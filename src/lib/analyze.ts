import type { Candle, Direction, Timeframe, TradingStyle } from '@/types/market'
import { STYLE_TIMEFRAMES } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import { marketData } from '@/lib/providers/LiveMarketDataProvider'
import { computeIndicators, ema, interpretIndicators, rsi, clamp, type TechnicalReport } from '@/lib/engines/indicators'
import { analyzeStructure, type MarketStructureReport } from '@/lib/engines/structure'
import { detectPatterns, type DetectedPattern } from '@/lib/engines/patterns'
import { computeStrength, type StrengthReport } from '@/lib/engines/strength'
import { findHistoricalAnalogues, type HistoricalReport } from '@/lib/engines/historical'
import { buildForecast, type ForecastReport } from '@/lib/engines/forecast'
import { buildExplanation, type ExplanationReport } from '@/lib/engines/explain'
import { evaluateSignal, type SignalReport } from '@/lib/engines/signal'
import { groundForecast } from '@/lib/engines/forecast'
import { fibonacci, type FibReport } from '@/lib/engines/fibonacci'
import { buildZones, type ZoneReport } from '@/lib/engines/zones'
import { runBacktest, type BacktestReport } from '@/lib/engines/backtest'
import { edgeGateCached, type EdgeGate } from '@/lib/engines/edgeGate'
import { buildMacro, DEFAULT_MACRO_VIEW, type MacroReport, type MacroView } from '@/lib/engines/macro'
import { buildDecision, type DecisionReport } from '@/lib/engines/decision'
import { resolveHorizon, type HorizonKey, type ResolvedHorizon } from '@/lib/horizons'
import type { SourceInfo } from '@/lib/providers/MarketDataProvider'
import { TIMEFRAME_LABEL } from '@/types/market'

export type Purity = '24K' | '22K' | '21K' | '18K'
const PURITY: Record<Purity, number> = { '24K': 0.9999, '22K': 0.916, '21K': 0.875, '18K': 0.75 }

export interface AnalyzeOptions {
  horizon?: HorizonKey
  purity?: Purity
  macroView?: MacroView
}

/** Price multiplier for the selected gold purity (only the AED/gram gold symbol is purity-quoted). */
export function purityScale(symbol: string, purity: Purity = '24K'): number {
  return symbol === 'XAUAED' ? PURITY[purity] / PURITY['24K'] : 1
}

export function scaleCandle<T extends Candle>(c: T, k: number): T {
  return k === 1 ? c : { ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }
}

/* ============================================================
   analyze() — the ensemble orchestrator (spec §33).

   Runs every engine over the primary timeframe, cross-checks
   the multi-timeframe matrix, blends the reads into Bull/
   Neutral/Bear probabilities and assembles everything the UI
   renders.
   ============================================================ */

export const MTF_SET: Timeframe[] = ['1m', '5m', '15m', '1H', '4H', '1D']

export interface MTFRow {
  timeframe: Timeframe
  label: string
  direction: Direction
  bullScore: number
}

export interface MTFReport {
  rows: MTFRow[]
  alignmentPct: number
  dominant: Direction
  avgBull: number
  conflict?: string
}

export interface TradeSetup {
  bias: Direction
  entryLow: number
  entryHigh: number
  targets: number[]
  invalidation: number
  riskReward: number
  confidence: number
  horizon: string
}

export interface Analysis {
  symbol: string
  symbolName: string
  timeframe: Timeframe
  style: TradingStyle
  precision: number
  candles: Candle[]
  price: number
  changePct: number
  /** The single unified directional read driving signal, setup & projection. */
  bias: Direction
  technical: TechnicalReport
  structure: MarketStructureReport
  patterns: DetectedPattern[]
  pattern: DetectedPattern
  strength: StrengthReport
  historical: HistoricalReport
  forecast: ForecastReport
  mtf: MTFReport
  explanation: ExplanationReport
  setup: TradeSetup
  signal: SignalReport
  horizon: ResolvedHorizon
  fib: FibReport
  zones: ZoneReport
  backtest: BacktestReport
  /** Did this model's past calls on this market/timeframe/period beat guessing? Gates BUY/SELL. */
  edgeGate: EdgeGate
  macro: MacroReport
  decision: DecisionReport
  source: SourceInfo
  purity: Purity
  /** Multiplier applied to raw feed prices (purity); live ticks must use it too. */
  priceScale: number
  generatedAt: number
}

