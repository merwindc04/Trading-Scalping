import { useEffect, useMemo, useState } from 'react'
import { Crosshair, Check, X, Timer, FlaskConical, SlidersHorizontal } from 'lucide-react'
import type { Candle } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'
import type { Analysis } from '@/lib/analyze'
import { scaleCandle } from '@/lib/analyze'
import { ASSETS } from '@/lib/assets'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { confirmEntry, ENTRY_TFS, HTF_FOR, ENTRY_RULES, type EntryTF, type EntrySide, type EntryMode, type EntryCondition, type EntryStatus } from '@/lib/engines/entryConfirm'

/* Short-term Entry Confirmation (1m → 30m) — interactive, live, with a replay of the same rule. */

const BULL = 'var(--color-bull-400)'
const BEAR = 'var(--color-bear-400)'
const AMBER = 'var(--color-neutral-400)'
const MUTED = 'var(--color-ink-400)'
const GOLD = 'var(--color-gold-300)'

const PREFS_KEY = 'aurumpulse-entry-v1'
const TARGETS = [1.5, 2, 3]

interface Prefs {
  tf: EntryTF
  side: EntrySide | 'auto'
  targetR: number
  mode: EntryMode
  costPct: number | null
  risk: number
}
const DEFAULT_PREFS: Prefs = { tf: '5m', side: 'auto', targetR: 2, mode: 'close', costPct: null, risk: 100 }

function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    return v && typeof v === 'object' ? { ...DEFAULT_PREFS, ...v } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/** Typical round-trip cost (spread + slippage) as % of price, by asset class. */
function defaultCost(symbol: string): number {
  const cls = ASSETS[symbol]?.assetClass
  return cls === 'Metals' ? 0.015 : cls === 'Forex' ? 0.01 : cls === 'Crypto' ? 0.1 : 0.05
}

function useEntryCandles(analysis: Analysis, tf: EntryTF) {
  const [data, setData] = useState<{ key: string; c: Candle[]; h: Candle[] }>({ key: '', c: [], h: [] })
  const k = analysis.priceScale
  const key = `${analysis.symbol}|${tf}|${k}`
  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.all([marketData.getHistory(analysis.symbol, tf, 1000), marketData.getHistory(analysis.symbol, HTF_FOR[tf], 300)])
        .then(([a, b]) => {
          if (!alive) return
          setData({ key, c: a.map((c) => scaleCandle(c, k)), h: b.map((c) => scaleCandle(c, k)) })
        })
        .catch(() => {
          /* stays on the last good data */
        })
    load()
    const id = window.setInterval(load, tf === '1m' || tf === '3m' ? 10_000 : 20_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [analysis.symbol, tf, k, key])
  return data.key === key ? data : { key, c: [], h: [] }
}

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const STATUS_TONE: Record<EntryStatus, string> = { confirmed: BULL, active: BULL, missed: AMBER, setup: GOLD, none: MUTED, nodata: MUTED }

