import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { NewAchievements } from '@/components/common/badges'
import { ErrorState, LoadingState } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress'
import { api } from '@/lib/api/endpoints'
import type { AttemptResult } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

export default function AttemptResultPage() {
  const { attemptId = '' } = useParams()
  const location = useLocation()
  const fromState = (location.state as { result?: AttemptResult } | null)?.result
  const fetched = useAsync(() => (fromState ? Promise.resolve(fromState) : api.assessments.result(attemptId)), [attemptId])
  const concepts = useAsync(() => api.content.concepts(), [])

  if (fetched.error) return <ErrorState message={fetched.error.message} onRetry={fetched.reload} />
  if (fetched.loading || !fetched.data) return <LoadingState rows={3} />
  const r = fetched.data
  const title = (key: string) => concepts.data?.find((c) => c.key === key)?.title ?? key.replaceAll('_', ' ')
  const isQuiz = r.assessment_slug.startsWith('quiz-')
  const passed = r.score_pct >= 60

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <ProgressRing value={r.score_pct} size={104} stroke={10} label="Score" color={r.score_pct >= 60 ? 'var(--color-accent)' : 'var(--color-warning)'} />
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">
              {r.correct_count} of {r.total} correct
            </h1>
            <p className="mt-1 text-ink-soft">
              {r.assessment_slug === 'initial'
                ? 'This is your starting point, not a grade. Your activities will now adapt to it.'
                : r.assessment_slug === 'post'
                  ? 'Compare this with your starting check on your progress page.'
                  : passed
                    ? 'Quiz passed. Read the explanations below to lock in what you learned.'
                    : 'Not passed yet (60% needed). Review the explanations, then try again.'}
            </p>
          </div>
        </div>
        {r.new_achievements.length > 0 && (
          <div className="mt-5">
            <NewAchievements slugs={r.new_achievements} />
          </div>
        )}
        {r.flagged_guessing && (
          <Alert tone="warning" className="mt-5" title="Some answers were very fast">
            Answers given in under two seconds count less toward your understanding scores. Take your time to read each question.
          </Alert>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button asChild>
            <Link to="/app">
              Next recommended activity <ArrowRight />
            </Link>
          </Button>
          {isQuiz && (
            <Button asChild variant="outline">
              <Link to={`/app/assessments/${r.assessment_slug}`}>Retake quiz</Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link to="/app/progress">View progress</Link>
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By concept</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {Object.entries(r.concepts).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-sm">
                  <span>{title(k)}</span>
                  <span className={cn('tabular font-semibold', v.correct === v.total ? 'text-accent-ink' : v.correct === 0 ? 'text-danger-ink' : 'text-warning-ink')}>
                    {v.correct}/{v.total}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ideas to revisit</CardTitle>
          </CardHeader>
          <CardContent>
            {r.misconceptions.length === 0 ? (
              <p className="text-sm text-muted">No misconceptions detected in this attempt. Nicely done.</p>
            ) : (
              <ul className="space-y-2">
                {r.misconceptions.map((m) => (
                  <li key={m.key} className="flex gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <span className="first-letter:uppercase">{m.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="review-h" className="space-y-3">
        <h2 id="review-h" className="text-lg font-bold">
          Question review
        </h2>
        {r.questions.map((q, i) => (
          <Card key={q.question_slug} className="p-5">
            <div className="flex gap-3">
              {q.is_correct ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-label="Correct" />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-label="Incorrect" />
              )}
              <div className="flex-1 space-y-2">
                <p className="font-semibold">
                  {i + 1}. {q.prompt}
                </p>
                <p className="text-sm text-ink-soft">
                  <span className="font-semibold">Your answer ({q.selected.toUpperCase()}): </span>
                  {q.explanation}
                </p>
                {!q.is_correct && (
                  <p className="rounded-lg bg-accent-soft p-2.5 text-sm text-accent-ink">
                    <span className="font-semibold">Correct answer ({q.correct_key.toUpperCase()}): </span>
                    {q.correct_explanation}
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </section>
    </div>
  )
}
