import type { Candle, Timeframe } from '@/types/market'

/* ============================================================
   MarketDataProvider — vendor-agnostic data interface.

   Swapping demo data for a real feed (Polygon, Twelve Data,
   OANDA, Binance, a broker bridge…) means implementing this
   one interface. No UI or engine code needs to change.
   ============================================================ */

export interface Quote {
  symbol: string
  price: number
  changePct: number
  time: number
}

export type CandleListener = (candle: Candle, isNewBar: boolean) => void

export interface MarketDataProvider {
  /** Human label surfaced in the UI (e.g. "DEMO MARKET DATA"). */
  readonly sourceLabel: string
  /** True when the data is simulated rather than a live market feed. */
  readonly isDemo: boolean

  /**
   * Whether the given symbol is currently served by a real feed or by demo
   * data (e.g. a live provider may serve some symbols live and fall back to
   * demo for the rest, or when the network/region blocks the feed).
   */
  getStatus(symbol: string): 'live' | 'demo'

  /** Return `count` historical candles ending at (or near) now. */
  getHistory(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]>

  /** Latest quote snapshot. */
  getQuote(symbol: string): Promise<Quote>

  /**
   * Subscribe to streaming updates for the forming bar.
   * Returns an unsubscribe function.
   */
  subscribe(symbol: string, timeframe: Timeframe, listener: CandleListener): () => void
}
