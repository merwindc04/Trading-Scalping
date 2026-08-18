import type { Candle, Timeframe } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'
import { ASSETS } from '@/lib/assets'
import { hashSeed, mulberry32, gaussianFrom } from './rng'

/* ============================================================
   Demo OHLCV generator.

   Produces believable price action — trend regimes, volatility
   clustering, momentum bursts and clean swing structure — so the
   analysis engines have real shapes to read. Deterministic per
   (symbol, timeframe): the same request always yields the same
   history, which keeps analysis stable between renders.
   ============================================================ */

function alignedNow(tfSec: number): number {
  const now = Math.floor(Date.now() / 1000)
  return now - (now % tfSec)
}

export function generateSeries(symbol: string, timeframe: Timeframe, count: number): Candle[] {
  const asset = ASSETS[symbol] ?? ASSETS.XAUUSD
  const tfSec = TIMEFRAME_SECONDS[timeframe]
  // Directional backbone is seeded by SYMBOL ONLY so every timeframe is a
  // consistent view of the same market (the MTF matrix becomes meaningful).
  // Per-timeframe noise keeps each resolution's micro-structure distinct.
  const regimeRand = mulberry32(hashSeed(`${symbol}|regime|v4`))
  const rand = mulberry32(hashSeed(`${symbol}|${timeframe}|v4`))
  const gauss = gaussianFrom(rand)

  // Per-step volatility scales with the sqrt of bar length, damped for realism
  // so daily/weekly changes stay in a believable range (no hype-sized moves).
  const barsPerDay = 86400 / tfSec
  const stepVol = (asset.vol / Math.sqrt(barsPerDay * 252)) * asset.seedPrice * 2.6

  // Regime plan: alternate trend / range blocks of varying strength.
  type Regime = { len: number; drift: number; volMul: number }
  const regimes: Regime[] = []
  let placed = 0
  while (placed < count + 5) {
    const kind = regimeRand()
    const len = 18 + Math.floor(regimeRand() * 46)
    let drift: number
    let volMul: number
    if (kind < 0.42) {
      // trending
      drift = (regimeRand() < 0.5 ? 1 : -1) * (0.18 + regimeRand() * 0.55)
      volMul = 0.8 + regimeRand() * 0.5
    } else if (kind < 0.72) {
      // ranging / consolidation
      drift = (regimeRand() - 0.5) * 0.12
      volMul = 0.55 + regimeRand() * 0.4
    } else {
      // volatile / impulsive
      drift = (regimeRand() < 0.5 ? 1 : -1) * (0.28 + regimeRand() * 0.45)
      volMul = 1.15 + regimeRand() * 0.6
    }
    regimes.push({ len, drift, volMul })
    placed += len
  }

  // Bias the final legs bullish so the primary XAUUSD demo reads clearly
  // "constructive" across every timeframe for the signature Projected
  // Pattern experience: an up-leg, a shallow retest dip, then continuation.
  if (symbol === 'XAUUSD') {
    regimes[regimes.length - 1] = { len: 34, drift: 0.5, volMul: 0.9 }
    regimes[regimes.length - 2] = { len: 20, drift: -0.14, volMul: 1.0 } // retest dip
    regimes[regimes.length - 3] = { len: 40, drift: 0.42, volMul: 0.95 } // prior advance
  }

  const closes: number[] = []
  let price = asset.seedPrice * (0.86 + regimeRand() * 0.1)
  let clusterVol = 1
  let ri = 0
  let riLeft = regimes[0].len
  const n = count

  for (let i = 0; i < n; i++) {
    if (riLeft <= 0) {
      ri = Math.min(ri + 1, regimes.length - 1)
      riLeft = regimes[ri].len
    }
    const reg = regimes[ri]
    // Volatility clustering (GARCH-ish): today's shock feeds tomorrow's vol.
    clusterVol = 0.86 * clusterVol + 0.14 * (0.6 + Math.abs(gauss()))
    const vol = stepVol * reg.volMul * clusterVol
    const shock = gauss() * vol
    // Keep drift small relative to noise so trends form without runaway moves.
    const drift = (reg.drift * stepVol) / 4.2
    price = Math.max(price + drift + shock, asset.seedPrice * 0.4)
    closes.push(price)
    riLeft--
  }

  // Multiplicative rescale so the final close lands on the seed price —
  // preserves the shape of the walk while anchoring to a realistic level.
  const scale = asset.seedPrice / closes[closes.length - 1]
  for (let i = 0; i < n; i++) closes[i] *= scale

  // Build OHLCV from the close path + a coherent intrabar wick model.
  const endTime = alignedNow(tfSec)
  const candles: Candle[] = []
  let volBase = asset.seedPrice * 900 * (0.6 + rand())
  for (let i = 0; i < n; i++) {
    const time = endTime - (n - 1 - i) * tfSec
    const close = closes[i]
    const open = i === 0 ? close * (1 - (gauss() * asset.vol) / 260) : closes[i - 1]
    const body = Math.abs(close - open)
    const wick = (Math.abs(gauss()) * 0.6 + 0.25) * (stepVol * 0.9) + body * 0.4
    const high = Math.max(open, close) + wick * (0.3 + rand() * 0.7)
    const low = Math.min(open, close) - wick * (0.3 + rand() * 0.7)
    // Volume rises with range and on directional bars.
    const range = high - low
    const vMul = 0.7 + (range / (stepVol + 1e-9)) * 0.5 + (close > open ? 0.15 : 0.05)
    volBase = 0.9 * volBase + 0.1 * asset.seedPrice * 900 * (0.6 + rand())
    const volume = Math.round(volBase * vMul * (0.7 + rand() * 0.6))
    candles.push({
      time,
      open: round(open, asset.precision),
      high: round(high, asset.precision),
      low: round(low, asset.precision),
      close: round(close, asset.precision),
      volume,
    })
  }
  return candles
}

function round(v: number, p: number): number {
  const f = Math.pow(10, p)
  return Math.round(v * f) / f
}
