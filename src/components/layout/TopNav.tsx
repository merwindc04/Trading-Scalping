import { useState } from 'react'
import { ChevronDown, Search, Sparkles, Bell, MessageSquare } from 'lucide-react'
import type { Timeframe, TradingStyle } from '@/types/market'
import { TIMEFRAME_LABEL } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import { useAppStore, type NavKey } from '@/store/appStore'
import { fmt, fmtSigned } from '@/lib/format'

const NAV: NavKey[] = ['Dashboard', 'Markets', 'AI Scanner', 'Forecast', 'Historical', 'Backtesting', 'Watchlist', 'Alerts', 'Journal', 'Settings']
const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', '1D', '1W', '1MO']
const STYLES: TradingStyle[] = ['SCALP', 'INTRADAY', 'SWING', 'INVEST']

export function TopNav({ price, changePct, source }: { price: number | null; changePct: number | null; source: 'live' | 'demo' }) {
  const { nav, setNav, symbol, setSymbol, timeframe, setTimeframe, style, setStyle, toggleChat } = useAppStore()
  const [assetOpen, setAssetOpen] = useState(false)
  const asset = ASSETS[symbol]
  const up = (changePct ?? 0) >= 0

  return (
    <header className="relative z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-base-900/80 px-3 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-2.5 pr-2">
        <Logo />
        <div className="hidden leading-none sm:block">
          <div className="text-[13px] font-semibold tracking-tight">
            <span className="gold-text">Aurum</span>
            <span className="text-ink-100">Pulse</span>
            <span className="ml-1 text-[9px] font-bold text-gold-300">AI</span>
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-ink-500">Probability Forecasting</div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="hidden items-center gap-0.5 xl:flex">
        {NAV.slice(0, 7).map((n) => (
          <button
            key={n}
            onClick={() => setNav(n)}
            className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              nav === n ? 'bg-white/[0.06] text-ink-100' : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {n}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        {/* Asset selector */}
        <div className="relative">
          <button onClick={() => setAssetOpen((v) => !v)} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-base-800 px-2.5 py-1.5 hover:border-white/15">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-gold-200/20 to-gold-500/10 text-[11px] font-bold text-gold-200">
              {asset.name[0]}
            </span>
            <div className="text-left leading-none">
              <div className="text-[12px] font-semibold text-ink-100">{asset.symbol}</div>
              <div className="text-[9px] text-ink-500">{asset.name}</div>
            </div>
            <ChevronDown size={14} className="text-ink-500" />
          </button>
          {assetOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAssetOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-60 rounded-xl border border-white/10 bg-base-850 p-1.5 shadow-2xl">
                <div className="flex items-center gap-1.5 rounded-md bg-base-800 px-2 py-1.5 text-ink-500">
                  <Search size={13} />
                  <span className="text-[11px]">Search markets…</span>
                </div>
                <div className="mt-1 max-h-72 overflow-auto scrollbar-thin">
                  {Object.values(ASSETS).map((a) => (
                    <button
                      key={a.symbol}
                      onClick={() => {
                        setSymbol(a.symbol)
                        setAssetOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-white/[0.05] ${a.symbol === symbol ? 'bg-white/[0.04]' : ''}`}
                    >
                      <div>
                        <div className="text-[12px] font-medium text-ink-100">{a.symbol}</div>
                        <div className="text-[9px] text-ink-500">{a.name}</div>
                      </div>
                      <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-ink-400">{a.assetClass}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live price */}
        <div className="hidden items-baseline gap-1.5 rounded-lg border border-white/[0.06] bg-base-800 px-2.5 py-1.5 md:flex">
          <span className="nums text-[13px] font-semibold text-ink-100">{price == null ? '—' : fmt(price, asset.precision)}</span>
          {asset.unit && <span className="text-[9px] text-ink-500">{asset.unit}</span>}
          <span className={`nums text-[11px] font-medium ${up ? 'text-[var(--color-bull-400)]' : 'text-[var(--color-bear-400)]'}`}>
            {changePct == null ? '' : `${fmtSigned(changePct)}%`}
          </span>
          <span className="live-dot ml-1 h-1.5 w-1.5 rounded-full bg-[var(--color-bull-400)]" />
        </div>

        {/* Timeframe */}
        <div className="hidden items-center rounded-lg border border-white/[0.06] bg-base-800 p-0.5 lg:flex">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`nums rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
                timeframe === t ? 'bg-gradient-to-b from-gold-200 to-gold-400 text-base-950' : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              {TIMEFRAME_LABEL[t]}
            </button>
          ))}
        </div>

        {/* Style */}
        <div className="hidden items-center rounded-lg border border-gold-500/20 bg-base-800 p-0.5 sm:flex">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors ${
                style === s ? 'bg-white/[0.08] text-gold-200' : 'text-ink-500 hover:text-ink-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button className="btn hidden !px-2 md:inline-flex" title="Alerts">
          <Bell size={15} />
        </button>
        <button onClick={toggleChat} className="btn !px-2" title="AI Assistant">
          <MessageSquare size={15} className="text-gold-300" />
        </button>
        <button className="hidden h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-gold-200/25 to-gold-500/10 text-[11px] font-bold text-gold-200 md:grid" title="Profile">
          MD
        </button>
        {source === 'live' ? (
          <div className="hidden items-center gap-1.5 rounded-md border border-[var(--color-bull-500)]/30 bg-[var(--color-bull-500)]/[0.08] px-2 py-1 lg:flex" title="Live market data — XAUUSD via PAXG (gold-backed) on Binance">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-bull-400)]" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-bull-400)]">Live</span>
          </div>
        ) : (
          <div className="hidden items-center gap-1 rounded-md border border-gold-500/25 bg-gold-500/[0.07] px-2 py-1 lg:flex" title="Simulated demo market data">
            <Sparkles size={11} className="text-gold-300" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gold-200">Demo</span>
          </div>
        )}
      </div>
    </header>
  )
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" className="shrink-0">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6d98a" />
          <stop offset="0.5" stopColor="#d9b86b" />
          <stop offset="1" stopColor="#b8923f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#12141a" stroke="rgba(217,184,107,0.25)" />
      <path d="M6 20 L11 14 L15 17 L20 9 L26 20" fill="none" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="9" r="2.1" fill="#f6d98a" />
    </svg>
  )
}
