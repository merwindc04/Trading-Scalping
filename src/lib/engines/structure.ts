import type { Candle, Direction, UTCTimestamp } from '@/types/market'
import { clamp } from './indicators'

/* ============================================================
   MarketStructure engine

   Detects swing pivots, labels them HH / HL / LH / LL, flags
   Break of Structure (BOS) and Change of Character (CHoCH),
   clusters horizontal support/resistance, and derives a trend
   read + a structure score.
   ============================================================ */

export type SwingKind = 'HH' | 'HL' | 'LH' | 'LL'

export interface SwingPoint {
  index: number
  time: UTCTimestamp
  price: number
  type: 'high' | 'low'
  label?: SwingKind
}

export interface StructureEvent {
  index: number
  time: UTCTimestamp
  price: number
  kind: 'BOS' | 'CHoCH'
  direction: Direction
}

export interface SRLevel {
  price: number
  kind: 'support' | 'resistance'
  strength: number // touches-based, 1..n
  label: string
}

export interface MarketStructureReport {
  swings: SwingPoint[]
  events: StructureEvent[]
  levels: SRLevel[]
  trend: Direction
  trendLabel: string
  structureScore: number // 0..100 (bull-positive)
  nearestSupport: number
  nearestResistance: number
  breakoutLevel: number
  swingHigh: number
  swingLow: number
}

/** Fractal-style pivot detection with a configurable half-window. */
export function findSwings(candles: Candle[], left = 3, right = 3): SwingPoint[] {
  const swings: SwingPoint[] = []
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true
    let isLow = true
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) isHigh = false
      if (candles[j].low <= candles[i].low) isLow = false
    }
    if (isHigh) swings.push({ index: i, time: candles[i].time, price: candles[i].high, type: 'high' })
    if (isLow) swings.push({ index: i, time: candles[i].time, price: candles[i].low, type: 'low' })
  }
  return swings.sort((a, b) => a.index - b.index)
}

function labelSwings(swings: SwingPoint[]): SwingPoint[] {
  let lastHigh: number | null = null
  let lastLow: number | null = null
  for (const s of swings) {
    if (s.type === 'high') {
      s.label = lastHigh === null ? 'HH' : s.price > lastHigh ? 'HH' : 'LH'
      lastHigh = s.price
    } else {
      s.label = lastLow === null ? 'HL' : s.price > lastLow ? 'HL' : 'LL'
      lastLow = s.price
    }
  }
  return swings
}

function detectEvents(candles: Candle[], swings: SwingPoint[]): StructureEvent[] {
  const events: StructureEvent[] = []
  const highs = swings.filter((s) => s.type === 'high')
  const lows = swings.filter((s) => s.type === 'low')
  let bias: Direction = 'NEUTRAL'

  // Walk swing highs/lows and detect breaks of the prior pivot.
  for (let i = 1; i < swings.length; i++) {
    const s = swings[i]
    if (s.type === 'high') {
      const priorHighs = highs.filter((h) => h.index < s.index)
      const prev = priorHighs[priorHighs.length - 1]
      if (prev && s.price > prev.price) {
        const kind = bias === 'BEARISH' ? 'CHoCH' : 'BOS'
        events.push({ index: s.index, time: s.time, price: prev.price, kind, direction: 'BULLISH' })
        bias = 'BULLISH'
      }
    } else {
      const priorLows = lows.filter((l) => l.index < s.index)
      const prev = priorLows[priorLows.length - 1]
      if (prev && s.price < prev.price) {
        const kind = bias === 'BULLISH' ? 'CHoCH' : 'BOS'
        events.push({ index: s.index, time: s.time, price: prev.price, kind, direction: 'BEARISH' })
        bias = 'BEARISH'
      }
    }
  }
  return events
}

/** Cluster swing pivots into horizontal S/R zones by proximity. */
function clusterLevels(candles: Candle[], swings: SwingPoint[]): SRLevel[] {
  const px = candles[candles.length - 1].close
  const tol = px * 0.0035
  const raw = swings.map((s) => ({ price: s.price, type: s.type }))
  const clusters: { price: number; count: number; type: 'high' | 'low' }[] = []
  for (const r of raw) {
    const hit = clusters.find((c) => Math.abs(c.price - r.price) <= tol)
    if (hit) {
      hit.price = (hit.price * hit.count + r.price) / (hit.count + 1)
      hit.count++
    } else {
      clusters.push({ price: r.price, count: 1, type: r.type })
    }
  }
  return clusters
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((c): SRLevel => ({
      price: c.price,
      kind: c.price >= px ? 'resistance' : 'support',
      strength: c.count,
      label: c.price >= px ? 'Resistance' : 'Support',
    }))
    .sort((a, b) => b.price - a.price)
}

export function analyzeStructure(candles: Candle[]): MarketStructureReport {
  const swings = labelSwings(findSwings(candles, 3, 3))
  const events = detectEvents(candles, swings)
  const levels = clusterLevels(candles, swings)
  const px = candles[candles.length - 1].close

  // Trend from the last few labelled swings.
  const recent = swings.slice(-6)
  const hhhl = recent.filter((s) => s.label === 'HH' || s.label === 'HL').length
  const lhll = recent.filter((s) => s.label === 'LH' || s.label === 'LL').length
  let trend: Direction = 'NEUTRAL'
  if (hhhl - lhll >= 2) trend = 'BULLISH'
  else if (lhll - hhhl >= 2) trend = 'BEARISH'

  const lastEvent = events[events.length - 1]
  const structureScore = clamp(
    50 + (hhhl - lhll) * 9 + (lastEvent?.direction === 'BULLISH' ? 12 : lastEvent?.direction === 'BEARISH' ? -12 : 0),
    6,
    96,
  )

  const supports = levels.filter((l) => l.kind === 'support')
  const resistances = levels.filter((l) => l.kind === 'resistance')
  const nearestSupport = supports.length ? Math.max(...supports.map((s) => s.price)) : Math.min(...candles.slice(-30).map((c) => c.low))
  const nearestResistance = resistances.length ? Math.min(...resistances.map((r) => r.price)) : Math.max(...candles.slice(-30).map((c) => c.high))

  const highs = swings.filter((s) => s.type === 'high')
  const lows = swings.filter((s) => s.type === 'low')
  const swingHigh = highs.length ? highs[highs.length - 1].price : Math.max(...candles.slice(-30).map((c) => c.high))
  const swingLow = lows.length ? lows[lows.length - 1].price : Math.min(...candles.slice(-30).map((c) => c.low))

  const trendLabel =
    trend === 'BULLISH'
      ? 'Higher highs & higher lows intact'
      : trend === 'BEARISH'
        ? 'Lower highs & lower lows forming'
        : 'Range-bound / structure balanced'

  return {
    swings,
    events,
    levels,
    trend,
    trendLabel,
    structureScore,
    nearestSupport,
    nearestResistance,
    breakoutLevel: nearestResistance,
    swingHigh,
    swingLow,
  }
}
