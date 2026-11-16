import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, H, rng, dealWithJokers, jokerAssignments } from './helpers.mjs';

const has = (hand, type) => E.qualifies(H(hand)).includes(type);

// One hand per type that should be labelled exactly that type.
const KNOWN = {
  '8 of a Kind': '7s 7s 7h 7h 7d 7d 7c 7c',
  '8-Card Straight Flush': '2h 3h 4h 5h 6h 7h 8h 9h',
  '7 of a Kind': '9s 9s 9h 9h 9d 9d 9c Kh',
  '6 of a Kind + Pair': '5s 5s 5h 5h 5d 5d Ks Kh',
  'Two 4 of a Kinds': '8s 8h 8d 8c Qs Qh Qd Qc',
  '5 of a Kind + Trips': '4s 4s 4h 4d 4c Js Jh Jd',
  '7-Card Straight Flush': '3c 4c 5c 6c 7c 8c 9c Kh',
  '8-Card Flush': '2d 5d 7d 9d Jd Kd Ad 3d',
  '6 of a Kind': '10s 10s 10h 10h 10d 10c 2s 7d',
  '4-Straight Pairs': '5s 5h 6d 6c 7s 7h 8d 8c',
  'Quad Twins': 'Ks Ks 3h 3h 7d 7d 10c 10c',
  'Double Rainbow': 'As 2h 3d 4c 9s 10h Jd Qc',
  '6-Card Straight Flush': '4s 5s 6s 7s 8s 9s Kh 2d',
  '5 of a Kind + Pair': '6s 6h 6h 6d 6c 9s 9h 2d',
  '4 of a Kind + Trips': 'Js Jh Jd Jc 3s 3h 3d 8c',
  'Two Trips + Pair': '2s 2h 2d 9s 9h 9c Ks Kd',
  '4 of a Kind + Two Pairs': 'Qs Qh Qd Qc 5s 5h 8d 8c',
  '7-Card Flush': '2h 4h 6h 8h 10h Qh Kh 3s',
  'All Evens': '2s 4h 6d 8c 10s Qh 2d 6c',
  '8-Card Straight': '3s 4s 5h 6h 7d 8d 9s 10h',
  '5 of a Kind': 'Ks Kh Kd Kc Ks 2h 5d 9c',
  'All Odds': 'As 3h 5d 7c 9s Jh Kd 3c',
  'Triple Twins': '4s 4s 9h 9h Jd Jd 2c 7c',
  '5-Card Straight Flush': '5d 6d 7d 8d 9d Ks 2h Jc',
  'Four Pairs': '2s 2h 5d 5c 9s 9h Qd Qc',
  '3-Straight Pairs': '6s 6h 7d 7c 8s 8h Kd 2c',
  '7-Card Straight': '2s 3s 4h 5h 6d 7d 8s Kh',
  'Two Trips': '3s 3h 3d 10s 10h 10c Ks 6d',
  '4 of a Kind + Pair': '9s 9h 9d 9c 4s 4h Kd 7c',
  '6-Card Flush': '2c 5c 8c 10c Qc Kc 3h 7s',
  'Trips + Two Pairs': '7s 7h 7d 2s 2h Js Jh 9c',
  '4 of a Kind': 'As Ah Ad Ac 3s 6h 9d Qs',
  '6-Card Straight': '4s 5s 6h 7h 8d 9d Ks 2h',
  'Full Spectrum': '2s 5s 8h Jh 3d 9d Kc 6c',
  'Double Twins': '5s 5s Kh Kh 2d 8c 10s Jd',
  '5-Card Flush': '2s 6s 9s Js Ks 3h 4d 8c',
  'Three Pairs': '4s 4h 9d 9c Js Jh 2d 6s',
  'Full House': '8s 8h 8d 3c 3s Kh 5s Ac',
  '5-Card Straight': '5s 6h 7d 8s 9h Kd 2s Jh',
  'Rainbow': '5s 6h 7d 8c Ks 2h 10d Qs',
  '2-Straight Pairs': '6s 6h 7d 7s Ks 2h 10d Qs',
  'Three of a Kind': 'Qs Qh Qd 2s 5h 8d 10s Kh',
  'Twins': '9h 9h 2s 5d Js Kd 4s 7h',
  'Two Pairs': '3s 3h 9d 9s Ks 5h Jd Qs',
  'One Pair': 'Ks Kh 2d 5s 8h 10d Js 4h',
  'High Card': '2s 4h 7d 9s Jh Kd 3s 8h',
};

test('every hand type has a known example', () => {
  assert.deepEqual(Object.keys(KNOWN).sort(), [...E.TYPES].sort());
});

for (const [type, hand] of Object.entries(KNOWN)) {
  test(`classify: ${type}`, () => assert.equal(E.classify(H(hand)), type));
}

