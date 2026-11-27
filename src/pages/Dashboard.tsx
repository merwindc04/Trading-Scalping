import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { LiveState } from '@/hooks/useAnalysis'
import { Watchlist } from '@/components/layout/Watchlist'
import { ChartCard } from '@/components/chart/ChartCard'
import { SignalPanel } from '@/components/panels/SignalPanel'
import { ChecklistPanel } from '@/components/panels/ChecklistPanel'
import { EntryConfirmPanel } from '@/components/panels/EntryConfirmPanel'
import { MoveTrackerPanel } from '@/components/panels/MoveTrackerPanel'
import { MarketStrengthPanel } from '@/components/panels/MarketStrengthPanel'
import { ScenarioPanel } from '@/components/panels/ScenarioPanel'
import { PatternPanel } from '@/components/panels/PatternPanel'
import { TradeSetupPanel } from '@/components/panels/TradeSetupPanel'
import { ExplainPanel } from '@/components/panels/ExplainPanel'
import { MultiTimeframePanel } from '@/components/panels/MultiTimeframePanel'
import { HistoricalPanel } from '@/components/panels/HistoricalPanel'
import { MomentumPanel } from '@/components/panels/MomentumPanel'
import { EventRiskPanel } from '@/components/panels/EventRiskPanel'
import { UaeGoldPanel } from '@/components/panels/UaeGoldPanel'

/* Side-panel width: draggable, remembered per browser (falls back to default). */
const DEFAULT_SIDE_W = 366
const MIN_SIDE_W = 300
const SIDE_W_KEY = 'aurumpulse-side-width'

function readSideW(): number {
  try {
    const v = Number(localStorage.getItem(SIDE_W_KEY))
    return v >= MIN_SIDE_W ? v : DEFAULT_SIDE_W
  } catch {
    return DEFAULT_SIDE_W
  }
}

export function Dashboard({ live }: { live: LiveState }) {
  const { analysis, liveCandle, price, loading, lastTick, recalcReason } = live
  const gridRef = useRef<HTMLDivElement>(null)
  const [sideW, setSideW] = useState(readSideW)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SIDE_W_KEY, String(Math.round(sideW)))
    } catch {
      /* storage blocked — width just won't be remembered */
    }
  }, [sideW])

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    if (!grid) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const rect = grid.getBoundingClientRect()
      // Keep at least ~420px for the chart; side panels between 300px and 65% of the area.
      const max = Math.max(MIN_SIDE_W, Math.min(rect.width * 0.65, rect.width - 420))
      const w = rect.right - 8 - ev.clientX - 4
      setSideW(Math.min(max, Math.max(MIN_SIDE_W, w)))
    }
    const end = () => {
      setDragging(false)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  return (
    <div className="flex h-full">
      {/* Left rail — watchlist + UAE gold (xl only) */}
      <aside className="hidden w-56 shrink-0 flex-col gap-2 overflow-y-auto scrollbar-thin border-r border-white/[0.05] p-2 xl:flex">
        <div className="panel flex-1 overflow-hidden p-0">
          <Watchlist />
        </div>
        <UaeGoldPanel />
      </aside>

      {/* Main grid */}
      <div className="h-full flex-1 overflow-y-auto scrollbar-thin lg:overflow-hidden">
        <div
          ref={gridRef}
          style={{ '--side-w': `${sideW}px` } as CSSProperties}
          className="relative flex flex-col gap-2 p-2 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_var(--side-w)] lg:grid-rows-[minmax(0,1fr)_244px]"
        >
          {/* Drag handle between the chart and the side panels (desktop only) */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize the side panels (double-click to reset)"
            title="Drag to resize · double-click to reset"
            onPointerDown={startDrag}
            onDoubleClick={() => setSideW(DEFAULT_SIDE_W)}
            className={`group absolute inset-y-2 z-20 hidden w-3 cursor-col-resize touch-none justify-center lg:flex ${dragging ? 'is-dragging' : ''}`}
            style={{ right: sideW + 6 }}
          >
            <div className="h-full w-px bg-white/[0.06] transition-colors group-hover:bg-gold-400/60 group-[.is-dragging]:bg-gold-300" />
            <div className="absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-full bg-white/15 transition-colors group-hover:bg-gold-400/80 group-[.is-dragging]:bg-gold-300" />
          </div>
          {/* Chart */}
          <div className="order-1 h-[56vh] min-h-0 lg:col-start-1 lg:row-start-1 lg:h-auto">
            {loading && !analysis ? <ChartSkeleton /> : <ChartCard analysis={analysis} liveCandle={liveCandle} price={price} lastTick={lastTick} recalcReason={recalcReason} />}
          </div>

          {/* Right analysis stack */}
          <aside className="order-2 flex flex-col gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto lg:pr-0.5 scrollbar-thin">
            {analysis && (
              <>
                <ChecklistPanel analysis={analysis} price={price} />
                <EntryConfirmPanel analysis={analysis} price={price} />
                <SignalPanel analysis={analysis} />
                <MoveTrackerPanel analysis={analysis} price={price} />
                <MarketStrengthPanel analysis={analysis} />
                <ScenarioPanel analysis={analysis} />
                <PatternPanel analysis={analysis} />
                <TradeSetupPanel analysis={analysis} />
                <ExplainPanel analysis={analysis} />
              </>
            )}
          </aside>

          {/* Bottom insight strip */}
          <div className="order-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:grid-cols-4 lg:overflow-hidden">
            {analysis && (
              <>
                <div className="min-h-0 overflow-y-auto scrollbar-thin">
                  <MultiTimeframePanel analysis={analysis} />
                </div>
                <div className="min-h-0 overflow-y-auto scrollbar-thin">
                  <HistoricalPanel analysis={analysis} />
                </div>
                <div className="min-h-0 overflow-y-auto scrollbar-thin">
                  <MomentumPanel analysis={analysis} />
                </div>
                <div className="min-h-0 overflow-y-auto scrollbar-thin">
                  <EventRiskPanel />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="panel sheen relative flex h-full items-center justify-center overflow-hidden">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-300" />
        <div className="text-[12px] text-ink-400">Reading market structure…</div>
      </div>
    </div>
  )
}
