import { animate, stagger } from 'animejs'
import { ArrowRight, Info, Sparkles, Target } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AchievementTile } from '@/components/common/badges'
import { PILLAR_ORDER, PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LEVEL_STYLE, recommendationLink } from '@/features/dashboard/DashboardPage'
import { api } from '@/lib/api/endpoints'
import { relativeDate } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'
import { useAnime } from '@/lib/anime'
import type { Progress } from '@/lib/api/types'
import { StatTile } from '../simulations/shared'
import { LearningScoreCard } from './LearningScoreCard'

export default function ProgressPage() {
  const { t } = useI18n()
  const data = useAsync(() => Promise.all([api.progress.me(), api.progress.achievements()]), [])
  if (data.error) return <ErrorState message={data.error.message} onRetry={data.reload} />
  if (data.loading || !data.data) return <LoadingState rows={4} />
  const [p, achievements] = data.data
  const pp = p.pre_post
  const titleOf = (k: string) => p.concepts.find((c) => c.concept === k)?.title ?? k
  const prePostChart = pp?.concepts.map((c) => ({
    concept: titleOf(c.concept),
    Start: Math.round(c.initial * 100),
    Final: c.post != null ? Math.round(c.post * 100) : undefined,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('nav.progress')}
        title="How your understanding is growing"
        description="Understanding is measured from your answers and decisions. Completing activities and earning badges are tracked separately."
        actions={
          <Button asChild>
            <Link to={recommendationLink(p.recommendation)}>
              Next activity <ArrowRight />
            </Link>
          </Button>
        }
      />

      <LearningScoreCard />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Modules completed" value={`${p.activity.modules_completed} / 4`} />
        <StatTile label="Simulations completed" value={p.activity.simulations_completed} />
        <StatTile label="Checks & quizzes taken" value={p.activity.assessments_completed} />
        <StatTile label="Badges earned" value={`${achievements.filter((a) => a.earned).length} / ${achievements.length}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Starting check vs final check</CardTitle>
          <CardDescription>The fair way to see learning: the same ideas, before and after.</CardDescription>
        </CardHeader>
        <CardContent>
          {!pp ? (
            <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
              Take the starting check to set your baseline.{' '}
              <Link to="/app/assessments/initial" className="font-semibold text-primary hover:underline">
                Start it now
              </Link>
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Starting check" value={`${pp.initial_score}%`} />
                <StatTile label="Final check" value={pp.post_score != null ? `${pp.post_score}%` : 'Not yet'} />
                <StatTile
                  label="Change"
                  value={pp.change != null ? `${pp.change > 0 ? '+' : ''}${pp.change} pts` : '—'}
                  tone={pp.change == null ? 'neutral' : pp.change > 0 ? 'good' : pp.change < 0 ? 'bad' : 'neutral'}
                />
              </div>
              {pp.post_score != null && prePostChart && (
                <div className="h-72" role="img" aria-label="Bar chart of starting versus final check by concept">
                  <ResponsiveContainer>
                    <BarChart data={prePostChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid stroke="var(--color-line)" vertical={false} />
                      <XAxis dataKey="concept" angle={-30} textAnchor="end" interval={0} fontSize={11} tickLine={false} height={60} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} width={40} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Legend verticalAlign="top" />
                      <Bar dataKey="Start" fill="var(--color-line-strong)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Final" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="flex gap-2 text-xs text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {pp.note}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-accent" aria-hidden /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {p.strengths.length ? (
              <ul className="flex flex-wrap gap-2">
                {p.strengths.map((s) => (
                  <li key={s} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Strengths appear after you show consistent understanding of a concept across several answers.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-5 text-warning" aria-hidden /> Areas to practise
            </CardTitle>
          </CardHeader>
          <CardContent>
            {p.practice_areas.length ? (
              <ul className="flex flex-wrap gap-2">
                {p.practice_areas.map((s) => (
                  <li key={s} className="rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning-ink">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing flagged right now.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <MasteryMap p={p} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {p.recent.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.recent.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="text-xs text-muted">
                        {r.type === 'simulation' ? 'Simulation' : 'Check / quiz'} · {relativeDate(r.at)}
                      </p>
                    </div>
                    <span className="tabular shrink-0 font-semibold">{r.score}{r.type === 'simulation' ? '/100' : '%'}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
            <CardDescription>For effort and good habits, separate from understanding scores</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {achievements.map((a) => (
              <AchievementTile key={a.slug} a={a} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Every concept as a tile, coloured by how well it is understood. Point at or tap one for the detail. */
function MasteryMap({ p }: { p: Progress }) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const [sel, setSel] = useState(() => p.concepts.find((c) => c.level !== 'not_started') ?? p.concepts[0])

  useAnime(
    ref,
    () => {
      animate('.hm-cell', { scale: { from: 0.4 }, opacity: { from: 0 }, delay: stagger(30, { start: 200 }), duration: 550, ease: 'outBack(1.8)' })
    },
    [],
  )

  const fill = (m: number | null, level: keyof typeof LEVEL_STYLE) =>
    level === 'not_started' ? 'var(--color-canvas)' : `color-mix(in srgb, ${LEVEL_STYLE[level].bar} ${Math.round(20 + (m ?? 0) * 45)}%, white)`

  return (
    <section ref={ref} aria-labelledby="concepts-h" data-reveal="" className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="concepts-h" className="text-lg font-extrabold">
            Concept mastery by pillar
          </h2>
          <p className="mt-1 text-sm text-muted">Darker means stronger. Point at a tile, or tab to it, to see the evidence behind it.</p>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
          {(['not_started', 'needs_practice', 'developing', 'mastered'] as const).map((l) => (
            <li key={l} className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-[4px] ring-1 ring-line" style={{ background: fill(0.8, l) }} /> {LEVEL_STYLE[l].label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PILLAR_ORDER.map((pillar) => {
            const m = p.modules.find((x) => x.pillar === pillar)
            return (
              <div key={pillar}>
                <div className="mb-2 flex items-center gap-2">
                  <PillarIcon pillar={pillar} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{t(PILLARS[pillar].titleKey)}</p>
                    <p className="font-mono text-[10px] text-muted">{m?.completed ? 'complete' : `${Math.round(m?.percent ?? 0)}%`}</p>
                  </div>
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {p.concepts
                    .filter((c) => c.pillar === pillar)
                    .map((c) => {
                      const on = sel?.concept === c.concept
                      return (
                        <li key={c.concept}>
                          <button
                            type="button"
                            onMouseEnter={() => setSel(c)}
                            onFocus={() => setSel(c)}
                            onClick={() => setSel(c)}
                            aria-pressed={on}
                            aria-label={`${c.title}: ${LEVEL_STYLE[c.level].label}${c.mastery != null ? `, ${Math.round(c.mastery * 100)}%` : ''}`}
                            className={cn(
                              'hm-cell grid aspect-square w-full place-items-center rounded-lg border font-mono text-[11px] font-bold transition-all duration-200 hover:scale-105',
                              on ? 'scale-105 border-ink shadow-md' : 'border-line',
                              c.level === 'not_started' ? 'text-muted' : 'text-ink',
                            )}
                            style={{ background: fill(c.mastery, c.level) }}
                          >
                            {c.mastery != null ? Math.round(c.mastery * 100) : '–'}
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </div>
            )
          })}
        </div>

        {sel && (
          <div className="rounded-2xl border border-line bg-canvas p-5" aria-live="polite">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted">Selected concept</p>
            <p className="mt-1 text-xl font-extrabold leading-tight">{sel.title}</p>
            <p className={cn('mt-1 text-sm font-bold', LEVEL_STYLE[sel.level].color)}>{LEVEL_STYLE[sel.level].label}</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="font-mono text-5xl font-black tabular leading-none">{sel.mastery != null ? Math.round(sel.mastery * 100) : '–'}</span>
              <span className="pb-1 text-sm text-muted">/ 100 understanding</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(sel.mastery ?? 0) * 100}%`, background: LEVEL_STYLE[sel.level].bar }} />
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              Based on {sel.evidence_count} piece{sel.evidence_count === 1 ? '' : 's'} of evidence from your answers and decisions.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
