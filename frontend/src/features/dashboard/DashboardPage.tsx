import { animate, svg } from 'animejs'
import { ArrowRight, Check, Lightbulb, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AchievementTile, DifficultyBadge } from '@/components/common/badges'
import { Panel } from '@/components/common/panel'
import { PILLAR_ORDER, PILLARS } from '@/components/common/pillars'
import { ErrorState, LoadingState } from '@/components/common/states'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import { useProfile } from '@/features/onboarding/StudentGate'
import { useAnime, has } from '@/lib/anime'
import { api } from '@/lib/api/endpoints'
import type { MasteryLevel, Progress, Recommendation } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { EASE_OUT, fadeUp, SPRING, staggerChildren } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'
import { LearningPanel, PortfolioPanel, RewardsPanel } from './panels'

// eslint-disable-next-line react-refresh/only-export-components
export function recommendationLink(rec: Recommendation): string {
  switch (rec.kind) {
    case 'onboarding':
      return '/onboarding'
    case 'assessment':
      return `/app/assessments/${rec.slug}`
    case 'scenario':
      return `/app/play/${rec.slug}`
    default:
      return '/app/progress'
  }
}

/** Mastery levels. Each has a label and a glyph as well as a colour, so colour is never the only cue. */
export const LEVEL_STYLE: Record<MasteryLevel, { label: string; short: string; color: string; bar: string }> = {
  not_started: { label: 'Not assessed yet', short: '–', color: 'text-muted', bar: 'var(--color-line-strong)' },
  needs_practice: { label: 'Needs practice', short: '!', color: 'text-danger-ink', bar: 'var(--color-danger)' },
  developing: { label: 'Developing', short: '~', color: 'text-warning-ink', bar: 'var(--color-warning)' },
  mastered: { label: 'Strong', short: '✓', color: 'text-accent-ink', bar: 'var(--color-accent)' },
}

type Step = { label: string; done: boolean; active: boolean; to: string; detail: string }

function journeySteps(progress: Progress, t: ReturnType<typeof useI18n>['t']): Step[] {
  const pre = progress.pre_post
  const steps: Step[] = [
    { label: 'Starting check', done: !!pre, active: false, to: '/app/assessments', detail: pre ? 'Done' : '12 questions, not graded' },
    ...PILLAR_ORDER.map((p) => {
      const m = progress.modules.find((x) => x.pillar === p)
      return {
        label: t(PILLARS[p].titleKey),
        done: !!m?.completed,
        active: false,
        to: `/app/learn/${m?.slug ?? ''}`,
        detail: m?.completed ? 'Complete' : m && m.percent > 0 ? `${Math.round(m.percent)}% done` : 'Mission + quiz',
      }
    }),
    { label: 'Final check', done: pre?.post_score != null, active: false, to: '/app/assessments', detail: 'After the four modules' },
  ]
  const next = steps.findIndex((s) => !s.done)
  if (next >= 0) steps[next].active = true
  return steps
}

