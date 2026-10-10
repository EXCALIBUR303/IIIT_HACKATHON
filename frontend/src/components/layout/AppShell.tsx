import { animate, stagger } from 'animejs'
import { BarChart3, BookOpen, ClipboardCheck, Landmark, Coins, Home, LineChart, LogOut, Menu, Settings, Users, Wrench, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { TutorButton } from '@/features/tutor/TutorPanel'
import { useAnime, useScrollReveal } from '@/lib/anime'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/en'
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
  { items: [{ to: '/app/settings', label: 'nav.settings', icon: Settings }] },
]

const EDUCATOR_NAV: NavGroup[] = [
  {
    items: [
      { to: '/educator', label: 'nav.educator', icon: Users, end: true },
      { to: '/educator/settings', label: 'nav.settings', icon: Settings },
    ],
  },
]

function NavLinks({ groups, onNavigate, id }: { groups: NavGroup[]; onNavigate?: () => void; id: string }) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && (
            <p className="nav-in mb-1.5 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted">{g.title}</p>
          )}
          <ul className="space-y-0.5">
            {g.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to} className="nav-in">
                <NavLink to={to} end={end} onClick={onNavigate} className="group relative block rounded-xl outline-offset-2">
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId={`nav-active-${id}`}
                          className="absolute inset-0 rounded-xl bg-primary-soft"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        >
                          <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" />
                        </motion.span>
                      )}
                      <span
                        className={cn(
                          'relative flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors',
                          isActive ? 'text-primary' : 'text-ink-soft group-hover:text-ink',
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-7 place-items-center rounded-lg transition-all duration-300 group-hover:-rotate-6 group-hover:scale-110',
                            isActive ? 'bg-white text-primary shadow-sm' : 'bg-transparent group-hover:bg-canvas',
                          )}
                        >
                          <Icon className="size-[17px]" aria-hidden />
                        </span>
                        {t(label)}
                        {isActive && <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden />}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** A "practice note" that reminds students every rupee here is pretend. */
function PracticeNote() {
  const { t } = useI18n()
  return (
    <div className="nav-in relative mb-4 overflow-hidden rounded-xl border border-dashed border-primary/30 bg-canvas p-4">
      <span
        className="absolute right-2 top-2.5 rotate-12 rounded-md border-2 border-accent/60 px-2 py-0.5 font-mono text-[10px] font-black tracking-widest text-accent-ink"
        aria-hidden
      >
        ₹ PRACTICE
      </span>
      <p className="pr-20 text-sm font-bold leading-snug text-ink">{t('common.fictional')}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">Every rupee here is pretend. Mistakes cost nothing, so experiment.</p>
    </div>
  )
}

function UserCard({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth()
  const { t } = useI18n()
  if (!user) return null
  return (
    <div className="nav-in flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <span
        className="inline-flex size-9 items-center justify-center rounded-full bg-[#14123a] text-sm font-bold text-white ring-2 ring-primary-100"
        aria-hidden
      >
        {user.display_name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.display_name}</p>
        <p className="text-xs capitalize text-muted">{user.role}</p>
      </div>
      <button
        onClick={onSignOut}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger-ink"
        aria-label={t('nav.signOut')}
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
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const groups = role === 'student' ? STUDENT_NAV : EDUCATOR_NAV
  const home = groups[0].items[0].to
  const asideRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  useAnime(
    asideRef,
    () => {
      animate('.nav-in', { opacity: { from: 0 }, x: { from: -14 }, delay: stagger(35, { start: 120 }), duration: 550, ease: 'outExpo' })
    },
    [],
  )
  useScrollReveal(mainRef, pathname)

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
      <aside ref={asideRef} className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
        <Link to={home} className="nav-in mb-7 px-2 pt-1">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex-1">
          <NavLinks groups={groups} id="desktop" />
        </nav>
        {role === 'student' && <PracticeNote />}
        <UserCard onSignOut={handleSignOut} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link to={home}>
          <Logo size={30} />
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-ink hover:bg-canvas"
          aria-label={t('nav.menu')}
          aria-expanded={open}
        >
          <Menu className="size-6" />
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
            <motion.div
              className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="absolute inset-y-0 right-0 flex w-72 flex-col overflow-y-auto bg-surface p-4 shadow-2xl"
              initial={reduce ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reduce ? undefined : { x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <Logo size={28} />
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-canvas" aria-label="Close menu">
                  <X className="size-5" />
                </button>
              </div>
              <nav aria-label="Main" className="flex-1">
                <NavLinks groups={groups} id="mobile" onNavigate={() => setOpen(false)} />
              </nav>
              <UserCard onSignOut={handleSignOut} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main" ref={mainRef} className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
      {role === 'student' && <TutorButton />}
    </div>
  )
}

export function PublicShell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-canvas">{children}</div>
}
