import type { Candle, Direction } from '@/types/market'
import { runBacktest, type CoreModel } from './backtest'
import { computeIndicators } from './indicators'
import { analyzeStructure } from './structure'
import { fibonacci } from './fibonacci'
import { buildZones } from './zones'

/* ============================================================
   Forecast Time Machine.

   replayAt() rebuilds the forecast as it would have looked at a
   past bar using ONLY candles up to that bar (the walk-forward
   backtest, zones, targets and invalidation are all recomputed
   from that truncated history), then reveals what price did over
   the next h bars and scores the call.

   runTimeMachine() repeats that across the whole history to give
   an honest Model Performance report. Only the causal parts of
   the model can be replayed: multi-timeframe alignment, macro
   inputs and the live feed state have no historical snapshots,
   so they are not part of these scores.
   ============================================================ */

/** Bars of history required before the first replay point. */
export const MIN_HISTORY = 260
const ENGINE_WINDOW = 320

export type OutcomeKind = 'target' | 'stopped' | 'neither' | 'range-held' | 'range-broke'

export interface ReplayResult {
  index: number
  time: number
  price: number
  horizonSteps: number
  direction: Direction
  probs: { bull: number; neutral: number; bear: number }
  /** Probability the model gave to the call it made (%). */
  callProb: number
  /** Validated (shrunk) hit rate for this kind of reading, %. */
  confidence: number
  validated: boolean
  reason?: string
  target: number
  invalidation: number
  rangeTop: number
  rangeBottom: number
  sigmaBar: number
  flatBand: number
  coreScore: number
  /** Core model picked (on older data only) for this replay. */
  model: CoreModel
  /** Null when the future is not available yet (replay point too recent). */
  outcome: {
    endTime: number
    endPrice: number
    returnPct: number
    actual: Direction
    correct: boolean
    kind: OutcomeKind
    /** Bars until target / stop / range break, when one happened. */
    barsToEvent: number | null
    maxFavourablePct: number
    maxAdversePct: number
  } | null
}

export function replayAt(full: Candle[], index: number, h: number): ReplayResult {
  const known = full.slice(0, index + 1)
  const recent = known.slice(-ENGINE_WINDOW)
  const last = known[known.length - 1]
  const bt = runBacktest(known, h)
  const snap = computeIndicators(recent)
  const structure = analyzeStructure(recent)
  const fib = fibonacci(recent)
  const shrink = bt.current.nEff / (bt.current.nEff + 6)
  const zones = buildZones({
    candles: recent,
    atr: snap.atr,
    sigmaBar: bt.sigmaBar,
    driftPerBar: bt.current.driftPerBar * shrink,
    steps: h,
    fib,
    structureEvents: structure.events,
  })

  const direction = bt.coreDirection
  const probs = bt.calibration
  const callProb = direction === 'BULLISH' ? probs.bull : direction === 'BEARISH' ? probs.bear : probs.neutral
  const target = direction === 'BULLISH' ? zones.targets.bull[0] : direction === 'BEARISH' ? zones.targets.bear[0] : zones.immediateResistance.bottom
  const invalidation = direction === 'BULLISH' ? zones.invalidation.bull : direction === 'BEARISH' ? zones.invalidation.bear : zones.immediateSupport.bottom
  const rangeTop = zones.immediateResistance.top
  const rangeBottom = zones.immediateSupport.bottom

  const base: Omit<ReplayResult, 'outcome'> = {
    index,
    time: last.time,
    price: last.close,
    horizonSteps: h,
    direction,
    probs,
    callProb,
    confidence: Math.round(bt.current.posterior * 100),
    validated: bt.sufficient,
    reason: bt.reason,
    target,
    invalidation,
    rangeTop,
    rangeBottom,
    sigmaBar: bt.sigmaBar,
    flatBand: bt.flatBand,
    coreScore: bt.coreScore,
    model: bt.model,
  }

  const future = full.slice(index + 1, index + 1 + h)
  if (future.length < h) return { ...base, outcome: null }

  const end = future[future.length - 1]
  const fwd = Math.log(end.close / last.close)
  const actual: Direction = fwd > bt.flatBand ? 'BULLISH' : fwd < -bt.flatBand ? 'BEARISH' : 'NEUTRAL'
  const correct = direction === 'BULLISH' ? fwd > 0 : direction === 'BEARISH' ? fwd < 0 : Math.abs(fwd) <= bt.flatBand

  // First-passage scoring on highs/lows. If target and stop are both touched
  // inside the same bar we cannot know the order, so it counts as stopped.
  let kind: OutcomeKind = direction === 'NEUTRAL' ? 'range-held' : 'neither'
  let barsToEvent: number | null = null
  let mfe = 0
  let mae = 0
  for (let j = 0; j < future.length; j++) {
    const b = future[j]
    const up = (b.high - last.close) / last.close
    const dn = (b.low - last.close) / last.close
    if (direction === 'BEARISH') {
      mfe = Math.max(mfe, -dn)
      mae = Math.max(mae, up)
    } else {
      mfe = Math.max(mfe, up)
      mae = Math.max(mae, -dn)
    }
    if (barsToEvent !== null) continue
    if (direction === 'BULLISH') {
      const stop = b.low <= invalidation
      const hit = b.high >= target
      if (stop || hit) {
        kind = stop ? 'stopped' : 'target'
        barsToEvent = j + 1
      }
    } else if (direction === 'BEARISH') {
      const stop = b.high >= invalidation
      const hit = b.low <= target
      if (stop || hit) {
        kind = stop ? 'stopped' : 'target'
        barsToEvent = j + 1
      }
    } else if (b.close > rangeTop || b.close < rangeBottom) {
      kind = 'range-broke'
      barsToEvent = j + 1
    }
  }

  return {
    ...base,
    outcome: {
      endTime: end.time,
      endPrice: end.close,
      returnPct: (end.close / last.close - 1) * 100,
      actual,
      correct,
      kind,
      barsToEvent,
      maxFavourablePct: mfe * 100,
      maxAdversePct: mae * 100,
    },
  }
}

