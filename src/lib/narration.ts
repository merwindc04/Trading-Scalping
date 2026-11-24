import type { Analysis } from '@/lib/analyze'
import type { Timeframe } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import { buildChecklist } from '@/lib/engines/checklist'

/* ============================================================
   Voice narration — turns the current analysis into plain spoken
   sentences, in four parts: the chart, the pattern, the signals,
   and the KPI panels. Numbers are rounded for speech. Built once
   when the user presses play, so figures don't change mid-sentence.
   Honesty rules apply: probabilities, never guarantees.
   ============================================================ */

export type NarrationKey = 'chart' | 'pattern' | 'signals' | 'kpis'

export interface NarrationSection {
  key: NarrationKey
  title: string
  sentences: string[]
}

export const NARRATION_TITLES: Record<NarrationKey, string> = {
  chart: 'The chart',
  pattern: 'Pattern',
  signals: 'Signals',
  kpis: 'KPI panels',
}

const TF_SPOKEN: Partial<Record<Timeframe, string>> = {
  '1m': 'one-minute',
  '3m': 'three-minute',
  '5m': 'five-minute',
  '15m': '15-minute',
  '30m': '30-minute',
  '1H': 'one-hour',
  '4H': 'four-hour',
  '1D': 'daily',
  '1W': 'weekly',
  '1MO': 'monthly',
}

const TF_SPAN: Partial<Record<Timeframe, string>> = {
  '1m': 'one minute',
  '3m': 'three minutes',
  '5m': 'five minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1H': 'one hour',
  '4H': 'four hours',
  '1D': 'one day',
  '1W': 'one week',
  '1MO': 'one month',
}

const dirWord =(d: string) => (d === 'BULLISH' ? 'bullish' : d === 'BEARISH' ? 'bearish' : 'neutral')
const pct = (v: number) => `${Math.round(v)} percent`

function unitSpoken(symbol: string, purity: string): string {
  const u = ASSETS[symbol]?.unit
  if (u === 'AED/g') return `dirhams per gram, for ${purity.replace('K', ' karat')} gold`
  if (u === 'USD/oz') return 'US dollars per ounce'
  return ASSETS[symbol]?.currency === 'USD' ? 'US dollars' : ''
}

