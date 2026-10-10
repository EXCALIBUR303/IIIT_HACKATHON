import { animate, createTimeline, stagger, svg } from 'animejs'
import { ArrowRight, Check, Lightbulb, Trophy } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AchievementTile, DifficultyBadge } from '@/components/common/badges'
import { PILLAR_ORDER, PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/features/onboarding/StudentGate'
import { ThreePanels } from './panels'
import { useAnime } from '@/lib/anime'
import { api } from '@/lib/api/endpoints'
import type { MasteryLevel, Progress, Recommendation } from '@/lib/api/types'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

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

export const LEVEL_STYLE: Record<MasteryLevel, { label: string; color: string; bar: string }> = {
  not_started: { label: 'Not assessed yet', color: 'text-muted', bar: 'var(--color-line-strong)' },
  needs_practice: { label: 'Needs practice', color: 'text-danger-ink', bar: 'var(--color-danger)' },
  developing: { label: 'Developing', color: 'text-warning-ink', bar: 'var(--color-warning)' },
  mastered: { label: 'Strong', color: 'text-accent-ink', bar: 'var(--color-accent)' },
}

type Step = { label: string; done: boolean; active: boolean; to: string; detail: string }

function journeySteps(progress: Progress, t: ReturnType<typeof useI18n>['t']): Step[] {
  const pre = progress.pre_post
  return [
    { label: 'Starting check', done: !!pre, active: !pre, to: '/app/assessments', detail: pre ? 'Done' : '12 questions, not graded' },
    ...PILLAR_ORDER.map((p) => {
      const m = progress.modules.find((x) => x.pillar === p)
      return {
        label: t(PILLARS[p].titleKey),
        done: !!m?.completed,
        active: !!m && m.percent > 0 && !m.completed,
        to: `/app/learn/${m?.slug ?? ''}`,
        detail: m?.completed ? 'Complete' : `${Math.round(m?.percent ?? 0)}% done`,
      }
    }),
    { label: 'Final check', done: pre?.post_score != null, active: false, to: '/app/assessments', detail: 'Unlocks after the modules' },
  ]
}

/** The one thing to do next, on a dark "desk" card with a rising line drawn behind it. */
function NextMove({ rec, step, total }: { rec: Recommendation; step: number; total: number }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const pillar = rec.pillar ? PILLARS[rec.pillar] : null

  useAnime(
    ref,
    () => {
      createTimeline({ defaults: { ease: 'outExpo' } })
        .add(svg.createDrawable('.rise-line'), { draw: ['0 0', '0 1'], duration: 1800 }, 0)
        .add('.rise-dot', { scale: { from: 0 }, duration: 600, delay: stagger(120) }, 500)
        .add('.nm-in', { opacity: { from: 0 }, y: { from: 18 }, duration: 700, delay: stagger(90) }, 100)
      animate('.rise-dot-last', { scale: [1, 1.6, 1], opacity: [1, 0.5, 1], duration: 1600, loop: true, ease: 'inOutSine', delay: 1600 })
    },
    [rec.slug],
  )

  return (
    <div ref={ref} className="dash-rise relative overflow-hidden rounded-[22px] bg-[#14123a] text-white shadow-[0_24px_50px_-24px_rgb(49_46_129/0.8)]">
      <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-1/2 [mask-image:linear-gradient(to_right,transparent,black_35%)] md:block" aria-hidden>
        {[50, 100, 150].map((y) => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="white" strokeOpacity="0.06" strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
        ))}
        <path
          className="rise-line"
          d="M0 170 L80 150 L140 160 L210 120 L270 132 L340 92 L400 104 L470 60 L530 70 L600 28"
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {[
        [210, 120],
        [340, 92],
        [470, 60],
      ].map(([x, y]) => (
        <span
          key={x}
          className="rise-dot absolute hidden size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 md:block"
          style={{ left: `${50 + (x / 600) * 50}%`, top: `${(y / 200) * 100}%` }}
          aria-hidden
        />
      ))}
      <span
        className="rise-dot rise-dot-last absolute hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 ring-4 ring-emerald-300/25 md:block"
        style={{ left: '99%', top: '14%' }}
        aria-hidden
      />

      <div className="relative grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-end">
        <div className="relative z-10 max-w-xl">
          <p className="nm-in flex items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
            {t('dashboard.next')}
            <span className="rounded-full border border-white/20 px-2 py-0.5 font-mono text-[11px] tracking-normal text-white/70">
              step {step} / {total}
            </span>
          </p>
          <h2 className="nm-in mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">{rec.title}</h2>
          <div className="nm-in mt-3 flex flex-wrap items-center gap-2">
            {pillar && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
                <pillar.icon className="size-3.5" aria-hidden /> {t(pillar.titleKey)}
              </span>
            )}
            {rec.difficulty && <DifficultyBadge level={rec.difficulty} />}
          </div>
          <p className="nm-in mt-4 flex gap-2 text-sm leading-relaxed text-white/80">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-semibold text-white">{t('dashboard.why')} </span>
              {rec.reason}
            </span>
          </p>
        </div>
        <Button
          asChild
          size="lg"
          className="nm-in group w-full bg-emerald-400 text-[#0b2a20] shadow-[0_10px_30px_-10px_rgb(52_211_153/0.9)] hover:bg-emerald-300 md:w-auto"
        >
          <Link to={recommendationLink(rec)}>
            {t('common.continue')} <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

/** A track you can click along. The filled line shows how far you have come. */
function JourneyTrack({ steps }: { steps: Step[] }) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const doneCount = steps.filter((s) => s.done).length
  const fill = steps.length > 1 ? (Math.max(0, steps.findIndex((s) => !s.done)) / (steps.length - 1)) * 100 : 0
  const pct = doneCount === steps.length ? 100 : fill

  useAnime(
    ref,
    () => {
      animate('.track-fill', { scaleX: { from: 0 }, duration: 1400, ease: 'inOutQuart', delay: 300 })
      animate('.node', { scale: { from: 0.3 }, opacity: { from: 0 }, delay: stagger(110, { start: 200 }), duration: 600, ease: 'outBack(2)' })
      if (ref.current?.querySelector('.node-active')) animate('.node-active', { boxShadow: ['0 0 0 0 rgb(67 56 202 / 0.45)', '0 0 0 12px rgb(67 56 202 / 0)'], duration: 1600, loop: true, ease: 'outQuad', delay: 1200 })
    },
    [pct],
  )

  return (
    <section ref={ref} aria-labelledby="journey-h" className="dash-rise rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="journey-h" className="text-lg font-extrabold">
          {t('dashboard.journey')}
        </h2>
        <p className="font-mono text-xs font-bold text-muted">
          {doneCount}/{steps.length} complete
        </p>
      </div>
      <ol className="relative mt-6 grid gap-4 sm:grid-cols-6 sm:gap-2">
        <span className="absolute left-[8.33%] right-[8.33%] top-[18px] hidden h-1 rounded-full bg-line sm:block" aria-hidden>
          <span className="track-fill block h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
        </span>
        {steps.map((s, i) => (
          <li key={s.label} className="relative">
            <Link
              to={s.to}
              className="group flex items-center gap-3 rounded-xl p-1 sm:flex-col sm:gap-2 sm:text-center"
            >
              <span
                className={cn(
                  'node relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold transition-transform group-hover:scale-110',
                  s.done
                    ? 'border-accent bg-accent text-white'
                    : s.active
                      ? 'node-active border-primary bg-primary text-white'
                      : 'border-line-strong bg-surface text-muted group-hover:border-primary group-hover:text-primary',
                )}
              >
                {s.done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-bold', s.done ? 'text-accent-ink' : s.active ? 'text-primary' : 'text-ink-soft')}>{s.label}</span>
                <span className="block text-xs text-muted">{s.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

function PillarCards({ progress }: { progress: Progress }) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useAnime(
    ref,
    () => {
      animate('.pillar-card', { opacity: { from: 0 }, y: { from: 24 }, rotate: { from: -1.5 }, delay: stagger(90), duration: 700, ease: 'outExpo' })
      animate('.pillar-bar', { scaleX: { from: 0 }, delay: stagger(90, { start: 350 }), duration: 900, ease: 'outExpo' })
    },
    [progress.modules.length],
  )

  // A gentle tilt that follows the pointer, so the cards feel like objects you can pick up.
  function tilt(e: React.PointerEvent<HTMLAnchorElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    e.currentTarget.style.transform = `perspective(700px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg) translateY(-3px)`
  }
  function untilt(e: React.PointerEvent<HTMLAnchorElement>) {
    e.currentTarget.style.transform = ''
  }

  return (
    <section ref={ref} aria-labelledby="pillars-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pillars-h" className="text-lg font-extrabold">
          {t('dashboard.pillars')}
        </h2>
        <Link to="/app/learn" className="text-sm font-semibold text-primary hover:underline">
          All modules
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PILLAR_ORDER.map((pillar, i) => {
          const m = progress.modules.find((x) => x.pillar === pillar)
          const meta = PILLARS[pillar]
          const pct = Math.round(m?.percent ?? 0)
          return (
            <Link
              key={pillar}
              to={`/app/learn/${m?.slug ?? ''}`}
              onPointerMove={tilt}
              onPointerLeave={untilt}
              className="pillar-card group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 ease-out [transform-style:preserve-3d] hover:shadow-[var(--shadow-raised)]"
            >
              <span className="pointer-events-none absolute -right-3 -top-5 font-mono text-7xl font-black opacity-[0.07]" style={{ color: meta.color }} aria-hidden>
                0{i + 1}
              </span>
              <div className="flex items-start justify-between">
                <PillarIcon pillar={pillar} />
                {m?.completed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-ink">
                    <Check className="size-3" aria-hidden /> Done
                  </span>
                )}
              </div>
              <p className="mt-4 text-base font-extrabold group-hover:text-primary">{t(meta.titleKey)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(meta.descKey)}</p>
              <div className="mt-auto pt-4">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-ink-soft">Progress</span>
                  <span className="font-mono font-bold text-ink">
                    {pct}%
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${t(meta.titleKey)} progress`}
                >
                  <div className="pillar-bar h-full origin-left rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                </div>
                <div className="mt-3 flex gap-1.5 text-[11px] font-semibold">
                  <span className={cn('rounded-md px-1.5 py-0.5', m?.simulation_done ? 'bg-accent-soft text-accent-ink' : 'bg-canvas text-muted')}>
                    {m?.simulation_done ? '✓ Simulation' : 'Simulation'}
                  </span>
                  <span className={cn('rounded-md px-1.5 py-0.5', m?.quiz_best != null ? 'bg-accent-soft text-accent-ink' : 'bg-canvas text-muted')}>
                    {m?.quiz_best != null ? `Quiz ${m.quiz_best}%` : 'Quiz'}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const FILTERS: { key: 'all' | MasteryLevel; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_practice', label: 'Needs practice' },
  { key: 'developing', label: 'Developing' },
  { key: 'mastered', label: 'Strong' },
]

function MasteryCard({ progress }: { progress: Progress }) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const [filter, setFilter] = useState<'all' | MasteryLevel>('all')
  const list = useMemo(
    () => progress.concepts.filter((c) => filter === 'all' || c.level === filter),
    [progress.concepts, filter],
  )
  const assessed = progress.concepts.filter((c) => c.level !== 'not_started').length

  useAnime(
    ref,
    () => {
      animate('.m-row', { opacity: { from: 0 }, x: { from: -10 }, delay: stagger(35), duration: 400, ease: 'outQuad' })
      animate('.m-bar', { scaleX: { from: 0 }, delay: stagger(35, { start: 150 }), duration: 800, ease: 'outExpo' })
    },
    [filter],
  )

  return (
    <section ref={ref} aria-labelledby="mastery-h" className="dash-rise rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mastery-h" className="text-lg font-extrabold">
            {t('dashboard.mastery')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            From your answers and decisions, not activities finished. {assessed} of {progress.concepts.length} assessed.
          </p>
        </div>
        <div role="radiogroup" aria-label="Filter concepts" className="flex flex-wrap gap-1 rounded-xl bg-canvas p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                filter === f.key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {f.label}{' '}
              <span className="font-mono text-[10px] opacity-70">
                {f.key === 'all' ? progress.concepts.length : progress.concepts.filter((c) => c.level === f.key).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-muted">Nothing here yet. Try another filter.</p>
      ) : (
        <ul className="mt-5 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.concept} className="m-row">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{c.title}</span>
                <span className={cn('shrink-0 text-xs font-bold', LEVEL_STYLE[c.level].color)}>{LEVEL_STYLE[c.level].label}</span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-valuenow={Math.round((c.mastery ?? 0) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${c.title} understanding`}
              >
                <div className="m-bar h-full origin-left rounded-full" style={{ width: `${(c.mastery ?? 0) * 100}%`, background: LEVEL_STYLE[c.level].bar }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="link" className="mt-4 px-0">
        <Link to="/app/progress">
          See detailed progress <ArrowRight />
        </Link>
      </Button>
    </section>
  )
}

export default function DashboardPage() {
  const { t } = useI18n()
  const { profile } = useProfile()
  const progress = useAsync(() => api.progress.me(), [])
  const achievements = useAsync(() => api.progress.achievements(), [])
  const pageRef = useRef<HTMLDivElement>(null)
  const p = progress.data

  useAnime(
    pageRef,
    () => {
      animate('.hello-word', { opacity: { from: 0 }, y: { from: '0.6em' }, delay: stagger(60), duration: 700, ease: 'outExpo' })
      animate(svg.createDrawable('.hello-underline'), { draw: ['0 0', '0 1'], duration: 900, delay: 450, ease: 'inOutQuad' })
      animate('.dash-rise', { opacity: { from: 0 }, y: { from: 20 }, delay: stagger(110, { start: 150 }), duration: 800, ease: 'outExpo' })
    },
    [!!p],
  )

  if (progress.error) return <ErrorState message={progress.error.message} onRetry={progress.reload} />
  if (progress.loading || !p) return <LoadingState rows={4} />

  const earned = (achievements.data ?? []).filter((a) => a.earned).sort((a, b) => (b.awarded_at ?? '').localeCompare(a.awarded_at ?? ''))
  const steps = journeySteps(p, t)
  const stepIndex = Math.max(0, steps.findIndex((s) => !s.done)) + 1
  const greeting = t('dashboard.greeting', { name: profile.user.display_name })

  return (
    <div ref={pageRef} className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-primary">
            {profile.stage.label} · {profile.stage.grades}
          </p>
          <h1 className="relative mt-1 text-3xl font-extrabold tracking-tight sm:text-[2.6rem]" aria-label={greeting}>
            {greeting.split(' ').map((w, i) => (
              <span key={i} className="hello-word mr-[0.22em] inline-block" aria-hidden>
                {w}
              </span>
            ))}
            <svg viewBox="0 0 200 12" className="absolute -bottom-2 left-0 h-3 w-48" aria-hidden>
              <path className="hello-underline" d="M2 8 Q 50 2, 100 7 T 198 4" fill="none" stroke="var(--color-accent)" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </h1>
          <p className="mt-4 text-ink-soft">
            {p.activity.simulations_completed === 0
              ? 'Your first fictional rupees are waiting. Every choice comes with an explanation.'
              : `You’ve completed ${p.activity.simulations_completed} simulation${p.activity.simulations_completed === 1 ? '' : 's'} and ${p.activity.modules_completed} of 4 modules.`}
          </p>
        </div>
        <dl className="flex gap-2">
          {[
            { label: 'Simulations', value: p.activity.simulations_completed },
            { label: 'Modules', value: `${p.activity.modules_completed}/4` },
            { label: 'Badges', value: earned.length },
          ].map((s) => (
            <div key={s.label} className="flex min-w-20 flex-col-reverse rounded-xl border border-line bg-surface px-3 py-2 text-center shadow-[var(--shadow-card)]">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.label}</dt>
              <dd className="font-mono text-xl font-extrabold tabular">{s.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <NextMove rec={p.recommendation} step={stepIndex} total={steps.length} />

      <ThreePanels />

      <JourneyTrack steps={steps} />

      <PillarCards progress={p} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <MasteryCard progress={p} />

        <section aria-labelledby="ach-h" className="dash-rise rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <h2 id="ach-h" className="flex items-center gap-2 text-lg font-extrabold">
            <Trophy className="size-5 text-warning" aria-hidden /> {t('dashboard.achievements')}
          </h2>
          <p className="mt-1 text-sm text-muted">Badges reward effort and good habits. They are separate from your understanding scores.</p>
          <div className="mt-4 space-y-2.5">
            {earned.length === 0 ? (
              <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Complete your first activity to earn a badge.</p>
            ) : (
              earned.slice(0, 4).map((a) => <AchievementTile key={a.slug} a={a} />)
            )}
          </div>
          {achievements.data && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted">
                <span>
                  {earned.length} of {achievements.data.length} earned
                </span>
                <Link to="/app/progress" className="font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-warning" style={{ width: `${(earned.length / Math.max(1, achievements.data.length)) * 100}%` }} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
