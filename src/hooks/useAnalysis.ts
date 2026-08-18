import { useEffect, useRef, useState } from 'react'
import type { Candle, Timeframe, TradingStyle } from '@/types/market'
import { analyze, type Analysis } from '@/lib/analyze'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'

/* ============================================================
   useAnalysis — runs the ensemble pipeline on selection change,
   keeps a live forming candle streaming for the chart, and
   periodically refreshes the full analysis so panels stay in
   sync without thrashing on every tick.
   ============================================================ */

export interface LiveState {
  analysis: Analysis | null
  liveCandle: Candle | null
  price: number | null
  loading: boolean
  source: 'live' | 'demo'
}

export function useAnalysis(symbol: string, timeframe: Timeframe, style: TradingStyle): LiveState {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'live' | 'demo'>(() => marketData.getStatus(symbol))
  const lastRun = useRef(0)

  // Full analysis on selection change.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    analyze(symbol, timeframe, style).then((a) => {
      if (cancelled) return
      setAnalysis(a)
      setPrice(a.price)
      setLiveCandle(a.candles[a.candles.length - 1])
      setSource(marketData.getStatus(symbol))
      setLoading(false)
      lastRun.current = Date.now()
    })
    return () => {
      cancelled = true
    }
  }, [symbol, timeframe, style])

  // Live tape: update forming candle + price; refresh full analysis on new bar or every 12s.
  useEffect(() => {
    const unsub = marketData.subscribe(symbol, timeframe, (candle, isNewBar) => {
      setLiveCandle(candle)
      setPrice(candle.close)
      const due = Date.now() - lastRun.current > 12000
      if (isNewBar || due) {
        lastRun.current = Date.now()
        analyze(symbol, timeframe, style).then((a) => {
          setAnalysis(a)
          setSource(marketData.getStatus(symbol))
        })
      }
    })
    return unsub
  }, [symbol, timeframe, style])

  return { analysis, liveCandle, price, loading, source }
}
