import type { AssetClass } from '@/types/market'

/* Market session & data-freshness helpers (UTC based, DST-agnostic approximation). */

export interface SessionStatus {
  open: boolean
  label: string
  note?: string
}

export function marketSession(assetClass: AssetClass, now = new Date()): SessionStatus {
  if (assetClass === 'Crypto') return { open: true, label: 'Open 24/7' }
  const day = now.getUTCDay() // 0 Sun … 6 Sat
  const hr = now.getUTCHours() + now.getUTCMinutes() / 60
  const weekend = day === 6 || (day === 5 && hr >= 21) || (day === 0 && hr < 22)
  if (weekend) return { open: false, label: 'Closed (weekend)', note: 'Spot gold reopens Sunday ~22:00 UTC.' }
  if (hr >= 21 && hr < 22) return { open: false, label: 'Daily break', note: 'Spot trading pauses ~21:00–22:00 UTC.' }
  return { open: true, label: 'Open' }
}

export type Freshness = 'Fresh' | 'Delayed' | 'Stale'

export function freshness(ageMs: number): Freshness {
  if (ageMs < 20_000) return 'Fresh'
  if (ageMs < 120_000) return 'Delayed'
  return 'Stale'
}

export function fmtAge(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}
