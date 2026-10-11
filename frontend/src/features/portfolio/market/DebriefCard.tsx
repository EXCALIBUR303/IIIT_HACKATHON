import { Check, Coins, GraduationCap, X } from 'lucide-react'
import { motion } from 'motion/react'
import { forwardRef, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RadioCards } from '@/components/ui/radio-cards'
import { ApiError } from '@/lib/api/client'
import { api } from '@/lib/api/endpoints'
import type { LabSession } from '@/lib/api/types'
import { EASE_OUT } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { newRequestId } from './lib'

/** The reflection that ends a scenario. Coins reward understanding, never profit. */
export const DebriefCard = forwardRef<HTMLElement, { session: LabSession; onSession: (s: LabSession) => void; onPlayAnother: () => void }>(function DebriefCard(
  { session, onSession, onPlayAnother },
  ref,
) {
  const d = session.debrief!
  const [answer, setAnswer] = useState<string | null>(d.answer)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rid = useRef(newRequestId())
  const done = session.status === 'completed'

  async function submit() {
    if (!answer) return
    setBusy(true)
    setError(null)
    try {
      onSession(await api.market.finish(rid.current, answer))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit your answer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="pq-debrief"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="rounded-[var(--radius-panel)] border-2 border-primary/25 bg-surface p-5 shadow-[var(--shadow-raised)] outline-none sm:p-6"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
        <GraduationCap className="size-4" aria-hidden /> Scenario debrief
      </p>
      <h2 id="pq-debrief" className="mt-1 text-lg font-extrabold">
        {d.prompt}
      </h2>
      {done ? (
        <div className="mt-4 space-y-3">
          <ul className="space-y-2">
            {d.options.map((o) => {
              const right = o.key === d.correct_key
              const picked = o.key === d.answer
              return (
                <li key={o.key} className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', right ? 'border-accent bg-accent-soft' : picked ? 'border-danger/40 bg-danger-soft' : 'border-line text-muted')}>
                  {right ? <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden /> : picked ? <X className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden /> : <span className="size-4 shrink-0" />}
                  <span>
                    {o.text}
                    {right && <span className="sr-only"> (correct answer)</span>}
                    {picked && !right && <span className="sr-only"> (your answer)</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="text-sm text-ink-soft">{d.explanation}</p>
          {session.scenario.lesson && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
              <strong>Lesson: </strong>
              {session.scenario.lesson}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={cn('flex items-center gap-1.5 text-sm font-semibold', d.reward ? 'text-reward-ink' : 'text-muted')}>
              <Coins className="size-4" aria-hidden />
              {d.reward ? `Learning reward added to your wallet: +${d.reward} RR coins` : d.correct ? 'Lesson already rewarded for this scenario' : 'No reward this time. Replay it to try again.'}
            </p>
            <Button onClick={onPlayAnother}>Play another scenario</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <RadioCards label={d.prompt} options={d.options.map((o) => ({ value: o.key, label: o.text }))} value={answer} onChange={setAnswer} columns="grid-cols-1" size="sm" />
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
              {error}
            </p>
          )}
          <Button onClick={submit} disabled={!answer} loading={busy}>
            Finish scenario
          </Button>
        </div>
      )}
    </motion.section>
  )
})
