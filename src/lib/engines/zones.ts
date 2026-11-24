import type { Candle, Direction } from '@/types/market'
import { findSwings, type StructureEvent } from './structure'
import { atr as atrSeries, clamp } from './indicators'
import type { FibReport } from './fibonacci'

/* ============================================================
   Dynamic Support / Resistance zones.

   Zones (not lines) are built from clustered minor + major swing
   pivots, sized by ATR, and scored by recency-weighted touches
   and by how price actually reacted on each past test
   (rejections strengthen a zone, breaks weaken it).

   On top of the zones the engine detects recent price action
   (breakout, breakdown, false breakout / breakdown, consolidation,
   reversal) and estimates breakout / breakdown probability as:

     P(touch within horizon) × P(close-through | touch)

   • P(touch) — first-passage probability of drifted Brownian
     motion using the realized σ and the backtest-calibrated drift.
   • P(close-through | touch) — that zone's own history of
     breaks vs. tests (Laplace-smoothed).
   ============================================================ */

export interface Zone {
  id: string
  top: number
  bottom: number
  center: number
  kind: 'support' | 'resistance'
  /** 0..100 */
  strength: number
  touches: number
  tests: number
  breaks: number
  rejections: number
  major: boolean
  /** True when no real zone existed and this one was derived from the recent range. */
  derived?: boolean
}

export type PriceEventKind = 'breakout' | 'breakdown' | 'false-breakout' | 'false-breakdown' | 'consolidation' | 'reversal'

export interface PriceEvent {
  kind: PriceEventKind
  label: string
  direction: Direction
  level: number
  confirmed: boolean
  detail: string
}

export interface ZoneReport {
  zones: Zone[]
  immediateSupport: Zone
  immediateResistance: Zone
  majorSupport: Zone
  majorResistance: Zone
  events: PriceEvent[]
  breakoutProb: number // 0..100
  breakdownProb: number // 0..100
  targets: { bull: number[]; bear: number[]; neutral: number[] }
  confirmation: { bull: number; bear: number }
  invalidation: { bull: number; bear: number }
}

export interface ZoneInputs {
  candles: Candle[]
  atr: number
  sigmaBar: number // per-bar σ of log returns
  driftPerBar: number // per-bar mean log return (calibrated)
  steps: number
  fib: FibReport
  structureEvents: StructureEvent[]
}

interface Pivot {
  price: number
  index: number
  major: boolean
}

