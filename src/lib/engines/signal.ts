import type { Direction } from '@/types/market'

/* ============================================================
   Signal engine — turns the full analysis into ONE decisive,
   actionable call: STRONG BUY / BUY / WAIT / SELL / STRONG SELL.

   This is the "is it time to buy?" layer. It also produces a
   conviction score, a condition checklist, entry timing and a
   stable trigger key the notification layer watches.

   Framed as an analytical suggestion with an explicit stop —
   never a guarantee or personalised advice.
   ============================================================ */

export type SignalAction = 'BUY' | 'SELL' | 'WAIT'

export interface SignalCheck {
  label: string
  passed: boolean
  detail: string
}

export interface SignalReport {
  action: SignalAction
  headline: string // STRONG BUY / BUY / WAIT / SELL / STRONG SELL
  subline: string
  strong: boolean
  grade: 'A+' | 'A' | 'B' | 'C'
  score: number // 0..100 conviction
  timing: string
  entryLow: number
  entryHigh: number
  stop: number
  targets: number[]
  riskReward: number
  confidence: number
  expectedMovePct: number
  horizon: string
  checks: SignalCheck[]
  /** Changes only when the actionable state meaningfully changes. */
  triggerKey: string
}

export interface SignalInput {
  symbol: string
  price: number
  strengthOverall: number
  direction: Direction
  bull: number
  bear: number
  confidence: number
  rsi: number
  momentumScore: number
  mtfAlignment: number
  mtfDominant: Direction
  patternName: string
  patternDirection: Direction
  breakoutLevel: number
  trendLabel: string
  structureTrend: Direction
  entryLow: number
  entryHigh: number
  stop: number
  targets: number[]
  riskReward: number
  horizon: string
}

export function evaluateSignal(i: SignalInput): SignalReport {
  const bull = i.strengthOverall // 0..100, bull-positive (the ensemble read)
  const rsiOverbought = i.rsi >= 72
  const rsiOversold = i.rsi <= 28

  // Action follows the single directional read; RSI only guards against chasing
  // an already-extended move (demotes to WAIT rather than flipping the call).
  let action: SignalAction = 'WAIT'
  let strong = false
  if (i.direction === 'BULLISH' && !rsiOverbought) {
    action = 'BUY'
    strong = bull >= 73 && i.confidence >= 52
  } else if (i.direction === 'BEARISH' && !rsiOversold) {
    action = 'SELL'
    strong = bull <= 27 && i.confidence >= 52
  }

  // Conviction score
  const score =
    action === 'BUY'
      ? Math.round(bull * 0.7 + i.confidence * 0.3)
      : action === 'SELL'
        ? Math.round((100 - bull) * 0.7 + i.confidence * 0.3)
        : Math.round(50 - Math.abs(bull - 50) * 0.4)
  const grade: SignalReport['grade'] = score >= 76 ? 'A+' : score >= 66 ? 'A' : score >= 56 ? 'B' : 'C'

  // Which side to assess for the checklist
  const assess: Direction = action === 'SELL' || (action === 'WAIT' && bull < 50) ? 'BEARISH' : 'BULLISH'
  const checks = buildChecks(assess, i)

  // Entry timing
  let timing: string
  const p = i.price
  if (action === 'BUY') {
    if (i.patternDirection === 'BULLISH' && p < i.breakoutLevel * 0.999) {
      timing = `Coiling below ${fmt(i.breakoutLevel)} — a break above confirms the entry.`
    } else {
      timing = 'Conditions are aligned — a favourable long entry window is open now.'
    }
  } else if (action === 'SELL') {
    if (i.patternDirection === 'BEARISH' && p > i.breakoutLevel * 1.001) {
      timing = `Holding above ${fmt(i.breakoutLevel)} — a break below confirms the entry.`
    } else {
      timing = 'Conditions are aligned — a favourable short entry window is open now.'
    }
  } else {
    const missing = checks.filter((c) => !c.passed).length
    timing = `No high-conviction edge yet — ${missing} condition${missing === 1 ? '' : 's'} still missing. Stand aside and re-assess on the next bar.`
  }

  const headline = action === 'BUY' ? (strong ? 'STRONG BUY' : 'BUY') : action === 'SELL' ? (strong ? 'STRONG SELL' : 'SELL') : 'WAIT'
  const subline =
    action === 'BUY'
      ? 'Conditions align for a long setup'
      : action === 'SELL'
        ? 'Conditions align for a short setup'
        : 'Balanced tape — no edge worth the risk yet'

  const finalTarget = i.targets[action === 'SELL' ? i.targets.length - 1 : Math.min(1, i.targets.length - 1)] ?? i.price
  const expectedMovePct = ((finalTarget - i.price) / i.price) * 100

  return {
    action,
    headline,
    subline,
    strong,
    grade,
    score: clampInt(score),
    timing,
    entryLow: i.entryLow,
    entryHigh: i.entryHigh,
    stop: i.stop,
    targets: i.targets,
    riskReward: i.riskReward,
    confidence: i.confidence,
    expectedMovePct,
    horizon: i.horizon,
    checks,
    triggerKey: `${i.symbol}|${action}|${strong ? 'strong' : 'std'}`,
  }
}

function buildChecks(dir: Direction, i: SignalInput): SignalCheck[] {
  const bullish = dir === 'BULLISH'
  return [
    {
      label: 'Trend & structure',
      passed: bullish ? i.direction === 'BULLISH' || i.structureTrend === 'BULLISH' : i.direction === 'BEARISH' || i.structureTrend === 'BEARISH',
      detail: i.trendLabel,
    },
    {
      label: 'Momentum',
      passed: bullish ? i.momentumScore >= 55 : i.momentumScore <= 45,
      detail: `Momentum ${Math.round(i.momentumScore)}/100`,
    },
    {
      label: 'Multi-timeframe',
      passed: bullish ? i.mtfDominant === 'BULLISH' && i.mtfAlignment >= 55 : i.mtfDominant === 'BEARISH' && i.mtfAlignment >= 55,
      detail: `${i.mtfAlignment}% aligned ${i.mtfDominant.toLowerCase()}`,
    },
    {
      label: 'Pattern',
      passed: bullish ? i.patternDirection === 'BULLISH' : i.patternDirection === 'BEARISH',
      detail: i.patternName,
    },
    {
      label: bullish ? 'Not overbought' : 'Not oversold',
      passed: bullish ? i.rsi < 72 : i.rsi > 28,
      detail: `RSI ${Math.round(i.rsi)}`,
    },
    {
      label: 'Model confidence',
      passed: i.confidence >= 50,
      detail: `${i.confidence}% confidence`,
    },
  ]
}

function fmt(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
function clampInt(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}
