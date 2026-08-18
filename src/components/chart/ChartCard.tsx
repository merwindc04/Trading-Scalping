import { useState } from 'react'
import { Maximize2, Minimize2, Layers, TrendingUp, Ruler, Activity, Sparkles, Ghost, Waves } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import type { Candle } from '@/types/market'
import { TradingChart } from './TradingChart'
import { useAppStore, type OverlayToggles } from '@/store/appStore'
import { fmt, fmtSigned, dirText } from '@/lib/format'
import { DirectionPill } from '@/components/ui/primitives'
import { ASSETS } from '@/lib/assets'
import type { Timeframe, TradingStyle } from '@/types/market'
import { TIMEFRAME_LABEL } from '@/types/market'

const MOBILE_TFS: Timeframe[] = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W', '1MO']
const MOBILE_STYLES: TradingStyle[] = ['SCALP', 'INTRADAY', 'SWING', 'INVEST']

const TOGGLES: { key: keyof OverlayToggles; label: string; icon: typeof Layers }[] = [
  { key: 'structure', label: 'Structure', icon: TrendingUp },
  { key: 'levels', label: 'S/R', icon: Ruler },
  { key: 'emas', label: 'EMAs', icon: Activity },
  { key: 'vwap', label: 'VWAP', icon: Waves },
  { key: 'bbands', label: 'Bollinger', icon: Layers },
  { key: 'projected', label: 'Projected', icon: Sparkles },
  { key: 'ghost', label: 'Ghost', icon: Ghost },
]

export function ChartCard({ analysis, liveCandle, price }: { analysis: Analysis | null; liveCandle: Candle | null; price: number | null }) {
  const { overlays, toggleOverlay, scenarioView, symbol, timeframe, setTimeframe, style, setStyle } = useAppStore()
  const [full, setFull] = useState(false)

  const changePct = analysis?.changePct ?? 0
  const up = changePct >= 0

  return (
    <div className={`panel flex flex-col overflow-hidden ${full ? 'fixed inset-2 z-50' : 'h-full'}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.05] px-3 py-2">
        <div className="flex items-center gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-ink-100">{symbol}</span>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-ink-400">{TIMEFRAME_LABEL[timeframe]}</span>
              {analysis && <DirectionPill direction={analysis.strength.direction} size="sm" />}
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="nums text-lg font-bold text-ink-100">{price == null ? '—' : fmt(price, analysis?.precision ?? 2)}</span>
            {ASSETS[symbol]?.unit && <span className="text-[10px] text-ink-500">{ASSETS[symbol].unit}</span>}
            <span className={`nums text-[12px] font-medium ${up ? dirText.BULLISH : dirText.BEARISH}`}>{fmtSigned(changePct)}%</span>
          </div>
        </div>

        {/* Structure summary chips */}
        {analysis && (
          <div className="hidden items-center gap-1.5 text-[10px] md:flex">
            <Chip label="Trend" value={analysis.structure.trend} tone={analysis.structure.trend} />
            <Chip label="Pattern" value={analysis.pattern.name} />
            <Chip label="Strength" value={`${analysis.strength.overall}/100`} tone={analysis.strength.direction} />
          </div>
        )}

        {/* Toolbar */}
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center gap-0.5 rounded-lg border border-white/[0.06] bg-base-800 p-0.5 sm:flex">
            {TOGGLES.map((t) => {
              const on = overlays[t.key]
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => toggleOverlay(t.key)}
                  title={t.label}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${
                    on ? 'bg-white/[0.08] text-gold-200' : 'text-ink-500 hover:text-ink-300'
                  }`}
                >
                  <Icon size={12} />
                  <span className="hidden lg:inline">{t.label}</span>
                </button>
              )
            })}
          </div>
          <button onClick={() => setFull((v) => !v)} className="btn !px-2" title="Fullscreen">
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Mobile timeframe + style controls (desktop has them in the top nav) */}
      <div className="flex items-center gap-2 border-b border-white/[0.05] px-2 py-1.5 lg:hidden">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto scrollbar-thin">
          {MOBILE_TFS.map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`nums shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${timeframe === t ? 'bg-gradient-to-b from-gold-200 to-gold-400 text-base-950' : 'text-ink-400'}`}
            >
              {TIMEFRAME_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-gold-500/20 bg-base-800 p-0.5">
          {MOBILE_STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`rounded-md px-1.5 py-1 text-[9px] font-semibold ${style === s ? 'bg-white/[0.08] text-gold-200' : 'text-ink-500'}`}
            >
              {s[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative flex-1">
        <TradingChart analysis={analysis} liveCandle={liveCandle} overlays={overlays} scenarioView={scenarioView} />
        {/* Legend */}
        <div className="pointer-events-none absolute left-3 top-2.5 flex flex-col gap-1 text-[9.5px]">
          <LegendRow color="#35b47f" label="Real candles (live)" solid />
          {overlays.ghost && <LegendRow color="rgba(79,211,154,0.55)" label="Ghost candles — projection" />}
          {overlays.projected && (
            <div className="flex items-center gap-2">
              <Legend color="#4fd39a" label="Bull" />
              <Legend color="#e0b866" label="Base" />
              <Legend color="#f0736c" label="Bear" />
            </div>
          )}
        </div>
        {/* Projected divider hint */}
        <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-base-900/70 px-2 py-1 text-[9px] text-ink-500 backdrop-blur">
          Past → Now → Projected scenarios
        </div>
      </div>
    </div>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }) {
  const color = tone ? dirText[tone] : 'text-ink-300'
  return (
    <span className="rounded-md border border-white/[0.06] bg-base-800 px-1.5 py-1">
      <span className="text-ink-500">{label} </span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </span>
  )
}

function LegendRow({ color, label, solid }: { color: string; label: string; solid?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-500">
      <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color, opacity: solid ? 1 : 0.5 }} />
      {label}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-ink-500">
      <span className="inline-block h-0.5 w-3" style={{ background: color }} />
      {label}
    </span>
  )
}
