import { create } from 'zustand'
import type { SignalAction } from '@/lib/engines/signal'

/* ============================================================
   signalsStore — shared alert surface.

   Holds the compact per-asset signal from the background
   watchlist scanner (for badges + the opportunities list) and
   the toast queue that both the current-asset notifier and the
   scanner push into.
   ============================================================ */

export interface CompactSignal {
  symbol: string
  symbolName: string
  action: SignalAction
  headline: string
  grade: 'A+' | 'A' | 'B' | 'C'
  score: number
  timeframe: string
  price: number
  precision: number
  entryLow: number
  entryHigh: number
  targets: number[]
  confidence: number
  triggerKey: string
}

export interface Toast {
  id: number
  action: 'BUY' | 'SELL'
  title: string
  body: string
  symbol?: string
}

interface SignalsState {
  toasts: Toast[]
  watchlistSignals: Record<string, CompactSignal>
  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  setWatchlistSignal: (s: CompactSignal) => void
}

let seq = 1

export const useSignalsStore = create<SignalsState>((set) => ({
  toasts: [],
  watchlistSignals: {},
  pushToast: (t) => {
    const id = seq++
    set((s) => ({ toasts: [{ ...t, id }, ...s.toasts].slice(0, 4) }))
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 14000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setWatchlistSignal: (sig) => set((s) => ({ watchlistSignals: { ...s.watchlistSignals, [sig.symbol]: sig } })),
}))
