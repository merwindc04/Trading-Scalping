import type { Candle } from '@/types/market'

/* ============================================================
   TechnicalAnalysisEngine — indicator maths + interpretation.

   The philosophy (spec §10): don't dump 15 indicators on the
   user. Compute them, then translate them into plain-language
   conclusions and a signed contribution to bias.
   ============================================================ */

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  const k = 2 / (period + 1)
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN)
  let gain = 0
  let loss = 0
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    const g = Math.max(ch, 0)
    const l = Math.max(-ch, 0)
    if (i <= period) {
      gain += g
      loss += l
      if (i === period) {
        gain /= period
        loss /= period
        out[i] = 100 - 100 / (1 + gain / (loss || 1e-9))
      }
    } else {
      gain = (gain * (period - 1) + g) / period
      loss = (loss * (period - 1) + l) / period
      out[i] = 100 - 100 / (1 + gain / (loss || 1e-9))
    }
  }
  return out
}

export interface MACDResult {
  macd: number[]
  signal: number[]
  histogram: number[]
}

export function macd(closes: number[], fast = 12, slow = 26, sig = 9): MACDResult {
  const ef = ema(closes, fast)
  const es = ema(closes, slow)
  const line = closes.map((_, i) => ef[i] - es[i])
  const signal = ema(line, sig)
  const histogram = line.map((v, i) => v - signal[i])
  return { macd: line, signal, histogram }
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const p = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p))
  })
}

export function atr(candles: Candle[], period = 14): number[] {
  const tr = trueRange(candles)
  return ema(tr, period)
}

export function adx(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN)
  const plusDM: number[] = [0]
  const minusDM: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high
    const dn = candles[i - 1].low - candles[i].low
    plusDM.push(up > dn && up > 0 ? up : 0)
    minusDM.push(dn > up && dn > 0 ? dn : 0)
  }
  const tr = trueRange(candles)
  const atrS = ema(tr, period)
  const pdi = ema(plusDM, period).map((v, i) => (100 * v) / (atrS[i] || 1e-9))
  const mdi = ema(minusDM, period).map((v, i) => (100 * v) / (atrS[i] || 1e-9))
  const dx = pdi.map((p, i) => (100 * Math.abs(p - mdi[i])) / ((p + mdi[i]) || 1e-9))
  const adxS = ema(dx, period)
  for (let i = 0; i < candles.length; i++) out[i] = adxS[i]
  return out
}

export interface BollingerResult {
  middle: number[]
  upper: number[]
  lower: number[]
  width: number[]
}

export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const mid = sma(closes, period)
  const upper: number[] = new Array(closes.length).fill(NaN)
  const lower: number[] = new Array(closes.length).fill(NaN)
  const width: number[] = new Array(closes.length).fill(NaN)
  for (let i = period - 1; i < closes.length; i++) {
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - mid[i]) ** 2
    const sd = Math.sqrt(sq / period)
    upper[i] = mid[i] + mult * sd
    lower[i] = mid[i] - mult * sd
    width[i] = (upper[i] - lower[i]) / (mid[i] || 1e-9)
  }
  return { middle: mid, upper, lower, width }
}

export function vwap(candles: Candle[], window = 60): number[] {
  const out: number[] = new Array(candles.length).fill(NaN)
  let pv = 0
  let vol = 0
  const pvArr: number[] = []
  const vArr: number[] = []
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3
    pvArr.push(tp * candles[i].volume)
    vArr.push(candles[i].volume)
    pv += pvArr[i]
    vol += vArr[i]
    if (i >= window) {
      pv -= pvArr[i - window]
      vol -= vArr[i - window]
    }
    out[i] = pv / (vol || 1e-9)
  }
  return out
}

