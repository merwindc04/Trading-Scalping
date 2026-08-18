import { CalendarClock, AlertTriangle } from 'lucide-react'
import { Panel } from '@/components/ui/primitives'

/* Demo event calendar — clearly indicative, never auto-interpreted as directional. */
const EVENTS = [
  { time: 'in 6h', title: 'US CPI (YoY)', impact: 'High', effect: 'Volatility elevated' },
  { time: 'in 1d', title: 'FOMC Rate Decision', impact: 'High', effect: 'Trend-defining risk' },
  { time: 'in 2d', title: 'US Initial Jobless Claims', impact: 'Medium', effect: 'Short-term noise' },
  { time: 'in 3d', title: 'Core PCE Price Index', impact: 'High', effect: 'Volatility elevated' },
]

const impactColor: Record<string, string> = {
  High: 'var(--color-bear-400)',
  Medium: 'var(--color-neutral-400)',
  Low: 'var(--color-ink-400)',
}

export function EventRiskPanel() {
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <CalendarClock size={12} className="text-gold-300" /> Event Risk
        </span>
      }
      className="h-full"
    >
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--color-bear-500)]/25 bg-[var(--color-bear-500)]/[0.06] px-2.5 py-2">
        <AlertTriangle size={15} className="text-[var(--color-bear-400)]" />
        <div>
          <div className="text-[11px] font-semibold text-ink-100">High-impact event in ~6h</div>
          <div className="text-[9.5px] text-ink-400">US CPI — expect elevated volatility around the release.</div>
        </div>
      </div>
      <div className="space-y-1">
        {EVENTS.map((e, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md bg-base-800 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: impactColor[e.impact] }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-ink-200">{e.title}</div>
              <div className="text-[9px] text-ink-500">{e.effect}</div>
            </div>
            <span className="nums text-[10px] text-ink-400">{e.time}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-ink-600 text-ink-500">Events are risk markers only — not interpreted as guaranteed bullish or bearish.</p>
    </Panel>
  )
}
