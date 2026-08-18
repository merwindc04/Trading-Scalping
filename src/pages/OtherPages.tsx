import { useEffect, useState } from 'react'
import { Bell, BookOpen, Clock, LineChart, Settings as SettingsIcon, Database, Layers3, Plus, Check } from 'lucide-react'
import type { LiveState } from '@/hooks/useAnalysis'
import { ChartCard } from '@/components/chart/ChartCard'
import { ScenarioPanel } from '@/components/panels/ScenarioPanel'
import { ExplainPanel } from '@/components/panels/ExplainPanel'
import { HistoricalPanel } from '@/components/panels/HistoricalPanel'
import { MarketStrengthPanel } from '@/components/panels/MarketStrengthPanel'
import { Panel } from '@/components/ui/primitives'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { ASSETS, SCANNER_ASSETS } from '@/lib/assets'
import { useAppStore } from '@/store/appStore'
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

/* ---------- Alerts (interactive-ish) ---------- */
const ALERT_TEMPLATES = [
  'Gold Strength > 80',
  'Bull Flag detected',
  'Resistance breaks',
  'Bullish probability > 75%',
  'Multi-timeframe alignment > 80%',
  'Price enters potential entry zone',
  'Forecast flips bullish → bearish',
  'Historical similarity > 90%',
]
export function AlertsPage() {
  const [active, setActive] = useState<string[]>(['Gold Strength > 80', 'Bull Flag detected'])
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto scrollbar-thin p-4">
      <PageHead icon={Bell} title="Alerts" sub="Get notified the moment the market matches your conditions." phase="Phase 8" />
      <Panel title="Alert Conditions" className="mt-3">
        <div className="space-y-1.5">
          {ALERT_TEMPLATES.map((t) => {
            const on = active.includes(t)
            return (
              <button
                key={t}
                onClick={() => setActive((a) => (on ? a.filter((x) => x !== t) : [...a, t]))}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-[12px] transition-colors ${
                  on ? 'border-gold-500/30 bg-gold-500/[0.06] text-gold-100' : 'border-white/[0.06] bg-base-800 text-ink-300 hover:border-white/15'
                }`}
              >
                <span>Notify me when: <span className="font-medium">{t}</span></span>
                <span className={`grid h-5 w-5 place-items-center rounded-md ${on ? 'bg-gold-400 text-base-950' : 'border border-white/10'}`}>{on ? <Check size={12} /> : <Plus size={12} className="text-ink-500" />}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[10px] text-ink-500">{active.length} active alert{active.length === 1 ? '' : 's'}. Delivery channels (push / email / webhook) arrive with accounts in Phase 8.</p>
      </Panel>
    </div>
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
