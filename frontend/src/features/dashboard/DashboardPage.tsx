import { ArrowRight, CheckCircle2, Circle, CircleDot, Lightbulb, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { AchievementTile, DifficultyBadge } from '@/components/common/badges'
import { PILLAR_ORDER, PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { useProfile } from '@/features/onboarding/StudentGate'
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

function NextStepCard({ rec }: { rec: Recommendation }) {
  const { t } = useI18n()
  const pillar = rec.pillar ? PILLARS[rec.pillar] : null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden border-primary-100">
        <div className="grid gap-0 md:grid-cols-[1fr_auto]">
          <div className="p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{t('dashboard.next')}</p>
            <h2 className="mt-2 text-xl font-extrabold sm:text-2xl">{rec.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {pillar && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: pillar.color }}>
                  <pillar.icon className="size-4" aria-hidden /> {t(pillar.titleKey)}
                </span>
              )}
              {rec.difficulty && <DifficultyBadge level={rec.difficulty} />}
            </div>
            <p className="mt-4 flex gap-2 rounded-xl bg-primary-soft/70 p-3 text-sm leading-relaxed text-primary-ink">
              <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{t('dashboard.why')} </span>
                {rec.reason}
              </span>
            </p>
          </div>
          <div className="flex items-center border-t border-line bg-canvas p-5 md:border-l md:border-t-0 md:px-8">
            <Button asChild size="lg" className="w-full md:w-auto">
              <Link to={recommendationLink(rec)}>
                {t('common.continue')} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function Journey({ progress }: { progress: Progress }) {
  const { t } = useI18n()
  const pre = progress.pre_post
  const steps = [
    { label: 'Starting check', done: !!pre, active: !pre },
    ...PILLAR_ORDER.map((p) => {
      const m = progress.modules.find((x) => x.pillar === p)
      return { label: t(PILLARS[p].titleKey), done: !!m?.completed, active: !!m && m.percent > 0 && !m.completed }
    }),
    { label: 'Final check', done: pre?.post_score != null, active: false },
  ]
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0" aria-label={t('dashboard.journey')}>
      {steps.map((s, i) => {
        const Icon = s.done ? CheckCircle2 : s.active ? CircleDot : Circle
        return (
          <li key={s.label} className="flex flex-1 items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
            <div className="flex items-center sm:w-full">
              <span className={cn('hidden h-0.5 flex-1 sm:block', i === 0 ? 'invisible' : steps[i - 1].done ? 'bg-accent' : 'bg-line')} />
              <Icon
                className={cn('size-7 shrink-0', s.done ? 'text-accent' : s.active ? 'text-primary' : 'text-line-strong')}
                aria-hidden
              />
              <span className={cn('hidden h-0.5 flex-1 sm:block', i === steps.length - 1 ? 'invisible' : s.done ? 'bg-accent' : 'bg-line')} />
            </div>
            <span className={cn('text-xs font-semibold', s.done ? 'text-accent-ink' : s.active ? 'text-primary' : 'text-muted')}>
              {s.label}
              <span className="sr-only">{s.done ? ' (done)' : s.active ? ' (in progress)' : ' (not started)'}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default function DashboardPage() {
  const { t } = useI18n()
  const { profile } = useProfile()
  const progress = useAsync(() => api.progress.me(), [])
  const achievements = useAsync(() => api.progress.achievements(), [])

  if (progress.error) return <ErrorState message={progress.error.message} onRetry={progress.reload} />
  if (progress.loading || !progress.data) return <LoadingState rows={4} />
  const p = progress.data
  const earned = (achievements.data ?? []).filter((a) => a.earned).sort((a, b) => (b.awarded_at ?? '').localeCompare(a.awarded_at ?? ''))
  const assessed = p.concepts.filter((c) => c.level !== 'not_started').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t('dashboard.greeting', { name: profile.user.display_name })}</h1>
        <p className="text-ink-soft">
          {p.activity.simulations_completed === 0
            ? 'Your first fictional rupees are waiting. Every choice comes with an explanation.'
            : `You’ve completed ${p.activity.simulations_completed} simulation${p.activity.simulations_completed === 1 ? '' : 's'} and ${p.activity.modules_completed} of 4 modules.`}
        </p>
      </header>

      <NextStepCard rec={p.recommendation} />

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.journey')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Journey progress={p} />
        </CardContent>
      </Card>

      <section aria-labelledby="pillars-h">
        <h2 id="pillars-h" className="mb-3 text-lg font-bold">
          {t('dashboard.pillars')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PILLAR_ORDER.map((pillar) => {
            const m = p.modules.find((x) => x.pillar === pillar)
            const meta = PILLARS[pillar]
            return (
              <Link
                key={pillar}
                to={`/app/learn/${m?.slug ?? ''}`}
                className="group rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]"
              >
                <div className="flex items-start justify-between">
                  <PillarIcon pillar={pillar} />
                  {m?.completed && <CheckCircle2 className="size-5 text-accent" aria-label="Completed" />}
                </div>
                <p className="mt-4 font-bold group-hover:text-primary">{t(meta.titleKey)}</p>
                <p className="mt-0.5 text-xs text-muted">{t(meta.descKey)}</p>
                <ProgressBar value={m?.percent ?? 0} label={`${t(meta.titleKey)} progress`} className="mt-4" color={meta.color} />
                <p className="mt-2 text-xs text-muted">
                  {m?.simulation_done ? 'Simulation done' : 'Simulation to do'} ·{' '}
                  {m?.quiz_best != null ? `Quiz best ${m.quiz_best}%` : 'Quiz to do'}
                </p>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.mastery')}</CardTitle>
            <CardDescription>
              Based on your answers and simulation decisions, not just activities finished. {assessed} of {p.concepts.length}{' '}
              concepts assessed so far.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {p.concepts.map((c) => (
                <li key={c.concept}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{c.title}</span>
                    <span className={cn('shrink-0 text-xs font-semibold', LEVEL_STYLE[c.level].color)}>{LEVEL_STYLE[c.level].label}</span>
                  </div>
                  <ProgressBar
                    value={c.mastery != null ? c.mastery * 100 : 0}
                    label={`${c.title} understanding`}
                    className="mt-1.5 h-1.5"
                    color={LEVEL_STYLE[c.level].bar}
                  />
                </li>
              ))}
            </ul>
            <Button asChild variant="link" className="mt-4">
              <Link to="/app/progress">See detailed progress</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-5 text-warning" aria-hidden /> {t('dashboard.achievements')}
            </CardTitle>
            <CardDescription>Badges reward effort and good habits. They are separate from your understanding scores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {earned.length === 0 ? (
              <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Complete your first activity to earn a badge.</p>
            ) : (
              earned.slice(0, 4).map((a) => <AchievementTile key={a.slug} a={a} />)
            )}
            {achievements.data && (
              <p className="pt-1 text-xs text-muted">
                {earned.length} of {achievements.data.length} earned
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
