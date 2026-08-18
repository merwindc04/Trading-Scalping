import { Sparkles, ShieldAlert } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import { Panel } from '@/components/ui/primitives'
import { dirColor } from '@/lib/format'

export function ExplainPanel({ analysis }: { analysis: Analysis }) {
  const e = analysis.explanation
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-gold-300" /> Why This Forecast?
        </span>
      }
    >
      <h4 className="mb-2.5 text-[13px] font-semibold text-ink-100">{e.headline}</h4>
      <ul className="space-y-2">
        {e.bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dirColor[b.tone] }} />
            <span>{b.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2 rounded-lg border border-[var(--color-bear-500)]/25 bg-[var(--color-bear-500)]/[0.06] px-2.5 py-2">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[var(--color-bear-400)]" />
        <p className="text-[10.5px] leading-relaxed text-ink-300">{e.invalidation}</p>
      </div>
    </Panel>
  )
}
