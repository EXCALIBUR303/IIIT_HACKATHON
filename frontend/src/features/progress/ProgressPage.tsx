import { ArrowRight, Info, Sparkles, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AchievementTile } from '@/components/common/badges'
import { PILLAR_ORDER, PILLARS, PillarIcon } from '@/components/common/pillars'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { LEVEL_STYLE, recommendationLink } from '@/features/dashboard/DashboardPage'
import { api } from '@/lib/api/endpoints'
import { relativeDate } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'
import { StatTile } from '../simulations/shared'

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

      <section aria-labelledby="concepts-h" className="space-y-3">
        <h2 id="concepts-h" className="text-lg font-bold">
          Concept mastery by pillar
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PILLAR_ORDER.map((pillar) => {
            const m = p.modules.find((x) => x.pillar === pillar)
            return (
              <Card key={pillar} className="p-5">
                <div className="flex items-center gap-3">
                  <PillarIcon pillar={pillar} />
                  <div className="flex-1">
                    <p className="font-bold">{t(PILLARS[pillar].titleKey)}</p>
                    <p className="text-xs text-muted">
                      Module {m?.completed ? 'completed' : `${m?.percent ?? 0}% complete`}
                      {m?.quiz_best != null && ` · quiz best ${m.quiz_best}%`}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-3">
                  {p.concepts
                    .filter((c) => c.pillar === pillar)
                    .map((c) => (
                      <li key={c.concept}>
                        <div className="flex justify-between text-sm">
                          <span>{c.title}</span>
                          <span className={cn('text-xs font-semibold', LEVEL_STYLE[c.level].color)}>
                            {LEVEL_STYLE[c.level].label}
                            {c.mastery != null && ` · ${Math.round(c.mastery * 100)}%`}
                          </span>
                        </div>
                        <ProgressBar value={(c.mastery ?? 0) * 100} label={`${c.title} mastery`} className="mt-1 h-1.5" color={LEVEL_STYLE[c.level].bar} />
                        <p className="mt-0.5 text-[0.7rem] text-muted">{c.evidence_count} piece(s) of evidence</p>
                      </li>
                    ))}
                </ul>
              </Card>
            )
          })}
        </div>
      </section>

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
