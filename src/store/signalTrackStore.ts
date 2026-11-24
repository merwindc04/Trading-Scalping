import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/* ============================================================
   Signal tracker — remembers the BUY/SELL the app showed for each
   market + timeframe (+ gold purity) and follows it live:
   how far price has moved since the signal, how much of the way
   to the target it has travelled, and how far the stop is.

   Kept in its own localStorage key so it never touches the main
   settings store. Outcomes are judged on live ticks only (no
   historical high/low back-fill), which the UI says plainly.
   ============================================================ */

export type TrackStatus = 'open' | 'target' | 'stopped' | 'expired'

export interface SignalTrack {
  key: string
  action: 'BUY' | 'SELL'
  entry: number
  stop: number
  target: number
  openedAt: number
  /** Forecast period the signal was made for (ms); after it, the track expires. */
  horizonMs: number
  status: TrackStatus
  closedAt?: number
  closePrice?: number
  /** Best and worst move seen while open, % in the signal's favour. */
  bestPct: number
  worstPct: number
}

interface State {
  tracks: Record<string, SignalTrack>
  open: (t: Omit<SignalTrack, 'status' | 'bestPct' | 'worstPct'>) => void
  tick: (key: string, price: number, now: number) => void
}

/** Signed % move in the signal's favour (positive = going the right way). */
export function favourPct(t: Pick<SignalTrack, 'action' | 'entry'>, price: number): number {
  const raw = (price / t.entry - 1) * 100
  return t.action === 'BUY' ? raw : -raw
}

export const useSignalTrackStore = create<State>()(
  persist(
    (set, get) => ({
      tracks: {},
      open: (t) => set((s) => ({ tracks: { ...s.tracks, [t.key]: { ...t, status: 'open', bestPct: 0, worstPct: 0 } } })),
      tick: (key, price, now) => {
        const t = get().tracks[key]
        if (!t || t.status !== 'open' || !(price > 0)) return
        const fav = favourPct(t, price)
        const hitTarget = t.action === 'BUY' ? price >= t.target : price <= t.target
        const hitStop = t.action === 'BUY' ? price <= t.stop : price >= t.stop
        const expired = now - t.openedAt > t.horizonMs
        const status: TrackStatus = hitStop ? 'stopped' : hitTarget ? 'target' : expired ? 'expired' : 'open'
        const bestPct = Math.max(t.bestPct, fav)
        const worstPct = Math.min(t.worstPct, fav)
        if (status === 'open' && bestPct === t.bestPct && worstPct === t.worstPct) return
        set((s) => ({
          tracks: {
            ...s.tracks,
            [key]: { ...t, status, bestPct, worstPct, ...(status !== 'open' ? { closedAt: now, closePrice: price } : {}) },
          },
        }))
      },
    }),
    { name: 'aurumpulse-signal-track', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
