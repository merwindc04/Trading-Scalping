import type { IChartApi, ISeriesApi, ISeriesPrimitive, ISeriesPrimitivePaneRenderer, ISeriesPrimitivePaneView, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts'

/* ============================================================
   Canvas overlay attached to the candle series:
     • S/R zones as shaded horizontal bands (strength → opacity)
     • Forecast confidence bands as filled cones per scenario
     • A NOW divider separating ACTUAL from PROJECTED prices
   Drawn behind the candles so price action is never obscured.
   ============================================================ */

export interface ZoneDraw {
  top: number
  bottom: number
  fill: string
  stroke: string
  label: string
  emphasis: boolean
}

export interface BandDraw {
  points: { time: number; hi: number; lo: number }[]
  fill: string
}

export interface OverlayData {
  zones: ZoneDraw[]
  bands: BandDraw[]
  nowTime: number | null
}

interface MediaScope {
  context: CanvasRenderingContext2D
  mediaSize: { width: number; height: number }
}
interface Target {
  useMediaCoordinateSpace<T>(f: (scope: MediaScope) => T): T
}

export class ChartOverlayPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private request: (() => void) | null = null
  data: OverlayData = { zones: [], bands: [], nowTime: null }
  private views: ISeriesPrimitivePaneView[]

  constructor() {
    const self = this
    const bg: ISeriesPrimitivePaneRenderer = {
      draw() {},
      drawBackground(target) {
        ;(target as unknown as Target).useMediaCoordinateSpace((scope) => self.drawBack(scope))
      },
    }
    const fg: ISeriesPrimitivePaneRenderer = {
      draw(target) {
        ;(target as unknown as Target).useMediaCoordinateSpace((scope) => self.drawFront(scope))
      },
    }
    this.views = [
      { zOrder: () => 'bottom', renderer: () => bg },
      { zOrder: () => 'top', renderer: () => fg },
    ]
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart
    this.series = p.series
    this.request = p.requestUpdate
  }
  detached() {
    this.chart = null
    this.series = null
    this.request = null
  }
  updateAllViews() {}
  paneViews() {
    return this.views
  }

  setData(d: OverlayData) {
    this.data = d
    this.request?.()
  }

  private y(price: number): number | null {
    const v = this.series?.priceToCoordinate(price)
    return v == null ? null : v
  }
  private x(time: number): number | null {
    const v = this.chart?.timeScale().timeToCoordinate(time as Time)
    return v == null ? null : v
  }

  private drawBack({ context: ctx, mediaSize }: MediaScope) {
    const W = mediaSize.width
    // Projected region tint
    const nx = this.data.nowTime != null ? this.x(this.data.nowTime) : null
    if (nx != null && nx < W) {
      const g = ctx.createLinearGradient(nx, 0, W, 0)
      g.addColorStop(0, 'rgba(217,184,107,0.045)')
      g.addColorStop(1, 'rgba(217,184,107,0.0)')
      ctx.fillStyle = g
      ctx.fillRect(nx, 0, W - nx, mediaSize.height)
    }

    // Zones
    for (const z of this.data.zones) {
      const y1 = this.y(z.top)
      const y2 = this.y(z.bottom)
      if (y1 == null || y2 == null) continue
      const top = Math.min(y1, y2)
      const h = Math.max(2, Math.abs(y2 - y1))
      ctx.fillStyle = z.fill
      ctx.fillRect(0, top, W, h)
      if (!z.emphasis) continue // minor zones: fill only, keeps the chart clean
      ctx.strokeStyle = z.stroke
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, top + 0.5)
      ctx.lineTo(W, top + 0.5)
      ctx.moveTo(0, top + h - 0.5)
      ctx.lineTo(W, top + h - 0.5)
      ctx.stroke()
      if (z.label) {
        ctx.font = '600 9.5px Inter, system-ui, sans-serif'
        ctx.fillStyle = z.stroke
        ctx.fillText(z.label, 8, top + Math.min(h, 14) - 3 + (h < 12 ? 10 : 0))
      }
    }

    // Confidence bands
    for (const b of this.data.bands) {
      const pts = b.points.map((p) => ({ x: this.x(p.time), hi: this.y(p.hi), lo: this.y(p.lo) })).filter((p) => p.x != null && p.hi != null && p.lo != null) as {
        x: number
        hi: number
        lo: number
      }[]
      if (pts.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].hi)
      for (const p of pts) ctx.lineTo(p.x, p.hi)
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].lo)
      ctx.closePath()
      ctx.fillStyle = b.fill
      ctx.fill()
    }
  }

  private drawFront({ context: ctx, mediaSize }: MediaScope) {
    if (this.data.nowTime == null) return
    const nx = this.x(this.data.nowTime)
    if (nx == null) return
    ctx.strokeStyle = 'rgba(217,184,107,0.55)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(nx + 0.5, 0)
    ctx.lineTo(nx + 0.5, mediaSize.height)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '700 9px Inter, system-ui, sans-serif'
    const y = mediaSize.height - 30
    ctx.fillStyle = 'rgba(168,174,186,0.8)'
    ctx.textAlign = 'right'
    ctx.fillText('ACTUAL', nx - 6, y)
    ctx.fillStyle = 'rgba(232,200,119,0.95)'
    ctx.textAlign = 'left'
    ctx.fillText('PROJECTED ›', nx + 6, y)
    ctx.textAlign = 'start'
  }
}
