import type { Candle, Direction, GhostCandle, TradingStyle, UTCTimestamp } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'
import type { Timeframe } from '@/types/market'
import { hashSeed, mulberry32, gaussianFrom } from '@/lib/providers/rng'
import { clamp } from './indicators'

/* ============================================================
   Forecast engine — the signature PROJECTED PATTERN™.

   Not a single model: an ensemble blend of the technical,
   structural, pattern, momentum and historical reads produces
   Bull / Neutral / Bear probabilities. From those we synthesise
   three visual scenarios of translucent "ghost candles", each
   with a widening uncertainty envelope, targets, invalidation,
   projected duration and R:R.

   Confidence is computed SEPARATELY from probability (spec §35).
   ============================================================ */

export type ScenarioKey = 'bull' | 'base' | 'bear'

export interface Scenario {
  key: ScenarioKey
  label: string
  direction: Direction
  probability: number // %
  path: GhostCandle[]
  targets: number[]
  invalidation: number
  durationLabel: string
  expectedVolatility: string
  riskReward: number
  narrative: string
}

export interface ForecastReport {
  scenarios: Scenario[]
  bull: number
  neutral: number
  bear: number
  confidence: number
  primary: Scenario
  horizonSteps: number
}

export interface ForecastInputs {
  candles: Candle[]
  timeframe: Timeframe
  style: TradingStyle
  atr: number
  /** 0..100 aggregate bull score across engines. */
  bullScore: number
  mtfAlignment: number
  patternReliability: number // 0..1
  historicalSampleSize: number
  historicalBullishPct: number
  volatilityPct: number
}

const HORIZON_STEPS: Record<TradingStyle, number> = {
  SCALP: 16,
  INTRADAY: 20,
  SWING: 22,
  INVEST: 24,
}

/** Human projected-horizon label from total seconds (steps × timeframe). */
function formatHorizon(totalSec: number): string {
  const min = totalSec / 60
  if (min < 90) return `${Math.round(min / 5) * 5}–${Math.round((min * 1.6) / 5) * 5} min`
  const hr = min / 60
  if (hr < 20) return `${Math.round(hr)}–${Math.round(hr * 1.5)} hours`
  const d = hr / 24
  if (d < 12) return `${Math.round(d)}–${Math.round(d * 1.6)} days`
  const wk = d / 7
  if (wk < 9) return `${Math.round(wk)}–${Math.round(wk * 1.5)} weeks`
  const mo = d / 30
  if (mo < 22) return `${Math.round(mo)}–${Math.round(mo * 1.4)} months`
  return `${Math.round(mo / 12)}–${Math.round((mo * 1.4) / 12)} years`
}