/** The one thing to do next, with the whole path beside it. */
function ContinueHero({ rec, steps }: { rec: Recommendation; steps: Step[] }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const pillar = rec.pillar ? PILLARS[rec.pillar] : null
  const done = steps.filter((s) => s.done).length
  const current = Math.max(0, steps.findIndex((s) => s.active))

  // The one drawn element on this page: a rising line behind the call to action.
  useAnime(ref, (scope) => {
    if (has(scope, '.hero-line')) animate(svg.createDrawable('.hero-line'), { draw: ['0 0', '0 1'], duration: 1600, ease: 'inOutQuart', delay: 150 })
  }, [rec.slug])

  return (
    <motion.section
      ref={ref}
      variants={fadeUp}
      aria-labelledby="continue-h"
      className="relative overflow-hidden rounded-[var(--radius-panel)] bg-navy text-white shadow-[var(--shadow-hero)]"
    >
      <div className="bg-grid-dark pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" aria-hidden />

      <div className="relative grid lg:grid-cols-[1.45fr_1fr]">
        <div className="relative flex flex-col p-6 pb-24 sm:p-8 sm:pb-24">
        <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full lg:h-2/3" aria-hidden>
          <defs>
            <linearGradient id="hero-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#34d399" stopOpacity="0.16" />
              <stop offset="1" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 200 L70 186 L130 192 L200 160 L260 168 L330 128 L390 138 L460 96 L520 104 L600 60 L600 220 L0 220Z" fill="url(#hero-fill)" />
          <path
            className="hero-line"
            d="M0 200 L70 186 L130 192 L200 160 L260 168 L330 128 L390 138 L460 96 L520 104 L600 60"
            fill="none"
            stroke="#34d399"
            strokeOpacity="0.7"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
          <p className="relative flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
            Continue learning
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] tracking-normal text-white/75">
              step {current + 1} of {steps.length}
            </span>
          </p>
          <h2 id="continue-h" className="relative mt-3 max-w-xl text-[1.75rem] font-extrabold leading-tight tracking-tight text-white sm:text-[2.25rem]">
            {rec.title}
          </h2>
          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            {pillar && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90">
                <pillar.icon className="size-3.5" aria-hidden /> {t(pillar.titleKey)}
              </span>
            )}
            {rec.difficulty && <DifficultyBadge level={rec.difficulty} />}
          </div>
          <p className="relative mt-4 flex max-w-lg gap-2 text-sm leading-relaxed text-white/75">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-semibold text-white">{t('dashboard.why')} </span>
              {rec.reason}
            </span>
          </p>
          <div className="relative mt-6">
            <Link
              to={recommendationLink(rec)}
              className="group inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-400 px-6 text-base font-bold text-[#06281d] shadow-[0_10px_30px_-12px_rgb(52_211_153/0.9)] transition-[background-color,transform] duration-150 hover:bg-emerald-300 active:scale-[0.98]"
            >
              {t('common.continue')} <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
        </div>

        {/* The whole path, so the next step is seen in context. */}
        <nav aria-label={t('dashboard.journey')} className="relative border-t border-white/10 bg-white/[0.03] p-6 sm:p-8 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="text-sm font-bold text-white">{t('dashboard.journey')}</p>
            <p className="font-mono text-xs text-white/60">
              {done}/{steps.length} done
            </p>
          </div>
          <ol className="relative">
            <span className="absolute bottom-4 left-[13px] top-4 w-0.5 rounded-full bg-white/10" aria-hidden />
            <motion.span
              className="absolute left-[13px] top-4 w-0.5 origin-top rounded-full bg-emerald-400"
              style={{ height: `calc((100% - 2rem) * ${steps.length > 1 ? current / (steps.length - 1) : 0})` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 }}
              aria-hidden
            />
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link to={s.to} aria-current={s.active ? 'step' : undefined} className="group relative flex items-center gap-3 rounded-lg py-1.5 pr-2 outline-offset-2">
                  <span
                    className={cn(
                      'relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-transform duration-200 group-hover:scale-110',
                      s.done ? 'bg-emerald-400 text-[#06281d]' : s.active ? 'bg-white text-navy ring-4 ring-white/15' : 'border border-white/25 bg-navy text-white/60',
                    )}
                  >
                    {s.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-semibold', s.active ? 'text-white' : s.done ? 'text-white/85' : 'text-white/60')}>{s.label}</span>
                  </span>
                  <span className={cn('shrink-0 text-xs', s.active ? 'text-emerald-300' : 'text-white/45')}>{s.done ? 'Done' : s.detail}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </motion.section>
  )
}

