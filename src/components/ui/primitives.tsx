import type { ReactNode } from 'react'
import type { Direction } from '@/types/market'
import { dirText, scoreColor } from '@/lib/format'

/* Shared premium UI primitives. */

export function Panel({
  title,
  right,
  children,
  className = '',
  accent = false,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  accent?: boolean
}) {
  return (
    <section className={`panel ${accent ? 'gold-ring' : ''} p-3.5 ${className}`}>
      {title && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Meter({ label, value, tint }: { label: string; value: number; tint?: string }) {
  const color = tint ?? scoreColor(value)
  return (
    <div className="group">
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-ink-300">{label}</span>
        <span className="nums font-semibold text-ink-100">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-700">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, transparent), ${color})` }}
        />
      </div>
    </div>
  )
}

export function DirectionPill({ direction, label, size = 'md' }: { direction: Direction; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dot = direction === 'BULLISH' ? '▲' : direction === 'BEARISH' ? '▼' : '◆'
  const sizes = { sm: 'text-[10px] px-1.5 py-0.5', md: 'text-[11px] px-2 py-0.5', lg: 'text-xs px-2.5 py-1' }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wide ${sizes[size]} ${dirText[direction]}`}
      style={{ borderColor: 'color-mix(in oklab, currentColor 32%, transparent)', background: 'color-mix(in oklab, currentColor 12%, transparent)' }}
    >
      <span className="text-[0.7em]">{dot}</span>
      {label ?? direction}
    </span>
  )
}

export function ProbabilityBar({ bull, neutral, bear }: { bull: number; neutral: number; bear: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-800">
      <div style={{ width: `${bull}%`, background: 'linear-gradient(90deg,var(--color-bull-600),var(--color-bull-400))' }} />
      <div style={{ width: `${neutral}%`, background: 'linear-gradient(90deg,var(--color-neutral-500),var(--color-neutral-400))' }} />
      <div style={{ width: `${bear}%`, background: 'linear-gradient(90deg,var(--color-bear-400),var(--color-bear-600))' }} />
    </div>
  )
}

export function Stat({ label, value, sub, tint }: { label: string; value: ReactNode; sub?: ReactNode; tint?: string }) {
  return (
    <div className="panel-inset p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="nums mt-0.5 text-sm font-semibold" style={{ color: tint ?? 'var(--color-ink-100)' }}>
        {value}
      </div>
      {sub && <div className="nums text-[10px] text-ink-400">{sub}</div>}
    </div>
  )
}

export function Ring({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - value / 100)
  const color = scoreColor(value)
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-base-700)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="nums text-base font-bold text-ink-100">{Math.round(value)}</span>
        {label && <span className="text-[8px] uppercase tracking-wider text-ink-500">{label}</span>}
      </div>
    </div>
  )
}

export function Sparkline({ data, color = 'var(--color-ink-300)', width = 64, height = 22 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
