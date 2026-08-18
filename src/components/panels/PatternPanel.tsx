import type { Analysis } from '@/lib/analyze'
import { Panel, DirectionPill } from '@/components/ui/primitives'
import { fmt } from '@/lib/format'
import { useAppStore } from '@/store/appStore'

export function PatternPanel({ analysis }: { analysis: Analysis }) {
  const p = analysis.pattern
  const precision = analysis.precision
  const { overlays, toggleOverlay } = useAppStore()
  const relColor = p.reliability === 'High' ? 'var(--color-bull-400)' : p.reliability === 'Medium' ? 'var(--color-neutral-400)' : 'var(--color-ink-400)'

  return (
    <Panel title="Pattern Detected" right={<DirectionPill direction={p.direction} size="sm" />}>
      <div className="flex items-baseline justify-between">
        <h4 className="text-base font-semibold text-ink-100">{p.name}</h4>
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: relColor }}>
          {p.reliability} reliability
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Bar label="Pattern Completion" value={p.completion} />
        <Bar label="Breakout Probability" value={p.breakoutProbability} />
      </div>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-ink-400">{p.summary}</p>

      <div className="mt-2.5 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-white/[0.04] text-center">
        <Cell label="Breakout" value={fmt(p.breakoutLevel, precision)} />
        <Cell label="Target Zone" value={`${fmt(p.targetLow, precision)}–${fmt(p.targetHigh, precision)}`} tone="gold" />
        <Cell label="Invalidation" value={fmt(p.invalidation, precision)} tone="bear" />
      </div>

      <button
        onClick={() => !overlays.pattern && toggleOverlay('pattern')}
        className={`mt-2.5 w-full rounded-lg py-2 text-[11px] font-semibold transition-colors ${
          overlays.pattern ? 'border border-gold-500/25 bg-gold-500/[0.06] text-gold-200' : 'btn justify-center'
        }`}
      >
        {overlays.pattern ? '✓ Pattern shown on chart' : 'Show Pattern on Chart'}
      </button>
    </Panel>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel-inset p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-ink-400">{label}</span>
        <span className="nums text-[12px] font-bold text-ink-100">{Math.round(value)}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-base-700">
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500/60 to-gold-200" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'bear' }) {
  const color = tone === 'gold' ? 'var(--color-gold-200)' : tone === 'bear' ? 'var(--color-bear-400)' : 'var(--color-ink-100)'
  return (
    <div className="bg-base-800 px-1.5 py-2">
      <div className="text-[8.5px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="nums mt-0.5 text-[11px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