/** The four tracks as one strip: a quick read of where each pillar stands. */
function TrackStrip({ progress }: { progress: Progress }) {
  const { t } = useI18n()
  return (
    <motion.section variants={fadeUp} aria-labelledby="tracks-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="tracks-h" className="text-base font-extrabold sm:text-lg">
          {t('dashboard.pillars')}
        </h2>
        <Link to="/app/learn" className="text-sm font-semibold text-primary hover:underline">
          All modules
        </Link>
      </div>
      <ul className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
        {PILLAR_ORDER.map((pillar, i) => {
          const m = progress.modules.find((x) => x.pillar === pillar)
          const meta = PILLARS[pillar]
          const pct = Math.round(m?.percent ?? 0)
          return (
            <li key={pillar} className={cn('border-line', i > 0 && 'border-t sm:border-t-0', i % 2 === 1 && 'sm:border-l', i >= 2 && 'sm:border-t lg:border-t-0', i > 0 && 'lg:border-l')}>
              <Link to={`/app/learn/${m?.slug ?? ''}`} className="group flex h-full flex-col gap-3 p-4 transition-colors duration-150 hover:bg-canvas sm:p-5">
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span className="grid size-7 place-items-center rounded-lg" style={{ background: meta.soft, color: meta.color }} aria-hidden>
                      <meta.icon className="size-4" />
                    </span>
                    {t(meta.titleKey)}
                  </span>
                  {m?.completed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-accent-ink">
                      <Check className="size-3.5" aria-hidden /> Done
                    </span>
                  ) : (
                    <ArrowRight className="size-4 text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                  )}
                </span>
                <span className="flex items-end justify-between gap-3">
                  <AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} className="text-2xl font-extrabold leading-none" />
                  <span className="flex gap-1 pb-0.5 text-[11px] font-semibold">
                    <span className={cn('rounded px-1.5 py-0.5', m?.simulation_done ? 'bg-accent-soft text-accent-ink' : 'bg-canvas text-muted')}>Mission{m?.simulation_done ? ' ✓' : ''}</span>
                    <span className={cn('rounded px-1.5 py-0.5', m?.quiz_best != null ? 'bg-accent-soft text-accent-ink' : 'bg-canvas text-muted')}>
                      {m?.quiz_best != null ? `Quiz ${m.quiz_best}%` : 'Quiz'}
                    </span>
                  </span>
                </span>
                <span
                  className="block h-1.5 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${t(meta.titleKey)} progress`}
                >
                  <motion.span
                    className="block h-full origin-left rounded-full"
                    style={{ width: `${pct}%`, background: meta.color }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.25 + i * 0.06 }}
                  />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </motion.section>
  )
}

const FILTERS: { key: 'all' | MasteryLevel; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_practice', label: 'Needs practice' },
  { key: 'developing', label: 'Developing' },
  { key: 'mastered', label: 'Strong' },
]

function MasteryPanel({ progress, className }: { progress: Progress; className?: string }) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<'all' | MasteryLevel>('all')
  const list = useMemo(() => progress.concepts.filter((c) => filter === 'all' || c.level === filter), [progress.concepts, filter])
  const assessed = progress.concepts.filter((c) => c.level !== 'not_started').length

  return (
    <Panel
      id="mastery-h"
      kicker={`${assessed} of ${progress.concepts.length} assessed`}
      title={t('dashboard.mastery')}
      className={className}
      action={
        <Link to="/app/progress" className="shrink-0 text-sm font-semibold text-primary hover:underline">
          Details
        </Link>
      }
    >
      <div role="radiogroup" aria-label="Filter concepts" className="flex flex-wrap gap-1 self-start rounded-xl bg-canvas p-1">
        {FILTERS.map((f) => {
          const on = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f.key)}
              className={cn('relative rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors', on ? 'text-ink' : 'text-muted hover:text-ink')}
            >
              {on && <motion.span layoutId="mastery-filter" className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-line" transition={SPRING} />}
              <span className="relative">
                {f.label} <span className="font-mono text-[10px] opacity-70">{f.key === 'all' ? progress.concepts.length : progress.concepts.filter((c) => c.level === f.key).length}</span>
              </span>
            </button>
          )
        })}
      </div>
      {list.length === 0 ? (
        <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-muted">Nothing here yet. Try another filter.</p>
      ) : (
        <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.concept}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{c.title}</span>
                <span className={cn('shrink-0 text-xs font-bold', LEVEL_STYLE[c.level].color)}>{c.level === 'not_started' ? 'Not yet' : LEVEL_STYLE[c.level].label}</span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-valuenow={Math.round((c.mastery ?? 0) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${c.title} understanding`}
              >
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(c.mastery ?? 0) * 100}%`, background: LEVEL_STYLE[c.level].bar }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function BadgesPanel({ className }: { className?: string }) {
  const { t } = useI18n()
  const achievements = useAsync(() => api.progress.achievements(), [])
  const all = achievements.data ?? []
  const earned = all.filter((a) => a.earned).sort((a, b) => (b.awarded_at ?? '').localeCompare(a.awarded_at ?? ''))
  return (
    <Panel
      id="ach-h"
      kicker={`${earned.length} of ${all.length} earned`}
      title={t('dashboard.achievements')}
      color="var(--color-warning)"
      className={className}
      action={<Trophy className="size-5 text-warning" aria-hidden />}
    >
      <div className="grid gap-2.5 sm:grid-cols-3">
        {earned.length === 0 ? <p className="rounded-xl bg-canvas p-4 text-sm text-muted sm:col-span-3">Complete your first activity to earn a badge.</p> : earned.slice(0, 3).map((a) => <AchievementTile key={a.slug} a={a} />)}
      </div>
      <p className="mt-3 text-xs text-muted">Badges reward effort and good habits. They are separate from your understanding scores.</p>
      <Link to="/app/progress" className="mt-auto self-start pt-3 text-sm font-semibold text-primary hover:underline">
        View all badges
      </Link>
    </Panel>
  )
}

export default function DashboardPage() {
  const { t } = useI18n()
  const { profile } = useProfile()
  const progress = useAsync(() => api.progress.me(), [])
  const p = progress.data

  if (progress.error) return <ErrorState message={progress.error.message} onRetry={progress.reload} />
  if (progress.loading || !p) return <LoadingState rows={4} />

  const steps = journeySteps(p, t)
  const greeting = t('dashboard.greeting', { name: profile.user.display_name })
  const summary = [
    { label: 'Modules', value: p.activity.modules_completed, suffix: '/4' },
    { label: 'Missions', value: p.activity.simulations_completed },
    { label: 'Checks taken', value: p.activity.assessments_completed },
  ]

  return (
    <motion.div variants={staggerChildren(0.08)} initial="hidden" animate="show" className="space-y-6 sm:space-y-7">
      <motion.header variants={fadeUp} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            {profile.stage.label} · {profile.stage.grades}
          </p>
          <h1 className="mt-1.5 text-[1.9rem] font-extrabold leading-tight tracking-tight sm:text-[2.4rem]">{greeting}</h1>
          <p className="mt-1.5 text-ink-soft">
            {p.activity.simulations_completed === 0
              ? 'Your first fictional rupees are waiting. Every choice comes with an explanation.'
              : `${p.activity.modules_completed} of 4 modules complete. Keep the streak of good decisions going.`}
          </p>
        </div>
        <dl className="flex divide-x divide-line self-start rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] lg:self-auto">
          {summary.map((s) => (
            <div key={s.label} className="flex flex-col-reverse px-4 py-2.5 sm:px-5">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.label}</dt>
              <dd className="text-xl font-extrabold">
                <AnimatedNumber value={s.value} />
                {s.suffix && <span className="text-sm font-bold text-muted">{s.suffix}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </motion.header>

      <ContinueHero rec={p.recommendation} steps={steps} />

      <TrackStrip progress={p} />

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <LearningPanel className="lg:col-span-7" />
        <RewardsPanel className="lg:col-span-5" />
        <MasteryPanel progress={p} className="lg:col-span-7" />
        <PortfolioPanel className="lg:col-span-5" />
        <BadgesPanel className="lg:col-span-12" />
      </motion.div>
    </motion.div>
  )
}
