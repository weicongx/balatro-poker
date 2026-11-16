#!/usr/bin/env node
// Derives the hand ranking that index.html ships with.
//
//   node scripts/simulate.mjs                      # 200M deals, print the table
//   node scripts/simulate.mjs --deals 20000000     # quicker run
//   node scripts/simulate.mjs --write              # also rewrite the RANKINGS block in index.html
//   options: --seed N (default 1), --workers N (default: CPU count)
//
// How the ranking is built:
//   1. For each deal, record every hand type the hand QUALIFIES for, with
//      jokers played optimally (qualifyFlags() from index.html). Qualifying
//      does not depend on the ranking, so nothing here is circular.
//   2. Probability of a type = chance that a random 8-card deal qualifies for
//      it. 44 of the 46 types are counted exactly over all C(108,8) deals
//      (see exact.mjs). Rainbow and Double Rainbow come from the simulation.
//   3. Rank types from rarest to most common. The app labels a hand with the
//      rarest type it qualifies for, so a hand is never ranked below a type
//      it also contains.
//   4. Check the simulation against every exact count (z-score); a large
//      deviation means the exact counting or the engine is wrong, and the
//      script refuses to write.
//
// Deals are split into fixed chunks with one RNG stream per chunk, so the
// result for a given --deals/--seed does not depend on the worker count.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEngine, replaceBlock, INDEX_HTML } from './engine.mjs';
import { exactCounts } from './exact.mjs';

const CHUNK = 1_000_000;
const Z_LIMIT = 4.5;

// sfc32 seeded through splitmix32: fast, 128-bit state, one stream per chunk.
function makeRng(seed, stream) {
  let s = (Math.imul(seed, 0x9e3779b9) ^ Math.imul(stream + 1, 0x85ebca6b)) >>> 0;
  const mix = () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix();
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16; i++) next();
  return next;
}

function parseArgs(argv) {
  const o = { deals: 200_000_000, seed: 1, workers: os.availableParallelism?.() ?? os.cpus().length, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') o.write = true;
    else if (a === '--deals') o.deals = Number(argv[++i].replace(/_/g, ''));
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--workers') o.workers = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!(o.deals > 0)) throw new Error('--deals must be positive');
  return o;
}

function simulate(E, { deals, seed, workers }) {
  const NT = E.SPEC.length;
  const nChunks = Math.ceil(deals / CHUNK);
  const counts = new Array(NT).fill(0);
  const masks = new Map();
  let next = 0, done = 0;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const pool = Array.from({ length: Math.min(workers, nChunks) }, () =>
      new Worker(fileURLToPath(import.meta.url), { workerData: { seed } }));
    const feed = (w) => {
      if (next < nChunks) {
        const c = next++;
        w.postMessage({ chunk: c, deals: Math.min(CHUNK, deals - c * CHUNK) });
      } else w.postMessage({ chunk: -1 });
    };
    for (const w of pool) {
      w.on('error', reject);
      w.on('message', (msg) => {
        msg.counts.forEach((c, i) => { counts[i] += c; });
        for (const [m, c] of msg.masks) masks.set(m, (masks.get(m) || 0) + c);
        done++;
        if (done % 10 === 0 || done === nChunks) {
          const s = (Date.now() - t0) / 1000;
          process.stderr.write(`\r  ${(Math.min(done * CHUNK, deals) / 1e6).toFixed(0)}M / ${deals / 1e6}M deals  (${s.toFixed(0)}s)`);
        }
        if (done === nChunks) { process.stderr.write('\n'); pool.forEach((p) => p.postMessage({ chunk: -1 })); resolve({ counts, masks }); }
        else feed(w);
      });
      feed(w);
    }
  });
}