export function buildForecast(inp: ForecastInputs): ForecastReport {
  const { candles, atr, timeframe, style } = inp
  const last = candles[candles.length - 1]
  const px = last.close
  const tfSec = TIMEFRAME_SECONDS[timeframe]
  const steps = HORIZON_STEPS[style]
  const horizonLabel = formatHorizon(steps * tfSec)

  // ---- Probabilities from the ensemble bull score ----------------------
  const b = clamp(inp.bullScore, 2, 98) / 100
  // Bell-shaped neutral weight: highest when the read is balanced.
  const neutralRaw = 0.24 * (1 - Math.abs(b - 0.5) * 1.6) + 0.08
  let bull = b * (1 - neutralRaw)
  let bear = (1 - b) * (1 - neutralRaw)
  let neutral = neutralRaw
  const sum = bull + bear + neutral
  bull = Math.round((bull / sum) * 100)
  bear = Math.round((bear / sum) * 100)
  neutral = 100 - bull - bear

  // ---- Confidence (independent of probability, spec §35) ---------------
  const agreement = Math.abs(bull - bear) / 100 // dominance of the leading side
  const sampleFactor = clamp(inp.historicalSampleSize / 120, 0, 1)
  const alignFactor = inp.mtfAlignment / 100
  const volPenalty = clamp(1 - Math.abs(inp.volatilityPct - 0.55) * 0.6, 0.4, 1)
  const confidence = Math.round(
    clamp(
      100 * (0.34 * agreement + 0.24 * alignFactor + 0.16 * sampleFactor + 0.14 * inp.patternReliability + 0.12 * volPenalty),
      18,
      93,
    ),
  )

  const rand = mulberry32(hashSeed(`${last.time}|${timeframe}|forecast`))
  const gauss = gaussianFrom(rand)

  // Ground the projection in REALIZED volatility measured from recent returns
  // (standard σ√t diffusion), blended with ATR for robustness. This makes the
  // uncertainty envelope a genuine ~1σ probability cone rather than a guess.
  const closes = candles.map((c) => c.close)
  const rets: number[] = []
  for (let i = Math.max(1, closes.length - 120); i < closes.length; i++) {
    const r = Math.log(closes[i] / closes[i - 1])
    if (Number.isFinite(r)) rets.push(r)
  }
  const rMean = rets.length ? rets.reduce((s, r) => s + r, 0) / rets.length : 0
  const rVar = rets.length > 1 ? rets.reduce((s, r) => s + (r - rMean) ** 2, 0) / (rets.length - 1) : 0
  let sigmaFrac = Math.sqrt(rVar)
  if (!Number.isFinite(sigmaFrac) || sigmaFrac <= 0) sigmaFrac = (atr || px * 0.004) / px
  // Per-bar σ in price: blend realized σ with ATR (both volatility measures).
  const sigmaBar = 0.7 * (px * sigmaFrac) + 0.3 * (atr || px * sigmaFrac)
  const horizonSigma = sigmaBar * Math.sqrt(steps) // 1σ move over the horizon

  // Directional move as a fraction of the horizon's 1σ, scaled by conviction.
  const unit = horizonSigma
  const bullMove = unit * (0.8 + (b - 0.5) * 0.9)
  const bearMove = -unit * (0.8 + (0.5 - b) * 0.9)
  const baseMove = unit * 0.12 * (b - 0.5)

  const bullScenario: Scenario = makeScenario({
    key: 'bull',
    label: 'Bullish',
    direction: 'BULLISH',
    probability: bull,
    px,
    endPrice: px + bullMove,
    steps,
    atr,
    sigmaBar,
    tfSec,
    startTime: last.time,
    shape: 'breakout-retest',
    uncertainty: 1,
    rand,
    gauss,
    durationLabel: horizonLabel,
    narrative:
      'Breakout above resistance, a shallow retest that holds, then continuation toward the target ladder. Structure stays bullish while it holds the retest low.',
  })

  const baseScenario: Scenario = makeScenario({
    key: 'base',
    label: 'Consolidation',
    direction: 'NEUTRAL',
    probability: neutral,
    px,
    endPrice: px + baseMove,
    steps,
    atr,
    sigmaBar,
    tfSec,
    startTime: last.time,
    shape: 'range',
    uncertainty: 0.7,
    rand,
    gauss,
    durationLabel: horizonLabel,
    narrative: 'Sideways range development as the market digests the recent move. No directional edge until price leaves the range.',
  })

  const bearScenario: Scenario = makeScenario({
    key: 'bear',
    label: 'Bearish',
    direction: 'BEARISH',
    probability: bear,
    px,
    endPrice: px + bearMove,
    steps,
    atr,
    sigmaBar,
    tfSec,
    startTime: last.time,
    shape: 'breakdown',
    uncertainty: 1.15,
    rand,
    gauss,
    durationLabel: horizonLabel,
    narrative: 'Rejection and a break below support opens a move toward lower demand zones. Momentum flips as sellers take control.',
  })

  const scenarios = [bullScenario, baseScenario, bearScenario]
  const primary = [...scenarios].sort((a, z) => z.probability - a.probability)[0]

  return { scenarios, bull, neutral, bear, confidence, primary, horizonSteps: steps }
}

