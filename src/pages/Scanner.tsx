import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ArrowUpDown } from 'lucide-react'
import type { Timeframe } from '@/types/market'
import { SCANNER_ASSETS, ASSETS } from '@/lib/assets'
import { analyze, type Analysis } from '@/lib/analyze'
import { useAppStore } from '@/store/appStore'
import { fmt, fmtSigned, dirText, dirColor } from '@/lib/format'
import { DirectionPill } from '@/components/ui/primitives'

type SortKey = 'strength' | 'confidence' | 'momentum' | 'move' | 'volatility'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'move', label: 'Potential Move' },
  { key: 'volatility', label: 'Volatility' },
]
const TFS: Timeframe[] = ['5m', '15m', '1H', '4H']

interface Row {
  a: Analysis
  momentum: number
  movePct: number
  volatility: number
}

export function Scanner() {
  const { setSymbol, setNav } = useAppStore()
  const [tf, setTf] = useState<Timeframe>('15m')
  const [rows, setRows] = useState<Row[]>([])
  const [sort, setSort] = useState<SortKey>('strength')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all(SCANNER_ASSETS.map((s) => analyze(s, tf, 'INTRADAY'))).then((res) => {
      if (!alive) return
      setRows(
        res.map((a) => {
          const prim = a.forecast.primary
          const movePct = ((prim.targets[prim.targets.length - 1] - a.price) / a.price) * 100
          return { a, momentum: a.technical.momentumScore, movePct, volatility: a.technical.snapshot.atrPct }
        }),
      )
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [tf, tick])

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((x, y) => {
      switch (sort) {
        case 'confidence':
          return y.a.forecast.confidence - x.a.forecast.confidence
        case 'momentum':
          return y.momentum - x.momentum
        case 'move':
          return Math.abs(y.movePct) - Math.abs(x.movePct)
        case 'volatility':
          return y.volatility - x.volatility
        default:
          return y.a.strength.overall - x.a.strength.overall
      }
    })
    return copy
  }, [rows, sort])

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink-100">AI Market Scanner</h2>
          <p className="text-[11px] text-ink-500">Every market read by the full ensemble — sorted by opportunity.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.06] bg-base-800 p-0.5">
            {TFS.map((t) => (
              <button key={t} onClick={() => setTf(t)} className={`nums rounded-md px-2 py-1 text-[11px] font-medium ${tf === t ? 'bg-gradient-to-b from-gold-200 to-gold-400 text-base-950' : 'text-ink-400'}`}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={() => setTick((t) => t + 1)} className="btn !px-2" title="Rescan">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Sort chips */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-500">
          <ArrowUpDown size={11} /> Sort
        </span>
        {SORTS.map((s) => (
          <button key={s.key} onClick={() => setSort(s.key)} className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${sort === s.key ? 'btn-active' : 'btn !py-1'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-ink-500">
                <Th className="text-left">Asset</Th>
                <Th>Price</Th>
                <Th>Direction</Th>
                <Th>Strength</Th>
                <Th>Pattern</Th>
                <Th>Confidence</Th>
                <Th>Momentum</Th>
                <Th>Potential Move</Th>
                <Th>Volatility</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ a, momentum, movePct, volatility }) => (
                <tr
                  key={a.symbol}
                  onClick={() => {
                    setSymbol(a.symbol)
                    setNav('Dashboard')
                  }}
                  className="cursor-pointer border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-gold-200/15 to-gold-500/5 text-[11px] font-bold text-gold-200">{ASSETS[a.symbol].name[0]}</span>
                      <div>
                        <div className="font-semibold text-ink-100">{a.symbol}</div>
                        <div className="text-[9px] text-ink-500">{a.symbolName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="nums px-3 text-center text-ink-200">{fmt(a.price, a.precision)}</td>
                  <td className="px-3 text-center">
                    <DirectionPill direction={a.strength.direction} size="sm" />
                  </td>
                  <td className="px-3 text-center">
                    <Score value={a.strength.overall} />
                  </td>
                  <td className="px-3 text-center text-[11px] text-ink-300">{a.pattern.name}</td>
                  <td className="nums px-3 text-center font-semibold text-gold-100">{a.forecast.confidence}%</td>
                  <td className="px-3 text-center">
                    <Bar value={momentum} />
                  </td>
                  <td className={`nums px-3 text-center font-semibold ${movePct >= 0 ? dirText.BULLISH : dirText.BEARISH}`}>{fmtSigned(movePct)}%</td>
                  <td className="nums px-3 text-center text-ink-300">{volatility.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-ink-500">Demo market data — indicative analytics for education. Click any row to open it on the dashboard.</p>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-semibold ${className || 'text-center'}`}>{children}</th>
}

function Score({ value }: { value: number }) {
  return (
    <span className="nums font-bold" style={{ color: dirColor[value >= 60 ? 'BULLISH' : value <= 40 ? 'BEARISH' : 'NEUTRAL'] }}>
      {value}
      <span className="text-[9px] text-ink-500">/100</span>
    </span>
  )
}

function Bar({ value }: { value: number }) {
  return (
    <div className="mx-auto h-1.5 w-16 overflow-hidden rounded-full bg-base-700">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: dirColor[value >= 55 ? 'BULLISH' : value <= 45 ? 'BEARISH' : 'NEUTRAL'] }} />
    </div>
  )
}
