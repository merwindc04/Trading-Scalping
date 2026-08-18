import type { Analysis } from '@/lib/analyze'
import { Panel, Sparkline } from '@/components/ui/primitives'
import { dirColor, fmtSigned } from '@/lib/format'

export function HistoricalPanel({ analysis }: { analysis: Analysis }) {
  const h = analysis.historical
  return (
    <Panel
      title="Historical Analogues"
      right={<span className="nums text-[10px] text-ink-500">{h.matchCount} setups</span>}
      className="h-full"
    >
      <div className="mb-2.5 grid grid-cols-3 gap-1.5 text-center">
        <Outcome label="Bullish" value={h.bullishPct} color="var(--color-bull-400)" />
        <Outcome label="Neutral" value={h.neutralPct} color="var(--color-neutral-400)" />
        <Outcome label="Bearish" value={h.bearishPct} color="var(--color-bear-400)" />
      </div>
      <div className="space-y-1">
        {h.topMatches.map((m, i) => {
          const closes = m.window.map((c) => c.close)
          const up = m.forwardReturnPct >= 0
          return (
            <div key={i} className="flex items-center gap-2 rounded-md bg-base-800 px-2 py-1.5">
              <span className="grid h-5 w-5 place-items-center rounded bg-white/[0.05] text-[9px] font-bold text-ink-300">#{i + 1}</span>
              <div className="w-16">
                <div className="nums text-[11px] font-semibold text-gold-100">{m.similarity.toFixed(0)}%</div>
                <div className="text-[8px] text-ink-500">similarity</div>
              </div>
              <Sparkline data={closes} color="var(--color-ink-400)" width={54} height={18} />
              <div className="ml-auto text-right">
                <div className="nums text-[11px] font-semibold" style={{ color: up ? 'var(--color-bull-400)' : 'var(--color-bear-400)' }}>
                  {fmtSigned(m.forwardReturnPct)}%
                </div>
                <div className="text-[8px]" style={{ color: dirColor[m.outcome === 'Bullish continuation' ? 'BULLISH' : m.outcome === 'Bearish reversal' ? 'BEARISH' : 'NEUTRAL'] }}>
                  {m.outcome.split(' ')[0]}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Outcome({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md bg-base-800 py-2">
      <div className="nums text-lg font-bold" style={{ color }}>
        {value}%
      </div>
      <div className="text-[9px] uppercase tracking-wide text-ink-500">{label}</div>
    </div>
  )
}
