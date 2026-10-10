import { ArrowRight, Check, Clock, Gauge, Layers, Lock, Repeat } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api/endpoints'
import type { PortfolioView } from '@/lib/api/types'
import { EASE_OUT, fadeUp, staggerChildren } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'

const UNLOCKS = [
  { icon: Layers, title: 'Simulated holdings', text: 'Own fictional baskets and see each one’s value, cost and weight.' },
  { icon: Repeat, title: 'Buy and sell practice', text: 'Get a quote, confirm the trade, and watch cash and holdings update.' },
  { icon: Clock, title: 'Risk over time', text: 'Move through ten pretend years and live with good and bad ones.' },
  { icon: Gauge, title: 'Portfolio value', text: 'Track your total year by year, and reflect on what moved it.' },
]

const PLANNER_STAGES = new Set(['future_planner', 'investor_sandbox'])

/** A static, decorative preview of what the quest looks like. It has no controls. */
function PreviewArt() {
  return (
    <div className="relative h-full min-h-56 overflow-hidden rounded-2xl border border-line bg-canvas" aria-hidden>
      <div className="bg-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-x-5 top-5 flex gap-2 blur-[1.5px]">
        {['Cash', 'Invested', 'Total'].map((l, i) => (
          <div key={l} className="flex-1 rounded-xl border border-line bg-surface p-2.5">
            <div className="h-2 w-10 rounded bg-line" />
            <div className="mt-2 h-3 rounded bg-line-strong" style={{ width: `${60 + i * 12}%` }} />
          </div>
        ))}
      </div>
      <svg viewBox="0 0 400 160" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-3/5 w-full blur-[1px]">
        <path d="M0 130 L50 118 L90 124 L140 96 L190 104 L240 74 L290 86 L340 52 L400 40 L400 160 L0 160Z" fill="var(--color-practice)" fillOpacity="0.1" />
        <motion.path
          d="M0 130 L50 118 L90 124 L140 96 L190 104 L240 74 L290 86 L340 52 L400 40"
          fill="none"
          stroke="var(--color-practice)"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3.5 py-2 text-sm font-semibold text-ink-soft shadow-[var(--shadow-card)]">
          <Lock className="size-4 text-practice" /> Preview
        </span>
      </div>
    </div>
  )
}

export function LockedJourney({ view }: { view: PortfolioView }) {
  const modules = useAsync(() => api.content.modules(), [])
  const investing = Array.isArray(modules.data) ? modules.data.find((m) => m.pillar === 'investing') : undefined
  const stageOk = PLANNER_STAGES.has(view.access.stage)
  const steps = [
    { done: stageOk, title: 'Reach the Future Planner stage', text: 'Portfolio Quest is for Classes 11–12 and above.' },
    { done: false, title: 'Finish one investing mission', text: 'So you already know what risk and time horizon mean.' },
    { done: false, title: 'Open the quest', text: 'You start with ₹10,000 of pretend practice cash.' },
  ]
  const nextIndex = steps.findIndex((s) => !s.done)

  return (
    <motion.div variants={staggerChildren(0.08)} initial="hidden" animate="show" className="space-y-6">
      <motion.section
        variants={fadeUp}
        aria-labelledby="locked-h"
        className="grid gap-6 rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7 lg:grid-cols-[1.1fr_1fr]"
      >
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-practice-soft px-2.5 py-1 text-xs font-bold text-practice-ink ring-1 ring-practice/20">
            <Lock className="size-3.5" aria-hidden /> Locked
          </p>
          <h2 id="locked-h" className="mt-3 text-2xl font-extrabold tracking-tight">
            Not unlocked yet
          </h2>
          <p className="mt-1.5 text-ink-soft">{view.access.reason}</p>

          <ol className="mt-6 space-y-3">
            {steps.map((s, i) => {
              const current = i === nextIndex
              return (
                <li key={s.title} className="flex gap-3">
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                      s.done ? 'bg-accent text-white' : current ? 'bg-practice text-white ring-4 ring-practice/15' : 'border border-line-strong text-muted',
                    )}
                    aria-hidden
                  >
                    {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <div>
                    <p className={cn('text-sm font-bold', !s.done && !current && 'text-ink-soft')}>
                      {s.title}
                      <span className="sr-only">{s.done ? ' (done)' : current ? ' (next)' : ''}</span>
                    </p>
                    <p className="text-sm text-muted">{s.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {stageOk ? (
              <Link
                to={investing ? `/app/learn/${investing.slug}` : '/app/learn'}
                className="group inline-flex h-11 items-center gap-2 rounded-xl bg-accent-ink px-5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#065f46] active:scale-[0.98]"
              >
                Go to the investing mission <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ) : (
              <Link to="/app/learn" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 text-sm font-semibold transition-colors hover:bg-canvas">
                Keep building in Learn <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
            <span className="text-xs text-muted">Pretend money only. Nothing here predicts real prices.</span>
          </div>
        </div>
        <PreviewArt />
      </motion.section>

      <motion.section variants={fadeUp} aria-labelledby="unlocks-h">
        <h2 id="unlocks-h" className="mb-3 text-base font-extrabold sm:text-lg">
          What you will unlock
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {UNLOCKS.map((u) => (
            <li key={u.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
              <span className="grid size-9 place-items-center rounded-xl bg-practice-soft text-practice ring-1 ring-practice/15" aria-hidden>
                <u.icon className="size-[18px]" />
              </span>
              <p className="mt-3 text-sm font-bold">{u.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{u.text}</p>
            </li>
          ))}
        </ul>
      </motion.section>
    </motion.div>
  )
}
