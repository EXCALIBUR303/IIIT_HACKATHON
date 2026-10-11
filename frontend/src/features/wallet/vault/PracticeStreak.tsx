import { animate, stagger } from 'animejs'
import { CalendarDays, Check, Flame, Lock, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef } from 'react'
import { useAnime } from '@/lib/anime'
import type { Streak } from '@/lib/api/types'
import { SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

const LEVEL = ['bg-canvas-deep', 'bg-emerald-200', 'bg-emerald-300', 'bg-emerald-500', 'bg-emerald-700']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Twelve weeks of practice, today's tasks and milestone badges. Cells reveal with anime.js. */
export function PracticeStreak({ streak }: { streak: Streak }) {
  const ref = useRef<HTMLDivElement>(null)
  const weeks: Streak['days'][] = []
  for (let i = 0; i < streak.days.length; i += 7) weeks.push(streak.days.slice(i, i + 7))
  const best = Math.max(streak.current, streak.longest)
  const next = streak.next_milestone
  const toGo = next ? next - best : 0

  useAnime(
    ref,
    () => {
      animate('.streak-cell', { opacity: { from: 0 }, scale: { from: 0.4 }, delay: stagger(9), duration: 380, ease: 'outBack(1.6)' })
    },
    [streak.days.length],
  )

  return (
    <section ref={ref} aria-labelledby="vault-streak" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <CalendarDays className="size-3.5 text-accent-ink" aria-hidden /> Last 12 weeks
          </p>
          <h2 id="vault-streak" className="mt-1 flex items-baseline gap-2 text-lg font-extrabold">
            Practice Streak
          </h2>
          <p className="mt-2 flex items-center gap-2">
            <Flame className={cn('size-7', streak.current ? 'text-reward' : 'text-line-strong')} aria-hidden />
            <span className="text-4xl font-extrabold tabular leading-none">{streak.current}</span>
            <span className="text-sm font-semibold text-ink-soft">day{streak.current === 1 ? '' : 's'} in a row</span>
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {streak.today_done ? 'Today counts. ' : streak.current ? 'Practise today to keep it going. ' : 'A mission, check, reflection or market decision starts a streak. '}
            Longest <strong>{streak.longest}</strong> · Active days <strong>{streak.active_days}</strong>
          </p>
        </div>
        <div className="min-w-[15rem] flex-1 sm:max-w-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Today’s tasks</p>
          <ul className="mt-2 space-y-2 text-sm" aria-label="Today's learning tasks">
            {streak.habits.map((h) => (
              <li key={h.key} className="flex items-center gap-2.5">
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border transition-colors', h.done ? 'border-accent bg-accent text-white' : 'border-line-strong')}>
                  {h.done && <Check className="size-3" strokeWidth={3} aria-hidden />}
                </span>
                <span className={h.done ? 'text-muted line-through decoration-line-strong' : 'text-ink-soft'}>{h.label}</span>
                <span className="sr-only">{h.done ? '(done today)' : '(not yet today)'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto pb-1">
        <div
          className="grid min-w-[21rem] grid-flow-col gap-1 sm:gap-1.5"
          style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))', gridTemplateColumns: `2.25rem repeat(${weeks.length}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`Practice over the last ${streak.weeks} weeks: ${streak.active_days} active days, current streak ${streak.current} days.`}
        >
          {DAYS.map((d, i) => (
            <span key={d} className={cn('self-center pr-1 text-[10px] leading-none text-muted', i % 2 === 1 && 'invisible sm:visible')}>
              {d}
            </span>
          ))}
          {weeks.map((w, wi) =>
            Array.from({ length: 7 }, (_, di) => {
              const day = w[di]
              const today = day?.date === streak.today
              return (
                <span
                  key={`${wi}-${di}`}
                  title={day ? `${day.date}: ${day.count} activit${day.count === 1 ? 'y' : 'ies'}` : undefined}
                  className={cn('streak-cell aspect-square w-full max-w-7 rounded-[5px]', day ? LEVEL[day.level] : 'bg-transparent', today && 'ring-2 ring-primary ring-offset-1')}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted" aria-hidden>
        Less {LEVEL.map((c) => <span key={c} className={cn('size-3 rounded-[3px]', c)} />)} More
      </div>

      <h3 className="mt-6 flex items-center gap-1.5 text-sm font-bold">
        <Trophy className="size-4 text-reward-ink" aria-hidden /> Streak milestones
      </h3>
      <ol className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5" aria-label="Streak milestones">
        {streak.milestones.map((m) => (
          <motion.li
            key={m.days}
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ y: -2 }}
            transition={SPRING}
            className={cn('flex min-h-[5.5rem] flex-col items-start justify-between gap-2 rounded-2xl border p-3', m.reached ? 'border-accent/40 bg-accent-soft' : 'border-line bg-canvas')}
          >
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', m.reached ? 'bg-accent text-white' : 'bg-surface text-muted ring-1 ring-line-strong')}>
              {m.reached ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Lock className="size-4" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">{m.label}</span>
              <span className="block text-[11px] text-muted">{m.reached ? 'Unlocked' : `${m.days} days`}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        {next ? `${toGo} more day${toGo === 1 ? '' : 's'} to the ${next}-day badge. ` : 'Every milestone unlocked. '}
        Streak badges are virtual and never pay out coins.
      </p>
    </section>
  )
}
