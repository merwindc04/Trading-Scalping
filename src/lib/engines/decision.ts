import type { Candle, Direction } from '@/types/market'
import type { TechnicalReport } from './indicators'
import { atr as atrSeries } from './indicators'
import type { MarketStructureReport } from './structure'
import type { BacktestReport } from './backtest'
import type { ZoneReport, Zone } from './zones'
import type { FibReport } from './fibonacci'
import type { MacroReport } from './macro'
import type { SignalAction } from './signal'
import type { SourceInfo } from '@/lib/providers/MarketDataProvider'

/* ============================================================
   Decision layer — the single source for the Confidence &
   Signal panel.

   It reads every engine, lists each contributing factor with
   its direction, measures how much they CONFLICT with the
   directional read, and turns the backtest into a validated
   confidence. When the evidence is thin or contradictory it
   says so ("Insufficient Data" / "Awaiting Confirmation")
   instead of printing a number.
   ============================================================ */

export type DirectionLevel = 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish'
export type MarketSignal = 'BUY' | 'SELL' | 'HOLD' | 'WAIT_CONFIRM' | 'INSUFFICIENT'
export type FactorGroup = 'Technical' | 'Structure' | 'Fundamental' | 'Sentiment'
export type Tone = 'bull' | 'bear' | 'caution' | 'neutral'

export interface Factor {
  group: FactorGroup
  label: string
  value: string
  effect: -1 | 0 | 1
  weight: number
  source: 'measured' | 'user'
}

export interface ScenarioTarget {
  key: 'bull' | 'base' | 'bear'
  label: string
  probability: number
  targets: number[]
}

export interface DecisionReport {
  direction: Direction
  directionLevel: DirectionLevel
  directionScore: number
  /** Validated confidence after conflict reduction, or null when it can't be stated. */
  confidence: number | null
  validatedHitRate: number | null
  conflictReduction: number
  confidenceLabel: 'Insufficient Data' | 'Awaiting Confirmation' | null
  confidenceReason?: string
  strength: 'Weak' | 'Moderate' | 'Strong' | 'Very Strong'
  strengthIndex: number
  signal: MarketSignal
  signalLabel: string
  signalReason: string
  breakoutProb: number
  breakdownProb: number
  levels: { immediateSupport: Zone; majorSupport: Zone; immediateResistance: Zone; majorResistance: Zone }
  confirmation: { bull: number; bear: number }
  scenarios: ScenarioTarget[]
  probabilityBasis: 'calibrated' | 'model'
  risk: 'Low' | 'Moderate' | 'High' | 'Extreme'
  riskDetail: string
  sentiment: 'Positive' | 'Negative' | 'Neutral'
  sentimentDrivers: string[]
  factors: Factor[]
  conflicts: string[]
  conflictRatio: number
  invalidation: string[]
  source: SourceInfo
  backtest: BacktestReport
  horizonLabel: string
  summary: string
}

export interface DecisionInputs {
  candles: Candle[]
  timeframeLabel: string
  horizonLabel: string
  bias: Direction
  overall: number
  technical: TechnicalReport
  structure: MarketStructureReport
  mtf: { dominant: Direction; alignmentPct: number; rows: { timeframe: string; direction: Direction }[] }
  volumeScore: number
  historical: { bullishPct: number; bearishPct: number; sampleSize: number }
  backtest: BacktestReport
  zones: ZoneReport
  fib: FibReport
  macro: MacroReport
  probabilities: { bull: number; neutral: number; bear: number; basis: 'calibrated' | 'model' }
  signalAction: SignalAction
  source: SourceInfo
  precision: number
}

