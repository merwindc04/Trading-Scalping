import { useEffect, useState } from 'react'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { fmt, fmtSigned } from '@/lib/format'

/* ============================================================
   UAE Gold module (spec §26)

   Derives indicative per-gram values for common karats from the
   live XAUUSD spot (troy-ounce) price and the AED peg, and shows
   Daily / Weekly / Monthly change from daily candles. Clearly
   indicative; a local retail feed can replace the derivation.
   ============================================================ */

const USD_AED = 3.6725
const GRAMS_PER_OZ = 31.1035
const KARAT_PURITY: Record<string, number> = { '24K': 0.999, '22K': 0.916, '21K': 0.875, '18K': 0.75 }

interface GoldState {
  spot: number
  daily: number
  weekly: number
  monthly: number
}

export function UaeGoldPanel() {
  const [g, setG] = useState<GoldState | null>(null)
  const [ccy, setCcy] = useState<'AED' | 'USD'>('AED')

  useEffect(() => {
    let alive = true
    // Daily candles give clean day / week / month reference points.
    marketData.getHistory('XAUUSD', '1D', 45).then((c) => {
      if (!alive || c.length < 2) return
      const closes = c.map((x) => x.close)
      const last = closes[closes.length - 1]
      const ago = (n: number) => closes[closes.length - 1 - n] ?? closes[0]
      const pct = (base: number) => ((last - base) / base) * 100
      setG({ spot: last, daily: pct(ago(1)), weekly: pct(ago(7)), monthly: pct(ago(30)) })
    })
    return () => {
      alive = false
    }
  }, [])

  const rate = ccy === 'AED' ? USD_AED : 1
  const perGram = (k: string) => (g == null ? 0 : (g.spot / GRAMS_PER_OZ) * KARAT_PURITY[k] * rate)

  return (
    <div className="panel p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">UAE Gold</span>
          <span className="rounded bg-gold-500/[0.1] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-gold-200">Indicative</span>
        </div>
        <div className="flex rounded-md border border-white/[0.06] bg-base-800 p-0.5">
          {(['AED', 'USD'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCcy(c)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${ccy === c ? 'bg-white/[0.08] text-gold-200' : 'text-ink-500'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Headline: 24K per gram */}
      <div className="mb-2.5 rounded-lg border border-gold-500/15 bg-gradient-to-br from-gold-500/[0.08] to-transparent px-2.5 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">24K · per gram</span>
          <span className="nums text-[9px] text-ink-500">{ccy}</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="nums gold-text text-2xl font-bold">{fmt(perGram('24K'), 2)}</span>
          <span className="text-[10px] font-medium text-ink-500">{ccy}/g</span>
        </div>
      </div>

      {/* Karat grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {Object.keys(KARAT_PURITY).map((k) => (
          <div key={k} className="rounded-md bg-base-800 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wide text-ink-500">{k}</div>
            <div className="nums text-[13px] font-semibold text-gold-100">{fmt(perGram(k), 2)}</div>
            <div className="text-[8px] text-ink-500">{ccy}/g</div>
          </div>
        ))}
      </div>

      {/* Daily / Weekly / Monthly change */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Change label="Day" value={g?.daily} />
        <Change label="Week" value={g?.weekly} />
        <Change label="Month" value={g?.monthly} />
      </div>
    </div>
  )
}

function Change({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0
  const up = v >= 0
  const color = value == null ? 'var(--color-ink-500)' : up ? 'var(--color-bull-400)' : 'var(--color-bear-400)'
  return (
    <div className="rounded-md bg-base-800 px-1 py-1.5 text-center">
      <div className="text-[8px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="nums text-[11px] font-semibold" style={{ color }}>
        {value == null ? '—' : `${fmtSigned(v)}%`}
      </div>
    </div>
  )
}