/* ---------------- Model Performance ---------------- */

export interface RateStat {
  n: number
  hits: number
  rate: number
  /** Wilson 95 % interval on the effective (overlap-adjusted) sample. */
  ciLow: number
  ciHigh: number
}

export interface PerformanceReport {
  horizonSteps: number
  stride: number
  replays: ReplayResult[]
  scored: number
  effectiveSamples: number
  directional: RateStat
  /** Share of directional calls a coin-flip at the period's up/down frequency would get right. */
  baseline: number
  edge: number
  neutral: RateStat
  targetFirst: RateStat
  stoppedFirst: RateStat
  validatedOnly: RateStat
  byDirection: { label: string; stat: RateStat }[]
  byRegime: { label: string; hint: string; stat: RateStat }[]
  calibration: { label: string; predicted: number; actual: number; n: number }[]
  /** Rolling directional accuracy (last 12 calls), for a sparkline. */
  rolling: number[]
  fromTime: number
  toTime: number
  sufficient: boolean
  reason?: string
}

function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1]
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)]
}

function rate(flags: boolean[], overlap: number): RateStat {
  const n = flags.length
  const hits = flags.filter(Boolean).length
  const r = n ? hits / n : 0
  const [ciLow, ciHigh] = wilson(r, Math.max(1, n / overlap))
  return { n, hits, rate: r, ciLow, ciHigh }
}