export function EntryConfirmPanel({ analysis, price }: { analysis: Analysis; price: number | null }) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [showSettings, setShowSettings] = useState(false)
  const set = (p: Partial<Prefs>) => setPrefs((v) => ({ ...v, ...p }))
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* not remembered */
    }
  }, [prefs])

  const { tf } = prefs
  const tfSec = TIMEFRAME_SECONDS[tf]
  const { c, h } = useEntryCandles(analysis, tf)
  const now = useNow()
  const closedBucket = Math.floor(now / tfSec)
  const costPct = prefs.costPct ?? defaultCost(analysis.symbol)
  const asset = ASSETS[analysis.symbol]
  const p = analysis.precision
  const f = (v: number) => v.toFixed(p)

  const res = useMemo(
    () =>
      confirmEntry(c, h, tf, Math.floor(Date.now() / 1000), {
        side: prefs.side,
        targetR: prefs.targetR,
        mode: prefs.mode,
        costPct,
        alwaysLiquid: asset?.assetClass === 'Crypto',
        precision: p,
      }),
    // Re-evaluate when candles refresh or a candle closes — not every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, h, tf, closedBucket, prefs.side, prefs.targetR, prefs.mode, costPct, p],
  )

  const secsLeft = (closedBucket + 1) * tfSec - now
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0')
  const ss = String(secsLeft % 60).padStart(2, '0')
  const tone = STATUS_TONE[res.status]
  const sideTone = res.side === 'BUY' ? BULL : res.side === 'SELL' ? BEAR : MUTED
  const live = price ?? (c.length ? c[c.length - 1].close : analysis.price)
  const plan = res.plan
  const showPlan = plan && (res.status === 'confirmed' || res.status === 'active' || res.status === 'setup')
  const unit = asset?.unit === 'USD/oz' ? 'oz' : asset?.unit === 'AED/g' ? 'g' : 'units'
  const cur = asset?.currency ?? ''
  const size = plan ? prefs.risk / (plan.risk + plan.cost) : 0
  const bt = res.backtest

  return (
    <section className="panel p-3.5" aria-label="Short-term entry confirmation">
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          <Crosshair size={13} className="text-gold-300" /> Entry confirm
          <span className="font-medium normal-case tracking-normal text-ink-500">· 1–30 min</span>
        </h3>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-pressed={showSettings}
          aria-label="Costs and risk settings"
          title="Costs and risk settings"
          className={`rounded-md p-1 ${showSettings ? 'bg-white/[0.08] text-gold-200' : 'text-ink-500 hover:text-ink-300'}`}
        >
          <SlidersHorizontal size={13} />
        </button>
      </header>

      {/* Timeframe */}
      <div className="mb-2 flex rounded-md bg-base-800 p-0.5" role="group" aria-label="Entry timeframe">
        {ENTRY_TFS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => set({ tf: t })}
            aria-pressed={tf === t}
            title={`Check entries on the ${t} chart (trend filter: ${HTF_FOR[t]})`}
            className={`nums flex-1 rounded px-1 py-1 text-[10.5px] font-semibold transition-colors ${tf === t ? 'bg-gradient-to-b from-gold-200 to-gold-400 text-base-950' : 'text-ink-500 hover:text-ink-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Side · target · entry type */}
      <div className="mb-2.5 grid grid-cols-3 gap-1.5 text-[10px]">
        <Seg
          label="Side"
          value={prefs.side}
          options={[
            { v: 'auto', t: 'Auto', title: `Follow the ${HTF_FOR[tf]} trend` },
            { v: 'BUY', t: 'Buy', color: BULL },
            { v: 'SELL', t: 'Sell', color: BEAR },
          ]}
          onChange={(v) => set({ side: v as Prefs['side'] })}
        />
        <Seg label="Target" value={String(prefs.targetR)} options={TARGETS.map((r) => ({ v: String(r), t: `${r}R`, title: `Take profit at ${r}× the risk` }))} onChange={(v) => set({ targetR: Number(v) })} />
        <Seg
          label="Entry"
          value={prefs.mode}
          options={[
            { v: 'close', t: 'Close', title: 'Enter at the confirming candle close' },
            { v: 'break', t: 'Break', title: 'Stop order beyond the trigger candle (needs follow-through)' },
          ]}
          onChange={(v) => set({ mode: v as EntryMode })}
        />
      </div>

      {showSettings && (
        <div className="panel-inset mb-2.5 grid grid-cols-2 gap-2 px-2.5 py-2 text-[10px] text-ink-400">
          <label className="flex flex-col gap-1">
            Round-trip cost (% of price)
            <input
              type="number"
              min={0}
              max={1}
              step={0.005}
              value={costPct}
              onChange={(e) => set({ costPct: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })}
              className="nums rounded bg-base-900 px-1.5 py-1 text-[11px] text-ink-100 outline-none focus:ring-1 focus:ring-gold-400/50"
            />
            <span className="text-[9px] text-ink-500">Spread + slippage · ≈ {f((live * costPct) / 100)} per {unit}</span>
          </label>
          <label className="flex flex-col gap-1">
            Risk per trade ({cur})
            <input
              type="number"
              min={1}
              step={10}
              value={prefs.risk}
              onChange={(e) => set({ risk: Math.max(1, Number(e.target.value) || 1) })}
              className="nums rounded bg-base-900 px-1.5 py-1 text-[11px] text-ink-100 outline-none focus:ring-1 focus:ring-gold-400/50"
            />
            <button type="button" onClick={() => set({ costPct: null })} className="text-left text-[9px] text-ink-500 underline-offset-2 hover:text-ink-300 hover:underline">
              Reset cost to default ({defaultCost(analysis.symbol)}%)
            </button>
          </label>
        </div>
      )}

      {/* Status */}
      <div
        className="mb-2.5 rounded-lg border px-3 py-2"
        style={{ borderColor: `color-mix(in oklab, ${tone} 35%, transparent)`, background: `color-mix(in oklab, ${tone} 10%, transparent)` }}
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-bold leading-tight" style={{ color: tone }}>
            {res.status === 'confirmed' && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full align-middle" style={{ background: tone }} />}
            {res.headline}
          </span>
          {res.status !== 'nodata' && (
            <span className="nums shrink-0 text-[10px] font-semibold" style={{ color: sideTone }}>
              {res.side}
            </span>
          )}
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-ink-300">{res.detail}</p>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-400">
          <span className="nums">
            Must have {res.requiredMet}/{res.requiredTotal} · Timing {res.timingMet}/{res.timingTotal}
            <span className="text-ink-500"> (need {ENTRY_RULES.minTiming})</span>
          </span>
          <span className="nums flex items-center gap-1" title="Entries only confirm on a closed candle">
            <Timer size={11} /> {tf} closes in {mm}:{ss}
          </span>
        </div>
      </div>

      {/* Trade plan */}
      {showPlan && plan && (
        <div className="panel-inset mb-2.5 px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-ink-500">
            <span>{res.status === 'setup' ? 'Plan if it triggers' : 'Trade plan'}</span>
            <span className="normal-case tracking-normal">{prefs.mode === 'close' ? 'enter on close' : 'stop order'}</span>
          </div>
          <Ladder plan={plan} live={live} />
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
            <PlanRow label="Entry" value={f(plan.entry)} color={GOLD} />
            <PlanRow label="Stop" value={f(plan.stop)} sub={`−${f(plan.risk)}`} color={BEAR} />
            <PlanRow label="TP1 · 1R" value={f(plan.tp1)} sub="move stop to entry" color={BULL} />
            <PlanRow label={`TP2 · ${prefs.targetR}R`} value={f(plan.tp2)} color={BULL} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[9.5px] text-ink-500">
            <Stat label="Net win" value={`+${plan.netWinR.toFixed(2)}R`} color={BULL} />
            <Stat label="Net loss" value={`${plan.netLossR.toFixed(2)}R`} color={BEAR} />
            <Stat label="Break-even win" value={`${Math.round(plan.breakevenWin * 100)}%`} color="var(--color-ink-200)" />
          </div>
          <div className="mt-1.5 text-[10px] text-ink-400">
            Size for {cur} {prefs.risk} risk: <span className="nums font-semibold text-ink-100">{size >= 100 ? size.toFixed(0) : size.toFixed(2)} {unit}</span>
            <span className="text-ink-500"> (incl. ≈{f(plan.cost)} cost)</span>
          </div>
        </div>
      )}

      {/* Conditions */}
      {res.conditions.length > 0 && (
        <>
          <Group title="Must have" items={res.conditions.filter((i) => i.required)} />
          <Group title="Good timing" items={res.conditions.filter((i) => !i.required)} />
        </>
      )}

      {/* Replay of the exact rule */}
      {res.status !== 'nodata' && (
        <div className="panel-inset mt-1 px-2.5 py-2 text-[10px] text-ink-400">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-ink-500">
            <FlaskConical size={11} /> This exact rule, replayed
          </div>
          {bt.trades === 0 ? (
            <p>No confirmed entries in the last {bt.spanLabel} of {tf} candles — the rule is strict by design. Higher timeframes (5m–30m) usually give more setups to judge.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <Stat label="Trades" value={String(bt.trades)} color="var(--color-ink-200)" />
                <Stat label="Win rate" value={`${Math.round(bt.winRate * 100)}%`} color={plan && bt.winRate >= plan.breakevenWin ? BULL : AMBER} />
                <Stat label="Avg / trade" value={`${bt.avgR >= 0 ? '+' : ''}${bt.avgR.toFixed(2)}R`} color={bt.avgR >= 0 ? BULL : BEAR} />
              </div>
              <p className="mt-1.5 leading-snug">
                Last {bt.spanLabel} on {tf}: {bt.wins} wins, {bt.losses} losses{bt.timeouts ? `, ${bt.timeouts} timed out` : ''} · total {bt.totalR >= 0 ? '+' : ''}
                {bt.totalR.toFixed(1)}R after costs. Next-candle entry, stop counted first if both are hit in one candle.
              </p>
              {bt.trades < 20 && <p className="mt-1 text-[9.5px]" style={{ color: AMBER }}>Small sample ({bt.trades} trades) — anecdotal, not proof of an edge.</p>}
            </>
          )}
        </div>
      )}

      <p className="mt-2 text-[9.5px] leading-snug text-ink-500">
        Checks closed {tf} candles with a {HTF_FOR[tf]} trend filter. Probabilities, not guarantees — avoid entries minutes before CPI / FOMC / NFP. Not financial advice.
      </p>
    </section>
  )
}

function Seg({ label, value, options, onChange }: { label: string; value: string; options: { v: string; t: string; title?: string; color?: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-ink-500">{label}</div>
      <div className="flex rounded-md bg-base-800 p-0.5 font-semibold" role="group" aria-label={label}>
        {options.map((o) => {
          const on = value === o.v
          const col = o.color ?? GOLD
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              aria-pressed={on}
              title={o.title}
              className="flex-1 rounded px-1 py-0.5 transition-colors"
              style={on ? { color: col, background: `color-mix(in oklab, ${col} 16%, transparent)` } : { color: 'var(--color-ink-500)' }}
            >
              {o.t}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Horizontal price ladder: stop · entry · TP1 · TP2, with the live price marker. */
function Ladder({ plan, live }: { plan: NonNullable<ReturnType<typeof confirmEntry>['plan']>; live: number }) {
  const buy = plan.side === 'BUY'
  const lo = Math.min(plan.stop, plan.tp2, live)
  const hi = Math.max(plan.stop, plan.tp2, live)
  const span = hi - lo || 1
  // Left = stop side for both directions, so the bar always reads risk → reward.
  const pos = (v: number) => (buy ? (v - lo) / span : (hi - v) / span) * 100
  const sL = pos(plan.stop)
  const eL = pos(plan.entry)
  const t2 = pos(plan.tp2)
  return (
    <div className="relative h-5" aria-hidden>
      <div className="absolute top-2 h-1 rounded-l-full" style={{ left: `${Math.min(sL, eL)}%`, width: `${Math.abs(eL - sL)}%`, background: BEAR, opacity: 0.7 }} />
      <div className="absolute top-2 h-1 rounded-r-full" style={{ left: `${Math.min(eL, t2)}%`, width: `${Math.abs(t2 - eL)}%`, background: BULL, opacity: 0.7 }} />
      {[plan.stop, plan.entry, plan.tp1, plan.tp2].map((v, i) => (
        <div key={i} className="absolute top-1 h-3 w-px" style={{ left: `${pos(v)}%`, background: i === 1 ? GOLD : 'rgba(255,255,255,0.5)' }} />
      ))}
      <div className="absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded bg-white" style={{ left: `${Math.max(0, Math.min(100, pos(live)))}%` }} title="Live price" />
    </div>
  )
}

function PlanRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-ink-500">{label}</span>
      <span className="nums font-semibold" style={{ color }}>
        {value}
        {sub && <span className="ml-1 text-[9px] font-normal text-ink-500">{sub}</span>}
      </span>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded bg-base-900/60 px-1 py-1">
      <div className="nums text-[11.5px] font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[8.5px] uppercase tracking-wider text-ink-500">{label}</div>
    </div>
  )
}

function Group({ title, items }: { title: string; items: EntryCondition[] }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-ink-500">{title}</div>
      <ul className="space-y-1">
        {items.map((i) => {
          const color = i.state === 'pass' ? BULL : i.required ? BEAR : AMBER
          const Icon = i.state === 'pass' ? Check : X
          return (
            <li key={i.key} className="panel-inset flex items-start gap-2 px-2 py-1.5" title={i.hint}>
              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }} aria-label={i.state === 'pass' ? 'met' : 'not met'}>
                <Icon size={10} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-ink-100">{i.label}</div>
                <div className="nums text-[10px] text-ink-400">{i.value}</div>
                {i.state !== 'pass' && (
                  <div className="text-[10px] leading-snug" style={{ color }}>
                    {i.hint}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
