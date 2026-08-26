import type { Analysis } from '@/lib/analyze'
import type { Scenario } from '@/lib/engines/forecast'
import { useAppStore, type ScenarioView } from '@/store/appStore'
import { Panel, ProbabilityBar } from '@/components/ui/primitives'
import { fmt } from '@/lib/format'
import { SCENARIO_COLORS } from '@/components/chart/TradingChart'

const VIEWS: { key: ScenarioView; label: string }[] = [
  { key: 'bull', label: 'Bull Case' },
  { key: 'base', label: 'Base Case' },
  { key: 'bear', label: 'Bear Case' },
  { key: 'all', label: 'Show All' },
]

export function ScenarioPanel({ analysis }: { analysis: Analysis }) {
  const { scenarioView, setScenarioView } = useAppStore()
  const f = analysis.forecast
  const p = analysis.precision

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          Projected Pattern<span className="text-gold-300">™</span>
        </span>
      }
      right={
        <span className="rounded-full border border-gold-500/25 bg-gold-500/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-200">
          Confidence {f.confidence}%
        </span>
      }
    >
      {/* Probabilities */}
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-[var(--color-bull-400)]">Bull {f.bull}%</span>
        <span className="text-[var(--color-neutral-400)]">Neutral {f.neutral}%</span>
        <span className="text-[var(--color-bear-400)]">Bear {f.bear}%</span>
      </div>
      <ProbabilityBar bull={f.bull} neutral={f.neutral} bear={f.bear} />

      {/* View toggles */}
      <div className="mt-3 grid grid-cols-4 gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setScenarioView(v.key)}
            className={`rounded-md py-1.5 text-[10px] font-semibold transition-colors ${
              scenarioView === v.key ? 'btn-active' : 'btn justify-center !py-1.5'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Scenario cards */}
      <div className="mt-3 space-y-2">
        {f.scenarios
          .filter((s) => scenarioView === 'all' || s.key === scenarioView)
          .map((s) => (
            <ScenarioCard key={s.key} s={s} precision={p} />
          ))}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-500">
        Solid candles are real. Ghost candles & the band are a ~1σ / 2σ probability cone from the market's realized volatility (live XAU
        spot via gold-api, OHLC via Binance) — probabilistic projections, not guarantees.
      </p>
    </Panel>
  )
}

function ScenarioCard({ s, precision }: { s: Scenario; precision: number }) {
  const color = SCENARIO_COLORS[s.key]
  return (
    <div className="panel-inset overflow-hidden p-0">
      <div className="flex items-center justify-between px-2.5 py-2" style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${color} 12%, transparent), transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-[12px] font-semibold" style={{ color }}>
            {s.label}
          </span>
        </div>
        <span className="nums text-[15px] font-bold" style={{ color }}>
          {s.probability}%
        </span>
      </div>
      <p className="px-2.5 pb-2 text-[10.5px] leading-relaxed text-ink-400">{s.narrative}</p>
      <div className="grid grid-cols-3 gap-px bg-white/[0.04] text-center">
        {s.direction !== 'NEUTRAL' ? (
          s.targets.slice(0, 3).map((t, i) => (
            <Cell key={i} label={`Target ${i + 1}`} value={fmt(t, precision)} />
          ))
        ) : (
          <>
            <Cell label="Range Top" value={fmt(s.targets[0], precision)} />
            <Cell label="Range Low" value={fmt(s.targets[1], precision)} />
            <Cell label="Bias" value="Neutral" />
          </>
        )}
      </div>
      <div className="grid grid-cols-4 gap-px bg-white/[0.04] text-center">
        <Cell label="Invalidation" value={fmt(s.invalidation, precision)} tone="bear" />
        <Cell label="Duration" value={s.durationLabel} />
        <Cell label="Volatility" value={s.expectedVolatility} />
        <Cell label="R:R" value={s.direction === 'NEUTRAL' ? '—' : `1:${s.riskReward}`} tone="gold" />
      </div>
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'bear' | 'gold' }) {
  const color = tone === 'bear' ? 'var(--color-bear-400)' : tone === 'gold' ? 'var(--color-gold-200)' : 'var(--color-ink-100)'
  return (
    <div className="bg-base-800 px-1 py-1.5">
      <div className="text-[8.5px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="nums mt-0.5 text-[11px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
