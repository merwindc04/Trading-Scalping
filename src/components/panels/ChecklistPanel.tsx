import { useEffect, useMemo, useState } from 'react'
import { ListChecks, Check, X, Loader2 } from 'lucide-react'
import type { Candle } from '@/types/market'
import type { Analysis } from '@/lib/analyze'
import { scaleCandle } from '@/lib/analyze'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { rangeUse } from '@/lib/engines/moveTracker'
import { buildChecklist, autoSide, type CheckItem, type CheckSide, type ChecklistVerdict } from '@/lib/engines/checklist'

/* Buy / Sell Checklist — the most important conditions, ticked live. */

const BULL = 'var(--color-bull-400)'
const BEAR = 'var(--color-bear-400)'
const AMBER = 'var(--color-neutral-400)'
const MUTED = 'var(--color-ink-400)'

const VERDICT_TONE: Record<ChecklistVerdict, string> = { go: BULL, timing: AMBER, wait: MUTED, none: MUTED }

/** Today's range vs a normal day — same data as the Move Tracker (served from the provider cache). */
function useDayRange(analysis: Analysis, price: number) {
  const [intraday, setIntraday] = useState<Candle[]>([])
  const [daily, setDaily] = useState<Candle[]>([])
  const k = analysis.priceScale
  useEffect(() => {
    let alive = true
    const load = () =>
      Promise.all([marketData.getHistory(analysis.symbol, '15m', 700), marketData.getHistory(analysis.symbol, '1D', 30)])
        .then(([a, b]) => {
          if (!alive) return
          setIntraday(a.map((c) => scaleCandle(c, k)))
          setDaily(b.map((c) => scaleCandle(c, k)))
        })
        .catch(() => {
          /* range check just stays "loading" */
        })
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [analysis.symbol, k])
  return useMemo(() => rangeUse(intraday, daily, price, Date.now() / 1000), [intraday, daily, price])
}

export function ChecklistPanel({ analysis, price }: { analysis: Analysis; price: number | null }) {
  const px = price ?? analysis.price
  const range = useDayRange(analysis, px)
  const [mode, setMode] = useState<'auto' | CheckSide>('auto')
  const lean = autoSide(analysis)
  const c = useMemo(() => buildChecklist(analysis, px, range, Date.now() / 1000, mode === 'auto' ? undefined : mode), [analysis, px, range, mode])
  const tone = VERDICT_TONE[c.verdict]
  const sideTone = c.side === 'BUY' ? BULL : c.side === 'SELL' ? BEAR : MUTED
  const required = c.items.filter((i) => i.required)
  const timing = c.items.filter((i) => !i.required)

  return (
    <section className="panel p-3.5" aria-label="Buy and sell checklist">
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          <ListChecks size={13} className="text-gold-300" /> {c.side === 'SELL' ? 'Sell' : c.side === 'BUY' ? 'Buy' : 'Buy / Sell'} checklist
        </h3>
        <div className="flex rounded-md bg-base-800 p-0.5 text-[10px] font-semibold" role="group" aria-label="Which side to check">
          {(['auto', 'BUY', 'SELL'] as const).map((m) => {
            const on = mode === m
            const col = m === 'BUY' ? BULL : m === 'SELL' ? BEAR : 'var(--color-gold-300)'
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={on}
                title={m === 'auto' ? `Follow the app’s lean${lean ? ` (${lean})` : ' (none right now)'}` : `Check what a ${m} needs`}
                className="rounded px-1.5 py-0.5 transition-colors"
                style={on ? { color: col, background: `color-mix(in oklab, ${col} 16%, transparent)` } : { color: 'var(--color-ink-500)' }}
              >
                {m === 'auto' ? 'Auto' : m === 'BUY' ? 'Buy' : 'Sell'}
              </button>
            )
          })}
        </div>
      </header>

      {c.side && (
        <div className="mb-2 text-[10px] text-ink-400">
          Checking a{' '}
          <span className="font-bold" style={{ color: sideTone }}>
            {c.side}
          </span>{' '}
          {c.fromSignal ? '— the app shows this signal' : mode === 'auto' ? '— the market’s current lean (no signal yet)' : lean === c.side ? '— matches the market’s lean' : lean ? '— against the market’s current lean' : '— the market has no clear lean right now'}
        </div>
      )}

      {/* Verdict */}
      <div
        className="mb-3 rounded-lg border px-3 py-2"
        style={{ borderColor: `color-mix(in oklab, ${tone} 35%, transparent)`, background: `color-mix(in oklab, ${tone} 10%, transparent)` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold" style={{ color: tone }}>
            {c.headline}
          </span>
          {c.total > 0 && (
            <span className="nums text-[11px] font-semibold text-ink-300">
              {c.met}/{c.total}
            </span>
          )}
        </div>
        {c.total > 0 && (
          <div className="mt-1.5 flex gap-0.5" aria-hidden>
            {c.items.map((i) => (
              <span
                key={i.key}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: i.state === 'pass' ? BULL : i.state === 'fail' ? (i.required ? BEAR : AMBER) : 'var(--color-base-700)' }}
              />
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[10.5px] leading-snug text-ink-300">{c.detail}</p>
      </div>

      {c.total > 0 && (
        <>
          <Group title="Must have" items={required} />
          <Group title="Good timing" items={timing} />
        </>
      )}

      <p className="mt-2 text-[9.5px] leading-snug text-ink-500">
        Checks update live. Probabilities, not guarantees — check a real economic calendar before CPI / FOMC. Not financial advice.
      </p>
    </section>
  )
}

function Group({ title, items }: { title: string; items: CheckItem[] }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-ink-500">{title}</div>
      <ul className="space-y-1">
        {items.map((i) => (
          <Row key={i.key} item={i} />
        ))}
      </ul>
    </div>
  )
}

function Row({ item }: { item: CheckItem }) {
  const color = item.state === 'pass' ? BULL : item.state === 'fail' ? (item.required ? BEAR : AMBER) : MUTED
  const Icon = item.state === 'pass' ? Check : item.state === 'fail' ? X : Loader2
  return (
    <li className="panel-inset flex items-start gap-2 px-2 py-1.5" title={item.hint}>
      <span
        className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}
        aria-label={item.state === 'pass' ? 'met' : item.state === 'fail' ? 'not met' : 'checking'}
      >
        <Icon size={10} strokeWidth={3} className={item.state === 'pending' ? 'animate-spin' : ''} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-ink-100">{item.label}</div>
        <div className="nums truncate text-[10px] text-ink-400">{item.value}</div>
        {item.state !== 'pass' && <div className="text-[10px] leading-snug" style={{ color }}>{item.hint}</div>}
      </div>
    </li>
  )
}
