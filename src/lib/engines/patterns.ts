import type { Candle, Direction } from '@/types/market'
import type { SwingPoint } from './structure'
import { clamp } from './indicators'

/* ============================================================
   PatternRecognition engine

   Heuristic detection over recent swing geometry. Each detector
   returns a candidate with a completion %, breakout bias and the
   trade geometry (breakout level, target zone, invalidation).
   The framework is intentionally extensible — new detectors just
   push candidates into the same shape.
   ============================================================ */

export type PatternName =
  | 'Bull Flag'
  | 'Bear Flag'
  | 'Ascending Triangle'
  | 'Descending Triangle'
  | 'Symmetrical Triangle'
  | 'Rising Wedge'
  | 'Falling Wedge'
  | 'Double Top'
  | 'Double Bottom'
  | 'Head & Shoulders'
  | 'Inverse Head & Shoulders'
  | 'Channel Up'
  | 'Channel Down'
  | 'Range'
  | 'Breakout'
  | 'Breakdown'
  | 'Support Bounce'
  | 'Resistance Rejection'

export type Reliability = 'Low' | 'Medium' | 'High'

export interface DetectedPattern {
  name: PatternName
  direction: Direction
  completion: number // 0..100
  breakoutProbability: number // 0..100
  breakoutLevel: number
  targetLow: number
  targetHigh: number
  invalidation: number
  reliability: Reliability
  /** Chart anchor points (time,value) tracing the pattern outline. */
  outline: { time: number; value: number }[]
  summary: string
}

function slope(points: { x: number; y: number }[]): number {
  const n = points.length
  if (n < 2) return 0
  const sx = points.reduce((s, p) => s + p.x, 0)
  const sy = points.reduce((s, p) => s + p.y, 0)
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0)
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0)
  const d = n * sxx - sx * sx
  return d === 0 ? 0 : (n * sxy - sx * sy) / d
}

