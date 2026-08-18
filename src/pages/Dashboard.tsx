import type { LiveState } from '@/hooks/useAnalysis'
import { Watchlist } from '@/components/layout/Watchlist'
import { ChartCard } from '@/components/chart/ChartCard'
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

export function Dashboard({ live }: { live: LiveState }) {
  const { analysis, liveCandle, price, loading } = live

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
        <div className="flex flex-col gap-2 p-2 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_366px] lg:grid-rows-[minmax(0,1fr)_244px]">
          {/* Chart */}
          <div className="order-1 h-[56vh] min-h-0 lg:col-start-1 lg:row-start-1 lg:h-auto">
            {loading && !analysis ? <ChartSkeleton /> : <ChartCard analysis={analysis} liveCandle={liveCandle} price={price} />}
          </div>

          {/* Right analysis stack */}
          <aside className="order-2 flex flex-col gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto lg:pr-0.5 scrollbar-thin">
            {analysis && (
              <>
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
