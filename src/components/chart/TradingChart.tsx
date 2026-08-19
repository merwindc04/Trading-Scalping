import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts'
import type { Candle } from '@/types/market'
import type { Analysis } from '@/lib/analyze'
import type { OverlayToggles, ScenarioView } from '@/store/appStore'
import { dirColor } from '@/lib/format'

/* ============================================================
   TradingChart

   Professional candlestick chart (lightweight-charts) layered
   with structure markers, S/R price lines, EMAs / VWAP / BB,
   the Projected Pattern™ scenario paths, translucent Ghost
   Candles and their widening uncertainty envelope.

   The chart instance persists across analysis refreshes so the
   user's zoom/pan is preserved; only data is updated.
   ============================================================ */

const UP = '#35b47f'
const DOWN = '#e0554e'

const SCENARIO_COLORS: Record<string, string> = {
  bull: '#4fd39a',
  base: '#e0b866',
  bear: '#f0736c',
}

interface Refs {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
  ghost: ISeriesApi<'Candlestick'>
  envUpper: ISeriesApi<'Line'>
  envLower: ISeriesApi<'Line'>
  ema9: ISeriesApi<'Line'>
  ema20: ISeriesApi<'Line'>
  ema50: ISeriesApi<'Line'>
  vwap: ISeriesApi<'Line'>
  bbU: ISeriesApi<'Line'>
  bbL: ISeriesApi<'Line'>
  proj: Record<string, ISeriesApi<'Line'>>
  priceLines: IPriceLine[]
}

