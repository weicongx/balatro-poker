import { loadEngine } from '../scripts/engine.mjs';

export const E = loadEngine();

// Hand notation: rank (A 2..10 J Q K) + suit (s h d c), x = no suit entered, JK = joker.
// Example: H('As Kh 10d 7x JK')
const SUITS = 'shdc';
export function H(str) {
  return str.trim().split(/\s+/).map((t) => {
    if (t === 'JK') return { j: true };
    const r = E.RN.indexOf(t.slice(0, -1));
    const s = t.endsWith('x') ? E.NOSUIT : SUITS.indexOf(t.slice(-1));
    if (r < 0 || (s < 0 && !t.endsWith('x'))) throw new Error(`bad card ${t}`);
    return { r, s };
  });
}

// Deterministic PRNG for property tests.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random 8-card deal with exactly `j` jokers, or any deal when j is undefined.
export function dealWithJokers(rand, j) {
  const deck = Array.from({ length: E.JK }, (_, i) => i);
  const out = [];
  for (let k = 0; k < E.HAND - j; k++) {
    const i = k + Math.floor(rand() * (deck.length - k));
    [deck[k], deck[i]] = [deck[i], deck[k]];
    out.push({ ...E.CARDS[deck[k]] });
  }
  for (let k = 0; k < j; k++) out.push({ j: true });
  return out;
}

// Every way to turn the jokers in `cards` into real suited cards (multisets of faces).
export function* jokerAssignments(cards) {
  const nat = cards.filter((c) => !c.j);
  const j = cards.length - nat.length;
  const pick = [];
  function* rec(from, left) {
    if (left === 0) { yield nat.concat(pick.map((f) => ({ r: f >> 2, s: f & 3 }))); return; }
    for (let f = from; f < 52; f++) { pick.push(f); yield* rec(f, left - 1); pick.pop(); }
  }
  yield* rec(0, j);
}
