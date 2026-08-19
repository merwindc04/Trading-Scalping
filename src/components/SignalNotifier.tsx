import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, X, BellRing } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import type { SignalAction } from '@/lib/engines/signal'
import { useAppStore } from '@/store/appStore'
import { fmt } from '@/lib/format'

/* ============================================================
   SignalNotifier

   Watches the live signal. When it turns actionable (BUY / SELL)
   and the user has opted in, it raises an in-app toast and — if
   the browser granted permission — a native notification:
   "it's time to buy". Opt-in only; never fires on WAIT.
   ============================================================ */

interface Toast {
  id: number
  action: SignalAction
  title: string
  body: string
}

let toastSeq = 1

export function SignalNotifier({ analysis }: { analysis: Analysis | null }) {
  const { notifyEnabled } = useAppStore()
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastKey = useRef<string>('')

  const sig = analysis?.signal
  const triggerKey = sig?.triggerKey ?? ''

  useEffect(() => {
    if (!analysis || !sig) return
    if (!notifyEnabled) {
      // Keep the baseline in sync so enabling later doesn't replay an old state.
      lastKey.current = triggerKey
      return
    }
    if (sig.action === 'WAIT') {
      lastKey.current = triggerKey
      return
    }
    if (triggerKey === lastKey.current) return
    lastKey.current = triggerKey

    const verb = sig.action === 'BUY' ? 'buy' : 'sell'
    const title = `${sig.headline} · ${analysis.symbol}`
    const entry = fmt(Math.min(sig.entryLow, sig.entryHigh), analysis.precision)
    const target = fmt(sig.targets[Math.min(1, sig.targets.length - 1)], analysis.precision)
    const body = `${analysis.symbolName}: it may be time to ${verb}. Entry ~${entry}, target ${target}, ${sig.confidence}% confidence.`

    // In-app toast
    const id = toastSeq++
    setToasts((t) => [{ id, action: sig.action, title, body }, ...t].slice(0, 3))
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 14000)

    // Native notification (best-effort)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, tag: `aurumpulse-${analysis.symbol}` })
      }
    } catch {
      /* ignore */
    }
  }, [triggerKey, notifyEnabled, analysis, sig])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-2 top-16 z-[60] flex w-[min(340px,calc(100vw-1rem))] flex-col gap-2 sm:right-3">
      {toasts.map((t) => {
        const buy = t.action === 'BUY'
        const color = buy ? 'var(--color-bull-400)' : 'var(--color-bear-400)'
        const soft = buy ? 'color-mix(in oklab, var(--color-bull-500) 18%, transparent)' : 'color-mix(in oklab, var(--color-bear-500) 18%, transparent)'
        const Icon = buy ? TrendingUp : TrendingDown
        return (
          <div
            key={t.id}
            className="glass pointer-events-auto fade-up flex items-start gap-2.5 rounded-xl p-3"
            style={{ boxShadow: `0 0 0 1px ${soft}, 0 18px 44px -20px ${color}` }}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: soft, color }}>
              <Icon size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <BellRing size={11} style={{ color }} />
                <span className="text-[12px] font-bold" style={{ color }}>
                  {t.title}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-300">{t.body}</p>
            </div>
            <button onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} className="text-ink-500 hover:text-ink-200">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
