/* ============================================================
   Core market domain types — shared across engines & UI.
   ============================================================ */

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W' | '1MO'

export type TradingStyle = 'SCALP' | 'INTRADAY' | 'SWING' | 'INVEST'

export type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

export type AssetClass = 'Metals' | 'Forex' | 'Crypto' | 'Indices' | 'Commodities' | 'Stocks'

export interface Asset {
  symbol: string
  name: string
  assetClass: AssetClass
  /** Nominal reference price used to seed the demo generator. */
  seedPrice: number
  /** Price decimals for display. */
  precision: number
  /** Annualised volatility hint for the demo generator (0..1). */
  vol: number
  currency: string
  /** Optional price unit shown next to the quote (e.g. "AED/g"). */
  unit?: string
}

/** Unix seconds — lightweight-charts uses seconds for time. */
export type UTCTimestamp = number

export interface Candle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** A projected (not-real) candle used by the forecast/ghost-candle engine. */
export interface GhostCandle extends Candle {
  /** 0..1 — shrinks as the forecast extends into the future. */
  confidence: number
  /** Upper / lower probability envelope for this step. */
  bandHigh: number
  bandLow: number
}

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800,
  '1MO': 2592000, // ~30 days
}

/** Display labels — minute is "1m", month is "1M" (kept visually distinct). */
export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1H': '1H',
  '4H': '4H',
  '1D': '1D',
  '1W': '1W',
  '1MO': '1M',
}

export const STYLE_TIMEFRAMES: Record<TradingStyle, Timeframe[]> = {
  SCALP: ['1m', '3m', '5m', '15m'],
  INTRADAY: ['15m', '30m', '1H', '4H'],
  SWING: ['4H', '1D', '1W'],
  INVEST: ['1D', '1W', '1MO'],
}

export const STYLE_HORIZON: Record<TradingStyle, string> = {
  SCALP: '15–30 min',
  INTRADAY: '2–8 hours',
  SWING: '3–15 days',
  INVEST: '1–6 months',
}
