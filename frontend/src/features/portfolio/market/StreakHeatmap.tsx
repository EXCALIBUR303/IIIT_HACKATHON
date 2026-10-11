import { Check, Flame } from 'lucide-react'
import { motion } from 'motion/react'
import type { Streak } from '@/lib/api/types'
import { cn } from '@/lib/utils'

const LEVEL = ['bg-canvas-deep', 'bg-investing/25', 'bg-investing/50', 'bg-investing/75', 'bg-investing']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Twelve weeks of practice days, the current streak, milestones and today's habits. */
export function StreakHeatmap({ streak }: { streak: Streak }) {
  const weeks: Streak['days'][] = []
  for (let i = 0; i < streak.days.length; i += 7) weeks.push(streak.days.slice(i, i + 7))
  const nextM = streak.next_milestone
  const toGo = nextM ? nextM - Math.max(streak.current, streak.longest) : 0
  return (
    <section aria-labelledby="pq-streak" className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <Flame className="size-3.5 text-investing" aria-hidden /> 12-week practice streak
          </p>
          <h2 id="pq-streak" className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tabular text-investing">{streak.current}</span>
            <span className="text-lg font-extrabold">day{streak.current === 1 ? '' : 's'} in a row</span>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {streak.today_done ? 'Today counts. ' : streak.current ? 'Practise today to keep it going. ' : 'Any mission, check or market decision starts a streak. '}
            Longest: <strong>{streak.longest}</strong> · Active days: <strong>{streak.active_days}</strong>
          </p>
        </div>
        <ul className="space-y-1.5 text-sm" aria-label="Today's market habits">
          {streak.habits.map((h) => (
            <li key={h.key} className="flex items-center gap-2">
              <span className={cn('grid size-5 place-items-center rounded-full border', h.done ? 'border-accent bg-accent text-white' : 'border-line-strong')}>{h.done && <Check className="size-3" strokeWidth={3} aria-hidden />}</span>
              <span className={h.done ? 'text-muted line-through decoration-line-strong' : 'text-ink-soft'}>{h.label}</span>
              <span className="sr-only">{h.done ? '(done today)' : '(not yet today)'}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div
          className="grid min-w-[20rem] grid-flow-col gap-1 sm:gap-1.5"
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
                <motion.span
                  key={`${wi}-${di}`}
                  title={day ? `${day.date}: ${day.count} activit${day.count === 1 ? 'y' : 'ies'}` : undefined}
                  className={cn('aspect-square w-full max-w-7 rounded-[4px]', day ? LEVEL[day.level] : 'bg-transparent', today && 'ring-2 ring-primary ring-offset-1')}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: wi * 0.025, duration: 0.25 }}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted" aria-hidden>
        Less {LEVEL.map((c) => <span key={c} className={cn('size-3 rounded-[3px]', c)} />)} More
      </div>

      <ol className="mt-5 grid grid-cols-5 gap-2" aria-label="Streak milestones">
        {streak.milestones.map((m) => (
          <li key={m.days} className={cn('rounded-xl border px-2 py-2.5 text-center', m.reached ? 'border-investing/40 bg-investing-soft' : 'border-line')}>
            <span className={cn('mx-auto grid size-7 place-items-center rounded-full text-[11px] font-extrabold', m.reached ? 'bg-investing text-white' : 'bg-canvas text-muted')}>
              {m.reached ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : m.days}
            </span>
            <span className="mt-1.5 block text-[11px] font-semibold leading-tight">{m.label}</span>
            <span className="sr-only">{m.reached ? 'reached' : 'not reached yet'}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        {nextM ? `${toGo} more day${toGo === 1 ? '' : 's'} to the ${nextM}-day badge. ` : 'Every milestone reached. '}
        Streak badges are virtual learning rewards, not money.
      </p>
    </section>
  )
}
