import { TrendingUp, TrendingDown, PauseCircle, Check, X, BellRing, BellOff, Zap, SlidersHorizontal } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import type { SignalAction } from '@/lib/engines/signal'
import { useAppStore } from '@/store/appStore'
import { fmt, fmtSigned } from '@/lib/format'

const THEME: Record<SignalAction, { color: string; soft: string; icon: typeof TrendingUp }> = {
  BUY: { color: 'var(--color-bull-400)', soft: 'color-mix(in oklab, var(--color-bull-500) 16%, transparent)', icon: TrendingUp },
  SELL: { color: 'var(--color-bear-400)', soft: 'color-mix(in oklab, var(--color-bear-500) 16%, transparent)', icon: TrendingDown },
  WAIT: { color: 'var(--color-neutral-400)', soft: 'color-mix(in oklab, var(--color-neutral-500) 14%, transparent)', icon: PauseCircle },
}

export function SignalPanel({ analysis }: { analysis: Analysis }) {
  const s = analysis.signal
  const p = analysis.precision
  const t = THEME[s.action]
  const Icon = t.icon
  const { notifyEnabled, setNotify, setNav } = useAppStore()

  async function enableNotify() {
    if (notifyEnabled) {
      setNotify(false)
      return
    }
    setNotify(true)
    try {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="panel relative overflow-hidden p-0" style={{ boxShadow: `0 0 0 1px ${t.soft}, 0 14px 40px -22px ${t.color}` }}>
      {/* Header verdict */}
      <div className="sheen relative flex items-center gap-3 px-3.5 py-3" style={{ background: `linear-gradient(120deg, ${t.soft}, transparent 70%)` }}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: t.soft, color: t.color }}>
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">Signal</span>
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: t.soft, color: t.color }}>
              Grade {s.grade}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-bold tracking-tight" style={{ color: t.color }}>
              {s.headline}
            </h3>
            <span className="nums text-[11px] text-ink-400">· {s.score}/100 conviction</span>
          </div>
          <p className="text-[11px] text-ink-400">{s.subline}</p>
        </div>
      </div>

      {/* Timing callout */}
      <div className="mx-3.5 mt-2.5 flex items-start gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: t.soft, background: t.soft }}>
        <Zap size={14} className="mt-0.5 shrink-0" style={{ color: t.color }} />
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-ink-200)' }}>
          {s.timing}
        </p>
      </div>

      {/* Trade levels */}
      {s.action !== 'WAIT' && (
        <div className="mx-3.5 mt-2.5 grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-white/[0.05] text-center">
          <Lvl label="Entry" value={`${fmt(Math.min(s.entryLow, s.entryHigh), p)}`} />
          <Lvl label="Stop" value={fmt(s.stop, p)} tone="bear" />
          <Lvl label={s.action === 'SELL' ? 'Target' : 'Target'} value={fmt(s.targets[Math.min(1, s.targets.length - 1)], p)} tone="bull" />
          <Lvl label="R:R" value={`1:${s.riskReward}`} tone="gold" />
        </div>
      )}

      <div className="mx-3.5 mt-2 flex items-center justify-between text-[10.5px] text-ink-400">
        <span>
          Expected move <span className="nums font-semibold" style={{ color: t.color }}>{fmtSigned(s.expectedMovePct)}%</span>
        </span>
        <span className="nums">Confidence {s.confidence}% · {s.horizon}</span>
      </div>

      {/* Condition checklist */}
      <div className="mx-3.5 mb-2.5 mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {s.checks.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full"
              style={{ background: c.passed ? 'color-mix(in oklab, var(--color-bull-500) 22%, transparent)' : 'color-mix(in oklab, var(--color-bear-500) 18%, transparent)' }}
            >
              {c.passed ? <Check size={9} className="text-[var(--color-bull-400)]" /> : <X size={9} className="text-[var(--color-bear-400)]" />}
            </span>
            <span className="truncate text-[10px] text-ink-300" title={c.detail}>
              {c.label}
            </span>
          </div>
        ))}
      </div>

      {/* Notify toggle + rules link */}
      <div className="mx-3.5 mb-3.5 flex items-center gap-1.5">
        <button
          onClick={enableNotify}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-colors ${
            notifyEnabled ? 'border border-gold-500/30 bg-gold-500/[0.08] text-gold-200' : 'btn justify-center'
          }`}
        >
          {notifyEnabled ? <BellRing size={13} /> : <BellOff size={13} />}
          {notifyEnabled ? 'Alerts ON' : 'Notify me when it’s time to act'}
        </button>
        <button onClick={() => setNav('Alerts')} className="btn shrink-0 !px-2.5 !py-2" title="Customize alert rules">
          <SlidersHorizontal size={13} />
        </button>
      </div>

      <p className="mx-3.5 mb-3 -mt-1.5 text-[9px] leading-relaxed text-ink-500">
        Analytical suggestion with a defined stop — a probability-based scenario, not a guarantee or personalised financial advice.
      </p>
    </section>
  )
}

function Lvl({ label, value, tone }: { label: string; value: string; tone?: 'bear' | 'bull' | 'gold' }) {
  const color =
    tone === 'bear' ? 'var(--color-bear-400)' : tone === 'bull' ? 'var(--color-bull-400)' : tone === 'gold' ? 'var(--color-gold-200)' : 'var(--color-ink-100)'
  return (
    <div className="bg-base-800 px-1 py-1.5">
      <div className="text-[8.5px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="nums mt-0.5 text-[11px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