export function detectPatterns(candles: Candle[], swings: SwingPoint[], atrVal: number, bias: Direction = 'NEUTRAL'): DetectedPattern[] {
  const out: DetectedPattern[] = []
  const px = candles[candles.length - 1].close
  const highs = swings.filter((s) => s.type === 'high').slice(-4)
  const lows = swings.filter((s) => s.type === 'low').slice(-4)
  const hi = (arr: SwingPoint[]) => arr.map((s) => ({ x: s.index, y: s.price }))
  const recent = candles.slice(-40)
  const rHi = Math.max(...recent.map((c) => c.high))
  const rLo = Math.min(...recent.map((c) => c.low))
  const rRange = rHi - rLo

  const hiSlope = slope(hi(highs))
  const loSlope = slope(hi(lows))
  const norm = atrVal || rRange / 20

  // ---- Flags (impulse + counter-drift consolidation) --------------------
  const impulse = candles.length > 55 ? (candles[candles.length - 12].close - candles[candles.length - 30].close) : 0
  const impulsePct = impulse / px
  const consolRange = Math.max(...candles.slice(-12).map((c) => c.high)) - Math.min(...candles.slice(-12).map((c) => c.low))
  const tight = consolRange < rRange * 0.6
  if (impulsePct > 0.008 && tight && hiSlope <= norm * 0.15) {
    const bLevel = Math.max(...candles.slice(-12).map((c) => c.high))
    out.push({
      name: 'Bull Flag',
      direction: 'BULLISH',
      completion: clamp(64 + impulsePct * 900, 55, 92),
      breakoutProbability: clamp(58 + impulsePct * 700, 52, 82),
      breakoutLevel: bLevel,
      targetLow: bLevel + Math.abs(impulse) * 0.6,
      targetHigh: bLevel + Math.abs(impulse) * 1.0,
      invalidation: Math.min(...candles.slice(-12).map((c) => c.low)),
      reliability: impulsePct > 0.015 ? 'High' : 'Medium',
      outline: flagOutline(candles),
      summary: 'A strong up-leg has paused into a tight, slightly downward drift — a classic continuation coil.',
    })
  }
  if (impulsePct < -0.008 && tight && loSlope >= -norm * 0.15) {
    const bLevel = Math.min(...candles.slice(-12).map((c) => c.low))
    out.push({
      name: 'Bear Flag',
      direction: 'BEARISH',
      completion: clamp(64 + Math.abs(impulsePct) * 900, 55, 92),
      breakoutProbability: clamp(58 + Math.abs(impulsePct) * 700, 52, 82),
      breakoutLevel: bLevel,
      targetLow: bLevel - Math.abs(impulse) * 1.0,
      targetHigh: bLevel - Math.abs(impulse) * 0.6,
      invalidation: Math.max(...candles.slice(-12).map((c) => c.high)),
      reliability: Math.abs(impulsePct) > 0.015 ? 'High' : 'Medium',
      outline: flagOutline(candles),
      summary: 'A sharp down-leg is consolidating in a shallow rising drift — a continuation pattern lower.',
    })
  }

  // ---- Triangles / Wedges ----------------------------------------------
  if (highs.length >= 2 && lows.length >= 2) {
    const converging = hiSlope < -norm * 0.05 && loSlope > norm * 0.05
    const apexBull = Math.abs(hiSlope) < norm * 0.06 && loSlope > norm * 0.06
    const apexBear = hiSlope < -norm * 0.06 && Math.abs(loSlope) < norm * 0.06
    if (apexBull) {
      out.push(triangle('Ascending Triangle', 'BULLISH', candles, highs, lows, rRange, 'Flat highs with rising lows — buyers pressing a fixed resistance.'))
    } else if (apexBear) {
      out.push(triangle('Descending Triangle', 'BEARISH', candles, highs, lows, rRange, 'Flat lows with falling highs — sellers pressing a fixed support.'))
    } else if (converging) {
      out.push(triangle('Symmetrical Triangle', px > (rHi + rLo) / 2 ? 'BULLISH' : 'NEUTRAL', candles, highs, lows, rRange, 'Highs and lows converging — energy compressing ahead of a directional break.'))
    } else if (hiSlope > norm * 0.05 && loSlope > norm * 0.08 && loSlope > hiSlope) {
      out.push(triangle('Rising Wedge', 'BEARISH', candles, highs, lows, rRange, 'Both boundaries rise but lows rise faster — a tiring advance prone to reversal.'))
    } else if (hiSlope < -norm * 0.08 && loSlope < -norm * 0.05 && hiSlope < loSlope) {
      out.push(triangle('Falling Wedge', 'BULLISH', candles, highs, lows, rRange, 'Both boundaries fall but highs fall faster — selling pressure fading.'))
    }
  }

  // ---- Double top / bottom ---------------------------------------------
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2)
    if (Math.abs(a.price - b.price) < norm * 1.1 && px < Math.min(a.price, b.price)) {
      const neckline = Math.min(...candles.slice(a.index).map((c) => c.low))
      out.push({
        name: 'Double Top',
        direction: 'BEARISH',
        completion: clamp(70, 55, 90),
        breakoutProbability: 64,
        breakoutLevel: neckline,
        targetLow: neckline - (a.price - neckline),
        targetHigh: neckline - (a.price - neckline) * 0.6,
        invalidation: Math.max(a.price, b.price),
        reliability: 'Medium',
        outline: [
          { time: a.time, value: a.price },
          { time: b.time, value: b.price },
        ],
        summary: 'Price rejected the same ceiling twice — a topping structure while it holds.',
      })
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2)
    if (Math.abs(a.price - b.price) < norm * 1.1 && px > Math.max(a.price, b.price)) {
      const neckline = Math.max(...candles.slice(a.index).map((c) => c.high))
      out.push({
        name: 'Double Bottom',
        direction: 'BULLISH',
        completion: clamp(72, 55, 90),
        breakoutProbability: 66,
        breakoutLevel: neckline,
        targetLow: neckline + (neckline - a.price) * 0.6,
        targetHigh: neckline + (neckline - a.price),
        invalidation: Math.min(a.price, b.price),
        reliability: 'Medium',
        outline: [
          { time: a.time, value: a.price },
          { time: b.time, value: b.price },
        ],
        summary: 'Price defended the same floor twice — a basing structure while it holds.',
      })
    }
  }

  // ---- Fallbacks: trend-aware breakout / bounce / range -----------------
  if (out.length === 0) {
    const mid = (rHi + rLo) / 2
    const inUpper = px > rLo + rRange * 0.68
    const inLower = px < rLo + rRange * 0.32
    if (inUpper && bias === 'BULLISH') {
      // Testing resistance inside an uptrend reads as a breakout attempt, not a rejection.
      out.push({
        name: 'Breakout',
        direction: 'BULLISH',
        completion: 66,
        breakoutProbability: 63,
        breakoutLevel: rHi,
        targetLow: rHi + rRange * 0.4,
        targetHigh: rHi + rRange * 0.85,
        invalidation: rLo + rRange * 0.35 - norm,
        reliability: 'Medium',
        outline: [{ time: recent[0].time, value: rHi }, { time: candles[candles.length - 1].time, value: rHi }],
        summary: 'Price is pressing the top of its range within an uptrend — a breakout attempt with momentum behind it.',
      })
    } else if (inUpper) {
      out.push({
        name: 'Resistance Rejection',
        direction: 'BEARISH',
        completion: 60,
        breakoutProbability: 55,
        breakoutLevel: rLo + rRange * 0.5,
        targetLow: rLo + rRange * 0.2,
        targetHigh: rLo + rRange * 0.45,
        invalidation: rHi + norm,
        reliability: 'Low',
        outline: [{ time: recent[0].time, value: rHi }, { time: candles[candles.length - 1].time, value: rHi }],
        summary: 'Price is testing the top of its range with no trend support — watch for rejection.',
      })
    } else if (inLower && bias === 'BEARISH') {
      out.push({
        name: 'Breakdown',
        direction: 'BEARISH',
        completion: 66,
        breakoutProbability: 63,
        breakoutLevel: rLo,
        targetLow: rLo - rRange * 0.85,
        targetHigh: rLo - rRange * 0.4,
        invalidation: rHi - rRange * 0.35 + norm,
        reliability: 'Medium',
        outline: [{ time: recent[0].time, value: rLo }, { time: candles[candles.length - 1].time, value: rLo }],
        summary: 'Price is pressing the base of its range within a downtrend — a breakdown attempt with momentum behind it.',
      })
    } else if (inLower) {
      out.push({
        name: 'Support Bounce',
        direction: 'BULLISH',
        completion: 60,
        breakoutProbability: 55,
        breakoutLevel: mid,
        targetLow: rLo + rRange * 0.55,
        targetHigh: rLo + rRange * 0.8,
        invalidation: rLo - norm,
        reliability: 'Low',
        outline: [{ time: recent[0].time, value: rLo }, { time: candles[candles.length - 1].time, value: rLo }],
        summary: 'Price is testing the base of its range — watch for a bounce or breakdown.',
      })
    } else {
      out.push({
        name: 'Range',
        direction: 'NEUTRAL',
        completion: 50,
        breakoutProbability: 48,
        breakoutLevel: rHi,
        targetLow: rLo,
        targetHigh: rHi,
        invalidation: rLo - norm,
        reliability: 'Low',
        outline: [
          { time: recent[0].time, value: rHi },
          { time: candles[candles.length - 1].time, value: rHi },
          { time: candles[candles.length - 1].time, value: rLo },
          { time: recent[0].time, value: rLo },
        ],
        summary: 'Price is balancing inside a horizontal range — no directional edge until it breaks out.',
      })
    }
  }

  return out.sort((a, b) => b.completion * b.breakoutProbability - a.completion * a.breakoutProbability)
}