function quickBias(candles: Candle[]): { bullScore: number; direction: Direction; label: string } {
  const closes = candles.map((c) => c.close)
  const e9 = ema(closes, 9)
  const e20 = ema(closes, 20)
  const e50 = ema(closes, 50)
  const r = rsi(closes, 14)
  const n = closes.length - 1
  const seg = closes.slice(-20)
  const slope = (seg[seg.length - 1] - seg[0]) / (Math.abs(seg[0]) || 1)
  let score = 50
  score += e9[n] > e20[n] ? 12 : -12
  score += e20[n] > e50[n] ? 12 : -12
  score += ((r[n] || 50) - 50) * 0.5
  score += Math.sign(slope) * Math.min(Math.abs(slope) * 900, 14)
  score = clamp(score, 3, 97)
  const direction: Direction = score >= 58 ? 'BULLISH' : score <= 42 ? 'BEARISH' : 'NEUTRAL'
  const label = score >= 72 ? 'Strong Bullish' : score >= 58 ? 'Bullish' : score >= 42 ? 'Neutral' : score >= 28 ? 'Bearish' : 'Strong Bearish'
  return { bullScore: score, direction, label }
}

async function buildMTF(symbol: string): Promise<MTFReport> {
  const rows: MTFRow[] = []
  for (const tf of MTF_SET) {
    const candles = await marketData.getHistory(symbol, tf, 220)
    const q = quickBias(candles)
    rows.push({ timeframe: tf, label: q.label, direction: q.direction, bullScore: q.bullScore })
  }
  const avgBull = rows.reduce((s, r) => s + r.bullScore, 0) / rows.length
  const dominant: Direction = avgBull >= 56 ? 'BULLISH' : avgBull <= 44 ? 'BEARISH' : 'NEUTRAL'
  const agree = rows.filter((r) => r.direction === dominant).length
  const alignmentPct = Math.round((agree / rows.length) * 100)

  // Surface the loudest cross-timeframe conflict (short vs higher tf).
  let conflict: string | undefined
  const shortRow = rows.find((r) => r.timeframe === '5m') ?? rows[0]
  const higherRow = rows.find((r) => r.timeframe === '4H') ?? rows[rows.length - 1]
  if (shortRow.direction !== 'NEUTRAL' && higherRow.direction !== 'NEUTRAL' && shortRow.direction !== higherRow.direction) {
    conflict = `Short-term momentum (${shortRow.timeframe}) is ${shortRow.direction.toLowerCase()}, but the ${higherRow.timeframe} trend remains ${higherRow.direction.toLowerCase()} — treat the setup as lower-conviction until they align.`
  }

  return { rows, alignmentPct, dominant, avgBull, conflict }
}

function volumeStrength(candles: Candle[]): number {
  const seg = candles.slice(-30)
  let upVol = 0
  let dnVol = 0
  for (const c of seg) {
    if (c.close >= c.open) upVol += c.volume
    else dnVol += c.volume
  }
  const total = upVol + dnVol || 1
  return clamp(50 + ((upVol - dnVol) / total) * 55, 6, 96)
}

