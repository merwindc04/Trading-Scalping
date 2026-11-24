import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type IPriceLine, type Time } from 'lightweight-charts'
import type { Candle } from '@/types/market'
import type { ReplayResult } from '@/lib/engines/timeMachine'

/* Time Machine chart: the past up to the replay point in full colour, the
   hidden future revealed in muted candles, plus the call's target/stop. */

const UP = '#35b47f'
const DOWN = '#e0554e'
const LOOKBACK = 160

interface Refs {
  chart: IChartApi
  past: ISeriesApi<'Candlestick'>
  future: ISeriesApi<'Candlestick'>
  lines: IPriceLine[]
}

export function ReplayChart({ candles, index, revealed, replay }: { candles: Candle[]; index: number; revealed: boolean; replay: ReplayResult | null }) {
  const el = useRef<HTMLDivElement>(null)
  const refs = useRef<Refs | null>(null)

  useEffect(() => {
    if (!el.current) return
    const chart = createChart(el.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8b91a0', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.035)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(217,184,107,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#a8843c' },
        horzLine: { color: 'rgba(217,184,107,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#a8843c' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
      autoSize: true,
    })
    const past = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: 'rgba(53,180,127,0.75)',
      wickDownColor: 'rgba(224,85,78,0.75)',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    const future = chart.addCandlestickSeries({
      upColor: 'rgba(79,211,154,0.3)',
      downColor: 'rgba(240,115,108,0.3)',
      borderUpColor: 'rgba(79,211,154,0.6)',
      borderDownColor: 'rgba(240,115,108,0.6)',
      wickUpColor: 'rgba(79,211,154,0.45)',
      wickDownColor: 'rgba(240,115,108,0.45)',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    refs.current = { chart, past, future, lines: [] }
    return () => {
      chart.remove()
      refs.current = null
    }
  }, [])

  useEffect(() => {
    const r = refs.current
    if (!r || !candles.length) return
    const h = replay?.horizonSteps ?? 0
    const from = Math.max(0, index - LOOKBACK)
    const toBar = (c: Candle) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })
    r.past.setData(candles.slice(from, index + 1).map(toBar))
    r.future.setData(revealed ? candles.slice(index + 1, index + 1 + h).map(toBar) : [])
    r.past.setMarkers([{ time: candles[index].time as Time, position: 'aboveBar', color: '#e0b866', shape: 'arrowDown', text: 'Replay point' }])

    for (const l of r.lines) r.past.removePriceLine(l)
    r.lines = []
    if (replay) {
      const add = (price: number, color: string, title: string, style = LineStyle.Dashed) => {
        if (Number.isFinite(price)) r.lines.push(r.past.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }))
      }
      if (replay.direction === 'NEUTRAL') {
        add(replay.rangeTop, 'rgba(160,166,180,0.8)', 'Range top')
        add(replay.rangeBottom, 'rgba(160,166,180,0.8)', 'Range bottom')
      } else {
        add(replay.target, replay.direction === 'BULLISH' ? '#4fd39a' : '#f0736c', 'Target')
        add(replay.invalidation, '#e0a640', 'Invalidation')
      }
      add(replay.price, 'rgba(217,184,107,0.7)', 'Then', LineStyle.Dotted)
    }
    // Show the whole past window plus room on the right for the future window,
    // so revealing never shifts the replay point.
    const pastBars = index - from + 1
    r.chart.timeScale().setVisibleLogicalRange({ from: -1, to: pastBars + h + 3 })
  }, [candles, index, revealed, replay])

  return <div ref={el} className="h-full w-full" />
}