function flagOutline(candles: Candle[]): { time: number; value: number }[] {
  const seg = candles.slice(-12)
  const hi = Math.max(...seg.map((c) => c.high))
  const lo = Math.min(...seg.map((c) => c.low))
  const t0 = seg[0].time
  const t1 = seg[seg.length - 1].time
  return [
    { time: t0, value: hi },
    { time: t1, value: hi },
    { time: t1, value: lo },
    { time: t0, value: lo },
  ]
}

function triangle(
  name: PatternName,
  direction: Direction,
  candles: Candle[],
  highs: SwingPoint[],
  lows: SwingPoint[],
  rRange: number,
  summary: string,
): DetectedPattern {
  const px = candles[candles.length - 1].close
  const topLine = highs[highs.length - 1].price
  const botLine = lows[lows.length - 1].price
  const bull = direction === 'BULLISH'
  const breakoutLevel = bull ? topLine : botLine
  return {
    name,
    direction,
    completion: clamp(68, 58, 88),
    breakoutProbability: clamp(bull ? 66 : direction === 'BEARISH' ? 62 : 54, 50, 80),
    breakoutLevel,
    targetLow: bull ? breakoutLevel + rRange * 0.5 : breakoutLevel - rRange * 0.9,
    targetHigh: bull ? breakoutLevel + rRange * 0.9 : breakoutLevel - rRange * 0.5,
    invalidation: bull ? botLine : topLine,
    reliability: 'Medium',
    outline: [
      { time: highs[0].time, value: highs[0].price },
      { time: highs[highs.length - 1].time, value: highs[highs.length - 1].price },
      { time: lows[lows.length - 1].time, value: lows[lows.length - 1].price },
      { time: lows[0].time, value: lows[0].price },
    ],
    summary,
  }
}
