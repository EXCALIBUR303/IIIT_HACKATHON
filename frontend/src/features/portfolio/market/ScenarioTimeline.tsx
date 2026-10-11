import { Check, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { LabSession } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { EASE_OUT, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { CategoryChip, Delta, ImpactChip } from './bits'
import { CATEGORY } from './lib'

/** Where you are in the scenario, what just happened, and today's breaking event. */
export function ScenarioTimeline({ session, onOpenCompany }: { session: LabSession; onOpenCompany: (key: string) => void }) {
  const s = session
  const revealed = new Map(s.events.map((e) => [e.step, e]))
  const fresh = s.events.filter((e) => e.is_new)
  const names = Object.fromEntries(s.companies.map((c) => [c.key, c.name]))
  return (
    <section aria-labelledby="pq-timeline" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pq-timeline" className="text-lg font-extrabold">
          Scenario timeline
        </h2>
        <p className="text-sm text-muted">{s.scenario.summary}</p>
      </div>

      <ol className="mt-5 flex gap-1.5 overflow-x-auto pb-1" aria-label={`${s.step_label} of ${s.scenario.labels.length}`}>
        {s.scenario.labels.map((label, i) => {
          const ev = revealed.get(i)
          const past = i < s.step
          const now = i === s.step
          const Icon = ev ? CATEGORY[ev.category].icon : null
          return (
            <li key={label} className="relative min-w-[4.5rem] flex-1" aria-current={now ? 'step' : undefined}>
              {now && <motion.span layoutId="pq-step" className="absolute inset-0 rounded-xl bg-primary-soft ring-1 ring-primary/25" transition={SPRING} />}
              <div className="relative flex flex-col items-center gap-1.5 px-1 py-2.5">
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full border-2 text-[11px] font-bold',
                    past ? 'border-investing bg-investing text-white' : now ? 'border-primary bg-surface text-primary' : 'border-line bg-surface text-muted',
                  )}
                >
                  {past ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : Icon ? <Icon className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn('whitespace-nowrap text-xs font-semibold', now ? 'text-primary-ink' : 'text-muted')}>{label}</span>
                {ev && <span role="img" className="size-1.5 rounded-full bg-reward" title={ev.headline} aria-label={`News: ${ev.headline}`} />}
              </div>
            </li>
          )
        })}
      </ol>

      {s.recap && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-canvas p-4 text-sm sm:grid-cols-4">
          <p className="font-bold sm:col-span-4">{s.recap.label} recap</p>
          <Fact label="Whole market">
            <Delta pct={s.recap.market_pct} />
          </Fact>
          <Fact label="Your portfolio">
            <span className={cn('tabular font-semibold', s.recap.portfolio_change_paise > 0 ? 'text-accent-ink' : s.recap.portfolio_change_paise < 0 ? 'text-danger-ink' : 'text-muted')}>
              {s.recap.portfolio_change_paise > 0 ? '▲ +' : s.recap.portfolio_change_paise < 0 ? '▼ −' : ''}
              {inrPaise(Math.abs(s.recap.portfolio_change_paise))}
            </span>
          </Fact>
          <Fact label="Best mover">
            <button type="button" className="font-semibold hover:underline" onClick={() => onOpenCompany(s.recap!.best.key)}>
              {s.recap.best.name}
            </button>{' '}
            <Delta pct={s.recap.best.pct} />
          </Fact>
          <Fact label="Worst mover">
            <button type="button" className="font-semibold hover:underline" onClick={() => onOpenCompany(s.recap!.worst.key)}>
              {s.recap.worst.name}
            </button>{' '}
            <Delta pct={s.recap.worst.pct} />
          </Fact>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {fresh.map((e) => (
          <motion.article
            key={`${e.step}-${e.headline}`}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="relative mt-4 overflow-hidden rounded-2xl border border-reward/50 bg-reward-soft/50 p-4 sm:p-5"
            role="status"
          >
            {/* A single sweep across the card when breaking news lands. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
              initial={{ x: '0%' }}
              animate={{ x: '450%' }}
              transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.2 }}
            />
            <div className="relative flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-reward px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-navy">
                <Zap className="size-3" aria-hidden /> Breaking · {e.label}
              </span>
              <CategoryChip category={e.category} />
              <ImpactChip impact={e.impact} />
            </div>
            <h3 className="relative mt-2 text-base font-extrabold leading-snug">{e.headline}</h3>
            <p className="relative mt-1 text-sm text-ink-soft">{e.body}</p>
            <p className="relative mt-2 text-sm">
              <span className="font-semibold">Why it matters: </span>
              <span className="text-ink-soft">{e.why}</span>
            </p>
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              {(e.affected.length > 4 ? [] : e.affected).map((k) => (
                <button key={k} type="button" onClick={() => onOpenCompany(k)} className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold hover:border-primary hover:text-primary">
                  {names[k] ?? k}
                </button>
              ))}
              {e.affected.length > 4 && <span className="text-xs font-semibold text-muted">Affects the whole market</span>}
            </div>
          </motion.article>
        ))}
      </AnimatePresence>
    </section>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 truncate">{children}</p>
    </div>
  )
}
