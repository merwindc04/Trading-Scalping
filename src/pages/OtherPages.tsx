import { useEffect, useState } from 'react'
import { Bell, BookOpen, Clock, LineChart, Settings as SettingsIcon, Database, Layers3, Plus, Check } from 'lucide-react'
import type { LiveState } from '@/hooks/useAnalysis'
import { ChartCard } from '@/components/chart/ChartCard'
import { ScenarioPanel } from '@/components/panels/ScenarioPanel'
import { SignalPanel } from '@/components/panels/SignalPanel'
import { ExplainPanel } from '@/components/panels/ExplainPanel'
import { HistoricalPanel } from '@/components/panels/HistoricalPanel'
import { MarketStrengthPanel } from '@/components/panels/MarketStrengthPanel'
import { Panel } from '@/components/ui/primitives'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { ASSETS, SCANNER_ASSETS } from '@/lib/assets'
import { useAppStore, GRADE_RANK, type AlertGrade, type AlertDirection } from '@/store/appStore'
import { useSignalsStore } from '@/store/signalsStore'
import { fmt, fmtSigned } from '@/lib/format'
import { Sparkline } from '@/components/ui/primitives'

/* ---------- Forecast (focused) ---------- */
export function ForecastPage({ live }: { live: LiveState }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto scrollbar-thin p-2 lg:grid lg:grid-cols-[minmax(0,1fr)_366px] lg:overflow-hidden">
      <div className="h-[56vh] min-h-0 lg:h-auto">
        {live.analysis ? <ChartCard analysis={live.analysis} liveCandle={live.liveCandle} price={live.price} /> : null}
      </div>
      <aside className="flex flex-col gap-2 lg:overflow-y-auto scrollbar-thin">
        {live.analysis && (
          <>
            <SignalPanel analysis={live.analysis} />
            <ScenarioPanel analysis={live.analysis} />
            <ExplainPanel analysis={live.analysis} />
          </>
        )}
      </aside>
    </div>
  )
}

/* ---------- Historical (focused) ---------- */
export function HistoricalPage({ live }: { live: LiveState }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto scrollbar-thin p-2 lg:grid lg:grid-cols-[minmax(0,1fr)_366px] lg:overflow-hidden">
      <div className="h-[56vh] min-h-0 lg:h-auto">
        {live.analysis ? <ChartCard analysis={live.analysis} liveCandle={live.liveCandle} price={live.price} /> : null}
      </div>
      <aside className="flex flex-col gap-2 lg:overflow-y-auto scrollbar-thin">
        {live.analysis && (
          <>
            <HistoricalPanel analysis={live.analysis} />
            <MarketStrengthPanel analysis={live.analysis} />
          </>
        )}
      </aside>
    </div>
  )
}

