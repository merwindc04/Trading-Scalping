import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Timeframe, TradingStyle } from '@/types/market'
import { PRIMARY_ASSET, WATCHLIST_DEFAULT } from '@/lib/assets'
import type { ScenarioKey } from '@/lib/engines/forecast'
import type { HorizonKey } from '@/lib/horizons'
import { DEFAULT_MACRO_VIEW, type MacroKey, type MacroStance, type MacroView } from '@/lib/engines/macro'

export type Purity = '24K' | '22K' | '21K' | '18K'
export const PURITY_FACTOR: Record<Purity, number> = { '24K': 0.9999, '22K': 0.916, '21K': 0.875, '18K': 0.75 }
export type ChartType = 'candles' | 'line'
export interface IntelPanelState {
  collapsed: boolean
  opacity: number // 0.35..1
  /** Offset from the chart's top-left corner, px (left side = older bars, keeps live price visible). */
  x: number
  y: number
  /** User-resized width / height in px (unset = default 300 wide, height fits content). */
  w?: number
  h?: number
}

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
  signals: boolean // BUY/SELL marker + entry line
  fib: boolean // Fibonacci retracement levels
  intel: boolean // Confidence & Signal glass panel
}

export type ScenarioView = ScenarioKey | 'all'

export type AlertGrade = 'C' | 'B' | 'A' | 'A+'
export type AlertDirection = 'both' | 'buy' | 'sell'
export interface AlertRules {
  /** Only alert on signals at or above this grade. */
  minGrade: AlertGrade
  /** Which actions to alert on. */
  direction: AlertDirection
  /** Also alert when price enters an active signal's entry zone. */
  entryZone: boolean
}

export const GRADE_RANK: Record<AlertGrade, number> = { C: 0, B: 1, A: 2, 'A+': 3 }

interface AppState {
  nav: NavKey
  symbol: string
  timeframe: Timeframe
  style: TradingStyle
  watchlist: string[]
  overlays: OverlayToggles
  scenarioView: ScenarioView
  chatOpen: boolean
  notifyEnabled: boolean
  alertRules: AlertRules
  horizon: HorizonKey
  purity: Purity
  chartType: ChartType
  macroView: MacroView
  intelPanel: IntelPanelState

  setNav: (n: NavKey) => void
  setSymbol: (s: string) => void
  setTimeframe: (t: Timeframe) => void
  setStyle: (s: TradingStyle) => void
  toggleOverlay: (k: keyof OverlayToggles) => void
  setScenarioView: (v: ScenarioView) => void
  toggleChat: () => void
  setNotify: (v: boolean) => void
  setAlertRules: (patch: Partial<AlertRules>) => void
  addToWatchlist: (s: string) => void
  removeFromWatchlist: (s: string) => void
  setHorizon: (h: HorizonKey, tf?: Timeframe) => void
  setPurity: (p: Purity) => void
  setChartType: (t: ChartType) => void
  setMacro: (k: MacroKey, v: MacroStance) => void
  setIntelPanel: (patch: Partial<IntelPanelState>) => void
}

const STYLE_DEFAULT_TF: Record<TradingStyle, Timeframe> = {
  SCALP: '5m',
  INTRADAY: '15m',
  SWING: '4H',
  INVEST: '1D',
}

const DEFAULT_OVERLAYS: OverlayToggles = {
  structure: true,
  levels: true,
  emas: true,
  vwap: false,
  bbands: false,
  projected: true,
  ghost: true,
  pattern: true,
  signals: true,
  fib: false,
  intel: true,
}

const DEFAULT_ALERT_RULES: AlertRules = { minGrade: 'B', direction: 'both', entryZone: false }
const DEFAULT_INTEL: IntelPanelState = { collapsed: false, opacity: 0.86, x: 12, y: 60 }

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      nav: 'Dashboard',
      symbol: PRIMARY_ASSET,
      timeframe: '15m',
      style: 'SCALP',
      watchlist: WATCHLIST_DEFAULT,
      overlays: DEFAULT_OVERLAYS,
      scenarioView: 'all',
      chatOpen: false,
      notifyEnabled: false,
      alertRules: DEFAULT_ALERT_RULES,
      horizon: 'auto',
      purity: '24K',
      chartType: 'candles',
      macroView: DEFAULT_MACRO_VIEW,
      intelPanel: DEFAULT_INTEL,

      setNav: (nav) => set({ nav }),
      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setStyle: (style) => set({ style, timeframe: STYLE_DEFAULT_TF[style], horizon: 'auto' }),
      setHorizon: (horizon, tf) => set(tf ? { horizon, timeframe: tf } : { horizon }),
      setPurity: (purity) => set({ purity }),
      setChartType: (chartType) => set({ chartType }),
      setMacro: (k, v) => set((s) => ({ macroView: { ...s.macroView, [k]: v } })),
      setIntelPanel: (patch) => set((s) => ({ intelPanel: { ...s.intelPanel, ...patch } })),
      toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
      setScenarioView: (scenarioView) => set({ scenarioView }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      setNotify: (notifyEnabled) => set({ notifyEnabled }),
      setAlertRules: (patch) => set((s) => ({ alertRules: { ...s.alertRules, ...patch } })),
      addToWatchlist: (sym) => set((s) => (s.watchlist.includes(sym) ? s : { watchlist: [...s.watchlist, sym] })),
      removeFromWatchlist: (sym) => set((s) => ({ watchlist: s.watchlist.filter((x) => x !== sym) })),
    }),
    {
      name: 'aurumpulse',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist user preferences only — never transient UI like the chat drawer.
      partialize: (s) => ({
        nav: s.nav,
        symbol: s.symbol,
        timeframe: s.timeframe,
        style: s.style,
        watchlist: s.watchlist,
        overlays: s.overlays,
        scenarioView: s.scenarioView,
        notifyEnabled: s.notifyEnabled,
        alertRules: s.alertRules,
        horizon: s.horizon,
        purity: s.purity,
        chartType: s.chartType,
        macroView: s.macroView,
        intelPanel: s.intelPanel,
      }),
      // Deep-merge so newly-added overlay/rule keys keep their defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return {
          ...current,
          ...p,
          overlays: { ...DEFAULT_OVERLAYS, ...(p.overlays ?? {}) },
          alertRules: { ...DEFAULT_ALERT_RULES, ...(p.alertRules ?? {}) },
          macroView: { ...DEFAULT_MACRO_VIEW, ...(p.macroView ?? {}) },
          intelPanel: { ...DEFAULT_INTEL, ...(p.intelPanel ?? {}) },
        }
      },
    },
  ),
)