const sig = (x, n) => Number(x.toPrecision(n));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const E = loadEngine({ rankings: false });
  const NT = E.SPEC.length;

  console.error('Exact counting...');
  const ex = exactCounts(E);
  console.error(`Simulating ${opt.deals.toLocaleString()} deals on ${opt.workers} workers (seed ${opt.seed})...`);
  const sim = await simulate(E, opt);

  // Final probability per type: exact where available, simulated otherwise.
  const rows = E.SPEC.map(([name], i) => {
    const simP = sim.counts[i] / opt.deals;
    const exact = ex.counts[i] !== null;
    const p = exact ? ex.counts[i] / ex.total : simP;
    let z = null;
    if (exact) {
      const sd = Math.sqrt(opt.deals * p * (1 - p));
      // p = 0 or 1 has no variance: the simulation must match exactly.
      z = sd > 0 ? (sim.counts[i] - opt.deals * p) / sd : (sim.counts[i] === opt.deals * p ? 0 : Infinity);
    }
    return { i, name, p, src: exact ? 'exact' : 'sim', exactCount: ex.counts[i], simCount: sim.counts[i], z };
  });

  const unplaced = rows.filter((r) => r.src === 'sim' && r.simCount === 0);
  if (unplaced.length) throw new Error(`no exact method and never seen in simulation: ${unplaced.map((r) => r.name).join(', ')}`);

  const order = rows.slice().sort((a, b) => a.p - b.p || a.i - b.i);
  const ties = order.filter((r, k) => k > 0 && r.p === order[k - 1].p);

  // How often each type is the hand's label (rarest qualifying type) under this order.
  const pos = new Array(NT);
  order.forEach((r, k) => { pos[r.i] = k; });
  const best = new Array(NT).fill(0);
  for (const [m, c] of sim.masks) {
    let bi = -1, bp = Infinity, mm = m;
    for (let i = 0; i < NT; i++) { if (mm % 2 === 1 && pos[i] < bp) { bp = pos[i]; bi = i; } mm = Math.floor(mm / 2); }
    best[bi] += c;
  }

  console.log(`\nRanking (rarest first). P = chance a random 8-card deal qualifies.`);
  console.log(`Exact counts are out of C(108,8) = ${ex.total.toLocaleString()} deals; simulation = ${opt.deals.toLocaleString()} deals, seed ${opt.seed}.\n`);
  console.log(`${lpad('#', 3)}  ${pad('Hand', 24)} ${lpad('P(qualifies)', 13)} ${lpad('1 in', 16)}  ${pad('src', 5)} ${lpad('sim hits', 11)} ${lpad('z', 6)} ${lpad('P(best hand)', 13)}`);
  order.forEach((r, k) => {
    console.log(`${lpad(k + 1, 3)}  ${pad(r.name, 24)} ${lpad(r.p.toExponential(4), 13)} ${lpad(Math.round(1 / r.p).toLocaleString(), 16)}  ${pad(r.src, 5)} ${lpad(r.simCount.toLocaleString(), 11)} ${lpad(r.z === null ? '' : r.z.toFixed(2), 6)} ${lpad((best[r.i] / opt.deals).toExponential(3), 13)}`);
  });

  const bad = rows.filter((r) => r.z !== null && Math.abs(r.z) > Z_LIMIT);
  const maxZ = Math.max(...rows.filter((r) => r.z !== null).map((r) => Math.abs(r.z)));
  console.log(`\nSimulation vs exact: max |z| = ${maxZ.toFixed(2)} over ${rows.filter((r) => r.z !== null).length} exact types (limit ${Z_LIMIT}).`);
  // How far each simulated type sits from its neighbours, in standard errors.
  for (const r of rows.filter((x) => x.src === 'sim')) {
    const k = order.indexOf(r), se = Math.sqrt(r.p * (1 - r.p) / opt.deals);
    const gap = (o) => (o ? `${o.name} ${(Math.abs(o.p - r.p) / se).toFixed(1)} SE` : '-');
    console.log(`  ${r.name}: ${sim.counts[r.i].toLocaleString()} hits; neighbours ${gap(order[k - 1])} / ${gap(order[k + 1])}`);
  }
  if (ties.length) console.log(`Exact ties broken by definition order: ${ties.map((r) => r.name).join(', ')}`);
  if (bad.length) {
    console.error(`\nFAIL: simulation disagrees with exact counts for ${bad.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }

  if (opt.write) {
    let html = readFileSync(INDEX_HTML, 'utf8');
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const nExact = rows.filter((r) => r.src === 'exact').length;
    const simNames = rows.filter((r) => r.src === 'sim').map((r) => r.name);
    const body = [
      `// ${nExact} types: exact counts over all C(108,8) = ${ex.total.toLocaleString('en-US')} deals.`,
      `// ${simNames.join(', ')}: ${opt.deals.toLocaleString('en-US')}-deal simulation, seed ${opt.seed}.`,
      `const RANKING_META={deals:${opt.deals},seed:${opt.seed},exactTypes:${nExact},simTypes:${JSON.stringify(simNames)}};`,
      `// [name, probability that a random 8-card deal qualifies, source], rarest first.`,
      `const RANKING=[`,
      ...order.map((r, k) => `  [${JSON.stringify(r.name)},${sig(r.p, r.src === 'exact' ? 7 : 5)},"${r.src}"]${k < order.length - 1 ? ',' : ''}`),
      `];`,
      '',
    ].join(eol);
    html = replaceBlock(html, 'RANKINGS', body);
    writeFileSync(INDEX_HTML, html);
    console.log(`\nWrote ${order.length} ranked types to index.html.`);
  }
}

if (!isMainThread) {
  const E = loadEngine({ rankings: false });
  const NT = E.SPEC.length;
  const { seed } = workerData;
  parentPort.on('message', ({ chunk, deals }) => {
    if (chunk < 0) process.exit(0);
    const rng = makeRng(seed, chunk);
    const deck = Array.from({ length: E.TOTAL }, (_, i) => i);
    const counts = new Array(NT).fill(0);
    const masks = new Map(); // qualification set (bitmask over SPEC) -> deals
    for (let d = 0; d < deals; d++) {
      const f = E.qualifyFlags(E.dealRandom(rng, deck));
      let m = 0, bit = 1;
      for (let i = 0; i < NT; i++) { if (f[i]) { counts[i]++; m += bit; } bit *= 2; }
      masks.set(m, (masks.get(m) || 0) + 1);
    }
    parentPort.postMessage({ chunk, counts, masks: [...masks] });
  });
} else {
  await main();
}
