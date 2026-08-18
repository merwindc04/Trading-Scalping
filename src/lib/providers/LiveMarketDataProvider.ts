import type { Candle, Timeframe } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import type { CandleListener, MarketDataProvider, Quote } from './MarketDataProvider'
import { DemoMarketDataProvider, demoMarketData } from './DemoMarketDataProvider'

/* ============================================================
   LiveMarketDataProvider

   Real market data in the browser with no API key and no proxy,
   via Binance's public market-data host (data-api.binance.vision):

     • XAUUSD → PAXGUSDT  (PAX Gold — redeemable 1:1 for a troy
       ounce of physical gold, so it tracks spot gold live)
     • BTCUSD → BTCUSDT,  ETHUSD → ETHUSDT

   History comes from REST klines; the forming bar streams over a
   WebSocket. Anything not mapped (silver, forex, indices), or any
   symbol whose live fetch fails (network / region block), falls
   back transparently to the demo feed — the app never breaks, and
   the LIVE / DEMO badge always reflects the truth per symbol.

   To add true spot XAU/USD, forex and indices, drop in a keyed
   provider (Twelve Data, Polygon…) behind this same interface.
   ============================================================ */

const REST = 'https://data-api.binance.vision/api/v3/klines'
const WS = 'wss://data-stream.binance.vision/ws'

// Abu Dhabi / UAE gold rate = spot (USD/troy-oz) → AED per gram, 24K purity.
const USD_AED = 3.6725
const GRAMS_PER_OZ = 31.1035
const AED_PER_GRAM_24K = (USD_AED / GRAMS_PER_OZ) * 0.999

/** Each app symbol → its Binance source + optional linear price transform. */
const SYMBOL_MAP: Record<string, { binance: string; factor?: number }> = {
  XAUAED: { binance: 'PAXGUSDT', factor: AED_PER_GRAM_24K },
  XAUUSD: { binance: 'PAXGUSDT' },
  BTCUSD: { binance: 'BTCUSDT' },
  ETHUSD: { binance: 'ETHUSDT' },
}

const INTERVAL_MAP: Record<Timeframe, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1W': '1w',
  '1MO': '1M',
}

const CACHE_TTL_MS = 9000
const FETCH_TIMEOUT_MS = 7000

export class LiveMarketDataProvider implements MarketDataProvider {
  readonly sourceLabel = 'LIVE · Binance (PAXG gold)'
  readonly isDemo = false

  private demo: DemoMarketDataProvider
  private status = new Map<string, 'live' | 'demo'>()
  private cache = new Map<string, { t: number; candles: Candle[] }>()

  constructor(demo: DemoMarketDataProvider) {
    this.demo = demo
  }

  getStatus(symbol: string): 'live' | 'demo' {
    return this.status.get(symbol) ?? (SYMBOL_MAP[symbol] ? 'live' : 'demo')
  }

  private precisionFor(symbol: string): number {
    return ASSETS[symbol]?.precision ?? 2
  }

  async getHistory(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]> {
    const mapped = SYMBOL_MAP[symbol]
    if (!mapped) {
      this.status.set(symbol, 'demo')
      return this.demo.getHistory(symbol, timeframe, count)
    }

    const key = `${symbol}|${timeframe}`
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.t < CACHE_TTL_MS && cached.candles.length >= count) {
      return cached.candles.slice(-count).map((c) => ({ ...c }))
    }

    try {
      const want = Math.min(Math.max(count, 480), 1000)
      const url = `${REST}?symbol=${mapped.binance}&interval=${INTERVAL_MAP[timeframe]}&limit=${want}`
      const raw = await fetchJSON(url)
      const p = this.precisionFor(symbol)
      const f = mapped.factor ?? 1
      const candles: Candle[] = (raw as unknown[][]).map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: round(Number(k[1]) * f, p),
        high: round(Number(k[2]) * f, p),
        low: round(Number(k[3]) * f, p),
        close: round(Number(k[4]) * f, p),
        volume: Number(k[5]),
      }))
      if (candles.length < 20) throw new Error('insufficient live candles')
      this.cache.set(key, { t: Date.now(), candles })
      this.status.set(symbol, 'live')
      return candles.slice(-count).map((c) => ({ ...c }))
    } catch {
      // Region block, offline, rate-limit — degrade gracefully to demo.
      this.status.set(symbol, 'demo')
      return this.demo.getHistory(symbol, timeframe, count)
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    const hist = await this.getHistory(symbol, '1H', 30)
    const last = hist[hist.length - 1]
    const prev = hist[hist.length - 25] ?? hist[0]
    return { symbol, price: last.close, changePct: ((last.close - prev.close) / prev.close) * 100, time: last.time }
  }

  subscribe(symbol: string, timeframe: Timeframe, listener: CandleListener): () => void {
    const mapped = SYMBOL_MAP[symbol]
    if (!mapped || this.status.get(symbol) === 'demo') {
      return this.demo.subscribe(symbol, timeframe, listener)
    }

    const p = this.precisionFor(symbol)
    const f = mapped.factor ?? 1
    const stream = `${mapped.binance.toLowerCase()}@kline_${INTERVAL_MAP[timeframe]}`
    let ws: WebSocket | null = null
    let demoUnsub: (() => void) | null = null
    let closedByUs = false
    let lastBarTime = 0

    const startDemoFallback = () => {
      if (demoUnsub || closedByUs) return
      this.status.set(symbol, 'demo')
      demoUnsub = this.demo.subscribe(symbol, timeframe, listener)
    }

    try {
      ws = new WebSocket(`${WS}/${stream}`)
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string)
          const k = msg.k
          if (!k) return
          const time = Math.floor(Number(k.t) / 1000)
          const candle: Candle = {
            time,
            open: round(Number(k.o) * f, p),
            high: round(Number(k.h) * f, p),
            low: round(Number(k.l) * f, p),
            close: round(Number(k.c) * f, p),
            volume: Number(k.v),
          }
          const isNewBar = lastBarTime !== 0 && time > lastBarTime
          lastBarTime = time
          // Keep the history cache's last bar in sync so refreshes stay current.
          const cached = this.cache.get(`${symbol}|${timeframe}`)
          if (cached) {
            const arr = cached.candles
            if (arr.length && arr[arr.length - 1].time === time) arr[arr.length - 1] = candle
            else if (arr.length && time > arr[arr.length - 1].time) arr.push(candle)
          }
          listener(candle, isNewBar)
        } catch {
          /* ignore malformed frame */
        }
      }
      ws.onerror = () => startDemoFallback()
      ws.onclose = () => {
        if (!closedByUs) startDemoFallback()
      }
    } catch {
      startDemoFallback()
    }

    return () => {
      closedByUs = true
      if (ws) {
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        try {
          ws.close()
        } catch {
          /* noop */
        }
      }
      if (demoUnsub) demoUnsub()
    }
  }
}

async function fetchJSON(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function round(v: number, p: number): number {
  const f = Math.pow(10, p)
  return Math.round(v * f) / f
}

/** Singleton the app talks to: live where possible, demo everywhere else. */
export const marketData: MarketDataProvider = new LiveMarketDataProvider(demoMarketData)
