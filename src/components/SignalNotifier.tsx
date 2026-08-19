import { useEffect, useRef } from 'react'
import type { Analysis } from '@/lib/analyze'
import { useAppStore, GRADE_RANK } from '@/store/appStore'
import { useSignalsStore } from '@/store/signalsStore'
import type { SignalReport } from '@/lib/engines/signal'
import { fmt } from '@/lib/format'

/* ============================================================
   SignalNotifier (logic only)

   Watches the CURRENT asset's signal on the user's exact
   timeframe and raises a toast + native notification when it
   turns actionable and matches the alert rules. Also handles
   the optional entry-zone trigger. Toasts render via <Toaster/>.
   ============================================================ */

export function SignalNotifier({ analysis }: { analysis: Analysis | null }) {
  const { notifyEnabled, alertRules } = useAppStore()
  const pushToast = useSignalsStore((s) => s.pushToast)
  const lastKey = useRef<string>('')
  const zoneState = useRef<{ symbol: string; inZone: boolean }>({ symbol: '', inZone: false })

  const sig = analysis?.signal
  const triggerKey = sig?.triggerKey ?? ''

  function passesRules(s: SignalReport): boolean {
    if (alertRules.direction === 'buy' && s.action !== 'BUY') return false
    if (alertRules.direction === 'sell' && s.action !== 'SELL') return false
    return GRADE_RANK[s.grade] >= GRADE_RANK[alertRules.minGrade]
  }

  function fire(action: 'BUY' | 'SELL', title: string, body: string, symbol: string, tag: string) {
    pushToast({ action, title, body, symbol })
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag })
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!analysis || !sig) return
    const consume = () => (lastKey.current = triggerKey)

    if (!notifyEnabled || sig.action === 'WAIT') {
      consume()
      zoneState.current = { symbol: analysis.symbol, inZone: false }
      return
    }

    // ---- Entry-zone trigger (optional) ----
    if (alertRules.entryZone && passesRules(sig)) {
      const lo = Math.min(sig.entryLow, sig.entryHigh)
      const hi = Math.max(sig.entryLow, sig.entryHigh)
      const inZone = analysis.price >= lo && analysis.price <= hi
      const prev = zoneState.current
      const wasInZone = prev.symbol === analysis.symbol && prev.inZone
      if (inZone && !wasInZone) {
        const verb = sig.action === 'BUY' ? 'buy' : 'sell'
        fire(
          sig.action,
          `Entry zone · ${analysis.symbol}`,
          `${analysis.symbolName}: price entered the ${verb} zone (${fmt(lo, analysis.precision)}–${fmt(hi, analysis.precision)}). ${sig.headline} setup active.`,
          analysis.symbol,
          `aurumpulse-zone-${analysis.symbol}`,
        )
      }
      zoneState.current = { symbol: analysis.symbol, inZone }
    } else {
      zoneState.current = { symbol: analysis.symbol, inZone: false }
    }

    // ---- Signal-flip trigger ----
    if (triggerKey === lastKey.current) return
    consume()
    if (!passesRules(sig)) return

    const verb = sig.action === 'BUY' ? 'buy' : 'sell'
    const entry = fmt(Math.min(sig.entryLow, sig.entryHigh), analysis.precision)
    const target = fmt(sig.targets[Math.min(1, sig.targets.length - 1)], analysis.precision)
    fire(
      sig.action,
      `${sig.headline} · ${analysis.symbol}`,
      `${analysis.symbolName}: it may be time to ${verb}. Entry ~${entry}, target ${target}, ${sig.confidence}% confidence.`,
      analysis.symbol,
      `aurumpulse-${analysis.symbol}`,
    )
  }, [triggerKey, notifyEnabled, alertRules, analysis, sig])

  return null
}
