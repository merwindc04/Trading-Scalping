import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Eye, EyeOff, Shuffle } from 'lucide-react'
import type { Candle, Direction, Timeframe } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'
import { Panel, ProbabilityBar, DirectionPill, Stat, Sparkline } from '@/components/ui/primitives'
import { ReplayChart } from '@/components/chart/ReplayChart'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { ASSETS } from '@/lib/assets'
import { purityScale, scaleCandle } from '@/lib/analyze'
import { formatSpan } from '@/lib/horizons'
import { MODEL_LABEL } from '@/lib/engines/backtest'
import { MIN_HISTORY, replayAt, runTimeMachine, type PerformanceReport, type RateStat, type ReplayResult } from '@/lib/engines/timeMachine'
import { useAppStore } from '@/store/appStore'
import { fmt, fmtSigned } from '@/lib/format'

/* ============================================================
   Backtesting — the Forecast Time Machine.
   1. Pick a past bar; the future is hidden.
   2. The model forecasts from only what was known then.
   3. Reveal the real outcome and see how the call scored.
   4. Model Performance repeats this across the whole history.
   ============================================================ */

const TIMEFRAMES: Timeframe[] = ['15m', '1H', '4H', '1D']
const HORIZON_BARS = [6, 12, 24, 48]

const BULL = 'var(--color-bull-400)'
const BEAR = 'var(--color-bear-400)'
const AMBER = 'var(--color-gold-300)'
const GRAY = 'var(--color-neutral-400)'

