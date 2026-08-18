import type { Direction } from '@/types/market'
import { clamp } from './indicators'

/* ============================================================
   Market Strength engine (spec §7)

   Blends nine interpreted components into a single weighted
   0..100 score plus an overall directional read.
   ============================================================ */

export interface StrengthComponent {
  key: string
  label: string
  value: number // 0..100
  weight: number
}

export interface StrengthReport {
  direction: Direction
  overall: number // 0..100
  components: StrengthComponent[]
}

export interface StrengthInputs {
  trend: number
  momentum: number
  structure: number
  pattern: number
  volume: number
  mtfAlignment: number
  volatilityQuality: number
  breakoutConfirmation: number
  historicalSimilarity: number
}

const WEIGHTS: Record<keyof StrengthInputs, { label: string; weight: number }> = {
  trend: { label: 'Trend', weight: 0.16 },
  momentum: { label: 'Momentum', weight: 0.13 },
  structure: { label: 'Market Structure', weight: 0.16 },
  pattern: { label: 'Pattern', weight: 0.11 },
  volume: { label: 'Volume', weight: 0.08 },
  mtfAlignment: { label: 'Multi-Timeframe Alignment', weight: 0.14 },
  volatilityQuality: { label: 'Volatility Quality', weight: 0.07 },
  breakoutConfirmation: { label: 'Breakout Confirmation', weight: 0.08 },
  historicalSimilarity: { label: 'Historical Similarity', weight: 0.07 },
}

export function computeStrength(inputs: StrengthInputs): StrengthReport {
  const components: StrengthComponent[] = (Object.keys(WEIGHTS) as (keyof StrengthInputs)[]).map((k) => ({
    key: k,
    label: WEIGHTS[k].label,
    value: clamp(Math.round(inputs[k]), 1, 99),
    weight: WEIGHTS[k].weight,
  }))
  const overall = Math.round(components.reduce((s, c) => s + c.value * c.weight, 0))
  const direction: Direction = overall >= 60 ? 'BULLISH' : overall <= 40 ? 'BEARISH' : 'NEUTRAL'
  return { direction, overall, components }
}
