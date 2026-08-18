import { create } from 'zustand'
import type { Timeframe, TradingStyle } from '@/types/market'
import { PRIMARY_ASSET, WATCHLIST_DEFAULT } from '@/lib/assets'
import type { ScenarioKey } from '@/lib/engines/forecast'

export type NavKey =
  | 'Dashboard'
  | 'Markets'
  | 'AI Scanner'
  | 'Forecast'
  | 'Historical'
  | 'Backtesting'
  | 'Watchlist'
  | 'Alerts'
  | 'Journal'
  | 'Settings'

export interface OverlayToggles {
  structure: boolean // HH/HL/LH/LL + BOS/CHoCH
  levels: boolean // support / resistance
  emas: boolean
  vwap: boolean
  bbands: boolean
  projected: boolean // Projected Pattern paths
  ghost: boolean // Ghost candles + envelope
  pattern: boolean // pattern outline
}

export type ScenarioView = ScenarioKey | 'all'

interface AppState {
  nav: NavKey
  symbol: string
  timeframe: Timeframe
  style: TradingStyle
  watchlist: string[]
  overlays: OverlayToggles
  scenarioView: ScenarioView
  chatOpen: boolean

  setNav: (n: NavKey) => void
  setSymbol: (s: string) => void
  setTimeframe: (t: Timeframe) => void
  setStyle: (s: TradingStyle) => void
  toggleOverlay: (k: keyof OverlayToggles) => void
  setScenarioView: (v: ScenarioView) => void
  toggleChat: () => void
}

const STYLE_DEFAULT_TF: Record<TradingStyle, Timeframe> = {
  SCALP: '5m',
  INTRADAY: '15m',
  SWING: '4H',
  INVEST: '1D',
}

export const useAppStore = create<AppState>((set) => ({
  nav: 'Dashboard',
  symbol: PRIMARY_ASSET,
  timeframe: '15m',
  style: 'SCALP',
  watchlist: WATCHLIST_DEFAULT,
  overlays: {
    structure: true,
    levels: true,
    emas: true,
    vwap: false,
    bbands: false,
    projected: true,
    ghost: true,
    pattern: true,
  },
  scenarioView: 'all',
  chatOpen: false,

  setNav: (nav) => set({ nav }),
  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setStyle: (style) => set({ style, timeframe: STYLE_DEFAULT_TF[style] }),
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
  setScenarioView: (scenarioView) => set({ scenarioView }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
}))
