import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, GripVertical, X, Droplets, ShieldAlert, Info, Database, History, Globe2, RefreshCw } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import type { DecisionReport, Factor, MarketSignal, Tone } from '@/lib/engines/decision'
import { MACRO_FACTORS, type MacroStance } from '@/lib/engines/macro'
import { MODEL_LABEL } from '@/lib/engines/backtest'
import { EdgeBadge } from '@/components/ui/EdgeBadge'
import { useAppStore } from '@/store/appStore'
import { ASSETS } from '@/lib/assets'
import { fmt } from '@/lib/format'
import { marketSession, freshness, fmtAge } from '@/lib/marketStatus'

/* ============================================================
   Confidence & Signal panel — a compact glass dashboard that
   floats over the chart. Draggable, collapsible, adjustable
   transparency, expandable detail sections. Everything shown
   comes from analysis.decision, so it is always in sync with
   the chart, the timeframe, the horizon and the gold purity.
   ============================================================ */

const TONE: Record<Tone, string> = {
  bull: 'var(--color-bull-400)',
  bear: 'var(--color-bear-400)',
  caution: 'var(--color-neutral-400)',
  neutral: 'var(--color-ink-400)',
}

const dirTone = (lvl: string): Tone => (lvl.includes('Bullish') ? 'bull' : lvl.includes('Bearish') ? 'bear' : 'neutral')
const signalTone = (s: MarketSignal): Tone => (s === 'BUY' ? 'bull' : s === 'SELL' ? 'bear' : s === 'HOLD' ? 'neutral' : 'caution')
const riskTone = (r: DecisionReport['risk']): Tone => (r === 'Low' ? 'bull' : r === 'Moderate' ? 'neutral' : r === 'High' ? 'caution' : 'bear')
const sentTone = (s: DecisionReport['sentiment']): Tone => (s === 'Positive' ? 'bull' : s === 'Negative' ? 'bear' : 'neutral')
const strengthTone = (s: DecisionReport['strength']): Tone => (s === 'Weak' ? 'neutral' : s === 'Moderate' ? 'caution' : 'bull')

type Section = 'why' | 'invalid' | 'data' | 'accuracy' | 'macro'

