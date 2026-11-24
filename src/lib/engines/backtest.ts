import type { Candle, Direction } from '@/types/market'
import { ema, rsi, macd, clamp } from './indicators'

/* ============================================================
   Walk-forward backtest & calibration.

   A causal "technical core" score (EMA stack, RSI, MACD, slope)
   is computed for every bar using ONLY data up to that bar. Each
   bar's score is then checked against what price actually did
   over the next `h` bars (the selected forecast horizon).

   • Calibration — for each score bucket, the empirical
     frequency of up / flat / down outcomes → the probabilities
     shown for bullish / neutral / bearish scenarios.
   • Validation — the last 40 % of evaluations are held out
     (out-of-sample): hit rate, Wilson interval, edge over the
     base rate and the Brier skill of the calibrated probabilities.

   Overlapping h-bar windows are NOT independent, so every count
   is converted to an effective sample size (n ÷ ⌈h/2⌉) before it
   is used for intervals or for "is there enough data?" checks.
   ============================================================ */

export type BucketKey = 'sbear' | 'bear' | 'neutral' | 'bull' | 'sbull'

const BUCKETS: { key: BucketKey; lo: number; hi: number; dir: Direction; label: string }[] = [
  { key: 'sbear', lo: 0, hi: 28, dir: 'BEARISH', label: 'Strong bearish read' },
  { key: 'bear', lo: 28, hi: 42, dir: 'BEARISH', label: 'Bearish read' },
  { key: 'neutral', lo: 42, hi: 58, dir: 'NEUTRAL', label: 'Neutral read' },
  { key: 'bull', lo: 58, hi: 72, dir: 'BULLISH', label: 'Bullish read' },
  { key: 'sbull', lo: 72, hi: 101, dir: 'BULLISH', label: 'Strong bullish read' },
]

export interface BucketStats {
  key: BucketKey
  label: string
  direction: Direction
  n: number
  nEff: number
  up: number
  flat: number
  down: number
  /** Raw hit rate for this bucket's call (sign for directional, stays-in-band for neutral). */
  hitRate: number
  /** Beta(5,5)-shrunk hit rate on the effective sample — the validated confidence basis. */
  posterior: number
  /** Mean forward log-return per bar for this bucket (drift estimate). */
  driftPerBar: number
}

export interface OutOfSample {
  nEff: number
  directional: number
  hitRate: number
  ciLow: number
  ciHigh: number
  baseline: number
  edge: number
  neutralHit: number
  brier: number
  brierRef: number
  /** Brier skill score vs climatology (>0 = better than base rates). */
  skill: number
  fromTime: number
  toTime: number
}

export interface BacktestReport {
  horizonSteps: number
  evaluations: number
  effectiveSamples: number
  coreScore: number
  coreDirection: Direction
  /** Which core produced the call: momentum (trend) or short-term mean reversion. */
  model: CoreModel
  current: BucketStats
  /** Calibrated scenario probabilities (%), from the current bucket. */
  calibration: { bull: number; neutral: number; bear: number }
  oos: OutOfSample | null
  /** Realized per-bar σ of log returns at the last bar. */
  sigmaBar: number
  /** Flat-band half-width used for outcome classes (log-return). */
  flatBand: number
  sufficient: boolean
  reason?: string
}

const WARMUP = 60