export function stochRSI(closes: number[], period = 14, smooth = 3): number[] {
  const r = rsi(closes, period)
  const out: number[] = new Array(closes.length).fill(NaN)
  for (let i = period * 2; i < closes.length; i++) {
    let lo = Infinity
    let hi = -Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (!isNaN(r[j])) {
        lo = Math.min(lo, r[j])
        hi = Math.max(hi, r[j])
      }
    }
    out[i] = hi > lo ? ((r[i] - lo) / (hi - lo)) * 100 : 50
  }
  return sma(out, smooth)
}

export function roc(closes: number[], period = 12): number[] {
  return closes.map((v, i) => (i >= period ? ((v - closes[i - period]) / closes[i - period]) * 100 : NaN))
}

export interface PivotPoints {
  pivot: number
  r1: number
  r2: number
  s1: number
  s2: number
}

export function pivotPoints(candles: Candle[]): PivotPoints {
  const c = candles[candles.length - 1]
  const p = (c.high + c.low + c.close) / 3
  return {
    pivot: p,
    r1: 2 * p - c.low,
    s1: 2 * p - c.high,
    r2: p + (c.high - c.low),
    s2: p - (c.high - c.low),
  }
}

const last = (a: number[]): number => {
  for (let i = a.length - 1; i >= 0; i--) if (!isNaN(a[i])) return a[i]
  return NaN
}

export interface IndicatorSnapshot {
  ema9: number
  ema20: number
  ema50: number
  ema200: number
  rsi: number
  macd: number
  macdSignal: number
  macdHist: number
  atr: number
  atrPct: number
  adx: number
  bbWidth: number
  vwap: number
  stochRsi: number
  roc: number
  pivots: PivotPoints
  series: {
    ema9: number[]
    ema20: number[]
    ema50: number[]
    ema200: number[]
    vwap: number[]
    bbUpper: number[]
    bbLower: number[]
    rsi: number[]
    macdHist: number[]
  }
}

/** One readable, interpreted conclusion from an indicator. */
export interface IndicatorReading {
  label: string
  value: string
  /** -1 (bearish) .. +1 (bullish) contribution to bias. */
  bias: number
  note: string
}

export interface TechnicalReport {
  snapshot: IndicatorSnapshot
  readings: IndicatorReading[]
  /** Aggregate momentum score 0..100. */
  momentumScore: number
  /** Aggregate trend score 0..100. */
  trendScore: number
  volatilityScore: number
}

export function computeIndicators(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.close)
  const e9 = ema(closes, 9)
  const e20 = ema(closes, 20)
  const e50 = ema(closes, 50)
  const e200 = ema(closes, 200)
  const r = rsi(closes, 14)
  const m = macd(closes)
  const a = atr(candles, 14)
  const ax = adx(candles, 14)
  const bb = bollinger(closes, 20, 2)
  const vw = vwap(candles, 60)
  const sr = stochRSI(closes)
  const rc = roc(closes, 12)
  const px = closes[closes.length - 1]
  return {
    ema9: last(e9),
    ema20: last(e20),
    ema50: last(e50),
    ema200: last(e200),
    rsi: last(r),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHist: last(m.histogram),
    atr: last(a),
    atrPct: (last(a) / px) * 100,
    adx: last(ax),
    bbWidth: last(bb.width),
    vwap: last(vw),
    stochRsi: last(sr),
    roc: last(rc),
    pivots: pivotPoints(candles),
    series: {
      ema9: e9,
      ema20: e20,
      ema50: e50,
      ema200: e200,
      vwap: vw,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      rsi: r,
      macdHist: m.histogram,
    },
  }
}