export function IntelOverlay({ analysis, lastTick, recalcReason }: { analysis: Analysis; lastTick: number | null; recalcReason: string | null }) {
  const { intelPanel, setIntelPanel, toggleOverlay, macroView, setMacro, purity } = useAppStore()
  const d = analysis.decision
  const p = analysis.precision
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const [open, setOpen] = useState<Section | null>(null)
  const [showOpacity, setShowOpacity] = useState(false)
  const [now, setNow] = useState(Date.now())
  // On phones the chart is small: start collapsed so price action stays visible.
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  const [mobileOpen, setMobileOpen] = useState(false)
  const collapsed = intelPanel.collapsed || (narrow && !mobileOpen)
  const toggleCollapsed = () => {
    if (!narrow) return setIntelPanel({ collapsed: !intelPanel.collapsed })
    // Phones: the expand state is per-visit; it never overrides the saved desktop preference.
    setMobileOpen(collapsed)
    if (collapsed && intelPanel.collapsed) setIntelPanel({ collapsed: false })
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ---- dragging (offsets are measured from the chart's top-left corner, over older bars) ----
  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select')) return
    drag.current = { sx: e.clientX, sy: e.clientY, ox: intelPanel.x, oy: intelPanel.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPointerEvent) => {
    const g = drag.current
    const el = ref.current
    if (!g || !el) return
    const parent = el.parentElement!.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const x = clampN(g.ox + (e.clientX - g.sx), 4, Math.max(4, parent.width - box.width - 4))
    const y = clampN(g.oy + (e.clientY - g.sy), 4, Math.max(4, parent.height - 40))
    setIntelPanel({ x, y })
  }
  const onUp = () => {
    drag.current = null
  }

  const age = lastTick ? now - lastTick : Infinity
  const fresh = Number.isFinite(age) ? freshness(age) : 'Stale'
  const session = marketSession(ASSETS[analysis.symbol]?.assetClass ?? 'Metals', new Date(now))
  const stale = fresh === 'Stale'
  // A stale feed suspends the actionable read rather than showing an outdated call.
  const signal: MarketSignal = stale && d.signal !== 'INSUFFICIENT' ? 'WAIT_CONFIRM' : d.signal
  const signalLabel = stale && d.signal !== 'INSUFFICIENT' ? 'Awaiting Fresh Data' : d.signalLabel
  const bg = `rgba(14,16,21,${intelPanel.opacity})`
  const unit = ASSETS[analysis.symbol]?.unit
  const unitLabel = analysis.symbol === 'XAUAED' ? `${unit} · ${purity}` : unit

  return (
    <div
      ref={ref}
      className="absolute z-20 flex w-[min(300px,calc(100%-16px))] select-none flex-col overflow-hidden rounded-xl border border-white/[0.08] text-[11px] shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)]"
      style={{ left: intelPanel.x, top: intelPanel.y, maxHeight: `calc(100% - ${intelPanel.y + 8}px)`, background: bg, backdropFilter: 'blur(14px) saturate(1.1)', WebkitBackdropFilter: 'blur(14px) saturate(1.1)' }}
      role="region"
      aria-label="Confidence and signal panel"
    >
      {/* Header / drag handle */}
      <div className="flex cursor-grab items-center gap-1.5 border-b border-white/[0.06] px-2 py-1.5 active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <GripVertical size={12} className="text-ink-500" />
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">Market Intelligence</span>
        <span className="ml-auto flex items-center gap-0.5">
          <IconBtn label="Panel transparency" onClick={() => setShowOpacity((v) => !v)} active={showOpacity}>
            <Droplets size={12} />
          </IconBtn>
          <IconBtn label={collapsed ? 'Expand panel' : 'Collapse panel'} onClick={toggleCollapsed}>
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </IconBtn>
          <IconBtn label="Hide panel" onClick={() => toggleOverlay('intel')}>
            <X size={12} />
          </IconBtn>
        </span>
      </div>

      {showOpacity && (
        <label className="flex items-center gap-2 border-b border-white/[0.06] px-2.5 py-1.5 text-[10px] text-ink-400">
          Opacity
          <input
            type="range"
            min={35}
            max={100}
            value={Math.round(intelPanel.opacity * 100)}
            onChange={(e) => setIntelPanel({ opacity: Number(e.target.value) / 100 })}
            className="h-1 flex-1 accent-[var(--color-gold-400)]"
            aria-label="Panel opacity"
          />
          <span className="nums w-8 text-right text-ink-300">{Math.round(intelPanel.opacity * 100)}%</span>
        </label>
      )}

      {/* Headline: direction + signal + confidence (always visible) */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-wider text-ink-500">Market direction</div>
          <div className="text-[13px] font-bold" style={{ color: TONE[dirTone(d.directionLevel)] }}>
            {d.directionLevel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-ink-500">Signal</div>
          <span
            className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
            style={{ color: TONE[signalTone(signal)], background: `color-mix(in oklab, ${TONE[signalTone(signal)]} 14%, transparent)` }}
          >
            {signalLabel}
          </span>
          <div className="mt-0.5">
            <EdgeBadge gate={analysis.edgeGate} size="sm" />
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2.5 pb-2.5">
          {d.source.mode === 'demo' && (
            <div className="mb-2 rounded-md border border-[var(--color-neutral-500)]/30 bg-[var(--color-neutral-500)]/[0.08] px-2 py-1.5 text-[10px] text-ink-200">
              Simulated data — no live feed for this symbol. Signals are illustrative only.
            </div>
          )}

          {/* Key stats */}
          <div className="grid grid-cols-2 gap-1.5">
            <Cell label="Prediction confidence" tone={d.confidence == null ? 'caution' : d.confidence >= 55 ? 'bull' : d.confidence >= 45 ? 'neutral' : 'bear'}>
              {d.confidence == null ? <span className="text-[11px]">{d.confidenceLabel}</span> : <span className="nums">{d.confidence}%</span>}
            </Cell>
            <Cell label="Signal strength" tone={strengthTone(d.strength)}>
              {d.strength}
            </Cell>
            <Cell label="Risk level" tone={riskTone(d.risk)}>
              {d.risk}
            </Cell>
            <Cell label="Market sentiment" tone={sentTone(d.sentiment)}>
              {d.sentiment}
            </Cell>
          </div>
          {d.confidence != null && d.conflictReduction > 0 && (
            <p className="mt-1 text-[9.5px] text-[var(--color-neutral-400)]">
              Validated {d.validatedHitRate}% · −{d.conflictReduction} pts for conflicting signals
            </p>
          )}
          {d.confidence == null && d.confidenceReason && <p className="mt-1 text-[9.5px] leading-snug text-ink-400">{d.confidenceReason}</p>}

          {/* Breakout / breakdown */}
          <div className="mt-2 space-y-1.5">
            <ProbRow label="Breakout" sub={`above ${fmt(d.levels.immediateResistance.top, p)}`} value={d.breakoutProb} color={TONE.bull} />
            <ProbRow label="Breakdown" sub={`below ${fmt(d.levels.immediateSupport.bottom, p)}`} value={d.breakdownProb} color={TONE.bear} />
            <p className="text-[9px] text-ink-500">Within {d.horizonLabel}. Touch probability × this zone's historical break rate.</p>
          </div>

          {/* Level ladder */}
          <div className="mt-2 rounded-lg border border-white/[0.05] bg-black/20 p-1.5">
            <Level label="Major resistance" value={d.levels.majorResistance.center} p={p} tone="bear" derived={d.levels.majorResistance.derived} />
            <Level label="Immediate resistance" value={d.levels.immediateResistance.center} p={p} tone="bear" derived={d.levels.immediateResistance.derived} />
            <div className="my-0.5 flex items-center justify-between rounded bg-white/[0.04] px-1.5 py-0.5">
              <span className="text-[9.5px] font-semibold text-gold-200">Price</span>
              <span className="nums text-[10.5px] font-bold text-gold-100">
                {fmt(analysis.price, p)} <span className="text-[8.5px] font-normal text-ink-500">{unitLabel}</span>
              </span>
            </div>
            <Level label="Immediate support" value={d.levels.immediateSupport.center} p={p} tone="bull" derived={d.levels.immediateSupport.derived} />
            <Level label="Major support" value={d.levels.majorSupport.center} p={p} tone="bull" derived={d.levels.majorSupport.derived} />
          </div>

          {/* Scenarios */}
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-ink-500">
              <span>Projected targets</span>
              <span className="normal-case tracking-normal">
                {d.probabilityBasis !== 'calibrated' ? 'model estimate' : d.backtest.sufficient ? 'calibrated on history' : 'base rates · low sample'}
              </span>
            </div>
            {d.scenarios.map((s) => (
              <div key={s.key} className="flex items-center gap-2 py-0.5">
                <span className="w-[86px] text-[10px] font-semibold" style={{ color: TONE[s.key === 'bull' ? 'bull' : s.key === 'bear' ? 'bear' : 'neutral'] }}>
                  {s.label}
                </span>
                <span className="nums w-8 text-[10px] font-bold text-ink-200">{s.probability}%</span>
                <span className="nums flex-1 truncate text-right text-[10px] text-ink-300">{s.key === 'base' ? [...s.targets].sort((a, b) => a - b).map((t) => fmt(t, p)).join(' – ') : s.targets.map((t) => fmt(t, p)).join(' → ')}</span>
              </div>
            ))}
          </div>

          {/* Signal reason */}
          <div className="mt-2 rounded-md px-2 py-1.5 text-[10px] leading-snug text-ink-200" style={{ background: `color-mix(in oklab, ${TONE[signalTone(signal)]} 10%, transparent)` }}>
            {stale && d.signal !== 'INSUFFICIENT' ? `No market update for ${fmtAge(age).replace(' ago', '')} — the signal is suspended until data is fresh.` : d.signalReason}
          </div>

          {/* Expandable sections */}
          <div className="mt-2 divide-y divide-white/[0.05] rounded-lg border border-white/[0.05]">
            <Expander id="why" open={open} setOpen={setOpen} icon={<Info size={11} />} title="Signal explanation" badge={d.conflicts.length ? `${d.conflicts.length} conflict${d.conflicts.length > 1 ? 's' : ''}` : undefined}>
              <FactorList factors={d.factors} />
              {d.conflicts.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {d.conflicts.map((c, i) => (
                    <p key={i} className="text-[9.5px] leading-snug text-[var(--color-neutral-400)]">
                      ⚠ {c}
                    </p>
                  ))}
                </div>
              )}
              {analysis.zones.events.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {analysis.zones.events.map((e, i) => (
                    <p key={i} className="text-[9.5px] leading-snug text-ink-300">
                      <span className="font-semibold" style={{ color: TONE[e.direction === 'BULLISH' ? 'bull' : e.direction === 'BEARISH' ? 'bear' : 'neutral'] }}>
                        {e.label}:
                      </span>{' '}
                      {e.detail}
                    </p>
                  ))}
                </div>
              )}
            </Expander>
            <Expander id="invalid" open={open} setOpen={setOpen} icon={<ShieldAlert size={11} />} title="Invalidation conditions">
              <ul className="space-y-1">
                {d.invalidation.map((t, i) => (
                  <li key={i} className="text-[9.5px] leading-snug text-ink-300">
                    • {t}
                  </li>
                ))}
              </ul>
            </Expander>
            <Expander id="accuracy" open={open} setOpen={setOpen} icon={<History size={11} />} title="Historical accuracy">
              <Accuracy analysis={analysis} />
            </Expander>
            <Expander id="data" open={open} setOpen={setOpen} icon={<Database size={11} />} title="Data reliability" badge={fresh} badgeTone={fresh === 'Fresh' ? 'bull' : fresh === 'Delayed' ? 'caution' : 'bear'}>
              <KV k="Feed" v={d.source.mode === 'live' ? 'Live' : 'Simulated (demo)'} tone={d.source.mode === 'live' ? 'bull' : 'caution'} />
              <KV k="Last update" v={lastTick ? `${new Date(lastTick).toLocaleTimeString()} · ${fmtAge(age)}` : '—'} />
              <KV k="Freshness" v={fresh} tone={fresh === 'Fresh' ? 'bull' : fresh === 'Delayed' ? 'caution' : 'bear'} />
              <KV k="Market status" v={session.label} tone={session.open ? 'bull' : 'caution'} />
              {d.source.spotPrice != null && <KV k="XAU spot ref." v={`$${fmt(d.source.spotPrice, 2)}`} />}
              <KV k="Last recalculation" v={recalcReason ?? '—'} />
              <ul className="mt-1 space-y-0.5">
                {d.source.feeds.map((f, i) => (
                  <li key={i} className="text-[9px] text-ink-400">
                    · {f}
                  </li>
                ))}
                {d.source.note && <li className="text-[9px] text-ink-500">{d.source.note}</li>}
                {session.note && !session.open && <li className="text-[9px] text-ink-500">{session.note}</li>}
              </ul>
            </Expander>
            <Expander id="macro" open={open} setOpen={setOpen} icon={<Globe2 size={11} />} title="Macro & fundamentals" badge={analysis.macro.userCount ? `${analysis.macro.userCount} set` : undefined}>
              <p className="mb-1 text-[9.5px] leading-snug text-ink-300">
                <span className="font-semibold text-ink-200">US dollar (live): </span>
                {analysis.macro.usd.detail}
              </p>
              <p className="mb-1.5 text-[9px] leading-snug text-ink-500">
                No free live feed exists for these — set your own view. They are labelled as your input and can only reduce confidence when they disagree.
              </p>
              {MACRO_FACTORS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-2 py-0.5" title={f.hint}>
                  <span className="text-[9.5px] text-ink-300">{f.label}</span>
                  <select
                    value={macroView[f.key]}
                    onChange={(e) => setMacro(f.key, e.target.value as MacroStance)}
                    className="rounded border border-white/[0.08] bg-base-800 px-1 py-0.5 text-[9.5px] text-ink-200"
                  >
                    <option value="unset">Not set</option>
                    <option value="supportive">Supportive</option>
                    <option value="neutral">Neutral</option>
                    <option value="headwind">Headwind</option>
                  </select>
                </label>
              ))}
            </Expander>
          </div>

          <div className="mt-2 flex items-center gap-1 text-[9px] text-ink-500">
            <RefreshCw size={9} /> {recalcReason ?? 'Live'} · Probabilities, not guarantees.
          </div>
        </div>
      )}
    </div>
  )
}

