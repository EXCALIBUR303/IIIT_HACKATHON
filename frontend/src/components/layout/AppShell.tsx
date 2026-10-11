import { BarChart3, BookOpen, ClipboardCheck, Coins, Home, Landmark, LineChart, LogOut, Menu, Settings, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { TutorButton } from '@/features/tutor/TutorPanel'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/en'
import { EASE_OUT, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: MessageKey
  icon: typeof Home
  end?: boolean
}

interface NavGroup {
  title?: string
  items: NavItem[]
}

const STUDENT_NAV: NavGroup[] = [
  {
    title: 'Learn',
    items: [
      { to: '/app', label: 'nav.home', icon: Home, end: true },
      { to: '/app/learn', label: 'nav.learn', icon: BookOpen },
      { to: '/app/explore', label: 'nav.practice', icon: Wrench },
      { to: '/app/assessments', label: 'nav.assessments', icon: ClipboardCheck },
      { to: '/app/progress', label: 'nav.progress', icon: BarChart3 },
    ],
  },
  {
    title: 'Practice money',
    items: [
      { to: '/app/wallet', label: 'nav.wallet', icon: Coins },
      { to: '/app/portfolio', label: 'nav.portfolio', icon: LineChart },
      { to: '/app/banking', label: 'nav.banking', icon: Landmark },
    ],
  },
]

const EDUCATOR_NAV: NavGroup[] = [{ items: [{ to: '/educator', label: 'nav.educator', icon: Users, end: true }] }]

function NavItemLink({ item, id, onNavigate }: { item: NavItem; id: string; onNavigate?: () => void }) {
  const { t } = useI18n()
  const { to, label, icon: Icon, end } = item
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className="group relative block rounded-lg outline-offset-1">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId={`nav-active-${id}`} className="absolute inset-0 rounded-lg bg-surface shadow-[var(--shadow-card)] ring-1 ring-line" transition={SPRING}>
              <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-primary" />
            </motion.span>
          )}
          <span
            className={cn(
              'relative flex items-center gap-2.5 px-2.5 py-2 text-[0.85rem] font-semibold transition-colors duration-150',
              isActive ? 'text-ink' : 'text-ink-soft group-hover:text-ink',
            )}
          >
            <Icon
              className={cn('size-[17px] shrink-0 transition-colors duration-150', isActive ? 'text-primary' : 'text-muted group-hover:text-ink-soft')}
              strokeWidth={isActive ? 2.4 : 2}
              aria-hidden
            />
            {t(label)}
          </span>
        </>
      )}
    </NavLink>
  )
}

function NavLinks({ groups, onNavigate, id }: { groups: NavGroup[]; onNavigate?: () => void; id: string }) {
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="mb-1.5 px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavItemLink item={item} id={id} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Always-visible reminder that every rupee here is pretend, set into the sidebar's footer. */
function PracticeMode() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface/70 p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden>
        <ShieldCheck className="size-4" />
      </span>
      <p className="text-xs leading-snug text-muted">
        <span className="block font-bold text-ink">Practice mode</span>
        All money is fictional. Mistakes cost nothing.
      </p>
    </div>
  )
}

function UserRow({ onSignOut, settingsTo, onNavigate }: { onSignOut: () => void; settingsTo: string; onNavigate?: () => void }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const { pathname } = useLocation()
  if (!user) return null
  const onSettings = pathname.startsWith(settingsTo)
  return (
    <div className="flex items-center gap-1 rounded-xl p-1">
      <Link
        to={settingsTo}
        onClick={onNavigate}
        aria-current={onSettings ? 'page' : undefined}
        className={cn('group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-surface', onSettings && 'bg-surface ring-1 ring-line')}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white" aria-hidden>
          {user.display_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{user.display_name}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Settings className="size-3" aria-hidden /> {t('nav.settings')}
          </span>
        </span>
      </Link>
      <button
        onClick={onSignOut}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger-ink"
        aria-label={t('nav.signOut')}
        title={t('nav.signOut')}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

export function AppShell({ role }: { role: 'student' | 'educator' }) {
  const { signOut } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const groups = role === 'student' ? STUDENT_NAV : EDUCATOR_NAV
  const home = groups[0].items[0].to
  const settingsTo = role === 'student' ? '/app/settings' : '/educator/settings'

  const handleSignOut = () => {
    signOut()
    navigate('/')
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow">
        {t('nav.skip')}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-canvas-deep/40 lg:flex">
        <Link to={home} className="mx-5 mb-6 mt-5 self-start rounded-lg">
          <Logo size={30} />
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
          <NavLinks groups={groups} id="desktop" />
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          {role === 'student' && <PracticeMode />}
          <UserRow onSignOut={handleSignOut} settingsTo={settingsTo} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link to={home}>
          <Logo size={28} />
        </Link>
        <button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-ink hover:bg-canvas" aria-label={t('nav.menu')} aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
            <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-canvas shadow-2xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <div className="flex items-center justify-between px-5 py-4">
                <Logo size={26} />
                <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-surface" aria-label="Close menu">
                  <X className="size-5" />
                </button>
              </div>
              <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
                <NavLinks groups={groups} id="mobile" onNavigate={() => setOpen(false)} />
              </nav>
              <div className="space-y-2 border-t border-line p-3">
                {role === 'student' && <PracticeMode />}
                <UserRow onSignOut={handleSignOut} settingsTo={settingsTo} onNavigate={() => setOpen(false)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main" className="dash-canvas lg:pl-60">
        {/* Route transition: a short fade and rise. Under reduced motion only the fade remains. */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
          className="relative z-[1] mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-9"
        >
          <Outlet />
        </motion.div>
      </main>
      {role === 'student' && <TutorButton />}
    </div>
  )
}

export function PublicShell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-canvas">{children}</div>
}