test('classify returns the highest-ranked type the hand qualifies for', () => {
  const rand = rng(7), deck = Array.from({ length: E.TOTAL }, (_, i) => i);
  for (let n = 0; n < 20000; n++) {
    const h = E.dealRandom(rand, deck);
    const q = E.qualifies(h);
    const best = q.reduce((a, t) => (E.rankPos(t) < E.rankPos(a) ? t : a));
    assert.equal(E.classify(h), best);
  }
});

test('labels a hand with the rarer of two types it qualifies for', () => {
  // 10-J-Q-K + A of mixed suits: both a 5-card straight and a rainbow.
  const h = '10s Jh Qd Kc Ah 2s 7d 4c';
  assert.ok(has(h, 'Rainbow') && has(h, '5-Card Straight'));
  const rarer = E.rankPos('Rainbow') < E.rankPos('5-Card Straight') ? 'Rainbow' : '5-Card Straight';
  // Full Spectrum (2 cards per suit) also applies here and may outrank both.
  const expected = E.rankPos('Full Spectrum') < E.rankPos(rarer) ? 'Full Spectrum' : rarer;
  assert.equal(E.classify(H(h)), expected);
});

test('aces: 10-J-Q-K-A is a straight, A-2-3-4-5 is a straight, no wraparound', () => {
  assert.ok(has('10s Jh Qd Kc As 2h 7d 4c', '5-Card Straight'));
  assert.ok(has('As 2h 3d 4c 5h 9s Jd Kc', '5-Card Straight'));
  assert.ok(!has('As 2h 3d 4c 5h 9s Jd Kc', '6-Card Straight'));
  assert.ok(!has('Ks Ah 2d 3c 4h 9s 7d Jc', '5-Card Straight'));
  assert.ok(!has('Qs Kh As 2d 3c 9s 7d 9c', '5-Card Straight'));
  assert.equal(E.classify(H('10s Js Qs Ks As 2h 3d 4c')), '5-Card Straight Flush');
  assert.ok(!has('Ks As 2s 3s 4s 9h 7d Jc', '5-Card Straight Flush'));
  assert.ok(has('Jh Qd Ks Ac 5s 8h 2d 7c', 'Rainbow'));       // J-Q-K-A rainbow
  assert.ok(!has('Qh Kd As 2c 5s 8h 9d 7c', 'Rainbow'));      // Q-K-A-2 is not a run
  assert.ok(has('Ks Kh As Ad 5c 8h 2d 9c', '2-Straight Pairs')); // K-A pairs
});

test('jokers complete straights and straight flushes', () => {
  assert.ok(has('2s 3h JK 5d 6c Ks 9h 9d', '5-Card Straight'));
  assert.ok(has('2s 3h JK 5d 6c JK 9h 9d', '6-Card Straight'));
  assert.equal(E.classify(H('10s Js JK Ks As 2h 5d 8c')), '5-Card Straight Flush');
  assert.ok(has('JK JK JK JK As 2h 3d 4c', '8-Card Straight'));
  assert.ok(has('JK JK JK JK As 2h 3d 4c', '5-Card Straight Flush'));
  assert.ok(!has('JK JK JK JK As 2h 3d 4c', '6-Card Straight Flush'));
});

test('jokers complete N of a kind and group patterns', () => {
  assert.ok(has('7s 7h JK JK 7d 2c 9s Qh', '5 of a Kind'));
  assert.ok(!has('7s 7h JK JK 7d 2c 9s Qh', '6 of a Kind'));
  assert.ok(has('7s 7h 7d 9s 9h JK Qc 2d', 'Two Trips'));
  assert.ok(has('7s 7h 7d 9s 9h JK Qc 2d', '4 of a Kind + Pair'));
  assert.ok(!has('7s 7h 7d 9s 9h JK Qc 2d', '4 of a Kind + Trips'));
  assert.ok(has('JK JK JK JK 5s 5h 5d 5c', '8 of a Kind'));
  assert.ok(has('JK 3s 5h 8d 10c Qs Ah 6d', 'One Pair'));
  assert.notEqual(E.classify(H('JK 3s 5h 8d 10c Qs Ah 6d')), 'High Card'); // a joker always pairs
});

test('jokers complete rainbows and double rainbows', () => {
  assert.ok(has('5s 6h JK 8c Ks 2h 10d Qs', 'Rainbow'));
  assert.ok(!has('5s 6h 9d 8c Ks 2h 10d Qs', 'Rainbow'));
  assert.ok(has('As 2h 3d JK 9s 10h Jd JK', 'Double Rainbow'));
  // A-2-3-4 and J-Q-K-A share the ace, so they do not make a Double Rainbow.
  assert.ok(!has('As 2h 3d 4c Js Qh Kd Ac', 'Double Rainbow'));
});

