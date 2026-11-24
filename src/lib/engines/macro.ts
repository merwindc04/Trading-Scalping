import { marketData } from '@/lib/providers/LiveMarketDataProvider'

/* ============================================================
   Macro / fundamental context.

   MEASURED (live, no key): USD strength, via Binance EUR/USDT
   daily candles as an inverse-dollar proxy, and the asset's own
   measured 60-day return correlation with it. If the link is
   weak, the factor is reported as neutral rather than guessed.

   USER-SUPPLIED: Fed policy, inflation, real rates, geopolitics
   and central-bank demand have no free live feed, so they are
   never invented. The user can set a stance for each; unset
   factors are excluded. These inputs only ever LOWER confidence
   when they conflict with the technical read — they never add
   unvalidated conviction.
   ============================================================ */

export type MacroStance = 'unset' | 'supportive' | 'neutral' | 'headwind'
export type MacroKey = 'fed' | 'inflation' | 'realRates' | 'geopolitics' | 'centralBanks'
export type MacroView = Record<MacroKey, MacroStance>

export const MACRO_FACTORS: { key: MacroKey; label: string; hint: string }[] = [
  { key: 'fed', label: 'Fed / rate decisions', hint: 'Dovish (cuts) is usually supportive for gold; hawkish is a headwind.' },
  { key: 'inflation', label: 'Inflation trend', hint: 'Rising inflation expectations tend to support gold.' },
  { key: 'realRates', label: 'Real interest rates', hint: 'Falling real yields lower the cost of holding gold.' },
  { key: 'geopolitics', label: 'Geopolitical risk', hint: 'Escalation drives safe-haven demand.' },
  { key: 'centralBanks', label: 'Central-bank buying', hint: 'Sustained official-sector purchases support prices.' },
]

export const DEFAULT_MACRO_VIEW: MacroView = { fed: 'unset', inflation: 'unset', realRates: 'unset', geopolitics: 'unset', centralBanks: 'unset' }

export interface UsdFactor {
  available: boolean
  source: string
  /** USD change over 20 days (%), positive = stronger dollar. */
  usdChange20d?: number
  /** Correlation of the asset's daily returns with EUR/USDT (60d). */
  corr?: number
  effect: -1 | 0 | 1
  detail: string
  asOf?: number
}

export interface MacroReport {
  usd: UsdFactor
  user: { key: MacroKey; label: string; stance: MacroStance; effect: -1 | 0 | 1 }[]
  /** Net user-supplied stance, −1..1 (0 when nothing is set). */
  userBias: number
  userCount: number
}

const EURUSDT = 'https://data-api.binance.vision/api/v3/klines?symbol=EURUSDT&interval=1d&limit=90'
let eurCache: { t: number; rows: { time: number; close: number }[] } | null = null

async function eurDaily(): Promise<{ time: number; close: number }[] | null> {
  if (eurCache && Date.now() - eurCache.t < 5 * 60_000) return eurCache.rows
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 7000)
    const res = await fetch(EURUSDT, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const raw = (await res.json()) as unknown[][]
    const rows = raw.map((k) => ({ time: Math.floor(Number(k[0]) / 1000), close: Number(k[4]) })).filter((r) => r.close > 0)
    if (rows.length < 30) return null
    eurCache = { t: Date.now(), rows }
    return rows
  } catch {
    return null
  }
}

export async function buildMacro(symbol: string, view: MacroView): Promise<MacroReport> {
  const user = MACRO_FACTORS.map((f) => {
    const stance = view[f.key] ?? 'unset'
    const effect: -1 | 0 | 1 = stance === 'supportive' ? 1 : stance === 'headwind' ? -1 : 0
    return { key: f.key, label: f.label, stance, effect }
  })
  const set = user.filter((u) => u.stance !== 'unset')
  const userBias = set.length ? set.reduce((s, u) => s + u.effect, 0) / set.length : 0

  let usd: UsdFactor = { available: false, source: 'EUR/USDT (Binance) — USD proxy', effect: 0, detail: 'USD feed unavailable — factor excluded.' }
  if (symbol !== 'EURUSD' && marketData.getStatus(symbol) === 'live') {
    const [eur, asset] = await Promise.all([eurDaily(), marketData.getHistory(symbol, '1D', 90)])
    if (eur && asset.length > 40) {
      const eurBy = new Map(eur.map((r) => [dayKey(r.time), r.close]))
      const pairs: [number, number][] = []
      for (let i = 1; i < asset.length; i++) {
        const e1 = eurBy.get(dayKey(asset[i].time))
        const e0 = eurBy.get(dayKey(asset[i - 1].time))
        if (e0 && e1) pairs.push([Math.log(asset[i].close / asset[i - 1].close), Math.log(e1 / e0)])
      }
      const seg = pairs.slice(-60)
      const corr = pearson(seg.map((p) => p[0]), seg.map((p) => p[1]))
      const eurNow = eur[eur.length - 1].close
      const eur20 = eur[Math.max(0, eur.length - 21)].close
      const usdChange20d = -((eurNow - eur20) / eur20) * 100
      let effect: -1 | 0 | 1 = 0
      let detail: string
      if (seg.length < 25) detail = 'Not enough overlapping days to measure the USD link.'
      else if (Math.abs(corr) < 0.15) detail = `Weak measured link to the dollar (ρ ${corr.toFixed(2)}) — treated as neutral.`
      else if (Math.abs(usdChange20d) < 0.4) detail = `Dollar roughly flat over 20 days (${fmtPct(usdChange20d)}) — no macro push.`
      else {
        // Asset moves with EUR (ρ>0) ⇒ moves AGAINST USD.
        const usdUp = usdChange20d > 0
        effect = (corr > 0 ? (usdUp ? -1 : 1) : usdUp ? 1 : -1) as -1 | 1
        detail = `Dollar ${usdUp ? 'strengthened' : 'weakened'} ${fmtPct(Math.abs(usdChange20d))} in 20 days; measured ρ ${corr.toFixed(2)} vs EUR ⇒ ${effect > 0 ? 'supportive' : 'headwind'}.`
      }
      usd = { available: seg.length >= 25, source: 'EUR/USDT (Binance) — USD proxy', usdChange20d, corr, effect, detail, asOf: eur[eur.length - 1].time }
    }
  }

  return { usd, user, userBias, userCount: set.length }
}

function dayKey(t: number): number {
  return Math.floor(t / 86400)
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 3) return 0
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
