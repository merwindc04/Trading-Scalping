import { useEffect, useState } from 'react'
import { CalendarRange, Info } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { buildOutlook, type OutlookReport, type HorizonOutlook } from '@/lib/engines/outlook'
import { Panel, DirectionPill } from '@/components/ui/primitives'
import { fmt, fmtSigned } from '@/lib/format'
import { ASSETS } from '@/lib/assets'

/* Multi-month expected-range outlook (1M / 2M / 3M), grounded in realized vol. */
export function OutlookPanel({ analysis }: { analysis: Analysis }) {
  const symbol = analysis.symbol
  const [outlook, setOutlook] = useState<OutlookReport | null>(null)
  const [spot, setSpot] = useState(analysis.price)
  const unit = ASSETS[symbol]?.unit
  const p = analysis.precision

  useEffect(() => {
    let alive = true
    const load = () =>
      marketData.getHistory(symbol, '1D', 200).then((c) => {
        if (!alive || c.length < 30) return
        const closes = c.map((x) => x.close)
        const px = closes[closes.length - 1]
        setSpot(px)
        setOutlook(buildOutlook(closes, px, analysis.bias))
      })
    load()
    const id = window.setInterval(load, 30000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [symbol, analysis.bias])

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <CalendarRange size={12} className="text-gold-300" /> 1–3 Month Outlook
        </span>
      }
      right={outlook ? <span className="nums text-[10px] text-ink-500">σ {outlook.annualVolPct.toFixed(0)}%/yr</span> : null}
    >
      {!outlook ? (
        <div className="rounded-lg bg-base-800 px-3 py-4 text-center text-[11px] text-ink-500">Measuring realized volatility…</div>
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2 text-[11px] text-ink-400">
            <span>Directional lean</span>
            <DirectionPill direction={outlook.lean} size="sm" />
            <span className="ml-auto nums text-ink-500">now {fmt(spot, p)}{unit ? ` ${unit}` : ''}</span>
          </div>
          <div className="space-y-2.5">
            {outlook.horizons.map((h) => (
              <HorizonRow key={h.days} h={h} spot={spot} precision={p} />
            ))}
          </div>
          <div className="mt-3 flex gap-2 rounded-lg border border-white/[0.06] bg-base-800 px-2.5 py-2">
            <Info size={13} className="mt-0.5 shrink-0 text-ink-500" />
            <p className="text-[9.5px] leading-relaxed text-ink-500">
              Expected ranges from the realized volatility of live daily data (XAU spot via gold-api, OHLC via Binance). Bands are 68% / 95%
              probability — a statistical range, <span className="text-ink-400">not a guaranteed target or financial advice.</span>
            </p>
          </div>
        </>
      )}
    </Panel>
  )
}

function HorizonRow({ h, spot, precision }: { h: HorizonOutlook; spot: number; precision: number }) {
  // Position everything on the 95% span.
  const min = h.low95
  const max = h.high95
  const span = max - min || 1
  const pct = (v: number) => `${((v - min) / span) * 100}%`
  const left68 = ((h.low68 - min) / span) * 100
  const width68 = ((h.high68 - h.low68) / span) * 100

  return (
    <div className="panel-inset p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-ink-200">{h.label}</span>
        <span className="nums text-[10px] text-ink-400">
          68%: {fmt(h.low68, precision)} – {fmt(h.high68, precision)} <span className="text-ink-600 text-ink-500">(±{h.bandPct68.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="relative h-6 w-full rounded-md bg-base-900">
        {/* 95% span */}
        <div className="absolute inset-y-0 left-0 right-0 rounded-md" style={{ background: 'color-mix(in oklab, var(--color-gold-500) 8%, transparent)' }} />
        {/* 68% band */}
        <div
          className="absolute inset-y-1 rounded"
          style={{ left: `${left68}%`, width: `${width68}%`, background: 'color-mix(in oklab, var(--color-gold-400) 22%, transparent)' }}
        />
        {/* central */}
        <div className="absolute inset-y-0 w-px bg-gold-200" style={{ left: pct(h.central) }} />
        {/* current price marker */}
        <div className="absolute -inset-y-0.5 w-0.5 rounded bg-ink-100" style={{ left: pct(spot) }} title="Now" />
        {/* end labels */}
        <span className="nums absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-ink-500">{fmt(min, precision)}</span>
        <span className="nums absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-ink-500">{fmt(max, precision)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-ink-500">
        <span>95% range</span>
        <span className="nums">midpoint {fmt(h.central, precision)} · {fmtSigned(h.centralChangePct)}%</span>
      </div>
    </div>
  )
}