test('jokers complete flushes, full spectrum, all evens/odds', () => {
  assert.ok(has('2h 4h 6h 8h JK 3s 9d Kc', '5-Card Flush'));
  assert.ok(has('2s 5s 8h Jh 3d 9d Kc JK', 'Full Spectrum'));
  assert.ok(!has('2s 5s 8h Jh 3d 9d Kh JK', 'Full Spectrum'));
  assert.ok(has('2s 4h 6d JK 10s Qh 2d 6c', 'All Evens'));
  assert.ok(has('As 3h 5d JK 9s Jh Kd 3c', 'All Odds'));
});

test('jokers make twins: copying a card, or two jokers together', () => {
  assert.ok(has('7h JK 2s 9d Kc 4c 5d Qs', 'Twins'));
  assert.ok(has('JK JK 3s 9d', 'Double Twins'));             // each joker copies a card
  assert.ok(has('JK JK 3s 3s', 'Double Twins'));             // natural twin + joker pair
  assert.ok(!has('JK JK 3s 3s', 'Triple Twins'));
  assert.ok(has('JK JK JK JK 2s 5h 8d Jc', 'Quad Twins'));
  assert.ok(!has('9h 9d 2s 5d Js Kd 4s 7h', 'Twins'));      // same rank, different suit
});

test('suitless mode: rank hands work, suit hands are not detected', () => {
  assert.equal(E.classify(H('7x 7x 7x 7x 2x 5x 9x Jx')), '4 of a Kind');
  assert.equal(E.classify(H('2x 3x 4x 5x 6x 7x 8x 9x')), '8-Card Straight');
  const q = E.qualifies(H('2x 3x 4x 5x 6x 7x 8x 9x'));
  for (const t of ['5-Card Flush', 'Rainbow', 'Full Spectrum', 'Twins', '5-Card Straight Flush']) assert.ok(!q.includes(t), t);
  assert.equal(E.classify(H('9x 9x 2x 5x Jx Kx 4x 7x')), 'One Pair'); // two suitless 9s are not twins
  assert.ok(has('JK JK 2x 5x Jx Kx 4x 7x', 'Twins'));       // two jokers can still be any identical pair
  // Mixed entry: suits that were entered still count.
  assert.ok(has('2h 4h 6h 8h 10h 3x 9x Kx', '5-Card Flush'));
});

test('partial hands classify', () => {
  assert.equal(E.classify(H('Qs Qh Qd 3c')), 'Three of a Kind');
  assert.equal(E.classify(H('As Ah Ad')), 'All Odds');   // every card odd outranks trips
  assert.equal(E.classify(H('JK')), 'High Card');
});

// The joker logic must be exact: a jokered hand qualifies for a type iff some
// assignment of real cards to its jokers does.
test('jokers: qualification equals the union over all real-card assignments', () => {
  const rand = rng(11);
  for (const [j, n] of [[1, 300], [2, 60]]) {
    for (let k = 0; k < n; k++) {
      const h = dealWithJokers(rand, j);
      if (rand() < 0.3) for (const c of h) if (!c.j && rand() < 0.5) c.s = E.NOSUIT;
      const want = new Uint8Array(E.TYPES.length);
      for (const concrete of jokerAssignments(h)) E.qualifyFlags(concrete).forEach((v, i) => { if (v) want[i] = 1; });
      assert.deepEqual([...E.qualifyFlags(h)], [...want], JSON.stringify(h));
    }
  }
});

// The exact counting in scripts/exact.mjs assumes these dependencies.
test('rank-based types ignore suits; suit-count types ignore ranks', () => {
  const rand = rng(5), deck = Array.from({ length: E.TOTAL }, (_, i) => i);
  const byKind = (kinds) => E.SPEC.map((s, i) => (kinds.includes(s[1]) ? i : -1)).filter((i) => i >= 0);
  const rankIdx = byKind(['group', 'straight', 'pairs', 'evens', 'odds', 'high']);
  const suitIdx = byKind(['flush', 'spectrum']);
  for (let n = 0; n < 5000; n++) {
    const h = E.dealRandom(rand, deck);
    const f = E.qualifyFlags(h);
    const noSuit = E.qualifyFlags(h.map((c) => (c.j ? c : { r: c.r, s: E.NOSUIT })));
    for (const i of rankIdx) assert.equal(noSuit[i], f[i], E.TYPES[i]);
    const reRank = E.qualifyFlags(h.map((c) => (c.j ? c : { r: Math.floor(rand() * 13), s: c.s })));
    for (const i of suitIdx) assert.equal(reRank[i], f[i], E.TYPES[i]);
  }
});
