import { NotebookPen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { JournalEntry } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { swap } from '@/lib/motion'
import { cn } from '@/lib/utils'

const ACTION = {
  buy: { label: 'Bought', cls: 'bg-accent-soft text-accent-ink' },
  sell: { label: 'Sold', cls: 'bg-danger-soft text-danger-ink' },
  hold: { label: 'Held', cls: 'bg-canvas text-ink-soft ring-1 ring-line-strong' },
}

/** Every decision with its reason, and what happened after it. */
export function DecisionJournal({ entries, onOpen }: { entries: JournalEntry[]; onOpen: (key: string) => void }) {
  return (
    <section aria-labelledby="pq-journal" className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Decision journal
      </p>
      <h2 id="pq-journal" className="mt-1 text-lg font-extrabold">
        What happened after your decisions?
      </h2>
      {entries.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-soft">
          <NotebookPen className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          Every buy, sell or hold you log appears here with the reason you chose. After the market moves, each one shows what it did to your money and which news caused it.
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          <AnimatePresence initial={false}>
            {entries.map((j) => {
              const a = ACTION[j.action]
              const effect = j.outcome?.effect_paise ?? 0
              return (
                <motion.li key={j.id} variants={swap} initial="hidden" animate="show" exit="exit" layout="position" className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', a.cls)}>{a.label}</span>
                    <span className="font-semibold">
                      {j.action === 'hold' ? '' : `${j.qty} × `}
                      {j.key ? (
                        <button type="button" onClick={() => onOpen(j.key!)} className="hover:text-primary hover:underline">
                          {j.name}
                        </button>
                      ) : null}
                    </span>
                    <span className="text-muted">
                      at {inrPaise(j.price_paise)} · {j.label}
                    </span>
                    <span className="ml-auto rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-ink">{j.reason_label}</span>
                  </div>
                  {j.outcome ? (
                    <div className="mt-3 rounded-xl bg-canvas p-3 text-sm">
                      <p className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-ink-soft">{j.outcome.text}</span>
                        {j.action !== 'hold' || j.qty > 0 ? (
                          <span className={cn('shrink-0 font-bold tabular', effect > 0 ? 'text-accent-ink' : effect < 0 ? 'text-danger-ink' : 'text-muted')}>
                            {effect > 0 ? '▲ +' : effect < 0 ? '▼ −' : ''}
                            {inrPaise(Math.abs(effect))}
                            <span className="sr-only"> effect on you</span>
                          </span>
                        ) : null}
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {j.outcome.causes.map((c) => (
                          <li key={c} className="flex gap-1.5">
                            <span aria-hidden>→</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted">Made this step. Move on to see what happens next.</p>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  )
}
