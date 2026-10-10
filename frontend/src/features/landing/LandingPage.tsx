import { ArrowRight, CheckCircle2, GraduationCap, Languages, Lock, RefreshCw, Shuffle, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { PILLAR_ORDER, PILLARS, PillarIcon } from '@/components/common/pillars'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { inr } from '@/lib/format'
import { LANGUAGES, useI18n } from '@/lib/i18n'
import { homeFor } from '@/components/layout/guards'

/**
 * A real (client-side) teaser of the budget simulator: Meera's ₹2,000 with
 * fixed needs of ₹1,349. The full, scored simulation runs on the server.
 */
function BudgetTeaser() {
  const income = 2000
  const needs = 1349
  const [savings, setSavings] = useState(300)
  const [wants, setWants] = useState(250)
  const free = income - needs
  const clampedWants = Math.min(wants, free - savings)
  const buffer = free - savings - clampedWants
  const months = savings > 0 ? Math.ceil(1200 / savings) : null

  const ranges = [
    { id: 'teaser-save', label: 'Savings', value: savings, max: free, color: 'var(--color-saving)', set: (v: number) => { setSavings(v); setWants((w) => Math.min(w, free - v)) } },
    { id: 'teaser-wants', label: 'Wants (outings, games)', value: clampedWants, max: free - savings, color: 'var(--color-warning)', set: setWants },
  ]

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-raised)] sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Try it · 10 seconds</p>
          <p className="mt-1 font-bold">Meera has {inr(income)} this month</p>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">Fictional ₹</span>
      </div>
      <div className="mb-4 flex h-3 overflow-hidden rounded-full" aria-hidden>
        <div style={{ width: `${(needs / income) * 100}%` }} className="bg-primary" />
        <div style={{ width: `${(savings / income) * 100}%`, background: 'var(--color-saving)' }} />
        <div style={{ width: `${(clampedWants / income) * 100}%`, background: 'var(--color-warning)' }} />
        <div style={{ width: `${(buffer / income) * 100}%` }} className="bg-line" />
      </div>
      <p className="mb-4 text-sm text-ink-soft">
        Needs (bus pass, lunch, stationery, data) already take <strong>{inr(needs)}</strong>.
      </p>
      <div className="space-y-4">
        {ranges.map((r) => (
          <div key={r.id}>
            <div className="mb-1.5 flex justify-between text-sm">
              <label htmlFor={r.id} className="font-semibold">
                {r.label}
              </label>
              <span className="tabular font-semibold">{inr(r.value)}</span>
            </div>
            <input
              id={r.id}
              type="range"
              className="rr-range w-full"
              min={0}
              max={Math.max(0, r.max)}
              step={10}
              value={r.value}
              onChange={(e) => r.set(Number(e.target.value))}
              style={{ ['--range-color' as string]: r.color, ['--range-fill' as string]: `${r.max ? (r.value / r.max) * 100 : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-canvas p-3">
          <p className="text-muted">Cash buffer left</p>
          <p className="tabular text-lg font-bold">{inr(buffer)}</p>
        </div>
        <div className="rounded-xl bg-canvas p-3">
          <p className="text-muted">₹1,200 calculator in</p>
          <p className="text-lg font-bold">{months ? `${months} month${months > 1 ? 's' : ''}` : 'never'}</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        In the full simulation a surprise expense arrives next. Will your plan survive it?
      </p>
    </div>
  )
}

export default function LandingPage() {
  const { t, lang, setLang } = useI18n()
  const { user, ready } = useAuth()
  if (ready && user) return <Navigate to={homeFor(user.role)} replace />

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Site">
          <label className="sr-only" htmlFor="lang">
            Language
          </label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">{t('landing.signIn')}</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-14">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-ink">
              <GraduationCap className="size-4" aria-hidden />
              {t('landing.badge')}
            </p>
            <h1 className="text-[2.4rem] font-extrabold leading-[1.08] sm:text-5xl lg:text-[3.4rem]">{t('landing.title')}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">{t('landing.subtitle')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/register">
                  {t('landing.ctaStudent')} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/register?role=educator">
                  <Users /> {t('landing.ctaEducator')}
                </Link>
              </Button>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted">
              <Lock className="size-4" aria-hidden /> {t('landing.privacy')}
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
            <BudgetTeaser />
          </motion.div>
        </section>

        <section className="border-y border-line bg-surface py-16" aria-labelledby="pillars-title">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="pillars-title" className="text-2xl font-extrabold sm:text-3xl">
              {t('landing.pillarsTitle')}
            </h2>
            <p className="mt-2 max-w-2xl text-ink-soft">
              Each pillar combines a story-based simulation, instant explanations and a short quiz. Your understanding is
              tracked concept by concept.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PILLAR_ORDER.map((p, i) => (
                <div key={p} className="rounded-2xl border border-line p-5" style={{ borderTop: `4px solid ${PILLARS[p].color}` }}>
                  <PillarIcon pillar={p} />
                  <p className="mt-4 text-xs font-bold text-muted">0{i + 1}</p>
                  <h3 className="mt-1 font-bold">{t(PILLARS[p].titleKey)}</h3>
                  <p className="mt-1 text-sm text-muted">{t(PILLARS[p].descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-title">
          <h2 id="how-title" className="text-2xl font-extrabold sm:text-3xl">
            {t('landing.howTitle')}
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { icon: Users, text: t('landing.how1') },
              { icon: Shuffle, text: t('landing.how2') },
              { icon: RefreshCw, text: t('landing.how3') },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex gap-4">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold text-primary">Step {i + 1}</p>
                  <p className="mt-1 leading-relaxed text-ink-soft">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-6 rounded-3xl bg-primary-ink p-6 text-white sm:p-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-extrabold text-white">Built for classrooms and NGO programmes</h2>
              <p className="mt-3 leading-relaxed text-primary-100">
                Educators create a class, share a six-letter code and see participation, module completion,
                concept-level understanding and the misconceptions that need support. No student personal data required.
              </p>
              <Button asChild variant="secondary" className="mt-6">
                <Link to="/register?role=educator">Set up a class</Link>
              </Button>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                'Starting check and final check measure change concept by concept',
                'Transparent adaptive rules pick each student’s next activity',
                'Guessing is detected and doesn’t inflate understanding scores',
                'Educate, never recommend: simulations are assumptions, not promises',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
                  <span className="text-primary-100">{item}</span>
                </li>
              ))}
              <li className="flex gap-3">
                <Languages className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
                <span className="text-primary-100">Interface ready for English, हिन्दी and తెలుగు</span>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo size={26} />
          <p>Educational simulations with fictional money. Not financial advice.</p>
        </div>
      </footer>
    </div>
  )
}
