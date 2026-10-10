import { CheckCircle2, MessageSquare, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { FeedbackList } from '@/components/common/feedback'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SafetyEvaluation, SafetyMessage, SafetySession } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { OptionCard } from '../shared'
import type { KindProps } from '../SimulationPage'

function PhoneMessage({ m }: { m: SafetyMessage }) {
  return (
    <div className="mx-auto max-w-md rounded-[1.75rem] border-8 border-ink bg-canvas p-4 shadow-[var(--shadow-raised)]">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-line text-ink-soft" aria-hidden>
          <MessageSquare className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{m.sender}</p>
          <p className="text-xs text-muted">{m.channel}</p>
        </div>
      </div>
      <p className="mt-4 rounded-2xl rounded-tl-sm bg-surface p-3.5 text-[0.95rem] leading-relaxed shadow-sm">{m.body}</p>
    </div>
  )
}

function Verdict({ e, labels }: { e: SafetyEvaluation; labels: Record<string, string> }) {
  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-2 rounded-xl p-3 font-semibold', e.verdict_correct ? 'bg-accent-soft text-accent-ink' : 'bg-danger-soft text-danger-ink')}>
        {e.verdict_correct ? <CheckCircle2 className="size-5" aria-hidden /> : <XCircle className="size-5" aria-hidden />}
        {e.verdict_correct ? 'Correct' : 'Not quite'}: this message is {e.correct_verdict === 'scam' ? 'a scam' : 'genuine'} · {e.score}/100
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">{e.explanation}</p>
      {(e.flags_found.length > 0 || e.flags_missed.length > 0) && (
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {e.flags_found.map((f) => (
            <li key={f} className="rounded-full bg-accent-soft px-2.5 py-1 font-semibold text-accent-ink">
              ✓ {labels[f] ?? f}
            </li>
          ))}
          {e.flags_missed.map((f) => (
            <li key={f} className="rounded-full bg-warning-soft px-2.5 py-1 font-semibold text-warning-ink">
              Missed: {labels[f] ?? f}
            </li>
          ))}
        </ul>
      )}
      <FeedbackList items={e.feedback.filter((f) => f.tone !== 'positive')} />
    </div>
  )
}

export function SafetyChallenge({ session, decide, busy, error }: KindProps<SafetySession>) {
  const { state } = session
  const flagLabels = Object.fromEntries(state.red_flags.map((f) => [f.key, f.label]))
  const actionLabels = Object.fromEntries(state.actions.map((a) => [a.key, a.label]))
  const answeredIds = new Set(state.answered.map((a) => a.message_id))
  const current = state.messages.find((m) => !answeredIds.has(m.id))
  const [verdict, setVerdict] = useState<'scam' | 'genuine' | null>(null)
  const [flags, setFlags] = useState<string[]>([])
  const [action, setAction] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<SafetyEvaluation | null>(null)

  async function submit() {
    if (!current || !verdict || !action) return
    const next = await decide('classify', { message_id: current.id, verdict, flags, action })
    const evaluation = next?.kind === 'safety' ? next.state.answered.find((a) => a.message_id === current.id) : undefined
    if (evaluation && next?.status === 'in_progress') setReviewing(evaluation)
    setVerdict(null)
    setFlags([])
    setAction(null)
  }

  if (session.status === 'completed' && session.result) {
    return (
      <div className="space-y-4">
        <p className="text-ink-soft">
          You judged {session.result.correct_verdicts} of {session.result.total} messages correctly. Review each one:
        </p>
        {session.result.messages.map((e) => {
          const m = state.messages.find((x) => x.id === e.message_id)!
          return (
            <Card key={e.message_id}>
              <CardHeader>
                <CardTitle className="text-sm">
                  {m.channel} · {m.sender}
                </CardTitle>
                <CardDescription className="line-clamp-2">{m.body}</CardDescription>
              </CardHeader>
              <CardContent>
                <Verdict e={e} labels={flagLabels} />
                <p className="mt-3 text-xs text-muted">
                  Your action: {actionLabels[e.action]} {e.action_safe ? '✓' : '✗'} · Best: {actionLabels[e.best_action]}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  if (reviewing) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Message {state.answered.length} of {state.messages.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Verdict e={reviewing} labels={flagLabels} />
          </CardContent>
        </Card>
        <Button size="lg" className="w-full" onClick={() => setReviewing(null)}>
          Next message
        </Button>
      </div>
    )
  }

  if (!current) return null
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-3 text-sm font-semibold text-muted">
          Message {state.answered.length + 1} of {state.messages.length}
        </p>
        <PhoneMessage m={current} />
      </div>
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-bold">1. Is this message a scam or genuine?</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(
              [
                ['scam', 'Scam', ShieldAlert],
                ['genuine', 'Genuine', ShieldCheck],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={verdict === key}
                onClick={() => setVerdict(key)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border-2 p-3 font-semibold transition-colors',
                  verdict === key
                    ? key === 'scam'
                      ? 'border-danger bg-danger-soft text-danger-ink'
                      : 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <Icon className="size-5" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-bold">2. Which red flags do you spot?</legend>
          <p className="mb-2 text-xs text-muted">Select all that apply. Genuine messages may have none.</p>
          <div className="flex flex-wrap gap-2">
            {state.red_flags.map((f) => {
              const on = flags.includes(f.key)
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFlags((xs) => (on ? xs.filter((x) => x !== f.key) : [...xs, f.key]))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    on ? 'border-warning-ink bg-warning-soft text-warning-ink' : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">3. What would you do?</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {state.actions.map((a) => (
              <OptionCard key={a.key} selected={action === a.key} onSelect={() => setAction(a.key)} title={a.label} />
            ))}
          </div>
        </fieldset>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button size="lg" className="w-full" disabled={!verdict || !action} loading={busy} onClick={submit}>
          Check my answer
        </Button>
      </div>
    </div>
  )
}
