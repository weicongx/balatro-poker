import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, H, rng, dealWithJokers, jokerAssignments } from './helpers.mjs';

// Compare two hands that must share a type; returns the result.
function showdown(a, b, type) {
  const res = E.compareHands(H(a), H(b));
  assert.equal(res.typeA, type, `hand 1 is ${res.typeA}`);
  assert.equal(res.typeB, type, `hand 2 is ${res.typeB}`);
  return res;
}

const CASES = [
  // [description, hand 1, hand 2, type, expected winner (0 = split), deciding label]
  ['higher quads win', 'Ks Kh Kd Kc 2s 5h 8d 10c', '9s 9h 9d 9c 2s 5h 8d Jc', '4 of a Kind', 1, 'primary group'],
  ['same quads: kickers decide', '9s 9h 9d 9c As 5h 4d 7s', '9s 9h 9d 9c Ks 5h 4d 7s', '4 of a Kind', 1, 'kicker'],
  ['full house: trips before pair', '8s 8h 8d 3c 3s Kh 5d Ah', '7s 7h 7d Ac As Kh 5d 2h', 'Full House', 1, 'primary group'],
  ['two pairs: top pair first', 'Ks Kh 3d 3c 9s 5h Jd Qd', 'Qs Qh 10d 10c 9s 5h 2d 7s', 'Two Pairs', 1, 'primary group'],
  ['two pairs: kicker', 'Ks Kh 3d 3c As 5h Jd 8s', 'Kd Kc 3s 3h Qs 5h Jd 8s', 'Two Pairs', 1, 'kicker'],
  ['identical ranks split the pot', 'Ks Kh 3d 3c As 5h Jd 8s', 'Kd Kc 3s 3h Ad 5c Jd 8h', 'Two Pairs', 0, null],
  ['ace-high straight beats king-high', '10s Jh Qd Ks Ah 2s 7d 4d', '9s 10h Jd Qs Kh 2s 7d 4d', '5-Card Straight', 1, 'top card'],
  ['A-2-3-4-5 is the lowest straight', 'As 2h 3d 4s 5h 9d Js Kh', '2s 3h 4d 5s 6h 9d Js Kh', '5-Card Straight', 2, 'top card'],
  ['flush: flush cards high to low', 'Ah Jh 9h 6h 3h 2s 4d 8s', 'Ah Jh 9h 5h 3h 2s 4d 8s', '5-Card Flush', 1, 'flush cards'],
  ['straight flush with a joker as the ace', '10s Js JK Ks As 2h 5d 8c', '9h 10h Jh Qh Kh 2s 5d 8c', '5-Card Straight Flush', 1, 'top card'],
  ['J-Q-K-A rainbow beats A-2-3-4', 'Js Qh Kd Ac 5s 8h 2d 7s', 'As 2h 3d 4c 9s 8h Jd 6s', 'Rainbow', 1, 'top card'],
  ['double rainbow: lower rainbow breaks a tie', 'As 2h 3d 4c 9s 10h Jd Qc', '2s 3h 4d 5c 9s 10h Jd Qc', 'Double Rainbow', 2, 'lower rainbow'],
  ['joker copies an ace for the higher twin', 'As JK 4s 6s 8h 10h Qd 2d', 'Ks Ks 4c 6c 8h 10h Qd 2c', 'Twins', 1, 'twins'],
  ['full spectrum compares every card', '2s 5s 8h Jh 3d 9d Kc 6c', '2s 5s 8h Jh 3d 9d Qc 6c', 'Full Spectrum', 1, 'cards'],
  ['all evens: a joker counts as a queen', '2s 4h 6d 8c 10s JK 2d 6c', '2s 4h 6d 8c 10s Qh 2d 6c', 'All Evens', 0, null],
  ['all evens: joker queen beats a ten', '2s 4h 6d 8c 10s JK 2d 6c', '2s 4h 6d 8c 10s 10h 2d 6c', 'All Evens', 1, 'cards'],
  ['suitless hands compare by rank', '7x 7x 7x 7x 2x 5x 9x Jx', '7x 7x 7x 7x 2x 5x 9x 10x', '4 of a Kind', 1, 'kicker'],
];

for (const [desc, a, b, type, winner, label] of CASES) {
  test(`tiebreak: ${desc}`, () => {
    const res = showdown(a, b, type);
    assert.equal(res.winner, winner);
    assert.equal(res.label, label);
    const rev = E.compareHands(H(b), H(a));
    assert.equal(rev.winner, winner === 0 ? 0 : 3 - winner);
  });
}

test('different types: the higher-ranked type wins regardless of cards', () => {
  const res = E.compareHands(H('2s 2h 2d 3c 4s 7h 9d Js'), H('As Ah Kd Kc 5s 8h 10d Qs'));
  assert.equal(res.typeA, 'Three of a Kind');
  assert.equal(res.winner, E.rankPos('Three of a Kind') < E.rankPos(res.typeB) ? 1 : 2);
});

test('tiebreak key exists exactly when the hand qualifies', () => {
  const rand = rng(3);
  for (let n = 0; n < 3000; n++) {
    const h = dealWithJokers(rand, n % 5);
    if (n % 7 === 0) for (const c of h) if (!c.j && rand() < 0.5) c.s = E.NOSUIT;
    const f = E.qualifyFlags(h);
    E.TYPES.forEach((t, i) => assert.equal(E.tiebreakKey(h, t) !== null, f[i] === 1, `${t} ${JSON.stringify(h)}`));
  }
});

// The joker optimisation must equal brute force: try every real card for every
// joker and keep the best key for the type.
test('jokers: tiebreak key equals the best over all real-card assignments', () => {
  const rand = rng(9);
  for (const [j, n] of [[1, 250], [2, 40]]) {
    for (let k = 0; k < n; k++) {
      const h = dealWithJokers(rand, j);
      for (const t of E.qualifies(h)) {
        let best = null;
        for (const concrete of jokerAssignments(h)) {
          const kk = E.tiebreakKey(concrete, t);
          if (kk && (!best || E.cmpKeys(kk.key, best).cmp > 0)) best = kk.key;
        }
        assert.deepEqual(E.tiebreakKey(h, t).key, best, `${t} ${JSON.stringify(h)}`);
      }
    }
  }
});

test('compareHands is antisymmetric on random deals', () => {
  const rand = rng(21), deck = Array.from({ length: E.TOTAL }, (_, i) => i);
  for (let n = 0; n < 5000; n++) {
    const a = E.dealRandom(rand, deck).slice(), b = E.dealRandom(rand, deck).slice();
    const x = E.compareHands(a, b).winner, y = E.compareHands(b, a).winner;
    assert.equal(y, x === 0 ? 0 : 3 - x);
  }
});
