import type { Candle, Timeframe } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import { hashSeed, mulberry32, gaussianFrom } from './rng'
import { generateSeries } from './demoGenerator'
import type { CandleListener, MarketDataProvider, Quote } from './MarketDataProvider'

/* ============================================================
   DemoMarketDataProvider

   Serves deterministic historical candles and drives a
   simulated live tape: the forming bar updates a few times a
   second and rolls into a new bar when its period elapses.
   Clearly flagged as demo so nothing is passed off as a real
   live price.
   ============================================================ */

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly sourceLabel = 'DEMO MARKET DATA'
  readonly isDemo = true

  private cache = new Map<string, Candle[]>()

  getStatus(): 'live' | 'demo' {
    return 'demo'
  }

  async getHistory(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]> {
    const key = `${symbol}|${timeframe}`
    let series = this.cache.get(key)
    if (!series || series.length < count) {
      series = generateSeries(symbol, timeframe, Math.max(count, 480))
      this.cache.set(key, series)
    }
    return series.slice(-count).map((c) => ({ ...c }))
  }

  async getQuote(symbol: string): Promise<Quote> {
    const series = this.cache.get(`${symbol}|1H`) ?? generateSeries(symbol, '1H', 480)
    const last = series[series.length - 1]
    const prev = series[series.length - 25] ?? series[0]
    return {
      symbol,
      price: last.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      time: last.time,
    }
  }

  subscribe(symbol: string, timeframe: Timeframe, listener: CandleListener): () => void {
    const asset = ASSETS[symbol] ?? ASSETS.XAUUSD
    const tfSec = TIMEFRAME_SECONDS[timeframe]
    const key = `${symbol}|${timeframe}`
    const rand = mulberry32(hashSeed(`${key}|stream|${Math.floor(Date.now() / 1000)}`))
    const gauss = gaussianFrom(rand)

    const tickVol = (asset.vol / Math.sqrt(252 * 24 * 60)) * asset.seedPrice * 2.4

    let series = this.cache.get(key)
    if (!series) {
      series = generateSeries(symbol, timeframe, 480)
      this.cache.set(key, series)
    }
    let forming: Candle = { ...series[series.length - 1] }

    const interval = window.setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const barStart = now - (now % tfSec)

      if (barStart > forming.time) {
        // Roll into a fresh bar seeded from the prior close.
        const open = forming.close
        forming = { time: barStart, open, high: open, low: open, close: open, volume: 0 }
        series!.push({ ...forming })
        listener({ ...forming }, true)
        return
      }

      // Intrabar tick — nudge close, expand range, accumulate volume.
      const drift = tickVol * 0.05 * (symbol === 'XAUUSD' ? 0.4 : 0)
      const next = forming.close + gauss() * tickVol + drift
      forming.close = round(next, asset.precision)
      forming.high = Math.max(forming.high, forming.close)
      forming.low = Math.min(forming.low, forming.close)
      forming.volume += Math.round(asset.seedPrice * 6 * (0.5 + rand()))
      series![series!.length - 1] = { ...forming }
      listener({ ...forming }, false)
    }, 900)

    return () => window.clearInterval(interval)
  }
}

function round(v: number, p: number): number {
  const f = Math.pow(10, p)
  return Math.round(v * f) / f
}

/** Shared demo instance — used directly, and as the live provider's fallback. */
export const demoMarketData = new DemoMarketDataProvider()
