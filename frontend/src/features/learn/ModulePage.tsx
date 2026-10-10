import { ArrowLeft, BookOpen, CheckCircle2, ClipboardCheck, Play, RotateCcw, Target } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DifficultyBadge } from '@/components/common/badges'
import { PILLARS, PillarIcon } from '@/components/common/pillars'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProfile } from '@/features/onboarding/StudentGate'
import { api } from '@/lib/api/endpoints'
import { useI18n } from '@/lib/i18n'
import { useAsync } from '@/lib/useAsync'

export default function ModulePage() {
  const { moduleSlug } = useParams()
  const { t } = useI18n()
  const { profile } = useProfile()
  const data = useAsync(
    () => Promise.all([api.content.modules(), api.content.concepts(), api.simulations.list(), api.assessments.list()]),
    [moduleSlug],
  )

  if (data.error) return <ErrorState message={data.error.message} onRetry={data.reload} />
  if (data.loading || !data.data) return <LoadingState rows={3} />
  const [modules, concepts, sessions, assessments] = data.data
  const module = modules.find((m) => m.slug === moduleSlug)
  if (!module)
    return (
      <EmptyState title="Module not found" action={<Button asChild variant="outline"><Link to="/app/learn">Back to modules</Link></Button>} />
    )
  const meta = PILLARS[module.pillar]
  const quiz = assessments.find((a) => a.slug === module.quiz_slug)

  return (
    <div className="space-y-6">
      <Link to="/app/learn" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All modules
      </Link>
      <header className="flex items-start gap-4">
        <PillarIcon pillar={module.pillar} size={56} />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: meta.color }}>
            Module {module.order}
          </p>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t(meta.titleKey)}</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">{module.summary}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="sims-h" className="space-y-3">
          <h2 id="sims-h" className="text-lg font-bold">
            Simulations
          </h2>
          {module.scenarios.map((s) => {
            const attempts = sessions.filter((x) => x.scenario_slug === s.slug && x.status === 'completed')
            const best = attempts.reduce<number | null>((b, x) => (x.score != null && (b == null || x.score > b) ? x.score : b), null)
            const forYou = s.persona_key && s.persona_key === profile.persona_key
            return (
              <Card key={s.slug} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <DifficultyBadge level={s.difficulty} />
                  {forYou && <Badge tone="primary">Your persona</Badge>}
                  {best != null && (
                    <Badge tone="success">
                      <CheckCircle2 /> Best {best}/100
                    </Badge>
                  )}
                </div>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.intro}</p>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                  <Target className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {s.objective}
                </p>
                <Button asChild size="sm" className="mt-4" variant={attempts.length ? 'outline' : 'primary'}>
                  <Link to={`/app/play/${s.slug}`}>
                    {attempts.length ? <RotateCcw /> : <Play />}
                    {attempts.length ? `Try again (${attempts.length} done)` : 'Start simulation'}
                  </Link>
                </Button>
              </Card>
            )
          })}
        </section>

        <aside className="space-y-6">
          {quiz && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-5 text-primary" aria-hidden /> {quiz.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-ink-soft">{quiz.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {quiz.attempts ? `Best score ${quiz.best_score}% from ${quiz.attempts} attempt(s). ` : ''}
                  Retakes count for less in your understanding score, so read the explanations first.
                </p>
                <Button asChild size="sm" className="mt-4" variant="secondary">
                  <Link to={`/app/assessments/${quiz.slug}`}>{quiz.attempts ? 'Retake quiz' : 'Take quiz'}</Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-5 text-primary" aria-hidden /> Key ideas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                {module.concepts.map((key) => {
                  const c = concepts.find((x) => x.key === key)
                  if (!c) return null
                  return (
                    <div key={key}>
                      <dt className="font-semibold">{c.title}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{c.explanation}</dd>
                      <dd className="mt-1.5 rounded-lg bg-canvas p-2.5 text-xs text-ink-soft">
                        <span className="font-semibold">Example: </span>
                        {c.example}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