/* ---------- Markets (asset cards) ---------- */
export function MarketsPage() {
  const { setSymbol, setNav } = useAppStore()
  const [cards, setCards] = useState<{ sym: string; price: number; chg: number; spark: number[] }[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(
      SCANNER_ASSETS.map(async (sym) => {
        const c = await marketData.getHistory(sym, '1H', 80)
        const closes = c.map((x) => x.close)
        const last = closes[closes.length - 1]
        const prev = closes[closes.length - 24] ?? closes[0]
        return { sym, price: last, chg: ((last - prev) / prev) * 100, spark: closes.slice(-40) }
      }),
    ).then((r) => alive && setCards(r))
    return () => {
      alive = false
    }
  }, [])
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-3">
      <h2 className="mb-3 text-lg font-semibold text-ink-100">Markets</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => {
          const up = c.chg >= 0
          return (
            <button
              key={c.sym}
              onClick={() => {
                setSymbol(c.sym)
                setNav('Dashboard')
              }}
              className="panel p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-gold-500/25"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-ink-100">{c.sym}</div>
                  <div className="text-[10px] text-ink-500">{ASSETS[c.sym].name}</div>
                </div>
                <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-ink-400">{ASSETS[c.sym].assetClass}</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="nums text-lg font-bold text-ink-100">{fmt(c.price, ASSETS[c.sym].precision)}</div>
                  <div className={`nums text-[11px] font-medium ${up ? 'text-[var(--color-bull-400)]' : 'text-[var(--color-bear-400)]'}`}>{fmtSigned(c.chg)}%</div>
                </div>
                <Sparkline data={c.spark} color={up ? 'var(--color-bull-400)' : 'var(--color-bear-400)'} width={90} height={34} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Alerts (custom trigger rules + live preview) ---------- */
const GRADES: AlertGrade[] = ['C', 'B', 'A', 'A+']
const DIRECTIONS: { key: AlertDirection; label: string }[] = [
  { key: 'both', label: 'Buy & Sell' },
  { key: 'buy', label: 'Buy only' },
  { key: 'sell', label: 'Sell only' },
]

export function AlertsPage({ live }: { live: LiveState }) {
  const { notifyEnabled, setNotify, alertRules, setAlertRules } = useAppStore()

  async function enable() {
    if (notifyEnabled) return setNotify(false)
    setNotify(true)
    try {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
    } catch {
      /* ignore */
    }
  }

  const sig = live.analysis?.signal
  const wouldFire =
    !!sig &&
    sig.action !== 'WAIT' &&
    (alertRules.direction === 'both' || (alertRules.direction === 'buy' && sig.action === 'BUY') || (alertRules.direction === 'sell' && sig.action === 'SELL')) &&
    GRADE_RANK[sig.grade] >= GRADE_RANK[alertRules.minGrade]

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto scrollbar-thin p-4">
      <PageHead icon={Bell} title="Alerts" sub="Set exactly when AurumPulse pings you that it’s time to act." phase="Live" />

      {/* Master switch */}
      <Panel className="mt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-ink-100">Buy / sell signal alerts</div>
            <div className="text-[11px] text-ink-400">In-app toast + browser notification when your rules are met.</div>
          </div>
          <Switch on={notifyEnabled} onClick={enable} />
        </div>
      </Panel>

      {/* Rules */}
      <Panel title="Trigger Rules" className="mt-2">
        <div className="space-y-3">
          <Row label="Direction" hint="Which signals should alert you">
            <Segmented options={DIRECTIONS.map((d) => ({ key: d.key, label: d.label }))} value={alertRules.direction} onChange={(v) => setAlertRules({ direction: v as AlertDirection })} />
          </Row>

          <Row label="Minimum grade" hint="Only alert on setups this strong or better">
            <Segmented
              options={GRADES.map((g) => ({ key: g, label: g }))}
              value={alertRules.minGrade}
              onChange={(v) => setAlertRules({ minGrade: v as AlertGrade })}
            />
          </Row>

          <Row label="Entry-zone alert" hint="Also ping when price enters an active signal’s entry zone">
            <Switch on={alertRules.entryZone} onClick={() => setAlertRules({ entryZone: !alertRules.entryZone })} />
          </Row>
        </div>
      </Panel>

      {/* Live preview */}
      <Panel title="Live Preview" className="mt-2">
        {sig ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] text-ink-300">
                Current signal for <span className="font-semibold text-ink-100">{live.analysis!.symbol}</span>:{' '}
                <span className="font-semibold" style={{ color: sig.action === 'BUY' ? 'var(--color-bull-400)' : sig.action === 'SELL' ? 'var(--color-bear-400)' : 'var(--color-neutral-400)' }}>
                  {sig.headline}
                </span>{' '}
                · Grade {sig.grade} · {sig.score}/100
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-500">{sig.timing}</div>
            </div>
            <span
              className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[10.5px] font-semibold"
              style={{
                color: wouldFire ? 'var(--color-bull-400)' : 'var(--color-ink-400)',
                borderColor: wouldFire ? 'color-mix(in oklab, var(--color-bull-500) 40%, transparent)' : 'rgba(255,255,255,0.1)',
                background: wouldFire ? 'color-mix(in oklab, var(--color-bull-500) 12%, transparent)' : 'transparent',
              }}
            >
              {notifyEnabled ? (wouldFire ? '✓ Would alert you' : '✗ Below your rules') : 'Alerts off'}
            </span>
          </div>
        ) : (
          <div className="text-[12px] text-ink-500">Loading current signal…</div>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-ink-500">
          The preview tracks the asset & timeframe you’re viewing; the scanner below watches your whole watchlist. Analytical suggestions with a defined stop — probabilistic, not guarantees or personalised advice.
        </p>
      </Panel>

      <OpportunitiesPanel />
    </div>
  )
}

function OpportunitiesPanel() {
  const signals = useSignalsStore((s) => s.watchlistSignals)
  const { alertRules, setSymbol, setNav } = useAppStore()
  const rows = Object.values(signals)
    .filter((s) => s.action !== 'WAIT')
    .filter((s) => alertRules.direction === 'both' || (alertRules.direction === 'buy' && s.action === 'BUY') || (alertRules.direction === 'sell' && s.action === 'SELL'))
    .filter((s) => GRADE_RANK[s.grade] >= GRADE_RANK[alertRules.minGrade])
    .sort((a, b) => b.score - a.score)

  return (
    <Panel title="Watchlist Opportunities" className="mt-2" right={<span className="nums text-[10px] text-ink-500">{rows.length} matching your rules</span>}>
      {rows.length === 0 ? (
        <div className="rounded-lg bg-base-800 px-3 py-4 text-center text-[11px] text-ink-500">
          No watchlist markets match your rules right now. The scanner keeps checking every 30 seconds — you’ll be notified the moment one does.
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((s) => {
            const buy = s.action === 'BUY'
            const color = buy ? 'var(--color-bull-400)' : 'var(--color-bear-400)'
            return (
              <button
                key={s.symbol}
                onClick={() => {
                  setSymbol(s.symbol)
                  setNav('Dashboard')
                }}
                className="flex w-full items-center gap-3 rounded-lg bg-base-800 px-3 py-2 text-left hover:bg-white/[0.04]"
              >
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
                  {s.headline}
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-ink-100">
                    {s.symbol} <span className="text-[10px] font-normal text-ink-500">· {s.timeframe}</span>
                  </div>
                  <div className="text-[10px] text-ink-500">
                    {s.symbolName} · Grade {s.grade} · {s.score}/100 · {s.confidence}% conf.
                  </div>
                </div>
                <span className="nums ml-auto text-[11px] text-ink-300">{fmt(s.price, s.precision)}</span>
              </button>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base-800 px-3 py-2.5">
      <div>
        <div className="text-[12px] font-medium text-ink-200">{label}</div>
        <div className="text-[10px] text-ink-500">{hint}</div>
      </div>
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

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-gradient-to-r from-gold-300 to-gold-500' : 'bg-base-700'}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

/* ---------- Roadmap pages ---------- */
export function BacktestingPage() {
  return (
    <RoadmapShell
      icon={Clock}
      title="Forecast Time Machine"
      sub="Replay any historical date, generate the forecast from only what was known then, and reveal the actual outcome to score the model honestly."
      phase="Phase 6"
      bullets={[
        'Pick a historical date — all future candles are hidden.',
        'AurumPulse forecasts using only information available at that moment.',
        'Reveal the real market and compare predicted vs actual direction, target and invalidation accuracy.',
        'Feeds a transparent Model Performance dashboard: directional accuracy, target hit-rate, and invalidation-before-target by timeframe and regime.',
      ]}
    />
  )
}

export function JournalPage() {
  return (
    <RoadmapShell
      icon={BookOpen}
      title="Trading Journal"
      sub="Save any forecast or setup, attach your notes and a chart snapshot, then track how it actually resolved."
      phase="Phase 8"
      bullets={[
        'Capture date, asset, timeframe, forecast, AI confidence, entry, targets and invalidation.',
        'Record the actual result and your own notes.',
        'Personal statistics reveal which setups and styles perform best for you.',
      ]}
    />
  )
}

export function WatchlistPage() {
  const { watchlist } = useAppStore()
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto scrollbar-thin p-4">
      <PageHead icon={LineChart} title="Watchlist" sub="Your markets at a glance with live bias." phase="Live" />
      <div className="panel mt-3 overflow-hidden p-0">
        <WatchlistBig symbols={watchlist} />
      </div>
    </div>
  )
}

function WatchlistBig({ symbols }: { symbols: string[] }) {
  const { setSymbol, setNav } = useAppStore()
  const [rows, setRows] = useState<{ sym: string; price: number; chg: number; spark: number[] }[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(
      symbols.map(async (sym) => {
        const c = await marketData.getHistory(sym, '1H', 80)
        const closes = c.map((x) => x.close)
        const last = closes[closes.length - 1]
        const prev = closes[closes.length - 24] ?? closes[0]
        return { sym, price: last, chg: ((last - prev) / prev) * 100, spark: closes.slice(-44) }
      }),
    ).then((r) => alive && setRows(r))
    return () => {
      alive = false
    }
  }, [symbols])
  return (
    <div className="divide-y divide-white/[0.04]">
      {rows.map((r) => {
        const up = r.chg >= 0
        return (
          <button
            key={r.sym}
            onClick={() => {
              setSymbol(r.sym)
              setNav('Dashboard')
            }}
            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.03]"
          >
            <div className="w-24">
              <div className="text-[13px] font-semibold text-ink-100">{r.sym}</div>
              <div className="text-[10px] text-ink-500">{ASSETS[r.sym].name}</div>
            </div>
            <Sparkline data={r.spark} color={up ? 'var(--color-bull-400)' : 'var(--color-bear-400)'} width={120} height={30} />
            <div className="ml-auto text-right">
              <div className="nums text-[13px] font-semibold text-ink-100">{fmt(r.price, ASSETS[r.sym].precision)}</div>
              <div className={`nums text-[11px] ${up ? 'text-[var(--color-bull-400)]' : 'text-[var(--color-bear-400)]'}`}>{fmtSigned(r.chg)}%</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function SettingsPage() {
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto scrollbar-thin p-4">
      <PageHead icon={SettingsIcon} title="Settings" sub="Configuration and the data-provider abstraction." phase="" />
      <Panel title="Market Data Source" className="mt-3">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-bull-500)]/25 bg-[var(--color-bull-500)]/[0.05] px-3 py-3">
          <span className="live-dot mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-bull-400)]" />
          <div>
            <div className="text-[12px] font-semibold text-ink-100">
              Live Market Data <span className="ml-1 rounded bg-[var(--color-bull-500)]/15 px-1.5 py-0.5 text-[9px] text-[var(--color-bull-400)]">ACTIVE</span>
            </div>
            <div className="text-[10px] text-ink-400">
              Gold (XAUUSD) and BTC/ETH stream live from Binance public market data — gold via <code className="text-gold-200">PAXG</code>, redeemable 1:1 for a troy ounce of physical gold. Symbols without a live feed (silver, forex, indices) fall back to demo automatically.
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-ink-400 sm:grid-cols-3">
          <div className="rounded-md border border-[var(--color-bull-500)]/20 bg-base-800 px-2 py-2 text-center">Binance <span className="text-[var(--color-bull-400)]">· live</span></div>
          {['Twelve Data', 'Polygon.io', 'OANDA', 'Metals-API', 'Custom REST'].map((p) => (
            <div key={p} className="rounded-md bg-base-800 px-2 py-2 text-center opacity-70">{p} <span className="text-ink-500">· key</span></div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-ink-500">Add a keyed provider (Twelve Data, Polygon…) behind the same <code className="text-gold-200">MarketDataProvider</code> interface for true spot XAU/USD, forex and index coverage.</p>
      </Panel>
      <Panel title="Engine Architecture" className="mt-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {['MarketDataProvider', 'TechnicalAnalysis', 'PatternRecognition', 'HistoricalSimilarity', 'ForecastEnsemble', 'AIExplanation'].map((e) => (
            <div key={e} className="flex items-center gap-1.5 rounded-md bg-base-800 px-2 py-2 text-[10.5px] text-ink-300">
              <Layers3 size={12} className="text-gold-300" /> {e}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Preferences" className="mt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-ink-400">Your asset, timeframe, overlays, watchlist and alert rules are saved on this device and restored automatically.</div>
          <button
            onClick={() => {
              try {
                localStorage.removeItem('aurumpulse')
              } catch {
                /* ignore */
              }
              location.reload()
            }}
            className="btn shrink-0"
          >
            Reset to defaults
          </button>
        </div>
      </Panel>
    </div>
  )
}

/* ---------- shared bits ---------- */
function PageHead({ icon: Icon, title, sub, phase }: { icon: typeof Bell; title: string; sub: string; phase: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-gold-200/20 to-gold-500/5">
        <Icon size={20} className="text-gold-200" />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-ink-100">{title}</h2>
          {phase && <span className="rounded-full border border-gold-500/25 bg-gold-500/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-200">{phase}</span>}
        </div>
        <p className="text-[11.5px] text-ink-400">{sub}</p>
      </div>
    </div>
  )
}

function RoadmapShell({ icon, title, sub, phase, bullets }: { icon: typeof Bell; title: string; sub: string; phase: string; bullets: string[] }) {
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto scrollbar-thin p-4">
      <PageHead icon={icon} title={title} sub={sub} phase={phase} />
      <Panel className="mt-3" title="What this feature does">
        <ul className="space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-ink-300">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gold-500/15 text-[9px] font-bold text-gold-200">{i + 1}</span>
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-base-800 px-3 py-2 text-[10.5px] text-ink-500">
          The dashboard, analysis engines and forecasting are live now. This module is on the build roadmap — the underlying engines it needs already exist.
        </div>
      </Panel>
    </div>
  )
}
