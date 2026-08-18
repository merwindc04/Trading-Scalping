import type { Analysis } from '@/lib/analyze'
import { Panel, DirectionPill } from '@/components/ui/primitives'
import { fmt } from '@/lib/format'

export function TradeSetupPanel({ analysis }: { analysis: Analysis }) {
  const s = analysis.setup
  const p = analysis.precision
  const biasLabel = s.bias === 'BULLISH' ? 'LONG BIAS' : s.bias === 'BEARISH' ? 'SHORT BIAS' : 'NEUTRAL BIAS'

  return (
    <Panel
      title="AI Trade Setup"
      right={<DirectionPill direction={s.bias} label={biasLabel} size="sm" />}
    >
      <div className="rounded-lg border border-white/[0.05] bg-base-800 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">Potential Entry Zone</span>
          <span className="nums text-[13px] font-bold text-gold-100">
            {fmt(Math.min(s.entryLow, s.entryHigh), p)}–{fmt(Math.max(s.entryLow, s.entryHigh), p)}
          </span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {s.targets.slice(0, 3).map((t, i) => (
          <div key={i} className="panel-inset p-2 text-center">
            <div className="text-[9px] uppercase tracking-wide text-ink-500">Target {i + 1}</div>
            <div className="nums mt-0.5 text-[12px] font-semibold text-[var(--color-bull-400)]">{fmt(t, p)}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <Kv label="Invalidation" value={fmt(s.invalidation, p)} tone="bear" />
        <Kv label="Risk / Reward" value={`1:${s.riskReward}`} tone="gold" />
        <Kv label="Confidence" value={`${s.confidence}%`} />
        <Kv label="Horizon" value={s.horizon} />
      </div>

      <p className="mt-2.5 rounded-md bg-base-800 px-2 py-1.5 text-[9.5px] leading-relaxed text-ink-500">
        Analytical scenario for educational purposes — a potential setup framed by probability and invalidation, not a guarantee or personalised advice.
      </p>
    </Panel>
  )
}

function Kv({ label, value, tone }: { label: string; value: string; tone?: 'bear' | 'gold' }) {
  const color = tone === 'bear' ? 'var(--color-bear-400)' : tone === 'gold' ? 'var(--color-gold-200)' : 'var(--color-ink-100)'
  return (
    <div className="panel-inset p-1.5 text-center">
      <div className="text-[8px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="nums mt-0.5 text-[11px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
