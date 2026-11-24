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
import type { ChartType, OverlayToggles, ScenarioView } from '@/store/appStore'
import { ChartOverlayPrimitive, type BandDraw, type ZoneDraw } from './overlayPrimitive'
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
  line: ISeriesApi<'Area'>
  overlay: ChartOverlayPrimitive
  priceLines: IPriceLine[]
}

export function TradingChart({
  analysis,
  liveCandle,
  overlays,
  scenarioView,
  chartType = 'candles',
}: {
  analysis: Analysis | null
  liveCandle: Candle | null
  overlays: OverlayToggles
  scenarioView: ScenarioView
  chartType?: ChartType
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Refs | null>(null)
  const lastView = useRef<string>('')
  const lastBarTime = useRef<number>(0)
  // Smooth tick animation state
  const shown = useRef<{ time: number; close: number } | null>(null)
  const anim = useRef<number>(0)

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

    const line = chart.addAreaSeries({
      lineColor: '#e8c877',
      lineWidth: 2,
      topColor: 'rgba(232,200,119,0.18)',
      bottomColor: 'rgba(232,200,119,0.0)',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      visible: false,
    })

    const overlay = new ChartOverlayPrimitive()
    candles.attachPrimitive(overlay)

    refs.current = { chart, candles, volume, ghost, envUpper, envLower, ema9, ema20, ema50, vwap, bbU, bbL, proj, line, overlay, priceLines: [] }

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(anim.current)
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
    // Line mode: draw closes as an area line; candles stay (transparent) so
    // markers, price lines and the zone overlay keep working in both modes.
    const lineMode = chartType === 'line'
    r.line.setData(analysis.candles.map((c) => ({ time: asTime(c.time), value: c.close })))
    r.line.applyOptions({ visible: lineMode })
    const clear = 'rgba(0,0,0,0)'
    r.candles.applyOptions(
      lineMode
        ? { upColor: clear, downColor: clear, borderUpColor: clear, borderDownColor: clear, wickUpColor: clear, wickDownColor: clear }
        : { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: 'rgba(53,180,127,0.75)', wickDownColor: 'rgba(224,85,78,0.75)' },
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
    // Signal marker on the latest bar — always present so every timeframe
    // (incl. 1W / 1M) shows the current call: BUY, SELL or a neutral HOLD.
    const sg = analysis.signal
    if (overlays.signals) {
      const anchorTime = analysis.candles[analysis.candles.length - 1].time
      if (sg.action === 'BUY' || sg.action === 'SELL') {
        markers.push({
          time: asTime(anchorTime),
          position: sg.action === 'BUY' ? 'belowBar' : 'aboveBar',
          color: sg.action === 'BUY' ? '#4fd39a' : '#f0736c',
          shape: sg.action === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${sg.action} ${sg.grade}`,
          size: 2,
        })
      } else {
        markers.push({
          time: asTime(anchorTime),
          position: 'aboveBar',
          color: '#e0b866',
          shape: 'circle',
          text: 'HOLD',
          size: 1,
        })
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    r.candles.setMarkers(markers)

    // Price lines: S/R levels + primary targets + invalidation
    for (const pl of r.priceLines) r.candles.removePriceLine(pl)
    r.priceLines = []
    // Dynamic S/R zones: shaded bands via the overlay primitive, plus axis labels
    // for the immediate floor / ceiling and the confirmation level of the bias.
    const zd = analysis.zones
    const zonesDraw: ZoneDraw[] = []
    if (overlays.levels) {
      for (const z of zd.zones) {
        const res = z.kind === 'resistance'
        const isImm = z.id === zd.immediateSupport.id || z.id === zd.immediateResistance.id
        const isMajor = z.id === zd.majorSupport.id || z.id === zd.majorResistance.id
        const a = 0.05 + (z.strength / 100) * 0.13
        zonesDraw.push({
          top: z.top,
          bottom: z.bottom,
          fill: res ? `rgba(240,115,108,${a})` : `rgba(79,211,154,${a})`,
          stroke: res ? 'rgba(240,115,108,0.55)' : 'rgba(79,211,154,0.55)',
          label: isImm || isMajor ? `${res ? 'Resistance' : 'Support'}${isMajor ? ' · major' : ''} · ${z.strength}` : '',
          emphasis: isImm || isMajor,
        })
      }
      const axis = (price: number, color: string, title: string, style: LineStyle = LineStyle.Dashed) =>
        r.priceLines.push(r.candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }))
      axis(zd.immediateResistance.center, 'rgba(240,115,108,0.6)', 'R')
      axis(zd.immediateSupport.center, 'rgba(79,211,154,0.6)', 'S')
      if (analysis.bias === 'BULLISH') axis(zd.confirmation.bull, 'rgba(79,211,154,0.9)', 'CONF ▲', LineStyle.SparseDotted)
      if (analysis.bias === 'BEARISH') axis(zd.confirmation.bear, 'rgba(240,115,108,0.9)', 'CONF ▼', LineStyle.SparseDotted)
    }
    if (overlays.fib) {
      for (const l of analysis.fib.levels) {
        if (l.ratio === 0 || l.ratio === 1) continue
        r.priceLines.push(
          r.candles.createPriceLine({
            price: l.price,
            color: l.kind === 'extension' ? 'rgba(180,140,255,0.5)' : 'rgba(120,200,255,0.45)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: `Fib ${l.label}`,
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

    // Filled confidence bands: every visible scenario faintly, the focused one stronger.
    const BAND: Record<string, string> = { bull: '79,211,154', base: '168,174,186', bear: '240,115,108' }
    const bands: BandDraw[] = []
    for (const sc of analysis.forecast.scenarios) {
      const focused = sc.key === ghostSc.key
      const visible = (overlays.ghost && focused) || (overlays.projected && (scenarioView === 'all' || scenarioView === sc.key))
      if (!visible) continue
      bands.push({
        points: [{ time: anchor.time, hi: anchor.close, lo: anchor.close }, ...sc.path.map((g) => ({ time: g.time, hi: g.bandHigh, lo: g.bandLow }))],
        fill: `rgba(${BAND[sc.key]},${focused ? 0.1 : 0.04})`,
      })
    }
    r.overlay.setData({ zones: zonesDraw, bands, nowTime: overlays.projected || overlays.ghost ? anchor.time : null })

    // Track the last real bar's time so live ticks can't feed out-of-order data.
    lastBarTime.current = analysis.candles[analysis.candles.length - 1].time

    // Preserve zoom across refreshes; only fit when the market/timeframe changes.
    const viewKey = `${analysis.symbol}|${analysis.timeframe}`
    if (lastView.current !== viewKey) {
      lastView.current = viewKey
      r.chart.timeScale().fitContent()
    }
    void p
  }, [analysis, overlays, scenarioView, chartType])

  // --- live forming candle (smoothly animated between ticks) ---
  useEffect(() => {
    const r = refs.current
    if (!r || !liveCandle) return
    // Guard against stale ticks from a prior timeframe's stream arriving after a
    // switch — lightweight-charts throws if update() goes back in time.
    if (liveCandle.time < lastBarTime.current) return
    const c = liveCandle
    const t = c.time as Time
    const push = (close: number) => {
      try {
        r.candles.update({ time: t, open: c.open, high: Math.max(c.high, close), low: Math.min(c.low, close), close })
        r.line.update({ time: t, value: close })
      } catch {
        /* out-of-order tick during a source switch — ignore */
      }
    }
    try {
      r.volume.update({ time: t, value: c.volume, color: c.close >= c.open ? 'rgba(53,180,127,0.28)' : 'rgba(224,85,78,0.28)' })
    } catch {
      return
    }
    lastBarTime.current = c.time
    cancelAnimationFrame(anim.current)
    const from = shown.current && shown.current.time === c.time ? shown.current.close : c.close
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (from === c.close || reduce) {
      push(c.close)
      shown.current = { time: c.time, close: c.close }
      return
    }
    const start = performance.now()
    const DUR = 320
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / DUR)
      const e = 1 - Math.pow(1 - k, 3)
      const v = from + (c.close - from) * e
      push(v)
      shown.current = { time: c.time, close: v }
      if (k < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [liveCandle])

  return <div ref={containerRef} className="h-full w-full" />
}

/* re-export for external legend use */
export { SCENARIO_COLORS, dirColor }
