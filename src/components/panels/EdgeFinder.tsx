import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Timeframe } from '@/types/market'
import { Panel } from '@/components/ui/primitives'
import { EDGE_TONE } from '@/components/ui/EdgeBadge'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { edgeGateCached, type EdgeGate } from '@/lib/engines/edgeGate'
import { HORIZONS, resolveHorizon, type HorizonKey } from '@/lib/horizons'
import { useAppStore } from '@/store/appStore'

/* "Where can you trust the signals?" — runs the proven-edge gate for every
   chart timeframe × dashboard forecast period on one market, so the user can
   switch the dashboard to a combination with a real track record. */

const TFS: Timeframe[] = ['15m', '1H', '4H', '1D']
const PERIODS: HorizonKey[] = ['1h', '4h', '1D', '1W', '1M']
const MAX_STEPS = 48

type Cell = { gate: EdgeGate; steps: number } | 'skip' | 'pending'

export function EdgeFinder({ symbol }: { symbol: string }) {
  const { style, setSymbol, setTimeframe, setHorizon, setNav } = useAppStore()
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const isDemo = marketData.getStatus(symbol) === 'demo'

  useEffect(() => {
    let alive = true
    setCells({})
    ;(async () => {
      for (const tf of TFS) {
        const deep = marketData.getDeepHistory ? await marketData.getDeepHistory(symbol, tf, 3000) : await marketData.getHistory(symbol, tf, 1000)
        for (const key of PERIODS) {
          if (!alive) return
          const r = resolveHorizon(key, tf, style)
          const id = `${tf}|${key}`
          if (r.truncated || r.steps > MAX_STEPS) {
            setCells((c) => ({ ...c, [id]: 'skip' }))
            continue
          }
          setCells((c) => ({ ...c, [id]: 'pending' }))
          // Yield to the browser between cells so the page stays responsive.
          await new Promise((res) => setTimeout(res, 0))
          const gate = edgeGateCached(`${symbol}|${tf}|${r.steps}`, deep, r.steps)
          if (alive) setCells((c) => ({ ...c, [id]: { gate, steps: r.steps } }))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [symbol, style])

  const use = (tf: Timeframe, key: HorizonKey) => {
    setSymbol(symbol)
    setTimeframe(tf)
    setHorizon(key, tf)
    setNav('Dashboard')
  }

  const found = Object.values(cells).filter((c): c is { gate: EdgeGate; steps: number } => typeof c === 'object' && c.gate.allows).length
  const done = TFS.length * PERIODS.length === Object.values(cells).filter((c) => c !== 'pending').length

  return (
    <Panel
      title="Where can you trust the signals?"
      className="mt-2"
      right={<span className="text-[10px] text-ink-500">{done ? `${found} trusted setting${found === 1 ? '' : 's'} for ${symbol}` : 'Testing…'}</span>}
    >
      <p className="mb-3 text-[11px] leading-relaxed text-ink-400">
        For {symbol}, every chart timeframe and forecast period was tested on up to 3,000 past bars. BUY/SELL only appears on the dashboard where the record beats guessing by more than luck explains. Tap a green cell to use that setting.
      </p>
      {isDemo && <p className="mb-2 text-[10.5px] text-gold-200">Simulated data — results here say nothing about the real market.</p>}
      <div className="overflow-x-auto">
        <table className="nums w-full min-w-[460px] border-separate border-spacing-1 text-[11px]">
          <thead>
            <tr className="text-[9.5px] uppercase tracking-wider text-ink-500">
              <th className="text-left font-medium">Chart ↓ · Looking ahead →</th>
              {PERIODS.map((p) => (
                <th key={p} className="font-medium">
                  {HORIZONS.find((h) => h.key === p)?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TFS.map((tf) => (
              <tr key={tf}>
                <td className="pr-2 font-semibold text-ink-300">{tf}</td>
                {PERIODS.map((key) => {
                  const c = cells[`${tf}|${key}`]
                  if (!c || c === 'pending') return <td key={key} className="h-11 animate-pulse rounded-md bg-base-800" />
                  if (c === 'skip') return <td key={key} className="h-11 rounded-md bg-base-900 text-center text-[10px] text-ink-600">—</td>
                  const tone = EDGE_TONE[c.gate.status].color
                  return (
                    <td key={key} className="h-11 p-0">
                      <button
                        onClick={() => c.gate.allows && use(tf, key)}
                        disabled={!c.gate.allows}
                        title={c.gate.reason}
                        className={`flex h-full w-full flex-col items-center justify-center rounded-md border text-center ${c.gate.allows ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
                        style={{ color: tone, borderColor: `color-mix(in oklab, ${tone} 30%, transparent)`, background: `color-mix(in oklab, ${tone} ${c.gate.allows ? 16 : 7}%, transparent)` }}
                      >
                        <span className="text-[10.5px] font-semibold">{c.gate.label}</span>
                        <span className="text-[9.5px] text-ink-400">
                          {c.gate.status === 'INSUFFICIENT' ? `${c.gate.calls} calls` : `${c.gate.edge >= 0 ? '+' : ''}${(c.gate.edge * 100).toFixed(1)} pts`}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-500">
        <span>
          <b style={{ color: EDGE_TONE.PROVEN.color }}>Proven / Likely</b> — BUY/SELL allowed
        </span>
        <span>
          <b style={{ color: EDGE_TONE.UNPROVEN.color }}>Not proven</b> — small lead, could be luck
        </span>
        <span>
          <b style={{ color: EDGE_TONE.NO_EDGE.color }}>No edge</b> — no better than guessing
        </span>
        <span className="inline-flex items-center gap-1">
          pts = points better than guessing <ArrowRight size={10} /> tap a green cell to use it
        </span>
      </div>
    </Panel>
  )
}