interface MakeScenarioArgs {
  key: ScenarioKey
  label: string
  direction: Direction
  probability: number
  px: number
  endPrice: number
  steps: number
  atr: number
  sigmaBar: number
  tfSec: number
  startTime: UTCTimestamp
  shape: 'breakout-retest' | 'range' | 'breakdown'
  uncertainty: number
  rand: () => number
  gauss: () => number
  durationLabel: string
  narrative: string
}

function makeScenario(a: MakeScenarioArgs): Scenario {
  const { px, endPrice, steps, sigmaBar, tfSec, startTime, shape, uncertainty } = a
  const path: GhostCandle[] = []
  const move = endPrice - px
  let prevClose = px
  // Per-bar σ (price) is the volatility unit for path noise, wicks and the band.
  const vol = sigmaBar

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    let target: number
    if (shape === 'range') {
      // Oscillate within a shallow band.
      target = px + Math.sin(t * Math.PI * 2.4) * vol * 1.4 + move * t
    } else if (shape === 'breakout-retest') {
      // Up-leg, a dip (retest) near the first third, then continuation.
      const retest = t < 0.28 ? -Math.sin((t / 0.28) * Math.PI) * vol * 1.1 : 0
      target = px + easeOut(t) * move + retest
    } else {
      // breakdown: brief pause then acceleration lower
      const pause = t < 0.2 ? Math.sin((t / 0.2) * Math.PI) * vol * 0.6 : 0
      target = px + easeIn(t) * move + pause
    }
    const noise = a.gauss() * vol * 0.35
    const close = target + noise
    const open = prevClose
    const wick = vol * (0.4 + a.rand() * 0.5)
    const high = Math.max(open, close) + wick
    const low = Math.min(open, close) - wick
    // Uncertainty envelope = a genuine ~1σ diffusion cone (σ·√step), widened
    // slightly per scenario. Confidence fades with distance into the future.
    const confidence = clamp(0.9 - t * 0.62, 0.2, 0.92)
    const band = vol * Math.sqrt(i) * uncertainty
    path.push({
      time: startTime + i * tfSec,
      open,
      high,
      low,
      close,
      volume: 0,
      confidence,
      bandHigh: close + band,
      bandLow: close - band,
    })
    prevClose = close
  }

  // Targets = fractions of the projected move (3-step ladder), invalidation past the opposite side.
  const dir = a.direction
  const finalMove = path[path.length - 1].close - px
  const targets =
    dir === 'NEUTRAL'
      ? [px + vol * 1.6, px - vol * 1.6]
      : [px + finalMove * 0.45, px + finalMove * 0.72, px + finalMove * 1.0]
  const invalidation =
    dir === 'BULLISH'
      ? Math.min(...path.slice(0, Math.ceil(steps * 0.3)).map((p) => p.low)) - vol * 0.6
      : dir === 'BEARISH'
        ? Math.max(...path.slice(0, Math.ceil(steps * 0.3)).map((p) => p.high)) + vol * 0.6
        : px - vol * 2.2
  const risk = Math.abs(px - invalidation) || vol
  const reward = Math.abs((targets[dir === 'BEARISH' ? targets.length - 1 : 1] ?? targets[0]) - px)
  const riskReward = dir === 'NEUTRAL' ? 1 : Math.round((reward / risk) * 10) / 10

  const expectedVolatility = uncertainty > 1.05 ? 'Elevated' : uncertainty < 0.8 ? 'Contained' : 'Moderate'

  return {
    key: a.key,
    label: a.label,
    direction: a.direction,
    probability: a.probability,
    path,
    targets,
    invalidation,
    durationLabel: a.durationLabel,
    expectedVolatility,
    riskReward,
    narrative: a.narrative,
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2)
}
function easeIn(t: number): number {
  return t * t
}
