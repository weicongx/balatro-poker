import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './helpers.mjs';
import { exactCounts } from '../scripts/exact.mjs';

test('the engine defines 46 hand types, each with a description', () => {
  assert.equal(E.TYPES.length, 46);
  assert.equal(new Set(E.TYPES).size, 46);
  assert.deepEqual(Object.keys(E.DESCS).sort(), [...E.TYPES].sort());
});

test('hardcoded ranking contains every type exactly once', () => {
  const names = E.RANKING.map((r) => r[0]);
  assert.equal(names.length, E.TYPES.length);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), [...E.TYPES].sort());
});

test('ranking is ordered rarest first with valid probabilities', () => {
  let prev = 0;
  for (const [name, p, src] of E.RANKING) {
    assert.ok(p > 0 && p <= 1, `${name}: ${p}`);
    assert.ok(p >= prev, `${name} is out of order`);
    assert.ok(src === 'exact' || src === 'sim', `${name}: ${src}`);
    prev = p;
  }
  assert.equal(E.RANKING.at(-1)[0], 'High Card');
  assert.ok(E.RANKING_META.deals >= 1e7);
});

// Catches a rule change that was not followed by `node scripts/simulate.mjs --write`.
test('hardcoded exact probabilities match a fresh exact count', () => {
  const ex = exactCounts(E);
  for (const [name, p, src] of E.RANKING) {
    const i = E.TI[name];
    if (ex.counts[i] === null) { assert.equal(src, 'sim', name); continue; }
    assert.equal(src, 'exact', name);
    const want = ex.counts[i] / ex.total;
    assert.ok(Math.abs(p - want) <= want * 1e-6, `${name}: ${p} vs ${want}`);
  }
  assert.equal(ex.counts[E.TI['High Card']], ex.total);
});

test('a type is never ranked below a type it implies', () => {
  // Pairs (A, B) where every hand qualifying for A also qualifies for B.
  const implied = [
    ['8 of a Kind', '7 of a Kind'], ['7 of a Kind', '6 of a Kind'], ['6 of a Kind', '5 of a Kind'],
    ['5 of a Kind', '4 of a Kind'], ['4 of a Kind', 'Three of a Kind'], ['Three of a Kind', 'One Pair'],
    ['8-Card Straight Flush', '8-Card Flush'], ['8-Card Straight Flush', '8-Card Straight'],
    ['5-Card Straight Flush', '5-Card Flush'], ['8-Card Straight', '5-Card Straight'],
    ['Quad Twins', 'Triple Twins'], ['Triple Twins', 'Double Twins'], ['Double Twins', 'Twins'],
    ['Double Rainbow', 'Rainbow'], ['4-Straight Pairs', 'Four Pairs'], ['Full House', 'Three of a Kind'],
  ];
  for (const [a, b] of implied) assert.ok(E.rankPos(a) < E.rankPos(b), `${a} should outrank ${b}`);
});
