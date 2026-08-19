import { TopNav } from '@/components/layout/TopNav'
import { MobileNav } from '@/components/layout/MobileNav'
import { AIChat } from '@/components/AIChat'
import { SignalNotifier } from '@/components/SignalNotifier'
import { Dashboard } from '@/pages/Dashboard'
import { Scanner } from '@/pages/Scanner'
import { ForecastPage, HistoricalPage, MarketsPage, AlertsPage, BacktestingPage, JournalPage, WatchlistPage, SettingsPage } from '@/pages/OtherPages'
import { useAppStore } from '@/store/appStore'
import { useAnalysis } from '@/hooks/useAnalysis'

export default function App() {
  const { nav, symbol, timeframe, style } = useAppStore()
  const live = useAnalysis(symbol, timeframe, style)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopNav price={live.price} changePct={live.analysis?.changePct ?? null} source={live.source} />

      <main className="relative min-h-0 flex-1 pb-16 lg:pb-0">
        <div className="fade-up h-full" key={nav}>
          {nav === 'Dashboard' && <Dashboard live={live} />}
          {nav === 'AI Scanner' && <Scanner />}
          {nav === 'Forecast' && <ForecastPage live={live} />}
          {nav === 'Historical' && <HistoricalPage live={live} />}
          {nav === 'Markets' && <MarketsPage />}
          {nav === 'Backtesting' && <BacktestingPage />}
          {nav === 'Watchlist' && <WatchlistPage />}
          {nav === 'Alerts' && <AlertsPage live={live} />}
          {nav === 'Journal' && <JournalPage />}
          {nav === 'Settings' && <SettingsPage />}
        </div>
      </main>

      <AIChat analysis={live.analysis} />
      <SignalNotifier analysis={live.analysis} />
      <MobileNav />
      <Disclaimer />
    </div>
  )
}

function Disclaimer() {
  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-20 hidden -translate-x-1/2 lg:bottom-1 lg:block">
      <p className="rounded-full bg-base-900/60 px-3 py-1 text-center text-[9px] text-ink-500 backdrop-blur">
        AurumPulse AI provides analytical & educational insights. Forecasts are probabilistic — not guarantees or personalised financial advice.
      </p>
    </div>
  )
}