export function buildZones(inp: ZoneInputs): ZoneReport {
  const { candles, atr, fib } = inp
  const n = candles.length
  const px = candles[n - 1].close
  const A = atr > 0 ? atr : px * 0.003

  // ---- 1. Pivots -------------------------------------------------------
  const minor = findSwings(candles, 3, 3).map((s): Pivot => ({ price: s.price, index: s.index, major: false }))
  const majorIdx = new Set(findSwings(candles, 8, 8).map((s) => `${s.index}|${s.price}`))
  for (const p of minor) if (majorIdx.has(`${p.index}|${p.price}`)) p.major = true

  // ---- 2. Cluster -------------------------------------------------------
  const tol = A * 0.5
  const clusters: Pivot[][] = []
  for (const p of [...minor].sort((a, b) => a.price - b.price)) {
    const last = clusters[clusters.length - 1]
    if (last && Math.abs(p.price - mean(last.map((x) => x.price))) <= tol) last.push(p)
    else clusters.push([p])
  }

  // ---- 3. Score each cluster by recency + reaction history -------------
  let zones: Zone[] = clusters.map((cl, ci) => {
    const prices = cl.map((x) => x.price)
    const center = mean(prices)
    const half = Math.max(A * 0.25, (Math.max(...prices) - Math.min(...prices)) / 2)
    const top = center + half
    const bottom = center - half
    const recency = cl.reduce((s, x) => s + Math.exp(-(n - 1 - x.index) / 150), 0)
    const majors = cl.filter((x) => x.major).length
    const firstIdx = Math.min(...cl.map((x) => x.index))
    const r = reactions(candles, firstIdx, top, bottom)
    const raw = recency + majors * 0.6 + r.rejections * 0.5 - r.breaks * 0.25
    return {
      id: `z${ci}`,
      top,
      bottom,
      center,
      kind: center >= px ? 'resistance' : 'support',
      strength: Math.round(clamp(100 * (1 - Math.exp(-Math.max(raw, 0) / 3)), 0, 100)),
      touches: cl.length,
      tests: r.tests,
      breaks: r.breaks,
      rejections: r.rejections,
      major: majors > 0,
    }
  })
  zones = zones
    .filter((z) => z.strength >= 12)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 6)
    .sort((a, b) => b.center - a.center)

  // ---- 4. Immediate & major levels (with honest fallbacks) -------------
  const recent = candles.slice(-50)
  const supports = zones.filter((z) => z.kind === 'support')
  const resistances = zones.filter((z) => z.kind === 'resistance')
  const fallbackS = (): Zone => {
    const lo = Math.min(...recent.map((c) => c.low))
    return mkDerived('ds', lo, A, 'support')
  }
  const fallbackR = (): Zone => {
    const hi = Math.max(...recent.map((c) => c.high))
    return mkDerived('dr', hi, A, 'resistance')
  }
  const immediateSupport = supports.sort((a, b) => b.center - a.center)[0] ?? fallbackS()
  const immediateResistance = resistances.sort((a, b) => a.center - b.center)[0] ?? fallbackR()
  const majorSupport = [...supports].sort((a, b) => b.strength - a.strength)[0] ?? immediateSupport
  const majorResistance = [...resistances].sort((a, b) => b.strength - a.strength)[0] ?? immediateResistance

  // ---- 5. Recent price-action events ------------------------------------
  const events = detectEvents(candles, zones, immediateSupport, immediateResistance, A, inp.structureEvents)

  // ---- 6. Breakout / breakdown probability -----------------------------
  const T = Math.max(1, inp.steps)
  const sig = Math.max(inp.sigmaBar, 1e-5)
  const mu = inp.driftPerBar
  const dUp = Math.log(immediateResistance.bottom / px)
  const dDn = Math.log(px / immediateSupport.top)
  const touchUp = dUp <= 0 ? 1 : firstPassage(dUp, mu, sig, T)
  const touchDn = dDn <= 0 ? 1 : firstPassage(dDn, -mu, sig, T)
  const throughR = (immediateResistance.breaks + 1) / (immediateResistance.tests + 2)
  const throughS = (immediateSupport.breaks + 1) / (immediateSupport.tests + 2)
  const breakoutProb = Math.round(clamp(touchUp * throughR * 100, 1, 99))
  const breakdownProb = Math.round(clamp(touchDn * throughS * 100, 1, 99))

  // ---- 7. Target ladders, confirmation & invalidation ------------------
  const horizonMove = px * sig * Math.sqrt(T)
  const fibPrices = fib.levels.map((l) => l.price)
  const ladder = (side: 'up' | 'down'): number[] => {
    const cands = [...zones.map((z) => z.center), ...fibPrices].filter((p) => (side === 'up' ? p > px + A * 0.3 : p < px - A * 0.3))
    cands.sort((a, b) => (side === 'up' ? a - b : b - a))
    const out: number[] = []
    for (const c of cands) if (!out.some((o) => Math.abs(o - c) < A * 0.6)) out.push(c)
    let k = 1
    while (out.length < 3) {
      const base = out[out.length - 1] ?? px
      out.push(side === 'up' ? base + horizonMove * 0.5 * k : base - horizonMove * 0.5 * k)
      k++
    }
    return out.slice(0, 3)
  }
  const targets = {
    bull: ladder('up'),
    bear: ladder('down'),
    // [range top, range low] — same order the scenario panel expects.
    neutral: [immediateResistance.bottom, immediateSupport.top],
  }
  const confirmation = { bull: immediateResistance.top, bear: immediateSupport.bottom }
  const invalidation = { bull: immediateSupport.bottom - A * 0.25, bear: immediateResistance.top + A * 0.25 }

  return {
    zones,
    immediateSupport,
    immediateResistance,
    majorSupport,
    majorResistance,
    events,
    breakoutProb,
    breakdownProb,
    targets,
    confirmation,
    invalidation,
  }
}

function mkDerived(id: string, level: number, A: number, kind: 'support' | 'resistance'): Zone {
  return { id, top: level + A * 0.25, bottom: level - A * 0.25, center: level, kind, strength: 10, touches: 1, tests: 0, breaks: 0, rejections: 0, major: false, derived: true }
}

/** Walk forward from the zone's first pivot: each entry into the zone is a test; exit on the far side = break. */
function reactions(candles: Candle[], from: number, top: number, bottom: number) {
  let tests = 0
  let breaks = 0
  let rejections = 0
  let side = 'inside' as 'above' | 'below' | 'inside'
  let entrySide: 'above' | 'below' | null = null
  for (let i = from + 1; i < candles.length; i++) {
    const c = candles[i]
    const now: typeof side = c.close > top ? 'above' : c.close < bottom ? 'below' : 'inside'
    const touched = c.high >= bottom && c.low <= top
    if (side !== 'inside' && entrySide === null && touched) {
      entrySide = side
      tests++
    }
    if (entrySide && now !== 'inside') {
      if (now !== entrySide) breaks++
      else rejections++
      entrySide = null
    }
    side = now
  }
  return { tests, breaks, rejections }
}

