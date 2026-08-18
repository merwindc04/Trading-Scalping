import type { Analysis } from '@/lib/analyze'
import { Panel } from '@/components/ui/primitives'
import { dirColor } from '@/lib/format'

export function MultiTimeframePanel({ analysis }: { analysis: Analysis }) {
  const mtf = analysis.mtf
  return (
    <Panel
      title="Multi-Timeframe Matrix"
      right={
        <span className="nums text-[10px] font-semibold" style={{ color: dirColor[mtf.dominant] }}>
          {mtf.alignmentPct}% aligned
        </span>
      }
      className="h-full"
    >
      <div className="space-y-1">
        {mtf.rows.map((r) => (
          <div key={r.timeframe} className="flex items-center gap-2">
            <span className="nums w-8 text-[11px] font-medium text-ink-400">{r.timeframe}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-800">
              <div className="h-full rounded-full" style={{ width: `${r.bullScore}%`, background: dirColor[r.direction] }} />
            </div>
            <span className="w-24 text-right text-[10px] font-medium" style={{ color: dirColor[r.direction] }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 rounded-md bg-base-800 px-2 py-1.5">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-ink-500">Timeframe Alignment</span>
          <span className="nums font-semibold" style={{ color: dirColor[mtf.dominant] }}>
            {mtf.alignmentPct}% {mtf.dominant}
          </span>
        </div>
        {mtf.conflict ? (
          <p className="text-[10px] leading-relaxed text-[var(--color-neutral-400)]">⚠ {mtf.conflict}</p>
        ) : (
          <p className="text-[10px] leading-relaxed text-ink-500">Smaller and larger timeframes broadly agree — a cleaner, higher-conviction backdrop.</p>
        )}
      </div>
    </Panel>
  )
}
