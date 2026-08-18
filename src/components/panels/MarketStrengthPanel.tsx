import type { Analysis } from '@/lib/analyze'
import { Panel, Meter, DirectionPill, Ring } from '@/components/ui/primitives'

export function MarketStrengthPanel({ analysis }: { analysis: Analysis }) {
  const s = analysis.strength
  return (
    <Panel
      title="AI Market Strength"
      accent
      right={<span className="nums text-[10px] text-ink-500">{analysis.symbol}</span>}
    >
      <div className="mb-3.5 flex items-center gap-3.5">
        <Ring value={s.overall} size={72} label="/ 100" />
        <div className="min-w-0">
          <DirectionPill direction={s.direction} size="lg" />
          <div className="mt-1.5 text-[11px] leading-snug text-ink-400">
            Overall strength <span className="nums font-semibold text-ink-100">{s.overall}/100</span> — a weighted blend of nine analytical
            components.
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5">
        {s.components.map((c) => (
          <Meter key={c.key} label={c.label} value={c.value} />
        ))}
      </div>
    </Panel>
  )
}