export function buildNarration(a: Analysis, price: number): NarrationSection[] {
  const p = a.precision
  const f = (v: number) => v.toFixed(p)
  const d = a.decision
  const tf = TF_SPOKEN[a.timeframe] ?? a.timeframe
  const name = (ASSETS[a.symbol]?.name ?? a.symbolName).replace(' · ', ', ')
  const s = a.technical.snapshot

  /* ---------------- 1 · The chart ---------------- */
  const chart: string[] = []
  chart.push(`This is the ${name} chart, on the ${tf} timeframe. Each candle covers ${TF_SPAN[a.timeframe] ?? 'one period'}, showing its open, high, low and close.`)
  chart.push(
    `Price is now ${f(price)} ${unitSpoken(a.symbol, a.purity)}, ${a.changePct >= 0 ? 'up' : 'down'} ${Math.abs(a.changePct).toFixed(2)} percent.`,
  )
  chart.push(`The market structure shows ${a.structure.trendLabel.toLowerCase()}, so the trend reads ${dirWord(a.structure.trend)}.`)
  if (s.ema9 > s.ema20 && s.ema20 > s.ema50) chart.push('The moving averages are stacked upward, short above long, which supports buyers.')
  else if (s.ema9 < s.ema20 && s.ema20 < s.ema50) chart.push('The moving averages are stacked downward, short below long, which supports sellers.')
  else chart.push('The moving averages are mixed, which usually means a sideways or turning market.')
  const L = d.levels
  chart.push(
    `The shaded bands are support and resistance zones. The nearest support is between ${f(L.immediateSupport.bottom)} and ${f(L.immediateSupport.top)}. The nearest resistance is between ${f(L.immediateResistance.bottom)} and ${f(L.immediateResistance.top)}.`,
  )
  chart.push(
    `To the right of the dashed divider is the projection, for the next ${spokenSpan(a.horizon.label)}. The ghost candles and the cone show the likely range, not a promise. The model gives ${pct(a.forecast.bull)} for up, ${pct(a.forecast.neutral)} for sideways, and ${pct(a.forecast.bear)} for down.`,
  )

  /* ---------------- 2 · Pattern ---------------- */
  const pattern: string[] = []
  const pt = a.pattern
  pattern.push(
    `The main pattern detected is a ${pt.name}, which is ${dirWord(pt.direction)}. It is about ${pct(pt.completion)} complete, with ${pt.reliability.toLowerCase()} reliability.`,
  )
  pattern.push(
    `It confirms on a move through ${f(pt.breakoutLevel)}. If it plays out, the target area is ${f(pt.targetLow)}${Math.abs(pt.targetHigh - pt.targetLow) > 10 ** -p ? ` to ${f(pt.targetHigh)}` : ''}. The pattern fails if price reaches ${f(pt.invalidation)}.`,
  )
  pattern.push('A pattern only counts after the confirming candle closes, so on its own it is context, not a trade.')
  const ev = a.structure.events[a.structure.events.length - 1]
  if (ev) {
    pattern.push(
      ev.kind === 'BOS'
        ? `The latest structure event was a ${dirWord(ev.direction)} break of structure near ${f(ev.price)}, which means the trend continued.`
        : `The latest structure event was a ${dirWord(ev.direction)} change of character near ${f(ev.price)}, an early sign the trend may be turning.`,
    )
  }

  /* ---------------- 3 · Signals ---------------- */
  const signals: string[] = []
  signals.push(`The current signal is: ${d.signalLabel}.`)
  if (d.signalReason) signals.push(d.signalReason)
  signals.push(`Track record check: ${a.edgeGate.reason}`)
  signals.push(`Buyers are confirmed by a candle close above ${f(d.confirmation.bull)}. Sellers are confirmed by a close below ${f(d.confirmation.bear)}.`)
  const c = buildChecklist(a, price, null, Date.now() / 1000)
  if (c.side) {
    const missing = c.items.filter((i) => i.state === 'fail').map((i) => i.label.toLowerCase())
    signals.push(`On the ${c.side === 'BUY' ? 'buy' : 'sell'} checklist, ${c.met} of ${c.total} conditions are met.${missing.length ? ` Still missing: ${missing.join('; ')}.` : ''}`)
  } else {
    signals.push('The market has no clear lean right now, so the checklist says wait.')
  }
  signals.push(`Risk is rated ${d.risk.toLowerCase()}. ${d.riskDetail}`)

  /* ---------------- 4 · KPI panels ---------------- */
  const kpis: string[] = []
  kpis.push(`Market strength is ${a.strength.overall} out of 100, leaning ${dirWord(a.strength.direction)}. Above 60 is a strong trend; below 40 is weak.`)
  const rows = a.mtf.rows.map((r) => `${TF_SPOKEN[r.timeframe] ?? r.label} ${dirWord(r.direction)}`)
  kpis.push(`The multi-timeframe matrix is ${pct(a.mtf.alignmentPct)} aligned, mostly ${dirWord(a.mtf.dominant)}${rows.length ? `: ${rows.join(', ')}` : ''}.`)
  if (a.historical.matchCount > 0) {
    kpis.push(
      `Historical analogues: in ${a.historical.matchCount} similar past setups, price went up ${pct(a.historical.bullishPct)} of the time, sideways ${pct(a.historical.neutralPct)}, and down ${pct(a.historical.bearishPct)}.`,
    )
  } else {
    kpis.push('There were too few similar past setups for the historical analogues to say much.')
  }
  const rsiNote = s.rsi >= 70 ? 'overbought, so a pullback is common' : s.rsi <= 30 ? 'oversold, so a bounce is common' : s.rsi >= 50 ? 'above the midline, a mild bullish tilt' : 'below the midline, a mild bearish tilt'
  const adxNote = Number.isFinite(s.adx) ? ` A D X is ${Math.round(s.adx)}, which means ${s.adx >= 25 ? 'a clear trend' : 'no strong trend'}.` : ''
  if (Number.isFinite(s.rsi)) kpis.push(`Momentum: R S I is ${Math.round(s.rsi)}, ${rsiNote}.${adxNote}`)
  kpis.push(
    d.confidence != null
      ? `The validated confidence is ${pct(d.confidence)}, based on how the model did on past data it had not seen.`
      : `Confidence: ${d.confidenceLabel ?? 'not stated'}.${d.confidenceReason ? ` ${d.confidenceReason}` : ''}`,
  )
  kpis.push('Remember: these are probabilities, not guarantees, and this is not financial advice.')

  const out = (key: NarrationKey, sentences: string[]): NarrationSection => ({ key, title: NARRATION_TITLES[key], sentences: sentences.map(speakable) })
  return [out('chart', chart), out('pattern', pattern), out('signals', signals), out('kpis', kpis)]
}

/** Make symbols and short units read naturally by a speech engine. */
function speakable(t: string): string {
  return t
    .replace(/\s*&\s*/g, ' and ')
    .replace(/(\d)\s*:\s*(\d)/g, '$1 to $2')
    .replace(/\s+\/\s+/g, ' to ')
    .replace(/≥/g, 'at least ')
    .replace(/≤/g, 'at most ')
    .replace(/\s+·\s+/g, ', ')
    .replace(/[—–]/g, ', ')
    .replace(/\bATR\b/g, 'average true range')
    .replace(/\s{2,}/g, ' ')
}

/** "4 h" → "4 hours", "15 m" → "15 minutes", "1 d" → "1 day", etc. */
function spokenSpan(label: string): string {
  const m = label.trim().match(/^(\d+(?:\.\d+)?)\s*(min|h)$/i)
  if (!m) return label // "3 days", "2 weeks"… already read well
  const n = Number(m[1])
  const unit = m[2].toLowerCase() === 'h' ? 'hour' : 'minute'
  return `${m[1]} ${unit}${n === 1 ? '' : 's'}`
}
