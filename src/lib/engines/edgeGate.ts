import type { Candle } from '@/types/market'
import { runBacktest } from './backtest'

/* ============================================================
   Proven-edge gate.

   Before the app may show BUY or SELL, it asks one question:
   "On THIS market, timeframe and forecast period, did the model's
   past calls beat a naive guess — by more than luck explains?"

   It replays the model walk-forward over the deepest history
   available (each replay sees only the bars before it and picks
   its own core model), records every directional call, and
   compares the hit rate with a naive guess that follows the
   period's up/down frequency.

   Overlapping replays are not independent, so the sample is
   converted to an effective size before testing. The result is a
   one-sided z-test of "edge > 0":

     PROVEN        edge ≥ 2 pts and z ≥ 1.645  (≈95 % sure it is real)
     LIKELY        edge ≥ 2 pts and z ≥ 1.0    (≈84 % sure it is real)
     UNPROVEN      positive, but could easily be luck
     NO_EDGE       past calls did no better than guessing
     INSUFFICIENT  too few independent past calls to judge

   Only PROVEN and LIKELY allow BUY/SELL.
   ============================================================ */

export type EdgeStatus = 'PROVEN' | 'LIKELY' | 'UNPROVEN' | 'NO_EDGE' | 'INSUFFICIENT'

export interface EdgeGate {
  status: EdgeStatus
  /** True when BUY/SELL may be shown. */
  allows: boolean
  label: string
  /** One plain-English sentence for the user. */
  reason: string
  hitRate: number
  baseline: number
  edge: number
  calls: number
  nEff: number
  z: number
  /** Approximate probability the edge is real (one-sided, normal approx.). */
  confidenceReal: number
  horizonSteps: number
  bars: number
  fromTime: number
  toTime: number
}

const MIN_HISTORY = 260
const ENGINE_WINDOW = 1000
const MAX_REPLAYS = 420
const MIN_NEFF = 30

const LABEL: Record<EdgeStatus, string> = {
  PROVEN: 'Proven edge',
  LIKELY: 'Likely edge',
  UNPROVEN: 'Edge not proven',
  NO_EDGE: 'No edge',
  INSUFFICIENT: 'Insufficient Data',
}

function normCdf(x: number): number {
  // Abramowitz–Stegun 7.1.26 via erf.
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

export function computeEdgeGate(candles: Candle[], h: number): EdgeGate {
  const n = candles.length
  const last = n - 1 - h
  const span = Math.max(0, last - MIN_HISTORY)
  const stride = Math.max(1, Math.ceil(h / 2), Math.ceil(span / MAX_REPLAYS))
  const overlap = Math.max(1, h / stride)

  const calls: { bull: boolean; fwd: number }[] = []
  const fwds: number[] = []
  let fromTime = 0
  let toTime = 0
  for (let i = MIN_HISTORY; i <= last; i += stride) {
    const known = candles.slice(Math.max(0, i + 1 - ENGINE_WINDOW), i + 1)
    const bt = runBacktest(known, h)
    const fwd = Math.log(candles[i + h].close / candles[i].close)
    fwds.push(fwd)
    if (!fromTime) fromTime = candles[i].time
    toTime = candles[i + h].time
    if (bt.coreDirection !== 'NEUTRAL') calls.push({ bull: bt.coreDirection === 'BULLISH', fwd })
  }

  const upShare = fwds.length ? fwds.filter((f) => f > 0).length / fwds.length : 0.5
  const hits = calls.filter((c) => (c.bull ? c.fwd > 0 : c.fwd < 0)).length
  const hitRate = calls.length ? hits / calls.length : 0
  const baseline = calls.length ? calls.reduce((s, c) => s + (c.bull ? upShare : 1 - upShare), 0) / calls.length : 0.5
  const edge = hitRate - baseline
  const nEff = calls.length / overlap
  const se = Math.sqrt(Math.max(baseline * (1 - baseline), 0.01) / Math.max(nEff, 1))
  const z = edge / se
  const confidenceReal = normCdf(z)

  let status: EdgeStatus
  if (nEff < MIN_NEFF) status = 'INSUFFICIENT'
  else if (edge <= 0) status = 'NO_EDGE'
  else if (edge >= 0.02 && z >= 1.645) status = 'PROVEN'
  else if (edge >= 0.02 && z >= 1.0) status = 'LIKELY'
  else status = 'UNPROVEN'

  const p = (v: number) => `${Math.round(v * 100)}%`
  const record = `right ${p(hitRate)} of the time vs ${p(baseline)} by guessing (${calls.length} past calls)`
  const reason =
    status === 'INSUFFICIENT'
      ? `Only ≈${Math.round(nEff)} independent past calls on this market and period — not enough to tell skill from luck.`
      : status === 'NO_EDGE'
        ? `Past calls were ${record} — no edge, so no BUY/SELL.`
        : status === 'UNPROVEN'
          ? `Past calls were ${record}. That small lead could easily be luck (${p(confidenceReal)} sure it is real).`
          : status === 'LIKELY'
            ? `Past calls were ${record} — about ${p(confidenceReal)} sure this edge is real.`
            : `Past calls were ${record} — over ${p(Math.min(confidenceReal, 0.99))} sure this edge is real.`

  return {
    status,
    allows: status === 'PROVEN' || status === 'LIKELY',
    label: LABEL[status],
    reason,
    hitRate,
    baseline,
    edge,
    calls: calls.length,
    nEff,
    z,
    confidenceReal,
    horizonSteps: h,
    bars: n,
    fromTime,
    toTime,
  }
}

/* The gate only changes when a new bar closes, and it is the most expensive
   step, so results are cached per market / timeframe / period. */
const cache = new Map<string, { at: number; lastClosed: number; gate: EdgeGate }>()
const TTL_MS = 10 * 60 * 1000

export function edgeGateCached(key: string, candles: Candle[], h: number): EdgeGate {
  const lastClosed = candles.length > 1 ? candles[candles.length - 2].time : 0
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS && hit.lastClosed === lastClosed) return hit.gate
  // Score only closed bars — the forming bar must not leak into the record.
  const gate = computeEdgeGate(candles.slice(0, -1), h)
  cache.set(key, { at: Date.now(), lastClosed, gate })
  return gate
}
