import { BarChart3, BookOpen, ClipboardCheck, Coins, Home, LineChart, LogOut, Menu, Settings, Sparkles, Users, Wrench, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { TutorButton } from '@/features/tutor/TutorPanel'
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

const STUDENT_NAV: NavItem[] = [
  { to: '/app', label: 'nav.home', icon: Home, end: true },
  { to: '/app/learn', label: 'nav.learn', icon: BookOpen },
  { to: '/app/explore', label: 'nav.practice', icon: Wrench },
  { to: '/app/assessments', label: 'nav.assessments', icon: ClipboardCheck },
  { to: '/app/progress', label: 'nav.progress', icon: BarChart3 },
  { to: '/app/wallet', label: 'nav.wallet', icon: Coins },
  { to: '/app/portfolio', label: 'nav.portfolio', icon: LineChart },
  { to: '/app/settings', label: 'nav.settings', icon: Settings },
]

const EDUCATOR_NAV: NavItem[] = [
  { to: '/educator', label: 'nav.educator', icon: Users, end: true },
  { to: '/educator/settings', label: 'nav.settings', icon: Settings },
]

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const { t } = useI18n()
  return (
    <ul className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-primary-soft text-primary' : 'text-ink-soft hover:bg-canvas hover:text-ink',
              )
            }
          >
            <Icon className="size-[18px]" aria-hidden />
            {t(label)}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function UserCard({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth()
  const { t } = useI18n()
  if (!user) return null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white" aria-hidden>
        {user.display_name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.display_name}</p>
        <p className="text-xs capitalize text-muted">{user.role}</p>
      </div>
      <button onClick={onSignOut} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" aria-label={t('nav.signOut')}>
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

export function AppShell({ role }: { role: 'student' | 'educator' }) {
  const { signOut } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const items = role === 'student' ? STUDENT_NAV : EDUCATOR_NAV
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface p-4 lg:flex">
        <Link to={items[0].to} className="mb-8 px-2 pt-1">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex-1">
          <NavLinks items={items} />
        </nav>
        {role === 'student' && (
          <div className="mb-4 rounded-xl bg-gradient-to-br from-primary-soft to-accent-soft p-4">
            <Sparkles className="mb-2 size-5 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-primary-ink">{t('common.fictional')}</p>
            <p className="mt-1 text-xs text-ink-soft">Every rupee here is pretend. Mistakes cost nothing, so experiment.</p>
          </div>
        )}
        <UserCard onSignOut={handleSignOut} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link to={items[0].to}>
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

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-surface p-4 shadow-2xl">
            <div className="mb-6 flex justify-end">
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-canvas" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </nav>
            <UserCard onSignOut={handleSignOut} />
          </div>
        </div>
      )}

      <main id="main" className="lg:pl-64">
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