function Accuracy({ analysis }: { analysis: Analysis }) {
  const bt = analysis.backtest
  const o = bt.oos
  if (!o) return <p className="text-[9.5px] text-ink-400">Insufficient Data — not enough history to hold out an out-of-sample test.</p>
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const edgeTone: Tone = o.edge > 0.02 ? 'bull' : o.edge < -0.02 ? 'bear' : 'caution'
  return (
    <div>
      <p className="mb-1 text-[9px] leading-snug text-ink-500">
        Walk-forward test on {analysis.timeframe} for a {bt.horizonSteps}-bar horizon ({analysis.horizon.label}). Out-of-sample window: {new Date(o.fromTime * 1000).toLocaleDateString()} – {new Date(o.toTime * 1000).toLocaleDateString()}.
      </p>
      <KV k="Directional hit rate" v={`${pct(o.hitRate)} (95% CI ${pct(o.ciLow)}–${pct(o.ciHigh)})`} />
      <KV k="Base rate" v={pct(o.baseline)} />
      <KV k="Edge vs base rate" v={`${o.edge >= 0 ? '+' : ''}${(o.edge * 100).toFixed(1)} pts`} tone={edgeTone} />
      <KV k="Range calls held" v={pct(o.neutralHit)} />
      <KV k="Brier skill" v={`${o.skill >= 0 ? '+' : ''}${(o.skill * 100).toFixed(1)}%`} tone={o.skill > 0 ? 'bull' : 'caution'} />
      <KV k="Independent samples" v={`≈${Math.round(o.nEff)} (of ${bt.evaluations} overlapping)`} />
      <KV k="Core model" v={`${MODEL_LABEL[bt.model]} · picked on older data`} />
      <KV k="This reading" v={`${bt.current.label}: ${pct(bt.current.hitRate)} of ≈${Math.round(bt.current.nEff)}`} />
      {!bt.sufficient && <p className="mt-1 text-[9.5px] text-[var(--color-neutral-400)]">{bt.reason}</p>}
    </div>
  )
}

