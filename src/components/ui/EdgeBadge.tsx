import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react'
import type { EdgeGate, EdgeStatus } from '@/lib/engines/edgeGate'

/* Shows whether BUY/SELL is backed by a proven track record on this market. */

export const EDGE_TONE: Record<EdgeStatus, { color: string; icon: typeof ShieldCheck }> = {
  PROVEN: { color: 'var(--color-bull-400)', icon: ShieldCheck },
  LIKELY: { color: 'var(--color-bull-400)', icon: ShieldCheck },
  UNPROVEN: { color: 'var(--color-neutral-400)', icon: ShieldQuestion },
  NO_EDGE: { color: 'var(--color-bear-400)', icon: ShieldX },
  INSUFFICIENT: { color: 'var(--color-ink-400)', icon: ShieldAlert },
}

export function EdgeBadge({ gate, size = 'md' }: { gate: EdgeGate; size?: 'sm' | 'md' }) {
  const t = EDGE_TONE[gate.status]
  const Icon = t.icon
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold ${size === 'sm' ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]'}`}
      style={{ color: t.color, borderColor: `color-mix(in oklab, ${t.color} 35%, transparent)`, background: `color-mix(in oklab, ${t.color} 12%, transparent)` }}
      title={gate.reason}
    >
      <Icon size={size === 'sm' ? 11 : 12} />
      {gate.label}
    </span>
  )
}

/** Badge plus the one-line explanation, for panels. */
export function EdgeLine({ gate }: { gate: EdgeGate }) {
  return (
    <div className="flex items-start gap-2">
      <EdgeBadge gate={gate} />
      <p className="text-[10.5px] leading-snug text-ink-400">
        {gate.reason}
        {!gate.allows && <span className="text-ink-500"> BUY/SELL stays off until the record proves itself.</span>}
      </p>
    </div>
  )
}
