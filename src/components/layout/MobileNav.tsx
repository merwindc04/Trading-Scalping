import { Home, LayoutGrid, ScanLine, Sparkles, Star } from 'lucide-react'
import { useAppStore, type NavKey } from '@/store/appStore'

const ITEMS: { label: string; nav?: NavKey; icon: typeof Home; chat?: boolean }[] = [
  { label: 'Home', nav: 'Dashboard', icon: Home },
  { label: 'Markets', nav: 'Markets', icon: LayoutGrid },
  { label: 'Scanner', nav: 'AI Scanner', icon: ScanLine },
  { label: 'AI', chat: true, icon: Sparkles },
  { label: 'Watchlist', nav: 'Watchlist', icon: Star },
]

export function MobileNav() {
  const { nav, setNav, toggleChat, chatOpen } = useAppStore()
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {ITEMS.map((it) => {
        const active = it.chat ? chatOpen : nav === it.nav
        const Icon = it.icon
        return (
          <button
            key={it.label}
            onClick={() => (it.chat ? toggleChat() : it.nav && setNav(it.nav))}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[9px] font-medium transition-colors ${active ? 'text-gold-200' : 'text-ink-500'}`}
          >
            <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
            {it.label}
          </button>
        )
      })}
    </nav>
  )
}
