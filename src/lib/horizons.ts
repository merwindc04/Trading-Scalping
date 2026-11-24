import type { Timeframe, TradingStyle } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'

/* ============================================================
   Forecast horizons — selectable projection periods from 5 min
   to 1 year. Each horizon recommends a chart timeframe so the
   projection has a sensible number of steps; the step count is
   always derived from (horizon ÷ timeframe), clamped.
   ============================================================ */

export type HorizonKey = 'auto' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M' | '3M' | '6M' | '1Y'

export interface HorizonDef {
  key: Exclude<HorizonKey, 'auto'>
  label: string
  sec: number
  /** Timeframe that gives a well-resolved projection for this horizon. */
  tf: Timeframe
}

export const HORIZONS: HorizonDef[] = [
  { key: '5m', label: '5m', sec: 300, tf: '1m' },
  { key: '15m', label: '15m', sec: 900, tf: '1m' },
  { key: '1h', label: '1H', sec: 3600, tf: '5m' },
  { key: '4h', label: '4H', sec: 14400, tf: '15m' },
  { key: '1D', label: '1D', sec: 86400, tf: '1H' },
  { key: '1W', label: '1W', sec: 604800, tf: '4H' },
  { key: '1M', label: '1M', sec: 2592000, tf: '1D' },
  { key: '3M', label: '3M', sec: 7776000, tf: '1D' },
  { key: '6M', label: '6M', sec: 15552000, tf: '1W' },
  { key: '1Y', label: '1Y', sec: 31536000, tf: '1W' },
]

/** Legacy style-driven step counts (used by the "Auto" horizon). */
export const STYLE_STEPS: Record<TradingStyle, number> = { SCALP: 16, INTRADAY: 20, SWING: 22, INVEST: 24 }

const MIN_STEPS = 3
const MAX_STEPS = 90

export interface ResolvedHorizon {
  steps: number
  /** Seconds actually covered by the projection. */
  coveredSec: number
  label: string
  /** True when the chosen horizon could not be fully represented on this timeframe. */
  truncated: boolean
}

export function resolveHorizon(key: HorizonKey, tf: Timeframe, style: TradingStyle): ResolvedHorizon {
  const tfSec = TIMEFRAME_SECONDS[tf]
  if (key === 'auto') {
    const steps = STYLE_STEPS[style]
    return { steps, coveredSec: steps * tfSec, label: formatSpan(steps * tfSec), truncated: false }
  }
  const def = HORIZONS.find((h) => h.key === key)!
  const raw = Math.round(def.sec / tfSec)
  const steps = Math.max(MIN_STEPS, Math.min(MAX_STEPS, raw))
  return { steps, coveredSec: steps * tfSec, label: formatSpan(steps * tfSec), truncated: raw > MAX_STEPS || raw < MIN_STEPS }
}

export function formatSpan(sec: number): string {
  const min = sec / 60
  if (min < 60) return `${Math.round(min)} min`
  const hr = min / 60
  if (hr < 24) return `${Math.round(hr * 10) / 10} h`.replace('.0 ', ' ')
  const d = hr / 24
  if (d < 14) return `${Math.round(d)} days`
  if (d < 60) return `${Math.round(d / 7)} weeks`
  if (d < 330) return `${Math.round(d / 30)} months`
  return `${Math.round((d / 365) * 10) / 10} year${d >= 548 ? 's' : ''}`
}
