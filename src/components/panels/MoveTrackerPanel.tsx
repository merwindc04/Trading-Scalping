import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import type { Candle } from '@/types/market'
import type { Analysis } from '@/lib/analyze'
import { scaleCandle } from '@/lib/analyze'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { priceMoves, rangeUse, indicatorVotes, athDrawdown, type AthDrawdown } from '@/lib/engines/moveTracker'
import { useSignalTrackStore, favourPct, type SignalTrack } from '@/store/signalTrackStore'
import { fmt } from '@/lib/format'
import { fmtAge } from '@/lib/marketStatus'

/* Move Tracker — live "how far has it already moved?" panel. */

const BULL = 'var(--color-bull-400)'
const BEAR = 'var(--color-bear-400)'
const AMBER = 'var(--color-neutral-400)'
const MUTED = 'var(--color-ink-400)'

const signed = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`
const toneOf = (v: number | null) => (v == null ? MUTED : v > 0.005 ? BULL : v < -0.005 ? BEAR : MUTED)

export function MoveTrackerPanel({ analysis, price }: { analysis: Analysis; price: number | null }) {
  const px = price ?? analysis.price
  const [intraday, setIntraday] = useState<Candle[]>([])
  const [daily, setDaily] = useState<Candle[]>([])
  const k = analysis.priceScale

  // 15-minute history (~7 days) for the moves and today's range; daily bars for the typical range.
  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.all([marketData.getHistory(analysis.symbol, '15m', 700), marketData.getHistory(analysis.symbol, '1D', 30)]).then(([a, b]) => {
        if (!alive) return
        setIntraday(a.map((c) => scaleCandle(c, k)))
        setDaily(b.map((c) => scaleCandle(c, k)))
      })
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [analysis.symbol, k])

  // Full daily history (up to ~8 years) for the all-time-high drawdown. It comes as raw
  // feed prices, so it is put on the displayed scale (spot calibration, AED, purity) by
  // matching one completed day against the scaled daily bars.
  const [deepRaw, setDeepRaw] = useState<Candle[]>([])
  useEffect(() => {
    let alive = true
    const load = () => marketData.getDeepHistory?.(analysis.symbol, '1D', 3000).then((d) => alive && setDeepRaw(d))
    load()
    const id = window.setInterval(load, 10 * 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [analysis.symbol])
  const deep = useMemo(() => {
    const ref = daily[daily.length - 2]
    const raw = ref && deepRaw.find((c) => c.time === ref.time)
    if (!ref || !raw || !(raw.close > 0)) return []
    const f = ref.close / raw.close
    return deepRaw.map((c) => ({ ...c, open: c.open * f, high: c.high * f, low: c.low * f, close: c.close * f }))
  }, [deepRaw, daily])

  const nowSec = Date.now() / 1000
  const moves = useMemo(() => priceMoves(intraday, px, nowSec), [intraday, px])
  const range = useMemo(() => rangeUse(intraday, daily, px, nowSec), [intraday, daily, px])
  const dd = useMemo(() => athDrawdown(deep, px, nowSec), [deep, px])
  const votes = useMemo(() => indicatorVotes(analysis.technical.readings), [analysis.technical.readings])
  const track = useSignalTracking(analysis, px)
  const p = analysis.precision

  return (
    <section className="panel p-3.5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          <Activity size={13} className="text-gold-300" /> Move Tracker
        </h3>
        {analysis.source.mode === 'demo' ? (
          <span className="text-[10px] font-semibold text-gold-200">DEMO data</span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] text-ink-500">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-bull-400)]" /> live
          </span>
        )}
      </header>

      {/* 1 · Price move so far */}
      <Section title="How much has price moved?">
        <div className="grid grid-cols-3 gap-1.5">
          {moves.map((m) => (
            <div key={m.key} className="panel-inset px-2 py-1.5" title={m.ref ? `from ${fmt(m.ref, p)}` : 'not enough history'}>
              <div className="truncate text-[9px] uppercase tracking-wider text-ink-500">{m.label}</div>
              <div className="nums text-[13px] font-bold" style={{ color: toneOf(m.pct) }}>
                {m.pct == null ? '—' : signed(m.pct)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 1b · Drawdown from the all-time high */}
      <Section title="Down from the all-time high">
        <AthSection dd={dd} precision={p} />
      </Section>

      {/* 2 · How much of a normal day's move is used */}
      <Section title="Is the move already done?">
        {range ? (
          <>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="text-ink-300">Today's range vs a normal day</span>
              <span className="nums font-bold" style={{ color: range.verdict === 'stretched' ? BEAR : range.verdict === 'most' ? AMBER : BULL }}>
                {Math.round(range.used * 100)}% used
              </span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-base-800">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (range.used / 1.5) * 100)}%`,
                  background: range.verdict === 'stretched' ? BEAR : range.verdict === 'most' ? AMBER : BULL,
                }}
              />
              {/* 50 % and 90 % of a normal day */}
              <span className="absolute top-0 h-full w-px bg-white/30" style={{ left: `${(0.5 / 1.5) * 100}%` }} />
              <span className="absolute top-0 h-full w-px bg-white/50" style={{ left: `${(0.9 / 1.5) * 100}%` }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-ink-600">
              <span>0</span>
              <span style={{ marginLeft: '20%' }}>half</span>
              <span>full day</span>
              <span>150%</span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-snug text-ink-300">{range.text}</p>
            <div className="nums mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-ink-500">
              <span>
                Normal day range <b className="text-ink-300">{range.adrPct.toFixed(2)}%</b>
              </span>
              <span>
                Today <b className="text-ink-300">{fmt(range.todayLow, p)}–{fmt(range.todayHigh, p)}</b>
              </span>
              <span>
                Price is <b className="text-ink-300">{Math.round(range.position * 100)}%</b> up today's range
              </span>
            </div>
          </>
        ) : (
          <p className="text-[10.5px] text-ink-500">Insufficient Data — need at least 5 completed days and today's bars.</p>
        )}
      </Section>

      {/* 3 · Live progress of the signal */}
      <Section title="Signal progress">
        <SignalProgress track={track} price={px} precision={p} />
      </Section>

      {/* 4 · Indicator votes */}
      <Section title="Indicators: up vs down" last>
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="font-semibold" style={{ color: BULL }}>
            ▲ {votes.bull} up · {votes.bullPct}%
          </span>
          <span className="text-ink-500">{votes.neutral} neutral</span>
          <span className="font-semibold" style={{ color: BEAR }}>
            {votes.bearPct}% · {votes.bear} down ▼
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-800">
          <div style={{ width: `${(votes.bull / (votes.total || 1)) * 100}%`, background: BULL }} />
          <div style={{ width: `${(votes.neutral / (votes.total || 1)) * 100}%`, background: 'var(--color-base-600)' }} />
          <div style={{ width: `${(votes.bear / (votes.total || 1)) * 100}%`, background: BEAR }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {votes.items.map((it) => (
            <span
              key={it.label}
              title={it.value}
              className="rounded-md px-1.5 py-0.5 text-[9.5px] font-medium"
              style={{
                color: it.lean === 'bull' ? BULL : it.lean === 'bear' ? BEAR : MUTED,
                background: `color-mix(in oklab, ${it.lean === 'bull' ? BULL : it.lean === 'bear' ? BEAR : MUTED} 12%, transparent)`,
              }}
            >
              {it.lean === 'bull' ? '▲' : it.lean === 'bear' ? '▼' : '◆'} {it.label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[9.5px] text-ink-500">A vote count shows agreement, not proof — the edge badge above says whether signals here have a track record.</p>
      </Section>
    </section>
  )
}

/* Opens a track when a BUY/SELL appears and feeds it every live tick. */
function useSignalTracking(a: Analysis, price: number): SignalTrack | undefined {
  const key = `${a.symbol}|${a.timeframe}|${a.purity}`
  const track = useSignalTrackStore((s) => s.tracks[key])
  const open = useSignalTrackStore((s) => s.open)
  const tick = useSignalTrackStore((s) => s.tick)

  useEffect(() => {
    const action = a.signal.action
    if (action !== 'BUY' && action !== 'SELL') return
    const now = Date.now()
    const horizonMs = Math.max(a.horizon.coveredSec * 1000, 15 * 60_000)
    const cur = useSignalTrackStore.getState().tracks[key]
    const isNew = !cur || cur.action !== action || (cur.status !== 'open' && now - (cur.closedAt ?? 0) > horizonMs / 2)
    if (!isNew) return
    open({ key, action, entry: a.price, stop: a.setup.invalidation, target: a.setup.targets[0] ?? a.price, openedAt: now, horizonMs })
  }, [a.generatedAt])

  useEffect(() => {
    tick(key, price, Date.now())
  }, [key, price, tick])

  return track
}

const STATUS: Record<SignalTrack['status'], { label: string; color: string }> = {
  open: { label: 'In progress', color: AMBER },
  target: { label: 'Target reached ✓', color: BULL },
  stopped: { label: 'Stopped out ✗', color: BEAR },
  expired: { label: 'Period ended', color: MUTED },
}

function SignalProgress({ track, price, precision }: { track?: SignalTrack; price: number; precision: number }) {
  if (!track) {
    return <p className="text-[10.5px] leading-snug text-ink-500">No BUY/SELL on this setting yet. When one fires, this shows how far price has gone since, how close the target is, and how far the stop is.</p>
  }
  const at = track.status === 'open' ? price : track.closePrice ?? price
  const fav = favourPct(track, at)
  const toTarget = (at - track.entry) / (track.target - track.entry || 1)
  const stopDist = (Math.abs(at - track.stop) / at) * 100
  const buy = track.action === 'BUY'
  const st = STATUS[track.status]
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ color: buy ? BULL : BEAR, background: `color-mix(in oklab, ${buy ? BULL : BEAR} 15%, transparent)` }}>
            {track.action}
          </span>
          <span className="nums text-ink-400">
            at {fmt(track.entry, precision)} · {fmtAge(Date.now() - track.openedAt)}
          </span>
        </span>
        <span className="text-[10.5px] font-semibold" style={{ color: st.color }}>
          {st.label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[10.5px] text-ink-400">{track.status === 'open' ? 'Since the signal' : 'Result'}</span>
        <span className="nums text-[15px] font-bold" style={{ color: toneOf(fav) }}>
          {signed(fav)}
        </span>
      </div>
      {/* Stop ◀ entry ▶ target track */}
      <div className="relative mt-1.5 h-2 w-full rounded-full bg-base-800">
        <div className="absolute top-0 h-full rounded-full" style={{ left: '33.3%', width: `${Math.max(0, Math.min(1, toTarget)) * 66.7}%`, background: BULL }} />
        <div className="absolute top-0 h-full rounded-full" style={{ right: '66.7%', width: `${Math.max(0, Math.min(1, -toTarget)) * 33.3}%`, background: BEAR }} />
        <span className="absolute -top-0.5 h-3 w-px bg-white/60" style={{ left: '33.3%' }} />
      </div>
      <div className="nums mt-0.5 flex justify-between text-[9.5px] text-ink-500">
        <span style={{ color: BEAR }}>Stop {fmt(track.stop, precision)}</span>
        <span>Entry</span>
        <span style={{ color: BULL }}>Target {fmt(track.target, precision)}</span>
      </div>
      <div className="nums mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-ink-500">
        <span>
          <b className="text-ink-300">{Math.round(Math.max(0, toTarget) * 100)}%</b> of the way
        </span>
        <span>
          Stop <b className="text-ink-300">{stopDist.toFixed(2)}%</b> away
        </span>
        <span>
          Best <b style={{ color: BULL }}>{signed(track.bestPct)}</b>
        </span>
      </div>
      <p className="mt-1 text-[9.5px] text-ink-600">Followed on live prices while the app is open.</p>
    </div>
  )
}

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? '' : 'mb-3 border-b border-white/[0.04] pb-3'}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{title}</div>
      {children}
    </div>
  )
}