/** Causal per-bar technical-core score, 0..100 bull-positive. */
export function coreScores(candles: Candle[]): { score: number[]; sigma: number[] } {
  const closes = candles.map((c) => c.close)
  const n = closes.length
  const e9 = ema(closes, 9)
  const e20 = ema(closes, 20)
  const e50 = ema(closes, 50)
  const r = rsi(closes, 14)
  const m = macd(closes)

  // Rolling σ of log returns (60 bars), O(n).
  const lr: number[] = [0]
  for (let i = 1; i < n; i++) lr.push(Math.log(closes[i] / closes[i - 1]) || 0)
  const sigma: number[] = new Array(n).fill(NaN)
  let s1 = 0
  let s2 = 0
  const W = 60
  for (let i = 1; i < n; i++) {
    s1 += lr[i]
    s2 += lr[i] * lr[i]
    if (i > W) {
      s1 -= lr[i - W]
      s2 -= lr[i - W] * lr[i - W]
    }
    const k = Math.min(i, W)
    if (k >= 10) sigma[i] = Math.sqrt(Math.max(s2 / k - (s1 / k) ** 2, 1e-12))
  }

  const score: number[] = new Array(n).fill(NaN)
  for (let i = WARMUP; i < n; i++) {
    let s = 50
    s += e9[i] > e20[i] ? 10 : -10
    s += e20[i] > e50[i] ? 10 : -10
    s += ((Number.isFinite(r[i]) ? r[i] : 50) - 50) * 0.45
    s += (m.histogram[i] ?? 0) > 0 ? 6 : -6
    const slope = Math.log(closes[i] / closes[i - 20])
    const z = sigma[i] > 0 ? slope / (sigma[i] * Math.sqrt(20)) : 0
    s += clamp(z * 6, -10, 10)
    score[i] = clamp(s, 3, 97)
  }
  return { score, sigma }
}

function bucketOf(score: number) {
  return BUCKETS.find((b) => score >= b.lo && score < b.hi) ?? BUCKETS[2]
}

function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1]
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)]
}

/* ---------------- Core models ----------------
   'trend'    — the original momentum core (EMA stack, RSI, MACD, slope).
   'reversal' — short-term mean reversion: a sharp move over the last h bars,
                measured in σ units, is expected to partly snap back.
   'auto'     — picks whichever had the larger directional edge over a naive
                guess on the TRAINING part of this market's own history only.
                The held-out test part never influences the choice, so the
                out-of-sample numbers stay honest.

   Offline study (Nov 2026, BTC/ETH/PAXG, 15m–1D, ~9,400 non-overlapping calls,
   checked on two separate halves): the trend core had no edge (≈ −1 pt);
   short-term reversal beat a naive guess by ≈ +5 pts on BTC/ETH 15m/1H in both
   halves; on gold nothing beat a naive guess. */

export type CoreModel = 'trend' | 'reversal'

export interface BacktestOptions {
  model?: CoreModel | 'auto'
}

/** Causal short-term reversal score, 0..100 bull-positive (a drop scores high). */
export function reversalScores(candles: Candle[], h: number, sigma: number[]): number[] {
  const n = candles.length
  const score: number[] = new Array(n).fill(NaN)
  for (let i = Math.max(WARMUP, h); i < n; i++) {
    if (!(sigma[i] > 0)) continue
    const z = Math.log(candles[i].close / candles[i - h].close) / (sigma[i] * Math.sqrt(h))
    score[i] = clamp(50 - z * 14, 3, 97)
  }
  return score
}

/** Directional edge (hit rate − naive baseline) of a score series on the first 60 % of evaluations. */
function trainEdge(score: number[], sigma: number[], closes: number[], h: number): number {
  const evs: { dir: Direction; fwd: number }[] = []
  for (let i = WARMUP; i < closes.length - h; i++) {
    if (!Number.isFinite(score[i]) || !Number.isFinite(sigma[i])) continue
    evs.push({ dir: bucketOf(score[i]).dir, fwd: Math.log(closes[i + h] / closes[i]) })
  }
  const train = evs.slice(0, Math.floor(evs.length * 0.6))
  const upShare = train.filter((e) => e.fwd > 0).length / (train.length || 1)
  let n = 0
  let hits = 0
  let base = 0
  for (const e of train) {
    if (e.dir === 'NEUTRAL') continue
    n++
    if (e.dir === 'BULLISH' ? e.fwd > 0 : e.fwd < 0) hits++
    base += e.dir === 'BULLISH' ? upShare : 1 - upShare
  }
  return n ? (hits - base) / n : 0
}

