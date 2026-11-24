import type { Candle } from '@/types/market'
import type { IndicatorReading } from './indicators'

/* ============================================================
   Move Tracker — "how far has price already moved?"

   • Price moves: % change over the last 1h / 4h / 24h, since the
     start of the UAE day, and from the 7-day high and low.
   • Range used: today's high–low range compared with the typical
     daily range (average of the last 14 completed days). Tells the
     user when most of a normal day's move is already done.
   • Indicator votes: how many indicators lean bullish vs bearish.

   All figures use the live price, so they update on every tick.
   ============================================================ */

export interface MoveStat {
  key: string
  label: string
  /** % change from the reference price to now (null when history is missing). */
  pct: number | null
  ref: number | null
}

export type RangeVerdict = 'room' | 'most' | 'stretched'

export interface RangeUse {
  /** Typical (average) daily high–low range, in price units. */
  adr: number
  adrPct: number
  todayOpen: number
  todayHigh: number
  todayLow: number
  /** Today's range ÷ typical daily range (1 = a full normal day). */
  used: number
  /** Move from today's open in units of the typical range (signed). */
  fromOpen: number
  /** Where price sits inside today's range, 0 = low, 1 = high. */
  position: number
  verdict: RangeVerdict
  text: string
  days: number
}

export interface IndicatorVotes {
  bull: number
  bear: number
  neutral: number
  total: number
  bullPct: number
  bearPct: number
  items: { label: string; value: string; lean: 'bull' | 'bear' | 'neutral' }[]
}

const UAE_OFFSET = 4 * 3600

/** Start of the current UAE (UTC+4) calendar day, in unix seconds. */
export function uaeDayStart(nowSec: number): number {
  return Math.floor((nowSec + UAE_OFFSET) / 86400) * 86400 - UAE_OFFSET
}

/** Open price of the first candle starting at or after `t` (≈ price at time t). */
function priceAt(candles: Candle[], t: number): number | null {
  for (const c of candles) if (c.time >= t) return c.open
  return null
}

export function priceMoves(intraday: Candle[], price: number, nowSec: number): MoveStat[] {
  const first = intraday[0]?.time ?? Infinity
  const pct = (ref: number | null) => (ref && ref > 0 ? (price / ref - 1) * 100 : null)
  const ago = (key: string, label: string, sec: number): MoveStat => {
    const t = nowSec - sec
    const ref = t >= first ? priceAt(intraday, t) : null
    return { key, label, ref, pct: pct(ref) }
  }
  const dayRef = priceAt(intraday, uaeDayStart(nowSec))
  const highs = intraday.map((c) => c.high)
  const lows = intraday.map((c) => c.low)
  const hi7 = highs.length ? Math.max(...highs, price) : null
  const lo7 = lows.length ? Math.min(...lows, price) : null
  return [
    ago('1h', 'Last 1 hour', 3600),
    ago('4h', 'Last 4 hours', 4 * 3600),
    ago('24h', 'Last 24 hours', 86400),
    { key: 'today', label: 'Today (UAE)', ref: dayRef, pct: pct(dayRef) },
    { key: 'hi7', label: 'From 7-day high', ref: hi7, pct: pct(hi7) },
    { key: 'lo7', label: 'From 7-day low', ref: lo7, pct: pct(lo7) },
  ]
}

export function rangeUse(intraday: Candle[], daily: Candle[], price: number, nowSec: number): RangeUse | null {
  // Typical daily range from the last 14 COMPLETED days (the forming day is excluded).
  const done = daily.slice(0, -1).slice(-14)
  if (done.length < 5) return null
  const adr = done.reduce((s, c) => s + (c.high - c.low), 0) / done.length
  const start = uaeDayStart(nowSec)
  const today = intraday.filter((c) => c.time >= start)
  if (!today.length || !(adr > 0)) return null
  const todayOpen = today[0].open
  const todayHigh = Math.max(...today.map((c) => c.high), price)
  const todayLow = Math.min(...today.map((c) => c.low), price)
  const used = (todayHigh - todayLow) / adr
  const fromOpen = (price - todayOpen) / adr
  const position = todayHigh > todayLow ? (price - todayLow) / (todayHigh - todayLow) : 0.5
  const verdict: RangeVerdict = used >= 0.9 ? 'stretched' : used >= 0.5 ? 'most' : 'room'
  const pctUsed = Math.round(used * 100)
  const text =
    verdict === 'stretched'
      ? `Already moved ${pctUsed}% of a normal day — chasing now is risky; better entries usually come after a pullback.`
      : verdict === 'most'
        ? `${pctUsed}% of a normal day's range is used — some room is left, but most of the usual move has happened.`
        : `Only ${pctUsed}% of a normal day's range is used — there is still room to move today.`
  return { adr, adrPct: (adr / price) * 100, todayOpen, todayHigh, todayLow, used, fromOpen, position, verdict, text, days: done.length }
}

export function indicatorVotes(readings: IndicatorReading[]): IndicatorVotes {
  const items = readings.map((r) => ({ label: r.label, value: r.value, lean: (r.bias > 0.15 ? 'bull' : r.bias < -0.15 ? 'bear' : 'neutral') as 'bull' | 'bear' | 'neutral' }))
  const bull = items.filter((i) => i.lean === 'bull').length
  const bear = items.filter((i) => i.lean === 'bear').length
  const total = items.length
  return {
    bull,
    bear,
    neutral: total - bull - bear,
    total,
    bullPct: total ? Math.round((bull / total) * 100) : 0,
    bearPct: total ? Math.round((bear / total) * 100) : 0,
    items,
  }
}
