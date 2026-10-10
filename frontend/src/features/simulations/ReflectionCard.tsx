import { CheckCircle2, Lightbulb, XCircle } from 'lucide-react'
import { useState } from 'react'
import { RewardEarned } from '@/components/common/rewards'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import type { ReflectionResult } from '@/lib/api/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { OptionCard } from './shared'

type Confidence = 'low' | 'medium' | 'high'

/** "Explain why": a multiple-choice reflection after a finished mission (no free text collected). */
export function ReflectionCard({ sessionId }: { sessionId: string }) {
  const prompt = useAsync(() => api.reflections.prompt(sessionId), [sessionId])
  const [selected, setSelected] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<Confidence>('medium')
  const [result, setResult] = useState<ReflectionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (prompt.loading || !prompt.data || !prompt.data.available) return null
  const p = prompt.data

  async function submit() {
    if (!selected || !p.question_key) return
    setBusy(true)
    setError(null)
    try {
      setResult(await api.reflections.answer({ session_id: sessionId, question_key: p.question_key, selected, confidence }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        <Lightbulb className="size-4" aria-hidden /> Explain what happened
      </div>
      <h2 className="mt-1 text-lg font-extrabold">{p.prompt}</h2>
      {!result ? (
        <>
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="Reflection options">
            {p.options.map((o) => (
              <OptionCard key={o.key} selected={selected === o.key} onSelect={() => setSelected(o.key)} title={o.text} />
            ))}
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">How sure are you?</legend>
            <div className="mt-2 flex gap-2" role="radiogroup">
              {(['low', 'medium', 'high'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={confidence === c}
                  onClick={() => setConfidence(c)}
                  className={cn('h-11 rounded-xl border px-4 text-sm font-semibold capitalize', confidence === c ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line-strong bg-surface text-ink-soft hover:bg-canvas')}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">{error}</p>}
          <Button className="mt-4" disabled={!selected} loading={busy} onClick={submit}>
            Check my explanation
          </Button>
        </>
      ) : (
        <div className="mt-4 space-y-3" role="status">
          <p className={cn('flex items-start gap-2 font-semibold', result.correct ? 'text-accent-ink' : 'text-warning-ink')}>
            {result.correct ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
            {result.correct ? 'Yes, that explains it.' : 'Not quite. Here is the better explanation.'}
          </p>
          <p className="text-sm text-ink-soft">{result.explanation}</p>
          {!result.correct && (
            <p className="rounded-lg bg-primary-soft p-3 text-sm text-primary-ink">
              <strong>Better answer:</strong> {result.correct_option.text}
              {result.misconception && <span className="mt-1 block text-xs">Common mix-up: {result.misconception}.</span>}
            </p>
          )}
          <RewardEarned rewards={result.rewards.map((r) => ({ amount: r.amount, reason: r.reason, rule_key: r.rule_key, concept: r.concept }))} />
        </div>
      )}
    </Card>
  )
}