/** Step back through history, replaying a forecast every `stride` bars. */
export function runTimeMachine(full: Candle[], h: number, maxReplays = 140): PerformanceReport {
  const last = full.length - 1 - h
  const span = Math.max(0, last - MIN_HISTORY)
  // Half-horizon spacing keeps windows mostly independent; widen it if the
  // history is long so the run stays fast.
  const stride = Math.max(1, Math.ceil(h / 2), Math.ceil(span / maxReplays))
  const overlap = Math.max(1, h / stride)

  const replays: ReplayResult[] = []
  for (let i = MIN_HISTORY; i <= last; i += stride) replays.push(replayAt(full, i, h))
  const scored = replays.filter((r) => r.outcome)

  const dir = scored.filter((r) => r.direction !== 'NEUTRAL')
  const neu = scored.filter((r) => r.direction === 'NEUTRAL')
  const upShare = scored.length ? scored.filter((r) => r.outcome!.returnPct > 0).length / scored.length : 0.5
  const baseline = dir.length ? dir.reduce((s, r) => s + (r.direction === 'BULLISH' ? upShare : 1 - upShare), 0) / dir.length : 0.5
  const directional = rate(dir.map((r) => r.outcome!.correct), overlap)

  const sigmas = scored.map((r) => r.sigmaBar).sort((a, b) => a - b)
  const medSigma = sigmas.length ? sigmas[Math.floor(sigmas.length / 2)] : 0
  const trending = (r: ReplayResult) => Math.abs(r.coreScore - 50) >= 18

  const calBins = [
    { lo: 0, hi: 40, label: 'Under 40 %' },
    { lo: 40, hi: 50, label: '40–50 %' },
    { lo: 50, hi: 60, label: '50–60 %' },
    { lo: 60, hi: 101, label: '60 % +' },
  ]
  const calibration = calBins
    .map((b) => {
      const inBin = scored.filter((r) => r.callProb >= b.lo && r.callProb < b.hi)
      // "Actual" = how often the outcome class matched the class the model called.
      const matched = inBin.filter((r) => r.outcome!.actual === r.direction).length
      return {
        label: b.label,
        predicted: inBin.length ? inBin.reduce((s, r) => s + r.callProb, 0) / inBin.length : 0,
        actual: inBin.length ? (matched / inBin.length) * 100 : 0,
        n: inBin.length,
      }
    })
    .filter((b) => b.n > 0)

  const rolling: number[] = []
  for (let i = 0; i < dir.length; i++) {
    const w = dir.slice(Math.max(0, i - 11), i + 1)
    if (w.length >= 6) rolling.push((w.filter((r) => r.outcome!.correct).length / w.length) * 100)
  }

  const effectiveSamples = scored.length / overlap
  let sufficient = true
  let reason: string | undefined
  if (scored.length === 0) {
    sufficient = false
    reason = `Not enough history: replays need at least ${MIN_HISTORY + h + 1} candles on this timeframe.`
  } else if (dir.length / overlap < 8) {
    sufficient = false
    reason = `Only ≈${Math.round(dir.length / overlap)} independent directional calls — too few to judge accuracy. Try a shorter horizon or a lower timeframe.`
  }

  return {
    horizonSteps: h,
    stride,
    replays,
    scored: scored.length,
    effectiveSamples,
    directional,
    baseline,
    edge: directional.rate - baseline,
    neutral: rate(neu.map((r) => r.outcome!.correct), overlap),
    targetFirst: rate(dir.map((r) => r.outcome!.kind === 'target'), overlap),
    stoppedFirst: rate(dir.map((r) => r.outcome!.kind === 'stopped'), overlap),
    validatedOnly: rate(dir.filter((r) => r.validated).map((r) => r.outcome!.correct), overlap),
    byDirection: [
      { label: 'Bullish calls', stat: rate(dir.filter((r) => r.direction === 'BULLISH').map((r) => r.outcome!.correct), overlap) },
      { label: 'Bearish calls', stat: rate(dir.filter((r) => r.direction === 'BEARISH').map((r) => r.outcome!.correct), overlap) },
    ],
    byRegime: [
      { label: 'Trend model', hint: 'calls from the momentum core', stat: rate(dir.filter((r) => r.model === 'trend').map((r) => r.outcome!.correct), overlap) },
      { label: 'Reversal model', hint: 'calls from snap-back core', stat: rate(dir.filter((r) => r.model === 'reversal').map((r) => r.outcome!.correct), overlap) },
      { label: 'Trending', hint: 'strong core reading', stat: rate(dir.filter(trending).map((r) => r.outcome!.correct), overlap) },
      { label: 'Ranging', hint: 'mild core reading', stat: rate(dir.filter((r) => !trending(r)).map((r) => r.outcome!.correct), overlap) },
      { label: 'High volatility', hint: 'σ above median', stat: rate(dir.filter((r) => r.sigmaBar > medSigma).map((r) => r.outcome!.correct), overlap) },
      { label: 'Low volatility', hint: 'σ at/below median', stat: rate(dir.filter((r) => r.sigmaBar <= medSigma).map((r) => r.outcome!.correct), overlap) },
    ],
    calibration,
    rolling,
    fromTime: scored[0]?.time ?? 0,
    toTime: scored[scored.length - 1]?.outcome?.endTime ?? 0,
    sufficient,
    reason,
  }
}