function AthSection({ dd, precision }: { dd: AthDrawdown | null; precision: number }) {
  if (!dd) return <p className="text-[10.5px] text-ink-500">Loading long-term history…</p>
  const day = (t: number) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (dd.atHigh) {
    return (
      <p className="text-[11px] font-semibold" style={{ color: BULL }}>
        At an all-time high — {fmt(dd.ath, precision)} (history since {day(dd.sinceTime)}).
      </p>
    )
  }
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] text-ink-400">Below the peak of {fmt(dd.ath, precision)}</span>
        <span className="nums text-[17px] font-bold" style={{ color: BEAR }}>
          −{dd.currentPct.toFixed(2)}%
        </span>
      </div>
      {/* Lowest low since the peak (left) → all-time high (right), price marker in between */}
      <div className="relative mt-1.5 h-2.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${BEAR} 45%, transparent), color-mix(in oklab, ${BULL} 45%, transparent))` }}>
        <span
          className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-white shadow"
          style={{ left: `${Math.max(0, Math.min(1, dd.position)) * 100}%` }}
          title="Price now"
        />
      </div>
      <div className="nums mt-0.5 flex justify-between text-[9.5px] text-ink-500">
        <span>Low {fmt(dd.low, precision)}</span>
        <span>Now</span>
        <span>High {fmt(dd.ath, precision)}</span>
      </div>
      <div className="nums mt-2 grid grid-cols-2 gap-1.5">
        <Mini label="Deepest fall" value={`−${dd.maxPct.toFixed(2)}%`} tone={BEAR} sub={`low on ${day(dd.lowTime)}`} />
        <Mini label="Bounce from low" value={signed(dd.bouncePct)} tone={BULL} sub="since that low" />
        <Mini label="Needed to recover" value={`+${dd.recoveryPct.toFixed(2)}%`} tone={AMBER} sub="to reach the peak" />
        <Mini label="Peak date" value={day(dd.athTime)} sub="all-time high" />
      </div>
      <p className="mt-1.5 text-[9.5px] leading-snug text-ink-500">
        Uses daily highs/lows since {day(dd.sinceTime)}. A big fall does not mean a bounce is due — it can fall further.
      </p>
    </div>
  )
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="panel-inset px-2 py-1.5">
      <div className="truncate text-[9px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-[12px] font-bold" style={{ color: tone ?? 'var(--color-ink-100)' }}>
        {value}
      </div>
      <div className="truncate text-[9px] text-ink-500">{sub}</div>
    </div>
  )
}