export function TradingChart({
  analysis,
  liveCandle,
  overlays,
  scenarioView,
}: {
  analysis: Analysis | null
  liveCandle: Candle | null
  overlays: OverlayToggles
  scenarioView: ScenarioView
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Refs | null>(null)
  const lastView = useRef<string>('')

  // --- create chart once ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b91a0',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.035)' },
        horzLines: { color: 'rgba(255,255,255,0.035)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(217,184,107,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#a8843c' },
        horzLine: { color: 'rgba(217,184,107,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#a8843c' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false, rightOffset: 14, barSpacing: 8 },
      handleScroll: true,
      handleScale: true,
    })

    const candles = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: 'rgba(53,180,127,0.75)',
      wickDownColor: 'rgba(224,85,78,0.75)',
      priceLineColor: 'rgba(217,184,107,0.6)',
      priceLineStyle: LineStyle.Dotted,
    })

    const volume = chart.addHistogramSeries({
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      color: 'rgba(255,255,255,0.18)',
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    const ghost = chart.addCandlestickSeries({
      upColor: 'rgba(79,211,154,0.28)',
      downColor: 'rgba(240,115,108,0.28)',
      borderUpColor: 'rgba(79,211,154,0.55)',
      borderDownColor: 'rgba(240,115,108,0.55)',
      wickUpColor: 'rgba(79,211,154,0.4)',
      wickDownColor: 'rgba(240,115,108,0.4)',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const mkLine = (color: string, width: 1 | 2 | 3, style: LineStyle = LineStyle.Solid) =>
      chart.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })

    const envUpper = mkLine('rgba(217,184,107,0.32)', 1, LineStyle.Dashed)
    const envLower = mkLine('rgba(217,184,107,0.32)', 1, LineStyle.Dashed)
    const ema9 = mkLine('rgba(120,200,255,0.9)', 1)
    const ema20 = mkLine('rgba(232,200,119,0.95)', 1)
    const ema50 = mkLine('rgba(168,132,60,0.9)', 2)
    const vwap = mkLine('rgba(180,140,255,0.85)', 1, LineStyle.Dotted)
    const bbU = mkLine('rgba(255,255,255,0.18)', 1)
    const bbL = mkLine('rgba(255,255,255,0.18)', 1)

    const proj: Record<string, ISeriesApi<'Line'>> = {
      bull: mkLine(SCENARIO_COLORS.bull, 2, LineStyle.Dashed),
      base: mkLine(SCENARIO_COLORS.base, 2, LineStyle.Dashed),
      bear: mkLine(SCENARIO_COLORS.bear, 2, LineStyle.Dashed),
    }

    refs.current = { chart, candles, volume, ghost, envUpper, envLower, ema9, ema20, ema50, vwap, bbU, bbL, proj, priceLines: [] }

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      refs.current = null
    }
  }, [])

  // --- redraw on analysis / overlays / scenario change ---
  useEffect(() => {
    const r = refs.current
    if (!r || !analysis) return
    const p = analysis.precision
    const asTime = (t: number) => t as Time

    // Candles + volume
    r.candles.setData(
      analysis.candles.map((c) => ({ time: asTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close })),
    )
    r.volume.setData(
      analysis.candles.map((c) => ({ time: asTime(c.time), value: c.volume, color: c.close >= c.open ? 'rgba(53,180,127,0.28)' : 'rgba(224,85,78,0.28)' })),
    )

    // Indicator overlays
    const ser = analysis.technical.snapshot.series
    const lineData = (arr: number[]) => analysis.candles.map((c, i) => ({ time: asTime(c.time), value: arr[i] })).filter((d) => Number.isFinite(d.value))
    r.ema9.setData(lineData(ser.ema9))
    r.ema20.setData(lineData(ser.ema20))
    r.ema50.setData(lineData(ser.ema50))
    r.vwap.setData(lineData(ser.vwap))
    r.bbU.setData(lineData(ser.bbUpper))
    r.bbL.setData(lineData(ser.bbLower))
    r.ema9.applyOptions({ visible: overlays.emas })
    r.ema20.applyOptions({ visible: overlays.emas })
    r.ema50.applyOptions({ visible: overlays.emas })
    r.vwap.applyOptions({ visible: overlays.vwap })
    r.bbU.applyOptions({ visible: overlays.bbands })
    r.bbL.applyOptions({ visible: overlays.bbands })

    // Structure markers (HH/HL/LH/LL + BOS/CHoCH)
    const markers: SeriesMarker<Time>[] = []
    if (overlays.structure) {
      for (const s of analysis.structure.swings.slice(-10)) {
        const bull = s.label === 'HH' || s.label === 'HL'
        markers.push({
          time: asTime(s.time),
          position: s.type === 'high' ? 'aboveBar' : 'belowBar',
          color: bull ? 'rgba(79,211,154,0.9)' : 'rgba(240,115,108,0.9)',
          shape: s.type === 'high' ? 'arrowDown' : 'arrowUp',
          text: s.label,
        })
      }
      for (const e of analysis.structure.events.slice(-4)) {
        markers.push({
          time: asTime(e.time),
          position: e.direction === 'BULLISH' ? 'belowBar' : 'aboveBar',
          color: e.kind === 'CHoCH' ? '#e8c877' : e.direction === 'BULLISH' ? '#4fd39a' : '#f0736c',
          shape: 'circle',
          text: e.kind,
        })
      }
    }
    // Signal marker on the latest bar — the decisive BUY / SELL indication.
    const sg = analysis.signal
    if (overlays.signals && sg.action !== 'WAIT') {
      const anchorTime = analysis.candles[analysis.candles.length - 1].time
      markers.push({
        time: asTime(anchorTime),
        position: sg.action === 'BUY' ? 'belowBar' : 'aboveBar',
        color: sg.action === 'BUY' ? '#4fd39a' : '#f0736c',
        shape: sg.action === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${sg.action} ${sg.grade}`,
        size: 2,
      })
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    r.candles.setMarkers(markers)

    // Price lines: S/R levels + primary targets + invalidation
    for (const pl of r.priceLines) r.candles.removePriceLine(pl)
    r.priceLines = []
    if (overlays.levels) {
      for (const lvl of analysis.structure.levels) {
        r.priceLines.push(
          r.candles.createPriceLine({
            price: lvl.price,
            color: lvl.kind === 'resistance' ? 'rgba(240,115,108,0.5)' : 'rgba(79,211,154,0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: lvl.kind === 'resistance' ? 'R' : 'S',
          }),
        )
      }
    }
    if (overlays.projected) {
      const prim = analysis.forecast.primary
      prim.targets.forEach((t, i) => {
        r.priceLines.push(
          r.candles.createPriceLine({
            price: t,
            color: 'rgba(217,184,107,0.6)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `T${i + 1}`,
          }),
        )
      })
      r.priceLines.push(
        r.candles.createPriceLine({
          price: prim.invalidation,
          color: 'rgba(224,85,78,0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'INVAL',
        }),
      )
    }
    // Signal entry line — where the BUY / SELL setup is triggered.
    if (overlays.signals && sg.action !== 'WAIT') {
      const entry = (sg.entryLow + sg.entryHigh) / 2
      const buy = sg.action === 'BUY'
      r.priceLines.push(
        r.candles.createPriceLine({
          price: entry,
          color: buy ? 'rgba(79,211,154,0.95)' : 'rgba(240,115,108,0.95)',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: buy ? 'BUY ▲' : 'SELL ▼',
        }),
      )
    }

    // Projected Pattern paths — anchor each at the last real candle for continuity.
    const anchor = analysis.candles[analysis.candles.length - 1]
    const anchorPt = { time: asTime(anchor.time), value: anchor.close }
    for (const key of ['bull', 'base', 'bear'] as const) {
      const sc = analysis.forecast.scenarios.find((s) => s.key === key)!
      const show = overlays.projected && (scenarioView === 'all' || scenarioView === key)
      const data = show ? [anchorPt, ...sc.path.map((g) => ({ time: asTime(g.time), value: g.close }))] : []
      r.proj[key].setData(data)
      r.proj[key].applyOptions({ lineWidth: scenarioView === key ? 3 : 2 })
    }

    // Ghost candles + envelope for the focused scenario (primary when "all")
    const ghostSc = scenarioView === 'all' ? analysis.forecast.primary : analysis.forecast.scenarios.find((s) => s.key === scenarioView)!
    if (overlays.ghost) {
      r.ghost.setData(ghostSc.path.map((g) => ({ time: asTime(g.time), open: g.open, high: g.high, low: g.low, close: g.close })))
      r.envUpper.setData([anchorPt, ...ghostSc.path.map((g) => ({ time: asTime(g.time), value: g.bandHigh }))])
      r.envLower.setData([anchorPt, ...ghostSc.path.map((g) => ({ time: asTime(g.time), value: g.bandLow }))])
    } else {
      r.ghost.setData([])
      r.envUpper.setData([])
      r.envLower.setData([])
    }

    // Preserve zoom across refreshes; only fit when the market/timeframe changes.
    const viewKey = `${analysis.symbol}|${analysis.timeframe}`
    if (lastView.current !== viewKey) {
      lastView.current = viewKey
      r.chart.timeScale().fitContent()
    }
    void p
  }, [analysis, overlays, scenarioView])

  // --- live forming candle ---
  useEffect(() => {
    const r = refs.current
    if (!r || !liveCandle) return
    const t = liveCandle.time as Time
    r.candles.update({ time: t, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close })
    r.volume.update({ time: t, value: liveCandle.volume, color: liveCandle.close >= liveCandle.open ? 'rgba(53,180,127,0.28)' : 'rgba(224,85,78,0.28)' })
  }, [liveCandle])

  return <div ref={containerRef} className="h-full w-full" />
}

/* re-export for external legend use */
export { SCENARIO_COLORS, dirColor }
