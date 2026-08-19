import { TrendingUp, TrendingDown, X, BellRing } from 'lucide-react'
import { useSignalsStore } from '@/store/signalsStore'
import { useAppStore } from '@/store/appStore'

/* Renders the shared toast queue (current-asset notifier + watchlist scanner). */
export function Toaster() {
  const toasts = useSignalsStore((s) => s.toasts)
  const dismiss = useSignalsStore((s) => s.dismissToast)
  const setSymbol = useAppStore((s) => s.setSymbol)
  const setNav = useAppStore((s) => s.setNav)

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
            role={t.symbol ? 'button' : undefined}
            onClick={() => {
              if (t.symbol) {
                setSymbol(t.symbol)
                setNav('Dashboard')
              }
              dismiss(t.id)
            }}
            className={`glass fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl p-3 ${t.symbol ? 'cursor-pointer' : ''}`}
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
            <button
              onClick={(e) => {
                e.stopPropagation()
                dismiss(t.id)
              }}
              className="text-ink-500 hover:text-ink-200"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