function FactorList({ factors }: { factors: Factor[] }) {
  const groups = ['Technical', 'Structure', 'Fundamental', 'Sentiment'] as const
  return (
    <div className="space-y-1.5">
      {groups.map((g) => {
        const fs = factors.filter((f) => f.group === g)
        if (!fs.length) return null
        return (
          <div key={g}>
            <div className="text-[8.5px] font-semibold uppercase tracking-wider text-ink-500">{g}</div>
            {fs.map((f, i) => (
              <div key={i} className="flex items-start gap-1.5 py-[1px]">
                <span className="w-3 text-center text-[9px]" style={{ color: f.effect > 0 ? TONE.bull : f.effect < 0 ? TONE.bear : TONE.neutral }} aria-hidden>
                  {f.effect > 0 ? '▲' : f.effect < 0 ? '▼' : '●'}
                </span>
                <span className="flex-1 text-[9.5px] leading-snug text-ink-300">
                  <span className="text-ink-200">{f.label}</span> — {f.value}
                  {f.source === 'user' && <span className="text-ink-500"> (your input)</span>}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Expander({
  id,
  open,
  setOpen,
  icon,
  title,
  badge,
  badgeTone = 'caution',
  children,
}: {
  id: Section
  open: Section | null
  setOpen: (s: Section | null) => void
  icon: ReactNode
  title: string
  badge?: string
  badgeTone?: Tone
  children: ReactNode
}) {
  const isOpen = open === id
  return (
    <div>
      <button className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[10px] font-semibold text-ink-300 hover:text-ink-100" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
        <span className="text-gold-300">{icon}</span>
        {title}
        {badge && (
          <span className="ml-1 rounded px-1 text-[8.5px] font-semibold" style={{ color: TONE[badgeTone], background: `color-mix(in oklab, ${TONE[badgeTone]} 14%, transparent)` }}>
            {badge}
          </span>
        )}
        <ChevronDown size={11} className={`ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-2 pb-2">{children}</div>}
    </div>
  )
}

function Cell({ label, tone, children }: { label: string; tone: Tone; children: ReactNode }) {
  return (
    <div className="rounded-md border border-white/[0.04] bg-black/20 px-2 py-1.5">
      <div className="text-[8.5px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-[12px] font-bold" style={{ color: TONE[tone] }}>
        {children}
      </div>
    </div>
  )
}

function ProbRow({ label, sub, value, color }: { label: string; sub: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold text-ink-200">
          {label} <span className="font-normal text-ink-500">{sub}</span>
        </span>
        <span className="nums text-[10.5px] font-bold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

function Level({ label, value, p, tone, derived }: { label: string; value: number; p: number; tone: Tone; derived?: boolean }) {
  return (
    <div className="flex items-center justify-between px-1.5 py-[1px]">
      <span className="text-[9.5px] text-ink-400">
        {label}
        {derived && <span className="text-ink-500" title="No tested zone — derived from the recent range"> · derived</span>}
      </span>
      <span className="nums text-[10px] font-semibold" style={{ color: TONE[tone] }}>
        {fmt(value, p)}
      </span>
    </div>
  )
}

function KV({ k, v, tone }: { k: string; v: string; tone?: Tone }) {
  return (
    <div className="flex items-start justify-between gap-2 py-[1px]">
      <span className="text-[9.5px] text-ink-500">{k}</span>
      <span className="nums text-right text-[9.5px] font-medium" style={{ color: tone ? TONE[tone] : 'var(--color-ink-200)' }}>
        {v}
      </span>
    </div>
  )
}

function IconBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`grid h-6 w-6 place-items-center rounded-md ${active ? 'bg-white/[0.08] text-gold-200' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-100'}`}>
      {children}
    </button>
  )
}

function clampN(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
