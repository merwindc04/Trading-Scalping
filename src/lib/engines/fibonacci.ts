import type { Candle } from '@/types/market'

/* ============================================================
   Fibonacci retracement / extension of the dominant swing.

   The anchor swing is the highest high and lowest low of the
   lookback window; whichever came LAST sets the leg direction.
   Retracements measure pull-backs inside that leg, extensions
   project beyond it.
   ============================================================ */

export interface FibLevel {
  ratio: number
  price: number
  label: string
  kind: 'retracement' | 'extension'
}

export interface FibReport {
  legDirection: 'up' | 'down'
  swingHigh: number
  swingLow: number
  levels: FibLevel[]
  /** Where price sits inside the leg: 0 = leg start, 1 = leg end. */
  position: number
  /** Nearest retracement below / above price (support / resistance candidates). */
  below?: FibLevel
  above?: FibLevel
}

const RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
const EXTEND = [1.272, 1.618]

export function fibonacci(candles: Candle[], lookback = 120): FibReport {
  const seg = candles.slice(-lookback)
  let hi = -Infinity
  let lo = Infinity
  let hiIdx = 0
  let loIdx = 0
  seg.forEach((c, i) => {
    if (c.high > hi) {
      hi = c.high
      hiIdx = i
    }
    if (c.low < lo) {
      lo = c.low
      loIdx = i
    }
  })
  const up = hiIdx > loIdx // low came first → up-leg
  const range = hi - lo || 1
  const px = candles[candles.length - 1].close

  // Retracement prices are measured back from the leg END.
  const levels: FibLevel[] = RETRACE.map((r) => ({
    ratio: r,
    price: up ? hi - range * r : lo + range * r,
    label: `${(r * 100).toFixed(1).replace('.0', '')}%`,
    kind: 'retracement' as const,
  }))
  for (const e of EXTEND) {
    levels.push({ ratio: e, price: up ? lo + range * e : hi - range * e, label: `${e}`, kind: 'extension' })
  }

  const position = up ? (px - lo) / range : (hi - px) / range
  const retr = levels.filter((l) => l.kind === 'retracement')
  const below = retr.filter((l) => l.price < px).sort((a, b) => b.price - a.price)[0]
  const above = retr.filter((l) => l.price > px).sort((a, b) => a.price - b.price)[0]

  return { legDirection: up ? 'up' : 'down', swingHigh: hi, swingLow: lo, levels, position, below, above }
}
