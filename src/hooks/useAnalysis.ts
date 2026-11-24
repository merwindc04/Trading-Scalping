import { useEffect, useRef, useState } from 'react'
import type { Candle, Timeframe, TradingStyle } from '@/types/market'
import { analyze, scaleCandle, type Analysis, type AnalyzeOptions } from '@/lib/analyze'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'

/* ============================================================
   useAnalysis — runs the ensemble pipeline on selection change,
   keeps a live forming candle streaming for the chart, and
   re-runs the full analysis:
     • on every new bar, or every 12 s, and
     • IMMEDIATELY on a significant market change — a move larger
       than 0.6 × ATR since the last run, or price crossing the
       immediate support / resistance zone.
   ============================================================ */

export interface LiveState {
  analysis: Analysis | null
  liveCandle: Candle | null
  price: number | null
  loading: boolean
  source: 'live' | 'demo'
  /** Wall-clock ms of the last market update received. */
  lastTick: number | null
  /** Why the last recalculation happened (shown in the panel). */
  recalcReason: string | null
}

export function useAnalysis(symbol: string, timeframe: Timeframe, style: TradingStyle, opts: AnalyzeOptions = {}): LiveState {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [liveCandle, setLiveCandle] = useState<Candle | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'live' | 'demo'>(() => marketData.getStatus(symbol))
  const [lastTick, setLastTick] = useState<number | null>(null)
  const [recalcReason, setRecalcReason] = useState<string | null>(null)
  const lastRun = useRef(0)
  const running = useRef(false)
  const current = useRef<Analysis | null>(null)

  const optKey = JSON.stringify(opts)

  // Full analysis on selection change.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    analyze(symbol, timeframe, style, opts).then((a) => {
      if (cancelled) return
      current.current = a
      setAnalysis(a)
      setPrice(a.price)
      setLiveCandle(a.candles[a.candles.length - 1])
      setSource(marketData.getStatus(symbol))
      setLastTick(Date.now())
      setRecalcReason('Loaded')
      setLoading(false)
      lastRun.current = Date.now()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, style, optKey])

  // Live tape.
  useEffect(() => {
    let alive = true
    const rerun = (reason: string) => {
      if (running.current) return
      running.current = true
      lastRun.current = Date.now()
      analyze(symbol, timeframe, style, opts)
        .then((a) => {
          if (!alive) return
          current.current = a
          setAnalysis(a)
          setSource(marketData.getStatus(symbol))
          setRecalcReason(reason)
        })
        .finally(() => {
          running.current = false
        })
    }

    const unsub = marketData.subscribe(symbol, timeframe, (raw, isNewBar) => {
      const a = current.current
      const candle = scaleCandle(raw, a?.priceScale ?? 1)
      setLiveCandle(candle)
      setPrice(candle.close)
      setLastTick(Date.now())
      if (isNewBar) return rerun('New bar closed')
      if (a) {
        const atr = a.technical.snapshot.atr
        const moved = Math.abs(candle.close - a.price)
        const z = a.zones
        if (candle.close > z.immediateResistance.top && a.price <= z.immediateResistance.top) return rerun('Price crossed resistance')
        if (candle.close < z.immediateSupport.bottom && a.price >= z.immediateSupport.bottom) return rerun('Price crossed support')
        if (atr > 0 && moved > atr * 0.6 && Date.now() - lastRun.current > 1500) return rerun(`Move of ${(moved / atr).toFixed(1)}× ATR`)
      }
      if (Date.now() - lastRun.current > 12000) rerun('Scheduled refresh')
    })
    return () => {
      alive = false
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, style, optKey])

  return { analysis, liveCandle, price, loading, source, lastTick, recalcReason }
}