/** Turn raw indicators into plain-language, biased conclusions. */
export function interpretIndicators(candles: Candle[]): TechnicalReport {
  const snap = computeIndicators(candles)
  const px = candles[candles.length - 1].close
  const readings: IndicatorReading[] = []

  // EMA structure
  const stacked = snap.ema9 > snap.ema20 && snap.ema20 > snap.ema50
  const stackedDown = snap.ema9 < snap.ema20 && snap.ema20 < snap.ema50
  readings.push({
    label: 'EMA Structure',
    value: stacked ? 'Bullish stack' : stackedDown ? 'Bearish stack' : 'Mixed',
    bias: stacked ? 0.9 : stackedDown ? -0.9 : (px > snap.ema50 ? 0.25 : -0.25),
    note: stacked
      ? 'EMA 9 > 20 > 50 confirms short-term upward momentum.'
      : stackedDown
        ? 'EMA 9 < 20 < 50 confirms short-term downward pressure.'
        : 'Moving averages are interleaved — momentum is transitioning.',
  })

  // Long-term trend via EMA200
  readings.push({
    label: 'Long-term Trend',
    value: px > snap.ema200 ? 'Above EMA 200' : 'Below EMA 200',
    bias: px > snap.ema200 ? 0.5 : -0.5,
    note: px > snap.ema200 ? 'Price holds above the 200 EMA — macro trend constructive.' : 'Price trades below the 200 EMA — macro trend heavy.',
  })

  // RSI
  const rsiBias = snap.rsi > 70 ? 0.1 : snap.rsi > 55 ? 0.6 : snap.rsi > 45 ? 0 : snap.rsi > 30 ? -0.6 : -0.2
  readings.push({
    label: 'RSI (14)',
    value: snap.rsi.toFixed(0),
    bias: rsiBias,
    note:
      snap.rsi > 70
        ? 'RSI is stretched — momentum strong but overbought risk rising.'
        : snap.rsi > 55
          ? 'RSI is bullish without being significantly overbought.'
          : snap.rsi < 30
            ? 'RSI is oversold — downside momentum extended.'
            : snap.rsi < 45
              ? 'RSI leans bearish.'
              : 'RSI is neutral around the midline.',
  })

  // MACD
  const macdBias = snap.macdHist > 0 ? (snap.macd > 0 ? 0.7 : 0.35) : snap.macd < 0 ? -0.7 : -0.35
  readings.push({
    label: 'MACD',
    value: snap.macdHist > 0 ? 'Rising' : 'Falling',
    bias: macdBias,
    note: snap.macdHist > 0 ? 'MACD histogram is positive — momentum favours buyers.' : 'MACD histogram is negative — momentum favours sellers.',
  })

  // ADX (trend quality, not direction)
  readings.push({
    label: 'ADX',
    value: snap.adx.toFixed(0),
    bias: 0,
    note: snap.adx > 25 ? 'ADX above 25 — a trending regime, moves have follow-through.' : 'ADX below 25 — a ranging regime, expect chop and mean reversion.',
  })

  // ATR / volatility
  readings.push({
    label: 'ATR',
    value: `${snap.atrPct.toFixed(2)}%`,
    bias: 0,
    note: snap.atrPct > 0.8 ? 'ATR suggests elevated volatility — widen stops and targets.' : 'ATR is contained — volatility is moderate.',
  })

  // VWAP
  readings.push({
    label: 'VWAP',
    value: px > snap.vwap ? 'Above' : 'Below',
    bias: px > snap.vwap ? 0.4 : -0.4,
    note: px > snap.vwap ? 'Price trades above VWAP — intraday control with buyers.' : 'Price trades below VWAP — intraday control with sellers.',
  })

  // Momentum & trend scores (0..100)
  const biasAvg = clampBiasAvg(readings)
  const momentumScore = clamp(50 + (macdBias * 22 + rsiBias * 18 + (snap.roc > 0 ? 10 : -10)), 4, 96)
  const trendScore = clamp(50 + biasAvg * 46 + (snap.adx > 25 ? 6 : -4), 4, 96)
  const volatilityScore = clamp(100 - Math.abs(snap.atrPct - 0.6) * 45, 20, 92)

  return { snapshot: snap, readings, momentumScore, trendScore, volatilityScore }
}

function clampBiasAvg(readings: IndicatorReading[]): number {
  const weighted = readings.reduce((s, r) => s + r.bias, 0)
  return clamp(weighted / readings.length, -1, 1)
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
