import type { Analysis } from '@/lib/analyze'
import { Panel, Sparkline } from '@/components/ui/primitives'
import { dirColor } from '@/lib/format'

export function MomentumPanel({ analysis }: { analysis: Analysis }) {
  const t = analysis.technical
  const snap = t.snapshot
  const rsiSeries = snap.series.rsi.filter(Number.isFinite).slice(-40)
  const histSeries = snap.series.macdHist.filter(Number.isFinite).slice(-40)

  return (
    <Panel title="Momentum & Indicators" className="h-full">
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        <Gauge label="Trend" value={t.trendScore} />
        <Gauge label="Momentum" value={t.momentumScore} />
        <Gauge label="Volatility" value={t.volatilityScore} />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-1.5">
        <MiniStat label="RSI (14)" value={snap.rsi.toFixed(0)} spark={rsiSeries} tint={snap.rsi > 55 ? 'var(--color-bull-400)' : snap.rsi < 45 ? 'var(--color-bear-400)' : 'var(--color-neutral-400)'} />
        <MiniStat label="MACD Hist" value={snap.macdHist >= 0 ? '▲' : '▼'} spark={histSeries} tint={snap.macdHist >= 0 ? 'var(--color-bull-400)' : 'var(--color-bear-400)'} />
      </div>
      <ul className="space-y-1.5">
        {t.readings.slice(0, 4).map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[10.5px] leading-snug">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dirColor[r.bias > 0.2 ? 'BULLISH' : r.bias < -0.2 ? 'BEARISH' : 'NEUTRAL'] }} />
            <span className="text-ink-400">
              <span className="font-medium text-ink-200">{r.label}:</span> {r.note}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Gauge({ label, value }: { label: string; value: number }) {
  const color = value >= 60 ? 'var(--color-bull-400)' : value <= 40 ? 'var(--color-bear-400)' : 'var(--color-neutral-400)'
  return (
    <div className="rounded-md bg-base-800 p-2 text-center">
      <div className="nums text-base font-bold" style={{ color }}>
        {Math.round(value)}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-ink-500">{label}</div>
    </div>
  )
}

function MiniStat({ label, value, spark, tint }: { label: string; value: string; spark: number[]; tint: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-base-800 px-2 py-1.5">
      <div>
        <div className="text-[9px] uppercase tracking-wide text-ink-500">{label}</div>
        <div className="nums text-[13px] font-bold" style={{ color: tint }}>
          {value}
        </div>
      </div>
      <div className="ml-auto">
        <Sparkline data={spark} color={tint} width={56} height={20} />
      </div>
    </div>
  )
}