const dirWord = (d: Direction) => (d === 'BULLISH' ? 'Up' : d === 'BEARISH' ? 'Down' : 'Sideways')
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`

function fmtDate(t: number, tf: Timeframe) {
  const d = new Date(t * 1000)
  const intraday = TIMEFRAME_SECONDS[tf] < 86400
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', ...(intraday ? { hour: '2-digit', minute: '2-digit' } : {}) })
}

export function BacktestingPage() {
  const store = useAppStore()
  const [symbol, setSymbol] = useState(store.symbol in ASSETS ? store.symbol : 'XAUUSD')
  const [tf, setTf] = useState<Timeframe>(TIMEFRAMES.includes(store.timeframe) ? store.timeframe : '1H')
  const [h, setH] = useState(12)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [perf, setPerf] = useState<PerformanceReport | null>(null)
  const [perfBusy, setPerfBusy] = useState(false)

  const asset = ASSETS[symbol]
  const isDemo = marketData.getStatus(symbol) === 'demo'
  const purity = symbol === 'XAUAED' ? store.purity : '24K'

  // Load the deepest history the feed offers (up to 1,000 bars).
  useEffect(() => {
    let alive = true
    setLoading(true)
    setPerf(null)
    marketData.getHistory(symbol, tf, 1000).then((raw) => {
      if (!alive) return
      const k = purityScale(symbol, purity)
      setCandles(raw.map((c) => scaleCandle(c, k)))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [symbol, tf, purity])

  const n = candles.length
  const lastScoreable = n - 1 - h
  const enough = lastScoreable >= MIN_HISTORY

  // Default replay point: the most recent bar whose outcome is already known.
  useEffect(() => {
    if (n) setIndex(Math.max(Math.min(MIN_HISTORY, n - 1), lastScoreable))
    setRevealed(false)
  }, [n, h, lastScoreable])

  const replay = useMemo<ReplayResult | null>(() => (n > MIN_HISTORY && index >= MIN_HISTORY && index < n ? replayAt(candles, index, h) : null), [candles, index, h, n])

  // Model Performance runs off the main render so the page stays responsive.
  useEffect(() => {
    if (!enough) {
      setPerf(null)
      return
    }
    setPerfBusy(true)
    const id = window.setTimeout(() => {
      setPerf(runTimeMachine(candles, h))
      setPerfBusy(false)
    }, 30)
    return () => window.clearTimeout(id)
  }, [candles, h, enough])

  const go = (i: number) => {
    setIndex(Math.max(MIN_HISTORY, Math.min(n - 1, i)))
    setRevealed(false)
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-3">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-gold-200/20 to-gold-500/5">
              <Clock size={20} className="text-gold-200" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-ink-100">Forecast Time Machine</h2>
                <span className="rounded-full border border-gold-500/25 bg-gold-500/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-200">Live</span>
              </div>
              <p className="max-w-2xl text-[11.5px] text-ink-400">Go back to any past moment. The model forecasts using only what was known then — the future stays hidden until you reveal it.</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Panel className="mt-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <Field label="Market">
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-white/[0.08] bg-base-900 px-2 py-1 text-[12px] font-semibold text-ink-100 outline-none focus:border-gold-500/40">
                {Object.values(ASSETS).map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Chart timeframe">
              <Segmented options={TIMEFRAMES.map((t) => ({ key: t, label: t }))} value={tf} onChange={(v) => setTf(v as Timeframe)} />
            </Field>
            <Field label="Forecast period">
              <Segmented options={HORIZON_BARS.map((b) => ({ key: String(b), label: formatSpan(b * TIMEFRAME_SECONDS[tf]) }))} value={String(h)} onChange={(v) => setH(Number(v))} />
            </Field>
            {symbol === 'XAUAED' && <span className="text-[10.5px] text-ink-500">Prices in AED/g · {purity}</span>}
          </div>
          {isDemo && (
            <div className="mt-2.5 rounded-lg border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.06] px-3 py-2 text-[10.5px] text-gold-200">
              {symbol} has no free live feed — this replay uses simulated demo prices. The scores show how the engine behaves, not how it would have done on the real market.
            </div>
          )}
        </Panel>

        {loading ? (
          <Panel className="mt-2">
            <div className="py-10 text-center text-[12px] text-ink-500">Loading history…</div>
          </Panel>
        ) : !enough ? (
          <Panel className="mt-2">
            <div className="py-8 text-center text-[12px] text-ink-400">
              <div className="font-semibold text-ink-200">Insufficient Data</div>
              Only {n} candles are available on {tf}. A replay needs at least {MIN_HISTORY + h + 1}. Pick a lower timeframe or a shorter forecast period.
            </div>
          </Panel>
        ) : (
          <>
            {/* Replay */}
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_340px]">
              <Panel
                title="1 · Pick a moment in the past"
                right={<span className="nums text-[10.5px] text-ink-400">{replay ? fmtDate(replay.time, tf) : ''}</span>}
              >
                <div className="h-[340px] sm:h-[400px]">
                  <ReplayChart candles={candles} index={index} revealed={revealed} replay={replay} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <IconBtn label="One bar back" onClick={() => go(index - 1)}>
                    <ChevronLeft size={14} />
                  </IconBtn>
                  <input
                    type="range"
                    min={MIN_HISTORY}
                    max={n - 1}
                    value={index}
                    onChange={(e) => go(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer accent-[var(--color-gold-400)]"
                    aria-label="Replay point"
                  />
                  <IconBtn label="One bar forward" onClick={() => go(index + 1)}>
                    <ChevronRight size={14} />
                  </IconBtn>
                  <IconBtn label="Random past moment" onClick={() => go(MIN_HISTORY + Math.floor(Math.random() * Math.max(1, lastScoreable - MIN_HISTORY + 1)))}>
                    <Shuffle size={14} />
                  </IconBtn>
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-ink-500">
                  <span>{fmtDate(candles[MIN_HISTORY].time, tf)}</span>
                  <span className="hidden sm:inline">Drag to travel back · the outcome is known up to {fmtDate(candles[Math.max(MIN_HISTORY, lastScoreable)].time, tf)}</span>
                  <span>Now</span>
                </div>
              </Panel>

              <div className="flex flex-col gap-2">
                {replay && <ForecastCard r={replay} precision={asset.precision} tf={tf} />}
                {replay && <OutcomeCard r={replay} precision={asset.precision} revealed={revealed} onReveal={() => setRevealed((v) => !v)} />}
              </div>
            </div>

            {/* Performance */}
            <PerformancePanel perf={perf} busy={perfBusy} tf={tf} h={h} onPick={(i) => go(i)} />
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- Forecast as of the replay point ---------------- */
function ForecastCard({ r, precision, tf }: { r: ReplayResult; precision: number; tf: Timeframe }) {
  const color = r.direction === 'BULLISH' ? BULL : r.direction === 'BEARISH' ? BEAR : GRAY
  return (
    <Panel title="2 · What the model said then" accent>
      <div className="flex items-center justify-between">
        <DirectionPill direction={r.direction} label={`${dirWord(r.direction)} call`} size="lg" />
        <span className="nums text-[11px] text-ink-400">at {fmt(r.price, precision)}</span>
      </div>
      <div className="mt-1.5 text-[10.5px] text-ink-500">
        Model used: <span className="font-semibold text-ink-300">{MODEL_LABEL[r.model]}</span> — chosen from older data only
      </div>
      <div className="mt-3">
        <ProbabilityBar bull={r.probs.bull} neutral={r.probs.neutral} bear={r.probs.bear} />
        <div className="nums mt-1 flex justify-between text-[10.5px]">
          <span style={{ color: BULL }}>Up {r.probs.bull}%</span>
          <span style={{ color: GRAY }}>Sideways {r.probs.neutral}%</span>
          <span style={{ color: BEAR }}>Down {r.probs.bear}%</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {r.direction === 'NEUTRAL' ? (
          <>
            <Stat label="Range top" value={fmt(r.rangeTop, precision)} />
            <Stat label="Range bottom" value={fmt(r.rangeBottom, precision)} />
          </>
        ) : (
          <>
            <Stat label="Target" value={fmt(r.target, precision)} tint={color} sub={`${fmtSigned((r.target / r.price - 1) * 100)}%`} />
            <Stat label="Invalidation" value={fmt(r.invalidation, precision)} tint={AMBER} sub={`${fmtSigned((r.invalidation / r.price - 1) * 100)}%`} />
          </>
        )}
        <Stat label="Validated confidence" value={r.validated ? `${r.confidence}%` : '—'} sub={r.validated ? 'hit rate of similar readings' : 'Insufficient Data'} />
        <Stat label="Looking ahead" value={formatSpan(r.horizonSteps * TIMEFRAME_SECONDS[tf])} sub={`${r.horizonSteps} bars`} />
      </div>
      {!r.validated && r.reason && <p className="mt-2 text-[10px] leading-relaxed text-ink-500">{r.reason}</p>}
    </Panel>
  )
}

/* ---------------- Revealed outcome ---------------- */
const KIND_TEXT: Record<string, { label: string; color: string }> = {
  target: { label: 'Target reached first', color: BULL },
  stopped: { label: 'Invalidated first', color: BEAR },
  neither: { label: 'Neither level touched', color: GRAY },
  'range-held': { label: 'Range held', color: BULL },
  'range-broke': { label: 'Range broke', color: BEAR },
}

function OutcomeCard({ r, precision, revealed, onReveal }: { r: ReplayResult; precision: number; revealed: boolean; onReveal: () => void }) {
  const o = r.outcome
  return (
    <Panel title="3 · What really happened">
      {!o ? (
        <div className="rounded-lg bg-base-800 px-3 py-4 text-center text-[11px] text-ink-400">
          <div className="font-semibold text-ink-200">Awaiting Confirmation</div>
          This moment is too recent — the {r.horizonSteps}-bar outcome hasn’t happened yet.
        </div>
      ) : !revealed ? (
        <button onClick={onReveal} className="btn w-full justify-center gap-2 py-2.5 text-[12px] font-semibold">
          <Eye size={14} /> Reveal the outcome
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span
              className="rounded-lg px-2.5 py-1 text-[12px] font-bold"
              style={{ color: o.correct ? BULL : BEAR, background: `color-mix(in oklab, ${o.correct ? BULL : BEAR} 14%, transparent)` }}
            >
              {o.correct ? '✓ Call was right' : '✗ Call was wrong'}
            </span>
            <span className="text-[11px] font-medium" style={{ color: KIND_TEXT[o.kind].color }}>
              {KIND_TEXT[o.kind].label}
              {o.barsToEvent ? ` · bar ${o.barsToEvent}` : ''}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Stat label="Price went" value={dirWord(o.actual)} tint={o.actual === 'BULLISH' ? BULL : o.actual === 'BEARISH' ? BEAR : GRAY} sub={`${fmtSigned(o.returnPct)}%`} />
            <Stat label="Ended at" value={fmt(o.endPrice, precision)} />
            <Stat label="Best move for the call" value={`${o.maxFavourablePct.toFixed(2)}%`} tint={BULL} />
            <Stat label="Worst move against" value={`${o.maxAdversePct.toFixed(2)}%`} tint={BEAR} />
          </div>
          <button onClick={onReveal} className="mt-2 flex items-center gap-1.5 text-[10.5px] text-ink-500 hover:text-ink-300">
            <EyeOff size={12} /> Hide again
          </button>
        </>
      )}
    </Panel>
  )
}

/* ---------------- Model Performance ---------------- */
function PerformancePanel({ perf, busy, tf, h, onPick }: { perf: PerformanceReport | null; busy: boolean; tf: Timeframe; h: number; onPick: (i: number) => void }) {
  if (!perf) {
    return (
      <Panel title="Model Performance" className="mt-2">
        <div className="py-6 text-center text-[11px] text-ink-500">{busy ? 'Replaying the whole history…' : 'Waiting for data…'}</div>
      </Panel>
    )
  }
  const recent = perf.replays.filter((r) => r.outcome).slice(-14).reverse()
  const edgeColor = perf.edge > 0.02 ? BULL : perf.edge < -0.02 ? BEAR : GRAY
  return (
    <Panel
      title="Model Performance"
      className="mt-2"
      right={
        <span className="nums text-[10px] text-ink-500">
          {perf.scored} replays · {fmtDate(perf.fromTime, tf)} → {fmtDate(perf.toTime, tf)}
          {busy ? ' · updating…' : ''}
        </span>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-ink-400">
        The Time Machine replayed a forecast every {perf.stride} bars and checked each one {formatSpan(h * TIMEFRAME_SECONDS[tf])} later. Nearby replays overlap, so ranges use ≈{Math.round(perf.effectiveSamples)} independent samples.
      </p>

      {!perf.sufficient && (
        <div className="mb-3 rounded-lg border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.06] px-3 py-2 text-[11px] text-gold-200">
          <span className="font-semibold">Insufficient Data — </span>
          {perf.reason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Stat label="Direction right" value={pct(perf.directional.rate)} sub={`likely ${pct(perf.directional.ciLow)}–${pct(perf.directional.ciHigh)} · ${perf.directional.n} calls`} />
        <Stat label="Edge vs guessing" value={`${perf.edge >= 0 ? '+' : ''}${(perf.edge * 100).toFixed(1)} pts`} tint={edgeColor} sub={`a naive guess gets ${pct(perf.baseline)}`} />
        <Stat label="Target hit first" value={pct(perf.targetFirst.rate)} tint={BULL} sub={`stopped first ${pct(perf.stoppedFirst.rate)}`} />
        <Stat label="Sideways calls held" value={perf.neutral.n ? pct(perf.neutral.rate) : '—'} sub={`${perf.neutral.n} sideways calls`} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        {/* Breakdown */}
        <div className="panel-inset p-2.5">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-500">When does it work?</div>
          <div className="space-y-1.5">
            {[...perf.byDirection.map((d) => ({ label: d.label, hint: '', stat: d.stat })), ...perf.byRegime, { label: 'Validated calls only', hint: 'enough history to trust', stat: perf.validatedOnly }].map((row) => (
              <RateRow key={row.label} label={row.label} hint={row.hint} stat={row.stat} baseline={perf.baseline} />
            ))}
          </div>
        </div>

        {/* Calibration */}
        <div className="panel-inset p-2.5">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-500">Are the % honest?</div>
          <p className="mb-2 text-[10px] leading-relaxed text-ink-500">When the model said “X % likely”, how often did that outcome really happen? Close numbers mean the percentages can be trusted.</p>
          <table className="nums w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9.5px] uppercase tracking-wider text-ink-500">
                <th className="pb-1 font-medium">Model said</th>
                <th className="pb-1 font-medium">Happened</th>
                <th className="pb-1 text-right font-medium">Cases</th>
              </tr>
            </thead>
            <tbody>
              {perf.calibration.map((b) => {
                const gap = Math.abs(b.actual - b.predicted)
                return (
                  <tr key={b.label} className="border-t border-white/[0.04]">
                    <td className="py-1 text-ink-300">{b.predicted.toFixed(0)}%</td>
                    <td className="py-1 font-semibold" style={{ color: b.n < 6 ? GRAY : gap <= 10 ? BULL : gap <= 20 ? AMBER : BEAR }}>
                      {b.actual.toFixed(0)}%
                    </td>
                    <td className="py-1 text-right text-ink-500">{b.n}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Rolling accuracy + recent */}
        <div className="panel-inset p-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Accuracy over time</div>
          {perf.rolling.length > 1 ? (
            <div className="flex items-center gap-2">
              <Sparkline data={perf.rolling} color={AMBER} width={170} height={34} />
              <span className="nums text-[10px] text-ink-500">last 12 calls · now {perf.rolling[perf.rolling.length - 1].toFixed(0)}%</span>
            </div>
          ) : (
            <div className="text-[10.5px] text-ink-500">Not enough calls yet.</div>
          )}
          <div className="mb-1 mt-3 text-[10px] uppercase tracking-wider text-ink-500">Recent replays · tap to open</div>
          <div className="max-h-[150px] space-y-0.5 overflow-y-auto scrollbar-thin">
            {recent.map((r) => (
              <button key={r.index} onClick={() => onPick(r.index)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[10.5px] hover:bg-white/[0.04]">
                <span style={{ color: r.direction === 'BULLISH' ? BULL : r.direction === 'BEARISH' ? BEAR : GRAY }}>{r.direction === 'BULLISH' ? '▲' : r.direction === 'BEARISH' ? '▼' : '◆'}</span>
                <span className="nums text-ink-300">{fmtDate(r.time, tf)}</span>
                <span className="ml-auto font-semibold" style={{ color: r.outcome!.correct ? BULL : BEAR }}>
                  {r.outcome!.correct ? '✓' : '✗'} {fmtSigned(r.outcome!.returnPct)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-500">
        Replays use the parts of the model that can be rebuilt from price history alone — the validated technical core, support/resistance zones, targets and invalidation. Multi-timeframe alignment and macro inputs have no historical snapshots, so they are not scored here. Past accuracy does not guarantee future results.
      </p>
    </Panel>
  )
}

function RateRow({ label, hint, stat, baseline }: { label: string; hint: string; stat: RateStat; baseline: number }) {
  const thin = stat.n < 8
  const color = thin ? GRAY : stat.rate - baseline > 0.03 ? BULL : stat.rate - baseline < -0.03 ? BEAR : GRAY
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="min-w-0 flex-1">
        <span className="text-ink-300">{label}</span>
        {hint && <span className="ml-1 text-[9.5px] text-ink-500">{hint}</span>}
      </div>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-base-700">
        <div className="h-full rounded-full" style={{ width: `${stat.rate * 100}%`, background: color }} />
      </div>
      <span className="nums w-20 text-right font-semibold" style={{ color }}>
        {stat.n ? pct(stat.rate) : '—'} <span className="text-[9.5px] font-normal text-ink-500">({stat.n})</span>
      </span>
    </div>
  )
}

/* ---------------- small UI bits ---------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
      {children}
    </div>
  )
}

function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-white/[0.06] bg-base-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${value === o.key ? 'bg-gradient-to-b from-gold-200 to-gold-400 text-base-950' : 'text-ink-400 hover:text-ink-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-base-800 text-ink-300 hover:border-gold-500/30 hover:text-gold-200">
      {children}
    </button>
  )
}
