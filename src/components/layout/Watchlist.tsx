import { useEffect, useState } from 'react'
import { Plus, Star, X } from 'lucide-react'
import type { Direction } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { useAppStore } from '@/store/appStore'
import { useSignalsStore } from '@/store/signalsStore'
import { fmt, fmtSigned } from '@/lib/format'
import { Sparkline } from '@/components/ui/primitives'

interface Row {
  symbol: string
  name: string
  price: number
  changePct: number
  spark: number[]
  dir: Direction
}

function SignalBadge({ symbol }: { symbol: string }) {
  const sig = useSignalsStore((s) => s.watchlistSignals[symbol])
  if (!sig || sig.action === 'WAIT') return null
  const buy = sig.action === 'BUY'
  const color = buy ? 'var(--color-bull-400)' : 'var(--color-bear-400)'
  return (
    <span
      className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide"
      style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}
      title={`${sig.headline} · Grade ${sig.grade} on ${sig.timeframe}`}
    >
      {buy ? 'BUY' : 'SELL'}
    </span>
  )
}

export function Watchlist() {
  const { watchlist, symbol, setSymbol, addToWatchlist, removeFromWatchlist } = useAppStore()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    let alive = true
    Promise.all(
      watchlist.map(async (sym) => {
        const candles = await marketData.getHistory(sym, '1H', 90)
        const closes = candles.map((c) => c.close)
        const last = closes[closes.length - 1]
        const prev = closes[closes.length - 25] ?? closes[0]
        const changePct = ((last - prev) / prev) * 100
        return {
          symbol: sym,
          name: ASSETS[sym].name,
          price: last,
          changePct,
          spark: closes.slice(-40),
          dir: (changePct > 0.15 ? 'BULLISH' : changePct < -0.15 ? 'BEARISH' : 'NEUTRAL') as Direction,
        }
      }),
    ).then((r) => alive && setRows(r))
    return () => {
      alive = false
    }
  }, [watchlist])

  return (
    <aside className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          <Star size={12} className="text-gold-300" /> Watchlist
        </div>
        <button
          onClick={() => addToWatchlist(symbol)}
          disabled={watchlist.includes(symbol)}
          title={watchlist.includes(symbol) ? `${symbol} is on your watchlist` : `Add ${symbol} to watchlist`}
          className="grid h-6 w-6 place-items-center rounded-md text-ink-500 enabled:hover:bg-white/[0.05] enabled:hover:text-ink-200 disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-auto scrollbar-thin px-1.5 pb-2">
        {rows.map((r) => {
          const active = r.symbol === symbol
          const up = r.changePct >= 0
          return (
            <div
              key={r.symbol}
              role="button"
              onClick={() => setSymbol(r.symbol)}
              className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                active ? 'bg-white/[0.06] ring-1 ring-gold-500/25' : 'hover:bg-white/[0.035]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[12px] font-semibold ${active ? 'text-gold-100' : 'text-ink-100'}`}>{r.symbol}</span>
                  <SignalBadge symbol={r.symbol} />
                </div>
                <div className="nums text-[10px] text-ink-500">{fmt(r.price, ASSETS[r.symbol].precision)}</div>
              </div>
              <Sparkline data={r.spark} color={up ? 'var(--color-bull-400)' : 'var(--color-bear-400)'} width={52} height={20} />
              <div className={`nums w-12 text-right text-[11px] font-medium ${up ? 'text-[var(--color-bull-400)]' : 'text-[var(--color-bear-400)]'}`}>
                {fmtSigned(r.changePct)}%
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeFromWatchlist(r.symbol)
                }}
                title={`Remove ${r.symbol}`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-600 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-[var(--color-bear-400)] group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