function detectEvents(candles: Candle[], zones: Zone[], S: Zone, R: Zone, A: number, sEvents: StructureEvent[]): PriceEvent[] {
  const n = candles.length
  const out: PriceEvent[] = []
  const last = candles.slice(-6)
  const closes = last.map((c) => c.close)
  const px = closes[closes.length - 1]
  const vol20 = mean(candles.slice(-21, -1).map((c) => c.volume)) || 1
  const volNow = candles[n - 1].volume

  // Breakout: a zone that was above recent closes is now below price.
  for (const z of zones) {
    const crossedUp = px > z.top && closes.slice(0, -1).some((c) => c < z.top)
    const crossedDn = px < z.bottom && closes.slice(0, -1).some((c) => c > z.bottom)
    if (crossedUp) {
      const confirmed = closes.slice(-2).every((c) => c > z.top)
      out.push({
        kind: 'breakout',
        label: confirmed ? 'Breakout confirmed' : 'Breakout — unconfirmed',
        direction: 'BULLISH',
        level: z.top,
        confirmed,
        detail: `Closed above the ${fmtLvl(z.top)} zone${volNow > vol20 * 1.2 ? ' on above-average volume' : ''}. ${confirmed ? 'Two closes above confirm it.' : 'Needs a second close above to confirm.'}`,
      })
    } else if (crossedDn) {
      const confirmed = closes.slice(-2).every((c) => c < z.bottom)
      out.push({
        kind: 'breakdown',
        label: confirmed ? 'Breakdown confirmed' : 'Breakdown — unconfirmed',
        direction: 'BEARISH',
        level: z.bottom,
        confirmed,
        detail: `Closed below the ${fmtLvl(z.bottom)} zone${volNow > vol20 * 1.2 ? ' on above-average volume' : ''}. ${confirmed ? 'Two closes below confirm it.' : 'Needs a second close below to confirm.'}`,
      })
    }
  }

  // False breakout / breakdown: wick through the immediate zone, close back inside.
  if (!R.derived && last.some((c) => c.high > R.top) && closes.every((c) => c <= R.top)) {
    out.push({ kind: 'false-breakout', label: 'False breakout', direction: 'BEARISH', level: R.top, confirmed: true, detail: `Wicked above ${fmtLvl(R.top)} but every close stayed below — sellers defended resistance.` })
  }
  if (!S.derived && last.some((c) => c.low < S.bottom) && closes.every((c) => c >= S.bottom)) {
    out.push({ kind: 'false-breakdown', label: 'False breakdown', direction: 'BULLISH', level: S.bottom, confirmed: true, detail: `Wicked below ${fmtLvl(S.bottom)} but every close held above — buyers defended support.` })
  }

  // Consolidation: compressed ATR and a tight 20-bar range.
  const atrs = atrSeries(candles, 14).filter(Number.isFinite)
  const atrNow = atrs[atrs.length - 1] ?? A
  const atrAvg = mean(atrs.slice(-100)) || A
  const seg = candles.slice(-20)
  const range20 = Math.max(...seg.map((c) => c.high)) - Math.min(...seg.map((c) => c.low))
  if (atrNow < atrAvg * 0.8 && range20 < A * 3.5) {
    out.push({ kind: 'consolidation', label: 'Consolidation / squeeze', direction: 'NEUTRAL', level: (R.bottom + S.top) / 2, confirmed: true, detail: `Volatility is ${Math.round((1 - atrNow / atrAvg) * 100)}% below normal inside a tight range — expansion usually follows.` })
  }

  // Reversal: a change of character in the recent bars.
  const ch = [...sEvents].reverse().find((e) => e.kind === 'CHoCH')
  if (ch && candles[n - 1].time - ch.time <= (candles[n - 1].time - candles[Math.max(0, n - 16)].time)) {
    out.push({ kind: 'reversal', label: `Reversal signal (CHoCH)`, direction: ch.direction, level: ch.price, confirmed: false, detail: `Market structure changed character ${ch.direction === 'BULLISH' ? 'up' : 'down'} at ${fmtLvl(ch.price)} — early reversal, needs follow-through.` })
  }

  return out
}

/** P(max of drifted BM reaches d within T) — reflection principle. All in log-return units. */
function firstPassage(d: number, mu: number, sigma: number, T: number): number {
  const s = sigma * Math.sqrt(T)
  const a = normCdf((-d + mu * T) / s)
  const expo = clamp((2 * mu * d) / (sigma * sigma), -50, 50)
  const b = Math.exp(expo) * normCdf((-d - mu * T) / s)
  return clamp(a + b, 0, 1)
}

function normCdf(x: number): number {
  // Abramowitz–Stegun 7.1.26
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0
}

function fmtLvl(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 4 : 2 })
}
