import { useEffect, useRef } from 'react'
import type { Timeframe, TradingStyle } from '@/types/market'
import { TIMEFRAME_LABEL } from '@/types/market'
import { analyze } from '@/lib/analyze'
import { useAppStore, GRADE_RANK, type AlertRules } from '@/store/appStore'
import { useSignalsStore, type CompactSignal } from '@/store/signalsStore'
import type { SignalReport } from '@/lib/engines/signal'

/* ============================================================
   useWatchlistScanner

   Quietly evaluates every watchlist asset on the current
   timeframe/style so the app knows where the opportunities are —
   powering the watchlist badges and the opportunities list, and
   raising a "time to buy" alert for ANY watchlist market that
   matches the user's rules, even one they aren't looking at.

   The current symbol's own alert is owned by SignalNotifier
   (on the user's exact timeframe); the scanner skips notifying
   it to avoid duplicates.
   ============================================================ */

function passesRules(sig: SignalReport, rules: AlertRules): boolean {
  if (sig.action === 'WAIT') return false
  if (rules.direction === 'buy' && sig.action !== 'BUY') return false
  if (rules.direction === 'sell' && sig.action !== 'SELL') return false
  return GRADE_RANK[sig.grade] >= GRADE_RANK[rules.minGrade]
}

export function useWatchlistScanner() {
  const watchlist = useAppStore((s) => s.watchlist)
  const timeframe = useAppStore((s) => s.timeframe)
  const style = useAppStore((s) => s.style)

  // Read-but-don't-retrigger values via refs.
  const currentSymbol = useAppStore((s) => s.symbol)
  const notifyEnabled = useAppStore((s) => s.notifyEnabled)
  const alertRules = useAppStore((s) => s.alertRules)
  const ref = useRef({ currentSymbol, notifyEnabled, alertRules })
  ref.current = { currentSymbol, notifyEnabled, alertRules }

  const setWatchlistSignal = useSignalsStore((s) => s.setWatchlistSignal)
  const pushToast = useSignalsStore((s) => s.pushToast)
  const lastKeys = useRef<Record<string, string>>({})

  useEffect(() => {
    let alive = true

    async function scanOne(sym: string, tf: Timeframe, st: TradingStyle) {
      try {
        const a = await analyze(sym, tf, st)
        if (!alive) return
        const sig = a.signal
        const compact: CompactSignal = {
          symbol: a.symbol,
          symbolName: a.symbolName,
          action: sig.action,
          headline: sig.headline,
          grade: sig.grade,
          score: sig.score,
          timeframe: TIMEFRAME_LABEL[tf],
          price: a.price,
          precision: a.precision,
          entryLow: sig.entryLow,
          entryHigh: sig.entryHigh,
          targets: sig.targets,
          confidence: sig.confidence,
          triggerKey: sig.triggerKey,
        }
        setWatchlistSignal(compact)

        const { currentSymbol: cur, notifyEnabled: notify, alertRules: rules } = ref.current
        // Current symbol is handled by SignalNotifier — keep baseline synced, don't double-fire.
        if (sym === cur || !notify || sig.action === 'WAIT') {
          lastKeys.current[sym] = sig.triggerKey
          return
        }
        if (sig.triggerKey === lastKeys.current[sym]) return
        lastKeys.current[sym] = sig.triggerKey
        if (!passesRules(sig, rules)) return

        const verb = sig.action === 'BUY' ? 'buy' : 'sell'
        const title = `${sig.headline} · ${a.symbol}`
        const body = `${a.symbolName} (${TIMEFRAME_LABEL[tf]}): it may be time to ${verb}. Entry ~${fmt(Math.min(sig.entryLow, sig.entryHigh), a.precision)}, ${sig.confidence}% confidence.`
        pushToast({ action: sig.action, title, body, symbol: a.symbol })
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: `aurumpulse-wl-${a.symbol}` })
        } catch {
          /* ignore */
        }
      } catch {
        /* skip this asset this cycle */
      }
    }

    async function scan() {
      // Stagger lightly so we never fire a burst of identical requests.
      for (const sym of watchlist) {
        if (!alive) return
        await scanOne(sym, timeframe, style)
      }
    }

    scan()
    const id = window.setInterval(scan, 30000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [watchlist, timeframe, style, setWatchlistSignal, pushToast])
}

function fmt(v: number, p: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p })
}