export async function analyze(symbol: string, timeframe: Timeframe, style: TradingStyle, opts: AnalyzeOptions = {}): Promise<Analysis> {
  const asset = ASSETS[symbol] ?? ASSETS.XAUUSD
  const purity = opts.purity ?? '24K'
  const k = purityScale(symbol, purity)
  // One deep fetch: the last 320 bars drive the engines & chart, the full
  // history (up to 1000 bars) feeds the walk-forward backtest.
  const full = (await marketData.getHistory(symbol, timeframe, 1000)).map((c) => scaleCandle(c, k))
  const candles = full.slice(-320)
  const corpus = full.slice(-480)
  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2] ?? last

  const technical = interpretIndicators(candles)
  const structure = analyzeStructure(candles)
  const snap = computeIndicators(candles)
  // Trend context for pattern classification: blend structural trend with momentum.
  const patternBias: import('@/types/market').Direction =
    technical.trendScore >= 56 && structure.trend !== 'BEARISH'
      ? 'BULLISH'
      : technical.trendScore <= 44 && structure.trend !== 'BULLISH'
        ? 'BEARISH'
        : structure.trend
  const patterns = detectPatterns(candles, structure.swings, snap.atr, patternBias)
  const pattern = patterns[0]
  const historical = findHistoricalAnalogues(corpus, Math.min(50, Math.floor(corpus.length / 6)), 20)
  const [mtf, macro] = await Promise.all([buildMTF(symbol), buildMacro(symbol, opts.macroView ?? DEFAULT_MACRO_VIEW)])
  const source: SourceInfo = marketData.getSourceInfo?.(symbol) ?? { mode: marketData.getStatus(symbol), feeds: [marketData.sourceLabel] }
  const horizon = resolveHorizon(opts.horizon ?? 'auto', timeframe, style)
  const backtest = runBacktest(full, horizon.steps)
  // Deeper history (up to 3,000 bars) for the proven-edge test; raw feed prices are fine for direction.
  const deep = marketData.getDeepHistory ? await marketData.getDeepHistory(symbol, timeframe, 3000) : full
  const edgeGate = edgeGateCached(`${symbol}|${timeframe}|${horizon.steps}`, deep, horizon.steps)

  // Directioned pattern strength (bull-positive).
  const patternComponent =
    pattern.direction === 'BULLISH'
      ? clamp(50 + pattern.completion * 0.42, 50, 96)
      : pattern.direction === 'BEARISH'
        ? clamp(50 - pattern.completion * 0.42, 6, 50)
        : 50
  const breakoutComponent =
    pattern.direction === 'BULLISH'
      ? clamp(45 + pattern.breakoutProbability * 0.4, 30, 92)
      : pattern.direction === 'BEARISH'
        ? clamp(55 - pattern.breakoutProbability * 0.4, 8, 70)
        : 50
  const historicalComponent = clamp(50 + (historical.bullishPct - historical.bearishPct) / 2, 8, 94)
  const volumeComponent = volumeStrength(candles)

  const strength = computeStrength({
    trend: technical.trendScore,
    momentum: technical.momentumScore,
    structure: structure.structureScore,
    pattern: patternComponent,
    volume: volumeComponent,
    mtfAlignment: mtf.avgBull,
    volatilityQuality: technical.volatilityScore,
    breakoutConfirmation: breakoutComponent,
    historicalSimilarity: historicalComponent,
  })

  // The Market Strength score IS the single ensemble read (a 9-component
  // weighted blend). Everything actionable — probabilities, the projected
  // primary scenario, the trade setup and the signal — keys off this same
  // number and its direction, so nothing on screen can contradict.
  const bullScore = strength.overall
  const bias: Direction = strength.direction

  const reliability = pattern.reliability === 'High' ? 0.85 : pattern.reliability === 'Medium' ? 0.6 : 0.4

  const forecast = buildForecast({
    candles,
    timeframe,
    style,
    atr: snap.atr,
    bullScore,
    mtfAlignment: mtf.alignmentPct,
    patternReliability: reliability,
    historicalSampleSize: historical.sampleSize,
    historicalBullishPct: historical.bullishPct,
    volatilityPct: snap.atrPct,
    steps: horizon.steps,
  })

  // ---- Dynamic S/R zones + Fibonacci, driven by validated drift & realized σ ----
  const fib = fibonacci(candles)
  const shrink = backtest.current.nEff / (backtest.current.nEff + 6)
  const zones = buildZones({
    candles,
    atr: snap.atr,
    sigmaBar: backtest.sigmaBar,
    driftPerBar: backtest.current.driftPerBar * shrink,
    steps: horizon.steps,
    fib,
    structureEvents: structure.events,
  })
  // Zones are the single source for S/R across the app.
  structure.nearestSupport = zones.immediateSupport.center
  structure.nearestResistance = zones.immediateResistance.center
  structure.breakoutLevel = zones.immediateResistance.top
  structure.levels = zones.zones.map((z) => ({ price: z.center, kind: z.kind, strength: z.touches, label: z.kind === 'resistance' ? 'Resistance' : 'Support' }))

  // Calibrated probabilities + zone-based targets/invalidation for every scenario.
  groundForecast(forecast, {
    price: last.close,
    calibration: backtest.evaluations > 0 ? backtest.calibration : null,
    targets: zones.targets,
    invalidation: { bull: zones.invalidation.bull, bear: zones.invalidation.bear, neutral: zones.immediateSupport.bottom },
  })

  // Align the projected primary scenario with the directional read so the chart
  // ghost candles, targets and the trade setup all tell the same story.
  const activeKey = bias === 'BULLISH' ? 'bull' : bias === 'BEARISH' ? 'bear' : 'base'
  const activeScenario = forecast.scenarios.find((s) => s.key === activeKey) ?? forecast.primary
  forecast.primary = activeScenario

  // Entry zone anchored to price; stop & targets come from the active scenario.
  const spread = snap.atr * 0.5
  const setup: TradeSetup = {
    bias,
    entryLow: last.close - spread,
    entryHigh: last.close + spread * 0.4,
    targets: activeScenario.targets,
    invalidation: activeScenario.invalidation,
    riskReward: activeScenario.riskReward,
    confidence: forecast.confidence,
    horizon: activeScenario.durationLabel,
  }

  const signalInput = (confidence: number) => ({
    symbol,
    price: last.close,
    strengthOverall: bullScore,
    direction: bias,
    bull: forecast.bull,
    bear: forecast.bear,
    confidence,
    rsi: snap.rsi,
    momentumScore: technical.momentumScore,
    mtfAlignment: mtf.alignmentPct,
    mtfDominant: mtf.dominant,
    patternName: pattern.name,
    patternDirection: pattern.direction,
    breakoutLevel: zones.immediateResistance.top,
    trendLabel: structure.trendLabel,
    structureTrend: structure.trend,
    entryLow: setup.entryLow,
    entryHigh: setup.entryHigh,
    stop: setup.invalidation,
    targets: setup.targets,
    riskReward: setup.riskReward,
    horizon: setup.horizon,
  })
  // The action itself never depends on confidence, so a provisional pass is safe.
  const provisional = evaluateSignal(signalInput(forecast.confidence))

  const decision = buildDecision({
    candles,
    timeframeLabel: TIMEFRAME_LABEL[timeframe],
    horizonLabel: horizon.label,
    bias,
    overall: bullScore,
    technical,
    structure,
    mtf,
    volumeScore: volumeComponent,
    historical,
    backtest,
    edgeGate,
    zones,
    fib,
    macro,
    probabilities: { bull: forecast.bull, neutral: forecast.neutral, bear: forecast.bear, basis: forecast.probabilityBasis },
    signalAction: provisional.action,
    source,
    precision: asset.precision,
  })

  // Validated confidence replaces the heuristic everywhere it is shown.
  groundForecast(forecast, {
    price: last.close,
    targets: zones.targets,
    invalidation: { bull: zones.invalidation.bull, bear: zones.invalidation.bear, neutral: zones.immediateSupport.bottom },
    confidence: decision.confidence,
  })
  setup.confidence = forecast.confidence

  let signal = evaluateSignal(signalInput(forecast.confidence))
  // The decision layer is authoritative: an unconfirmed or unvalidated call is never shown as BUY/SELL.
  if ((decision.signal === 'WAIT_CONFIRM' || decision.signal === 'INSUFFICIENT') && signal.action !== 'WAIT') {
    signal = {
      ...signal,
      action: 'WAIT',
      headline: 'WAIT',
      strong: false,
      subline: decision.signalLabel,
      timing: decision.signalReason,
      triggerKey: `${symbol}|WAIT|std`,
    }
  }

  const explanation = buildExplanation({
    symbolName: asset.name,
    direction: bias,
    technical,
    structure,
    pattern,
    forecast,
    historical,
    mtfSummary: { aligned: mtf.alignmentPct, conflict: mtf.conflict },
    precision: asset.precision,
  })

  return {
    symbol,
    symbolName: asset.name,
    timeframe,
    style,
    precision: asset.precision,
    candles,
    price: last.close,
    changePct: ((last.close - prev.close) / prev.close) * 100,
    bias,
    technical,
    structure,
    patterns,
    pattern,
    strength,
    historical,
    forecast,
    mtf,
    explanation,
    setup,
    signal,
    horizon,
    fib,
    zones,
    backtest,
    edgeGate,
    macro,
    decision,
    source,
    purity,
    priceScale: k,
    generatedAt: Date.now(),
  }
}
