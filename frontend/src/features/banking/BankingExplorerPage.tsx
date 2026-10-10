import { animate, stagger } from 'animejs'
import { Check, ExternalLink, Landmark, ShieldAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { RewardEarned } from '@/components/common/rewards'
import { ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import type { ExplorerAnswer, ExplorerJourney, ExplorerStop } from '@/lib/api/types'
import { useAsync } from '@/lib/useAsync'
import { useAnime } from '@/lib/anime'
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
          <MetroMap stops={j.stops} active={active} onPick={setActive} completed={j.completed} total={j.total} />
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

/** The seven stops drawn as a metro line: a station per stop, filled as you understand it. */
function MetroMap({ stops, active, onPick, completed, total }: { stops: ExplorerStop[]; active: number; onPick: (i: number) => void; completed: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const furthest = stops.reduce((m, s, i) => (s.completed ? i : m), -1)
  const fill = stops.length > 1 ? (Math.max(0, furthest) / (stops.length - 1)) * 100 : 0
  useAnime(
    ref,
    () => {
      animate('.mt-fill', { scaleX: { from: 0 }, duration: 1400, ease: 'inOutQuart', delay: 200 })
      animate('.mt-stn', { scale: { from: 0 }, delay: stagger(80, { start: 150 }), duration: 600, ease: 'outBack(2.4)' })
    },
    [],
  )
  return (
    <div ref={ref} className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Route · {total} stops</p>
        <p className="text-sm font-semibold text-ink-soft">
          {completed} of {total} stops understood
        </p>
      </div>
      <div className="relative -mx-2 overflow-x-auto px-2 pb-1">
        <ol className="relative flex min-w-[560px] justify-between" aria-label="Journey stops">
          <span className="absolute left-[18px] right-[18px] top-[17px] h-1.5 rounded-full bg-line" aria-hidden>
            <span className="mt-fill block h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${fill}%` }} />
          </span>
          {stops.map((s, i) => {
            const on = i === active
            return (
              <li key={s.key} className="relative flex w-0 flex-1 flex-col items-center first:items-start last:items-end">
                <button
                  onClick={() => onPick(i)}
                  aria-current={on ? 'step' : undefined}
                  aria-label={`Stop ${i + 1}: ${s.title}${s.completed ? ' (completed)' : ''}`}
                  className="group flex flex-col items-center gap-2 rounded-xl p-0.5"
                >
                  <span
                    className={cn(
                      'mt-stn relative z-10 grid size-10 place-items-center rounded-full border-[3px] font-mono text-xs font-black transition-all duration-300 group-hover:scale-110',
                      s.completed ? 'border-accent bg-accent text-white' : on ? 'border-primary bg-white text-primary' : 'border-line-strong bg-white text-muted',
                      on && 'ring-4 ring-primary/20 scale-110',
                    )}
                  >
                    {s.completed ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={cn('max-w-[88px] text-center text-[11px] font-semibold leading-tight', on ? 'text-primary' : 'text-muted group-hover:text-ink')}>
                    {s.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
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

  const cardRef = useRef<HTMLDivElement>(null)
  useAnime(
    cardRef,
    () => {
      animate('.sc-in', { opacity: { from: 0 }, y: { from: 14 }, delay: stagger(60), duration: 550, ease: 'outExpo' })
    },
    [],
  )
  useAnime(
    cardRef,
    () => {
      if (result) animate('.sc-result', { opacity: { from: 0 }, scale: { from: 0.96 }, y: { from: 8 }, duration: 500, ease: 'outBack(1.6)' })
    },
    [result],
  )

  return (
    <Card ref={cardRef} className="p-5 sm:p-7">
      <div className="sc-in flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        <Landmark className="size-4" aria-hidden /> {stop.title}
      </div>
      <p className="sc-in mt-3 rounded-xl border-l-4 border-primary/40 bg-canvas p-3 text-sm italic text-ink-soft">{stop.story}</p>
      <h2 className="mt-5 text-sm font-bold uppercase tracking-wider text-muted">What to know</h2>
      <ul className="sc-in mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">
        {stop.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <div className="sc-in mt-4 text-sm">
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
      <h2 className="sc-in mt-6 text-lg font-extrabold">{stop.question}</h2>
      <div className="sc-in mt-3 space-y-2" role="radiogroup" aria-label={stop.question}>
        {stop.options.map((o) => (
          <OptionCard key={o.key} selected={selected === o.key} onSelect={() => !result?.correct && setSelected(o.key)} title={o.text} />
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">{error}</p>}
      {result && (
        <div className="sc-result mt-4 space-y-3" role="status">
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
