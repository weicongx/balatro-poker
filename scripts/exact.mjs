// Exact qualification probabilities by counting.
//
// For most hand types, whether a hand qualifies depends only on a small
// summary of the hand: the rank counts, the suit counts, the twin structure,
// or the rank set inside one suit, plus the number of jokers. For each
// possible summary we build one representative hand, ask the real
// qualifyFlags() from index.html which types it qualifies for, and weight the
// answer by how many of the C(108,8) deals have that summary. That gives exact
// counts without a second implementation of the rules.
//
// Rainbow and Double Rainbow depend on the joint rank x suit layout and have
// no small summary, so they are left to the simulation (method 'sim').
//
// Shoe: 2 x 52 cards (13 ranks x 4 suits x 2 copies) + 4 jokers.

const COPIES_PER_RANK = 8;   // 4 suits x 2 decks
const CARDS_PER_SUIT = 26;   // 13 ranks x 2 decks
const FACES = 52;            // distinct rank+suit combinations
const JOKERS = 4;

const memo = new Map();
export function binom(n, k) {
  if (k < 0 || k > n) return 0;
  const key = n * 1000 + k;
  if (memo.has(key)) return memo.get(key);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  r = Math.round(r);
  memo.set(key, r);
  return r;
}

// The kinds whose flags each counting method may read, and why it is valid.
export const METHODS = {
  // Group patterns, straights, straight pairs, all evens/odds and high card are
  // decided by rank counts and joker count alone.
  rank: ['group', 'straight', 'pairs', 'evens', 'odds', 'high'],
  // Flushes and Full Spectrum are decided by suit counts and joker count alone.
  suit: ['flush', 'spectrum'],
  // Twins are decided by (#faces held twice, #faces held once, #jokers).
  twins: ['twins'],
  // An N-card straight flush exists iff some suit's rank set plus the jokers
  // forms an N-run. Suits are independent given their sizes, so count per suit.
  sflush: ['sflush'],
};

function assertSafe(x, what) {
  if (!Number.isSafeInteger(x)) throw new Error(`${what} is not a safe integer: ${x}`);
}