export function runBacktest(candles: Candle[], horizonSteps: number, options: BacktestOptions = {}): BacktestReport {
  const h = Math.max(1, horizonSteps)
  const n = candles.length
  const closes = candles.map((c) => c.close)
  const trend = coreScores(candles)
  const sigma = trend.sigma
  const rev = reversalScores(candles, h, sigma)
  const want = options.model ?? 'auto'
  const model: CoreModel =
    want !== 'auto' ? want : trainEdge(rev, sigma, closes, h) > trainEdge(trend.score, sigma, closes, h) ? 'reversal' : 'trend'
  const score = model === 'reversal' ? rev : trend.score
  const overlap = Math.max(1, Math.ceil(h / 2))
  const coreScore = Number.isFinite(score[n - 1]) ? score[n - 1] : 50
  const cur = bucketOf(coreScore)
  const sigmaBar = Number.isFinite(sigma[n - 1]) ? sigma[n - 1] : 0.004
  const flatBand = 0.35 * sigmaBar * Math.sqrt(h)

  // ---- Walk-forward evaluations ---------------------------------------
  interface Ev {
    i: number
    score: number
    fwd: number
    cls: 'up' | 'flat' | 'down'
    band: number
  }
  const evs: Ev[] = []
  for (let i = WARMUP; i < n - h; i++) {
    if (!Number.isFinite(score[i]) || !Number.isFinite(sigma[i])) continue
    const fwd = Math.log(closes[i + h] / closes[i])
    const band = 0.35 * sigma[i] * Math.sqrt(h)
    const cls = fwd > band ? 'up' : fwd < -band ? 'down' : 'flat'
    evs.push({ i, score: score[i], fwd, cls, band })
  }

  const statsFor = (list: Ev[], key: BucketKey): BucketStats => {
    const b = BUCKETS.find((x) => x.key === key)!
    const inB = list.filter((e) => bucketOf(e.score).key === key)
    const up = inB.filter((e) => e.cls === 'up').length
    const down = inB.filter((e) => e.cls === 'down').length
    const flat = inB.length - up - down
    const hits =
      b.dir === 'BULLISH'
        ? inB.filter((e) => e.fwd > 0).length
        : b.dir === 'BEARISH'
          ? inB.filter((e) => e.fwd < 0).length
          : inB.filter((e) => Math.abs(e.fwd) <= e.band).length
    const hitRate = inB.length ? hits / inB.length : 0
    const nEff = inB.length / overlap
    const posterior = (hitRate * nEff + 5) / (nEff + 10)
    const driftPerBar = inB.length ? inB.reduce((s, e) => s + e.fwd, 0) / inB.length / h : 0
    return { key, label: b.label, direction: b.dir, n: inB.length, nEff, up, flat, down, hitRate, posterior, driftPerBar }
  }

  const current = statsFor(evs, cur.key)
  const effectiveSamples = evs.length / overlap

  // Calibrated probabilities (Laplace-smoothed, shrunk toward overall base rates).
  const all = { up: evs.filter((e) => e.cls === 'up').length, down: evs.filter((e) => e.cls === 'down').length }
  const allFlat = evs.length - all.up - all.down
  const baseUp = (all.up + 1) / (evs.length + 3)
  const baseDown = (all.down + 1) / (evs.length + 3)
  const baseFlat = (allFlat + 1) / (evs.length + 3)
  const k = 6 // prior strength in effective samples
  const w = current.nEff / (current.nEff + k)
  const tot = current.n || 1
  const pUp = w * (current.up / tot) + (1 - w) * baseUp
  const pDown = w * (current.down / tot) + (1 - w) * baseDown
  const pFlat = w * (current.flat / tot) + (1 - w) * baseFlat
  const norm = pUp + pDown + pFlat || 1
  let bull = Math.round((pUp / norm) * 100)
  let bear = Math.round((pDown / norm) * 100)
  const neutral = 100 - bull - bear
  if (!evs.length) {
    bull = 0
    bear = 0
  }

  // ---- Out-of-sample: last 40 % using a table fitted on the first 60 % ----
  let oos: OutOfSample | null = null
  const split = Math.floor(evs.length * 0.6)
  const train = evs.slice(0, split)
  const test = evs.slice(split)
  if (train.length > 20 && test.length > 10) {
    const table = new Map<BucketKey, { up: number; flat: number; down: number }>()
    for (const b of BUCKETS) {
      const s = statsFor(train, b.key)
      const t = s.n + 3
      table.set(b.key, { up: (s.up + 1) / t, flat: (s.flat + 1) / t, down: (s.down + 1) / t })
    }
    const tu = train.filter((e) => e.cls === 'up').length
    const td = train.filter((e) => e.cls === 'down').length
    const clim = { up: (tu + 1) / (train.length + 3), down: (td + 1) / (train.length + 3), flat: (train.length - tu - td + 1) / (train.length + 3) }

    let brier = 0
    let brierRef = 0
    let dirN = 0
    let dirHits = 0
    let baseSum = 0
    let neuN = 0
    let neuHits = 0
    const testUp = test.filter((e) => e.fwd > 0).length / test.length
    for (const e of test) {
      const p = table.get(bucketOf(e.score).key)!
      const o = { up: e.cls === 'up' ? 1 : 0, flat: e.cls === 'flat' ? 1 : 0, down: e.cls === 'down' ? 1 : 0 }
      brier += (p.up - o.up) ** 2 + (p.flat - o.flat) ** 2 + (p.down - o.down) ** 2
      brierRef += (clim.up - o.up) ** 2 + (clim.flat - o.flat) ** 2 + (clim.down - o.down) ** 2
      const bk = bucketOf(e.score)
      const dir = bk.dir
      if (dir === 'BULLISH') {
        dirN++
        if (e.fwd > 0) dirHits++
        baseSum += testUp
      } else if (dir === 'BEARISH') {
        dirN++
        if (e.fwd < 0) dirHits++
        baseSum += 1 - testUp
      } else {
        neuN++
        if (Math.abs(e.fwd) <= e.band) neuHits++
      }
    }
    brier /= test.length
    brierRef /= test.length
    const hitRate = dirN ? dirHits / dirN : 0
    const nEffDir = dirN / overlap
    const [ciLow, ciHigh] = wilson(hitRate, Math.max(1, nEffDir))
    const baseline = dirN ? baseSum / dirN : 0.5
    oos = {
      nEff: test.length / overlap,
      directional: dirN,
      hitRate,
      ciLow,
      ciHigh,
      baseline,
      edge: hitRate - baseline,
      neutralHit: neuN ? neuHits / neuN : 0,
      brier,
      brierRef,
      skill: brierRef > 0 ? 1 - brier / brierRef : 0,
      fromTime: candles[test[0].i].time,
      toTime: candles[test[test.length - 1].i].time,
    }
  }

  let sufficient = true
  let reason: string | undefined
  if (n < 150) {
    sufficient = false
    reason = `Only ${n} candles of history on this timeframe.`
  } else if (!oos || oos.nEff < 8) {
    sufficient = false
    reason = `Too few independent out-of-sample outcomes for a ${h}-bar horizon (≈${oos ? oos.nEff.toFixed(0) : 0}). Choose a shorter horizon or a lower timeframe.`
  } else if (current.nEff < 5) {
    sufficient = false
    reason = `The current market reading has occurred too rarely in history (≈${current.nEff.toFixed(0)} independent cases) to validate.`
  }

  return {
    horizonSteps: h,
    evaluations: evs.length,
    effectiveSamples,
    coreScore,
    coreDirection: cur.dir,
    model,
    current,
    calibration: { bull, neutral, bear },
    oos,
    sigmaBar,
    flatBand,
    sufficient,
    reason,
  }
}

export const MODEL_LABEL: Record<CoreModel, string> = {
  trend: 'Trend-following',
  reversal: 'Short-term reversal',
}
