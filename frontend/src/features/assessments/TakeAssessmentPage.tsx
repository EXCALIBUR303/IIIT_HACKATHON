import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { ApiError } from '@/lib/api/client'
import { api } from '@/lib/api/endpoints'
import type { ResponseInput } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { errorMessage, useAsync } from '@/lib/useAsync'

type Confidence = NonNullable<ResponseInput['confidence']>

export default function TakeAssessmentPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const attempt = useAsync(() => api.assessments.start(slug), [slug])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseInput>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shownAt = useRef<number>(0)
  const elapsed = useRef<Record<string, number>>({})

  // Time spent per question (accumulated across visits) helps detect rapid guessing.
  useEffect(() => {
    shownAt.current = performance.now()
    const q = attempt.data?.questions[index]
    return () => {
      if (q) elapsed.current[q.slug] = (elapsed.current[q.slug] ?? 0) + (performance.now() - shownAt.current)
    }
  }, [index, attempt.data])

  if (attempt.error) {
    const locked = attempt.error instanceof ApiError && attempt.error.status === 409
    return locked ? (
      <Alert tone="warning" title="Not available right now" action={<Button asChild variant="outline" size="sm"><Link to="/app/assessments">Back to checks</Link></Button>}>
        {attempt.error.message}
      </Alert>
    ) : (
      <ErrorState message={attempt.error.message} onRetry={attempt.reload} />
    )
  }
  if (attempt.loading || !attempt.data) return <LoadingState rows={2} />

  const { questions, assessment } = attempt.data
  const q = questions[index]
  const current = answers[q.slug]
  const answeredCount = Object.keys(answers).length
  const last = index === questions.length - 1

  function choose(option_key: string) {
    setAnswers((a) => ({ ...a, [q.slug]: { ...a[q.slug], question_slug: q.slug, option_key } }))
  }
  function setConfidence(confidence: Confidence) {
    setAnswers((a) => ({ ...a, [q.slug]: { ...a[q.slug], confidence } }))
  }

  async function submit() {
    elapsed.current[q.slug] = (elapsed.current[q.slug] ?? 0) + (performance.now() - shownAt.current)
    shownAt.current = performance.now()
    setBusy(true)
    setError(null)
    try {
      const responses = questions.map((x) => ({ ...answers[x.slug], response_ms: Math.round(elapsed.current[x.slug] ?? 0) }))
      const result = await api.assessments.submit(attempt.data!.attempt_id, responses)
      navigate(`/app/results/${result.attempt_id}`, { replace: true, state: { result } })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link to="/app/assessments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Exit
        </Link>
        <h1 className="mt-3 text-xl font-extrabold sm:text-2xl">{assessment.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={((index + 1) / questions.length) * 100} label="Question progress" />
          <span className="shrink-0 text-sm font-semibold text-muted">
            {index + 1}/{questions.length}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.slug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          <Card className="p-5 sm:p-7">
            <fieldset>
              <legend className="text-lg font-bold leading-snug">{q.prompt}</legend>
              <div className="mt-5 space-y-2.5" role="radiogroup">
                {q.options.map((o) => {
                  const selected = current?.option_key === o.key
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => choose(o.key)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-colors',
                        selected ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span
                        className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase', selected ? 'bg-primary text-white' : 'bg-canvas text-ink-soft ring-1 ring-line')}
                        aria-hidden
                      >
                        {o.key}
                      </span>
                      <span className="pt-0.5 text-[0.95rem]">{o.text}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
            {current?.option_key && (
              <fieldset className="mt-5 border-t border-line pt-4">
                <legend className="text-sm font-semibold text-ink-soft">How sure are you? (optional)</legend>
                <div className="mt-2 flex gap-2">
                  {(['low', 'medium', 'high'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={current.confidence === c}
                      onClick={() => setConfidence(c)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold capitalize',
                        current.confidence === c ? 'border-primary bg-primary text-white' : 'border-line text-ink-soft hover:border-line-strong',
                      )}
                    >
                      {c === 'low' ? 'Guessing' : c === 'medium' ? 'Fairly sure' : 'Very sure'}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
          <ArrowLeft /> Previous
        </Button>
        {last ? (
          <Button onClick={submit} loading={busy} disabled={answeredCount < questions.length}>
            <Send /> Submit answers
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)} disabled={!current?.option_key}>
            Next <ArrowRight />
          </Button>
        )}
      </div>
      {last && answeredCount < questions.length && (
        <p className="mt-3 text-right text-sm text-warning-ink">{questions.length - answeredCount} question(s) still unanswered.</p>
      )}
    </div>
  )
}