export function exactCounts(E) {
  const NT = E.SPEC.length;
  const hand = E.HAND;
  const total = binom(E.TOTAL, hand);
  const counts = new Array(NT).fill(null);
  const method = new Array(NT).fill('sim');
  const idxOf = (kinds) => E.SPEC.map((s, i) => (kinds.includes(s[1]) ? i : -1)).filter((i) => i >= 0);
  const jokers = (j) => Array.from({ length: j }, () => ({ j: true }));

  // --- rank counts -------------------------------------------------------
  {
    const idx = idxOf(METHODS.rank);
    const acc = new Array(NT).fill(0);
    let seen = 0;
    for (let j = 0; j <= JOKERS; j++) {
      const rc = new Array(E.R).fill(0);
      const rec = (r, left, w) => {
        if (r === E.R - 1) {
          if (left > COPIES_PER_RANK) return;
          rc[r] = left;
          const W = w * binom(COPIES_PER_RANK, left) * binom(JOKERS, j);
          const cards = [];
          for (let q = 0; q < E.R; q++) for (let c = 0; c < rc[q]; c++) cards.push({ r: q, s: E.NOSUIT });
          const f = E.qualifyFlags(cards.concat(jokers(j)));
          seen += W;
          for (const i of idx) if (f[i]) acc[i] += W;
          return;
        }
        for (let c = 0; c <= Math.min(COPIES_PER_RANK, left); c++) {
          rc[r] = c;
          rec(r + 1, left - c, w * binom(COPIES_PER_RANK, c));
        }
      };
      rec(0, hand - j, 1);
    }
    if (seen !== total) throw new Error(`rank enumeration covered ${seen} of ${total} deals`);
    for (const i of idx) { assertSafe(acc[i], E.SPEC[i][0]); counts[i] = acc[i]; method[i] = 'exact'; }
  }

  // --- suit counts -------------------------------------------------------
  {
    const idx = idxOf(METHODS.suit);
    const acc = new Array(NT).fill(0);
    let seen = 0;
    for (let j = 0; j <= JOKERS; j++) {
      const n = hand - j;
      for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) for (let c = 0; a + b + c <= n; c++) {
        const sz = [a, b, c, n - a - b - c];
        let W = binom(JOKERS, j);
        for (const k of sz) W *= binom(CARDS_PER_SUIT, k);
        const cards = [];
        sz.forEach((k, s) => { for (let q = 0; q < k; q++) cards.push({ r: q % E.R, s }); });
        const f = E.qualifyFlags(cards.concat(jokers(j)));
        seen += W;
        for (const i of idx) if (f[i]) acc[i] += W;
      }
    }
    if (seen !== total) throw new Error(`suit enumeration covered ${seen} of ${total} deals`);
    for (const i of idx) { assertSafe(acc[i], E.SPEC[i][0]); counts[i] = acc[i]; method[i] = 'exact'; }
  }

  // --- twin structure ----------------------------------------------------
  {
    const idx = idxOf(METHODS.twins);
    const acc = new Array(NT).fill(0);
    let seen = 0;
    for (let j = 0; j <= JOKERS; j++) {
      const n = hand - j;
      for (let t = 0; 2 * t <= n; t++) {
        const u = n - 2 * t; // faces held once
        // choose the t doubled faces (both copies), then u single faces (either copy)
        const W = binom(JOKERS, j) * binom(FACES, t) * binom(FACES - t, u) * 2 ** u;
        const cards = [];
        for (let f = 0; f < t; f++) cards.push({ r: f >> 2, s: f & 3 }, { r: f >> 2, s: f & 3 });
        for (let f = t; f < t + u; f++) cards.push({ r: f >> 2, s: f & 3 });
        const fl = E.qualifyFlags(cards.concat(jokers(j)));
        seen += W;
        for (const i of idx) if (fl[i]) acc[i] += W;
      }
    }
    if (seen !== total) throw new Error(`twin enumeration covered ${seen} of ${total} deals`);
    for (const i of idx) { assertSafe(acc[i], E.SPEC[i][0]); counts[i] = acc[i]; method[i] = 'exact'; }
  }

  // --- straight flushes, one suit at a time ------------------------------
  {
    const idx = idxOf(METHODS.sflush);
    // g[i][j][n]: n-card subsets of one suit's 26 cards whose rank set, plus j
    // jokers, qualifies for straight-flush type i. A rank set of size k is hit
    // by C(k, n-k) * 2^(2k-n) subsets of size n (n-k ranks held twice).
    const g = idx.map(() => Array.from({ length: JOKERS + 1 }, () => new Array(hand + 1).fill(0)));
    const ways = (k, n) => (n < k || n > 2 * k ? 0 : binom(k, n - k) * 2 ** (2 * k - n));
    for (let mask = 0; mask < 1 << E.R; mask++) {
      const ranks = [];
      for (let r = 0; r < E.R; r++) if (mask & (1 << r)) ranks.push(r);
      const k = ranks.length;
      if (k > hand) continue;
      for (let j = 0; j <= JOKERS && k + j <= hand; j++) {
        const f = E.qualifyFlags(ranks.map((r) => ({ r, s: 0 })).concat(jokers(j)));
        idx.forEach((i, x) => { if (f[i]) for (let n = k; n + j <= hand; n++) g[x][j][n] += ways(k, n); });
      }
    }
    idx.forEach((i, x) => {
      let cnt = 0;
      for (let j = 0; j <= JOKERS; j++) {
        const n = hand - j;
        for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) for (let c = 0; a + b + c <= n; c++) {
          const sz = [a, b, c, n - a - b - c];
          let all = 1, none = 1;
          for (const m of sz) { const tot = binom(CARDS_PER_SUIT, m); all *= tot; none *= tot - g[x][j][m]; }
          cnt += binom(JOKERS, j) * (all - none);
        }
      }
      assertSafe(cnt, E.SPEC[i][0]);
      counts[i] = cnt;
      method[i] = 'exact';
    });
  }

  return { total, counts, method };
}
