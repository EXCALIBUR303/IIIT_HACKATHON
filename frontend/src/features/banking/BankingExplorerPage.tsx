import { Check, ExternalLink, Landmark, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { RewardEarned } from '@/components/common/rewards'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import type { ExplorerAnswer, ExplorerJourney, ExplorerStop } from '@/lib/api/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { OptionCard } from '@/features/simulations/shared'

export default function BankingExplorerPage() {
  const journey = useAsync(() => api.banking.get(), [])
  const [data, setData] = useState<ExplorerJourney | null>(null)
  const j = data ?? journey.data
  const [active, setActive] = useState(0)

  return (
    <div>
      <PageHeader
        eyebrow="Banking Explorer"
        title="How your first bank account works"
        description="A guided tour of the real rules in India, with the official source for every fact. You will never be asked for any real account or identity details here."
      />
      {journey.loading && !j && <LoadingState rows={2} />}
      {journey.error && !j && <ErrorState message={journey.error.message} onRetry={journey.reload} />}
      {j && (
        <div className="space-y-5">
          <Alert tone="info" title="Learning only">
            {j.disclaimer}
            <span className="mt-1 block text-xs">Sources last checked: {j.last_verified}</span>
          </Alert>
          <ol className="flex flex-wrap gap-2" aria-label="Journey stops">
            {j.stops.map((s, i) => (
              <li key={s.key}>
                <button
                  onClick={() => setActive(i)}
                  aria-current={i === active ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold',
                    i === active ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line-strong bg-surface text-ink-soft hover:bg-canvas',
                  )}
                >
                  <span className={cn('inline-flex size-6 items-center justify-center rounded-full text-xs', s.completed ? 'bg-accent-ink text-white' : 'bg-line text-muted')}>
                    {s.completed ? <Check className="size-3.5" aria-label="completed" /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">Stop {i + 1}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-sm font-semibold text-ink-soft">
            {j.completed} of {j.total} stops understood
          </p>
          <StopCard
            key={j.stops[active].key}
            stop={j.stops[active]}
            last={active === j.stops.length - 1}
            onAnswered={async () => setData(await api.banking.get())}
            onNext={() => setActive((a) => Math.min(a + 1, j.stops.length - 1))}
          />
        </div>
      )}
    </div>
  )
}

function StopCard({ stop, last, onAnswered, onNext }: { stop: ExplorerStop; last: boolean; onAnswered: () => Promise<void>; onNext: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<ExplorerAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const out = await api.banking.answer(stop.key, selected)
      setResult(out)
      await onAnswered()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        <Landmark className="size-4" aria-hidden /> {stop.title}
      </div>
      <p className="mt-3 rounded-xl bg-canvas p-3 text-sm italic text-ink-soft">{stop.story}</p>
      <h2 className="mt-5 text-sm font-bold uppercase tracking-wider text-muted">What to know</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">
        {stop.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <div className="mt-4 text-sm">
        <p className="font-semibold">Official sources</p>
        <ul className="mt-1 space-y-1">
          {stop.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1.5 text-primary underline-offset-4 hover:underline">
                <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {s.title} <span className="text-muted">({s.publisher})</span>
                </span>
              </a>
              <p className="ml-5 text-xs text-muted">Check status: {s.checked}</p>
            </li>
          ))}
        </ul>
      </div>
      <h2 className="mt-6 text-lg font-extrabold">{stop.question}</h2>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label={stop.question}>
        {stop.options.map((o) => (
          <OptionCard key={o.key} selected={selected === o.key} onSelect={() => !result?.correct && setSelected(o.key)} title={o.text} />
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3" role="status">
          <p className={cn('font-semibold', result.correct ? 'text-accent-ink' : 'text-warning-ink')}>{result.correct ? 'Correct.' : 'Not quite. Have another look at the facts, then try again.'}</p>
          <p className="text-sm text-ink-soft">{result.explanation}</p>
          <RewardEarned rewards={result.rewards.map((r) => ({ amount: r.amount, reason: r.reason, rule_key: r.rule_key, concept: r.concept }))} />
          {result.journey_complete && (
            <p className="flex items-center gap-2 rounded-lg bg-accent-soft p-3 text-sm font-semibold text-accent-ink">
              <ShieldAlert className="size-4" aria-hidden /> You finished the whole journey. Remember: RupeeRise can never open or check a real account.
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {!result?.correct && (
          <Button disabled={!selected} loading={busy} onClick={check}>
            Check my answer
          </Button>
        )}
        {result?.correct && !last && <Button onClick={onNext}>Next stop</Button>}
      </div>
    </Card>
  )
}
