import type { Direction } from '@/types/market'
import type { TechnicalReport } from './indicators'
import type { MarketStructureReport } from './structure'
import type { DetectedPattern } from './patterns'
import type { ForecastReport } from './forecast'
import type { HistoricalReport } from './historical'

/* ============================================================
   AIExplanation engine (spec §13)

   Turns the numeric analysis into plain-language reasons a
   non-expert can follow — always framed as probabilities and
   always ending with what would invalidate the thesis.
   ============================================================ */

export interface ExplanationBullet {
  text: string
  tone: Direction
}

export interface ExplanationReport {
  headline: string
  bullets: ExplanationBullet[]
  invalidation: string
}

export function buildExplanation(args: {
  symbolName: string
  direction: Direction
  technical: TechnicalReport
  structure: MarketStructureReport
  pattern: DetectedPattern
  forecast: ForecastReport
  historical: HistoricalReport
  mtfSummary: { aligned: number; conflict?: string }
  precision: number
}): ExplanationReport {
  const { symbolName, direction, structure, pattern, forecast, historical, mtfSummary, technical } = args
  const bull = direction === 'BULLISH'
  const dirWord = bull ? 'bullish' : direction === 'BEARISH' ? 'bearish' : 'neutral'

  const bullets: ExplanationBullet[] = []

  bullets.push({
    text: structure.trendLabel + (structure.trend !== 'NEUTRAL' ? ` — the ${structure.trend.toLowerCase()} structure is the anchor of this read.` : '.'),
    tone: structure.trend,
  })

  const emaReading = technical.readings.find((r) => r.label === 'EMA Structure')
  if (emaReading) bullets.push({ text: emaReading.note, tone: emaReading.bias > 0.2 ? 'BULLISH' : emaReading.bias < -0.2 ? 'BEARISH' : 'NEUTRAL' })

  if (mtfSummary.conflict) {
    bullets.push({ text: mtfSummary.conflict, tone: 'NEUTRAL' })
  } else {
    bullets.push({
      text: `Multiple timeframes agree — roughly ${mtfSummary.aligned}% of the analysed timeframes point the same way, which strengthens the signal.`,
      tone: direction,
    })
  }

  bullets.push({
    text: `A ${pattern.name} is about ${Math.round(pattern.completion)}% formed; a confirmed break would target the projected zone while ${fmtInval(pattern.invalidation, args.precision)} keeps it valid.`,
    tone: pattern.direction,
  })

  const rsiReading = technical.readings.find((r) => r.label === 'RSI (14)')
  if (rsiReading) bullets.push({ text: rsiReading.note, tone: rsiReading.bias > 0.2 ? 'BULLISH' : rsiReading.bias < -0.2 ? 'BEARISH' : 'NEUTRAL' })

  const domHist = Math.max(historical.bullishPct, historical.neutralPct, historical.bearishPct)
  const histWord = historical.bullishPct === domHist ? 'bullish continuation' : historical.bearishPct === domHist ? 'bearish reversal' : 'range / neutral'
  bullets.push({
    text: `Across ${historical.matchCount} similar historical setups, ${domHist}% resolved as ${histWord} — the base rate leans ${histWord === 'range / neutral' ? 'sideways' : histWord.split(' ')[0]}.`,
    tone: historical.bullishPct === domHist ? 'BULLISH' : historical.bearishPct === domHist ? 'BEARISH' : 'NEUTRAL',
  })

  const headline = `Why is AurumPulse ${dirWord} on ${symbolName}?`
  const primary = forecast.primary
  const invalidation = `A decisive close beyond ${fmtInval(primary.invalidation, args.precision)} would invalidate the ${primary.label.toLowerCase()} thesis and hand control to the opposite scenario.`

  return { headline, bullets, invalidation }
}

function fmtInval(v: number, p: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p })
}
