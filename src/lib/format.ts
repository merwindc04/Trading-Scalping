import type { Direction } from '@/types/market'

export function fmt(v: number | undefined | null, precision = 2): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
}

export function fmtSigned(v: number, precision = 2): string {
  const s = v >= 0 ? '+' : ''
  return s + fmt(v, precision)
}

export function fmtCompact(v: number): string {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

export const dirColor: Record<Direction, string> = {
  BULLISH: 'var(--color-bull-400)',
  BEARISH: 'var(--color-bear-400)',
  NEUTRAL: 'var(--color-neutral-400)',
}

export const dirText: Record<Direction, string> = {
  BULLISH: 'text-[var(--color-bull-400)]',
  BEARISH: 'text-[var(--color-bear-400)]',
  NEUTRAL: 'text-[var(--color-neutral-400)]',
}

export const dirBg: Record<Direction, string> = {
  BULLISH: 'bg-[color-mix(in_oklab,var(--color-bull-500)_18%,transparent)]',
  BEARISH: 'bg-[color-mix(in_oklab,var(--color-bear-500)_18%,transparent)]',
  NEUTRAL: 'bg-[color-mix(in_oklab,var(--color-neutral-500)_18%,transparent)]',
}

export function scoreColor(v: number): string {
  if (v >= 60) return 'var(--color-bull-400)'
  if (v <= 40) return 'var(--color-bear-400)'
  return 'var(--color-neutral-400)'
}
