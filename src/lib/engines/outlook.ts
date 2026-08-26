import type { Direction } from '@/types/market'

/* ============================================================
   Multi-month outlook — a realized-volatility "cone".

   Direction over months is not predictable to a single number, so
   we don't pretend to. Instead we estimate the EXPECTED RANGE at
   1/2/3-month horizons from the asset's own measured daily
   volatility (geometric Brownian motion: band ∝ σ·√t), with a
   heavily damped drift. This is a standard, defensible projection
   — probabilistic bands, never a guaranteed target.
   ============================================================ */

export interface HorizonOutlook {
  label: string
  days: number
  central: number
  low68: number
  high68: number
  low95: number
  high95: number
  centralChangePct: number
  bandPct68: number
}

export interface OutlookReport {
  annualVolPct: number
  sample: number
  lean: Direction
  horizons: HorizonOutlook[]
}

export function buildOutlook(dailyCloses: number[], spot: number, lean: Direction): OutlookReport {
  const window = dailyCloses.slice(-180).filter((v) => Number.isFinite(v) && v > 0)
  const rets: number[] = []
  for (let i = 1; i < window.length; i++) rets.push(Math.log(window[i] / window[i - 1]))
  const n = rets.length
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0
  const variance = n > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0
  const sd = Math.sqrt(variance) // daily log-return stdev
  const annualVolPct = sd * Math.sqrt(365) * 100
  const driftDaily = mean * 0.5 // damp the drift — multi-month drift is unreliable

  const mk = (days: number, label: string): HorizonOutlook => {
    const band68 = sd * Math.sqrt(days)
    const band95 = 2 * band68
    // Cap total drift to half the 68% band so realized volatility, not an
    // extrapolated trend, dominates the projected range.
    const cap = band68 * 0.5
    const mu = Math.max(-cap, Math.min(cap, driftDaily * days))
    return {
      label,
      days,
      central: spot * Math.exp(mu),
      low68: spot * Math.exp(mu - band68),
      high68: spot * Math.exp(mu + band68),
      low95: spot * Math.exp(mu - band95),
      high95: spot * Math.exp(mu + band95),
      centralChangePct: (Math.exp(mu) - 1) * 100,
      bandPct68: (Math.exp(band68) - 1) * 100,
    }
  }

  return {
    annualVolPct,
    sample: n,
    lean,
    horizons: [mk(30, '1 Month'), mk(60, '2 Months'), mk(90, '3 Months')],
  }
}