export function buildDecision(i: DecisionInputs): DecisionReport {
  const s = i.technical.snapshot
  const p = i.precision
  const f = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p })
  const z = i.zones
  const sign = i.bias === 'BULLISH' ? 1 : i.bias === 'BEARISH' ? -1 : 0

  // ---- Factors -----------------------------------------------------------
  const factors: Factor[] = []
  const add = (group: FactorGroup, label: string, value: string, effect: -1 | 0 | 1, weight: number, source: Factor['source'] = 'measured') =>
    factors.push({ group, label, value, effect, weight, source })

  const emaUp = s.ema9 > s.ema20 && s.ema20 > s.ema50
  const emaDn = s.ema9 < s.ema20 && s.ema20 < s.ema50
  add('Technical', 'EMA 9/20/50 stack', emaUp ? 'Bullish stack' : emaDn ? 'Bearish stack' : 'Mixed / crossing', emaUp ? 1 : emaDn ? -1 : 0, 1)
  const rsiV = s.rsi
  add('Technical', 'RSI (14)', `${rsiV.toFixed(0)}${rsiV >= 72 ? ' · overbought' : rsiV <= 28 ? ' · oversold' : ''}`, rsiV >= 72 || rsiV <= 28 ? 0 : rsiV > 55 ? 1 : rsiV < 45 ? -1 : 0, 0.8)
  add('Technical', 'MACD histogram', `${s.macdHist >= 0 ? '+' : ''}${s.macdHist.toFixed(p > 2 ? 4 : 2)}`, s.macdHist > 0 ? 1 : s.macdHist < 0 ? -1 : 0, 0.8)
  const fibOk = i.fib.position >= 0.382
  add(
    'Technical',
    'Fibonacci position',
    `${i.fib.legDirection === 'up' ? 'Up-leg' : 'Down-leg'}, ${(i.fib.position * 100).toFixed(0)}% of leg`,
    i.fib.legDirection === 'up' ? (fibOk ? 1 : -1) : fibOk ? -1 : 1,
    0.6,
  )
  add('Technical', 'Multi-timeframe', `${i.mtf.alignmentPct}% aligned ${i.mtf.dominant.toLowerCase()}`, dirEffect(i.mtf.dominant), 0.9)
  add('Technical', 'Validated core model', `${i.backtest.current.label} (${Math.round(i.backtest.coreScore)}/100)`, dirEffect(i.backtest.coreDirection), 0.8)

  add('Structure', 'Swing structure', i.structure.trendLabel, dirEffect(i.structure.trend), 1)
  const lastEv = i.structure.events[i.structure.events.length - 1]
  if (lastEv) add('Structure', `Last ${lastEv.kind}`, `${lastEv.direction.toLowerCase()} at ${f(lastEv.price)}`, dirEffect(lastEv.direction), 0.6)
  for (const ev of z.events.slice(0, 2)) {
    if (ev.kind === 'consolidation') add('Structure', ev.label, 'Range compression', 0, 0)
    else add('Structure', ev.label, `at ${f(ev.level)}`, dirEffect(ev.direction), ev.confirmed ? 0.8 : 0.5)
  }

  add('Fundamental', 'US dollar (measured)', i.macro.usd.available ? i.macro.usd.detail : 'Feed unavailable — excluded', i.macro.usd.effect, i.macro.usd.available ? 0.7 : 0)
  for (const u of i.macro.user) if (u.stance !== 'unset') add('Fundamental', u.label, `Your view: ${u.stance}`, u.effect, 0.4, 'user')

  const vol = i.volumeScore
  add('Sentiment', 'Volume flow', vol >= 58 ? 'Buyers dominate volume' : vol <= 42 ? 'Sellers dominate volume' : 'Balanced', vol >= 58 ? 1 : vol <= 42 ? -1 : 0, 0.5)
  const hd = i.historical.bullishPct - i.historical.bearishPct
  add('Sentiment', 'Historical analogues', `${i.historical.bullishPct}% up / ${i.historical.bearishPct}% down (n=${i.historical.sampleSize})`, hd > 15 ? 1 : hd < -15 ? -1 : 0, 0.5)

  // ---- Conflicts -----------------------------------------------------------
  const directional = factors.filter((x) => x.effect !== 0 && x.weight > 0)
  const upW = directional.filter((x) => x.effect > 0).reduce((a, x) => a + x.weight, 0)
  const dnW = directional.filter((x) => x.effect < 0).reduce((a, x) => a + x.weight, 0)
  let conflictRatio: number
  let against: Factor[]
  if (sign !== 0) {
    against = directional.filter((x) => x.effect === -sign)
    const agree = sign > 0 ? upW : dnW
    const opp = sign > 0 ? dnW : upW
    conflictRatio = agree + opp ? opp / (agree + opp) : 0
  } else {
    against = []
    conflictRatio = upW + dnW ? Math.min(upW, dnW) / Math.max(upW, dnW, 1e-9) * 0.5 : 0
  }
  const conflicts: string[] = against
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((x) => `${x.label}: ${x.value} — opposes the ${i.bias.toLowerCase()} read`)
  const coreDisagrees = sign !== 0 && i.backtest.coreDirection !== 'NEUTRAL' && dirEffect(i.backtest.coreDirection) !== sign
  const probLean = i.probabilities.bull - i.probabilities.bear
  if (sign !== 0 && i.probabilities.basis === 'calibrated' && Math.sign(probLean) === -sign && Math.abs(probLean) >= 6) {
    conflicts.push(`Calibrated history favours the ${probLean > 0 ? 'bullish' : 'bearish'} outcome (${i.probabilities.bull}% vs ${i.probabilities.bear}%) against the current read`)
  }

  // ---- Validated confidence --------------------------------------------------
  const bt = i.backtest
  let confidence: number | null = null
  let validatedHitRate: number | null = null
  let confidenceLabel: DecisionReport['confidenceLabel'] = null
  let confidenceReason: string | undefined
  let conflictReduction = 0
  if (i.source.mode === 'demo') {
    confidenceLabel = 'Insufficient Data'
    confidenceReason = 'No live market feed for this symbol — simulated data cannot be validated.'
  } else if (!bt.sufficient) {
    confidenceLabel = 'Insufficient Data'
    confidenceReason = bt.reason
  } else if (coreDisagrees) {
    confidenceLabel = 'Awaiting Confirmation'
    confidenceReason = `The validated core model reads ${bt.coreDirection.toLowerCase()} while the ensemble reads ${i.bias.toLowerCase()} — no validated basis until they agree.`
  } else {
    validatedHitRate = Math.round(bt.current.posterior * 100)
    const raw = bt.current.posterior * 100
    const reduced = raw * (1 - 0.4 * conflictRatio)
    conflictReduction = Math.round(raw - reduced)
    confidence = Math.round(reduced)
  }

  // ---- Strength --------------------------------------------------------------
  const strengthIndex = Math.round(Math.abs(i.overall - 50) * 2 * (1 - conflictRatio))
  const strength: DecisionReport['strength'] = strengthIndex >= 60 ? 'Very Strong' : strengthIndex >= 40 ? 'Strong' : strengthIndex >= 20 ? 'Moderate' : 'Weak'

  // ---- Market signal -----------------------------------------------------------
  let signal: MarketSignal
  let signalReason: string
  const edge = bt.oos?.edge ?? 0
  if (confidenceLabel === 'Insufficient Data') {
    signal = 'INSUFFICIENT'
    signalReason = confidenceReason ?? 'Not enough validated data.'
  } else if (confidenceLabel === 'Awaiting Confirmation') {
    signal = 'WAIT_CONFIRM'
    signalReason = confidenceReason ?? 'Signals disagree.'
  } else if (i.signalAction === 'BUY' || i.signalAction === 'SELL') {
    const buy = i.signalAction === 'BUY'
    const fakeOut = z.events.some((e) => e.kind === (buy ? 'false-breakout' : 'false-breakdown'))
    const problems: string[] = []
    if ((confidence ?? 0) < 52) problems.push(`validated confidence ${confidence}% is below 52%`)
    if (edge <= 0) problems.push('no out-of-sample edge over the base rate')
    if (conflictRatio >= 0.4) problems.push(`${Math.round(conflictRatio * 100)}% of the evidence conflicts`)
    if (fakeOut) problems.push(`a recent ${buy ? 'false breakout' : 'false breakdown'} argues against it`)
    if (problems.length) {
      signal = 'WAIT_CONFIRM'
      signalReason = `${buy ? 'Bullish' : 'Bearish'} lean, but ${problems.join('; ')}. Confirmation: a close ${buy ? 'above' : 'below'} ${f(buy ? z.confirmation.bull : z.confirmation.bear)}.`
    } else {
      signal = i.signalAction
      signalReason = `${buy ? 'Bullish' : 'Bearish'} read with ${confidence}% validated confidence and a positive out-of-sample edge (+${(edge * 100).toFixed(1)} pts).`
    }
  } else if (i.bias === 'NEUTRAL') {
    signal = 'HOLD'
    signalReason = `Balanced market inside ${f(z.immediateSupport.top)}–${f(z.immediateResistance.bottom)}. No edge to act on.`
  } else {
    signal = 'WAIT_CONFIRM'
    signalReason = `${i.bias === 'BULLISH' ? 'Bullish' : 'Bearish'} lean is not actionable yet — wait for a close ${i.bias === 'BULLISH' ? 'above ' + f(z.confirmation.bull) : 'below ' + f(z.confirmation.bear)}.`
  }
  const signalLabel = { BUY: 'Buy', SELL: 'Sell', HOLD: 'Hold', WAIT_CONFIRM: 'Wait for Confirmation', INSUFFICIENT: 'Insufficient Data' }[signal]

  // ---- Risk ----------------------------------------------------------------------
  const atrs = atrSeries(i.candles, 14).filter(Number.isFinite)
  const atrNow = atrs[atrs.length - 1] ?? 0
  const pct = atrs.length ? atrs.filter((a) => a <= atrNow).length / atrs.length : 0.5
  let riskScore = pct * 100
  if (conflictRatio >= 0.4) riskScore += 15
  if (i.source.mode === 'demo') riskScore += 10
  if (z.events.some((e) => e.kind === 'false-breakout' || e.kind === 'false-breakdown')) riskScore += 8
  const risk: DecisionReport['risk'] = riskScore >= 90 ? 'Extreme' : riskScore >= 65 ? 'High' : riskScore >= 35 ? 'Moderate' : 'Low'
  const riskDetail = `Volatility at the ${Math.round(pct * 100)}th percentile of this timeframe (ATR ${f(atrNow)})${conflictRatio >= 0.4 ? ', conflicting signals' : ''}.`

  // ---- Sentiment -------------------------------------------------------------------
  const sentF = factors.filter((x) => (x.group === 'Sentiment' || x.group === 'Fundamental') && x.weight > 0)
  const sw = sentF.reduce((a, x) => a + x.weight, 0) || 1
  const sScore = sentF.reduce((a, x) => a + x.effect * x.weight, 0) / sw
  const sentiment: DecisionReport['sentiment'] = sScore > 0.2 ? 'Positive' : sScore < -0.2 ? 'Negative' : 'Neutral'
  const sentimentDrivers = sentF.filter((x) => x.effect !== 0).map((x) => `${x.label}: ${x.effect > 0 ? 'positive' : 'negative'}${x.source === 'user' ? ' (your input)' : ''}`)

  // ---- Invalidation --------------------------------------------------------------------
  const invalidation: string[] = []
  if (i.bias === 'BULLISH') invalidation.push(`A close below ${f(z.immediateSupport.bottom)} (immediate support) invalidates the bullish case.`)
  else if (i.bias === 'BEARISH') invalidation.push(`A close above ${f(z.immediateResistance.top)} (immediate resistance) invalidates the bearish case.`)
  else invalidation.push(`A close outside ${f(z.immediateSupport.bottom)}–${f(z.immediateResistance.top)} ends the range view.`)
  const htf = i.mtf.rows.find((r) => r.timeframe === '4H')
  if (htf && sign !== 0) invalidation.push(`The 4H trend (now ${htf.direction.toLowerCase()}) turning ${i.bias === 'BULLISH' ? 'bearish' : 'bullish'}.`)
  if (sign > 0) invalidation.push('MACD histogram turning negative with RSI back below 45.')
  if (sign < 0) invalidation.push('MACD histogram turning positive with RSI back above 55.')
  invalidation.push(`The projection expires after ${i.horizonLabel}; it is recalculated on every new bar or a move larger than 0.6 × ATR.`)
  invalidation.push('Signals are suspended if the feed goes stale (no update for 2 minutes).')

  // ---- Scenario targets ----------------------------------------------------------------
  const scenarios: ScenarioTarget[] = [
    { key: 'bull', label: 'Bullish', probability: i.probabilities.bull, targets: z.targets.bull.slice(0, 2) },
    { key: 'base', label: 'Neutral / range', probability: i.probabilities.neutral, targets: z.targets.neutral },
    { key: 'bear', label: 'Bearish', probability: i.probabilities.bear, targets: z.targets.bear.slice(0, 2) },
  ]

  const directionLevel: DirectionLevel =
    i.overall >= 72 ? 'Strong Bullish' : i.overall >= 58 ? 'Bullish' : i.overall > 42 ? 'Neutral' : i.overall > 28 ? 'Bearish' : 'Strong Bearish'

  const summary =
    confidence != null
      ? `${directionLevel} on ${i.timeframeLabel}: similar readings were right ${validatedHitRate}% of the time over ${i.horizonLabel} (≈${bt.current.nEff.toFixed(0)} independent cases)${conflicts.length ? `; ${conflicts.length} conflicting factor${conflicts.length > 1 ? 's' : ''} reduce it to ${confidence}%` : ''}.`
      : `${directionLevel} on ${i.timeframeLabel}: ${confidenceLabel} — ${confidenceReason}`

  return {
    direction: i.bias,
    directionLevel,
    directionScore: i.overall,
    confidence,
    validatedHitRate,
    conflictReduction,
    confidenceLabel,
    confidenceReason,
    strength,
    strengthIndex,
    signal,
    signalLabel,
    signalReason,
    breakoutProb: z.breakoutProb,
    breakdownProb: z.breakdownProb,
    levels: { immediateSupport: z.immediateSupport, majorSupport: z.majorSupport, immediateResistance: z.immediateResistance, majorResistance: z.majorResistance },
    confirmation: z.confirmation,
    scenarios,
    probabilityBasis: i.probabilities.basis,
    risk,
    riskDetail,
    sentiment,
    sentimentDrivers,
    factors,
    conflicts,
    conflictRatio,
    invalidation,
    source: i.source,
    backtest: bt,
    horizonLabel: i.horizonLabel,
    summary,
  }
}

function dirEffect(d: Direction): -1 | 0 | 1 {
  return d === 'BULLISH' ? 1 : d === 'BEARISH' ? -1 : 0
}
