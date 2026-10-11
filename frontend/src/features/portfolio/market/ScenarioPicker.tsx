import { ArrowRight, Award, CalendarDays, Check } from 'lucide-react'
import { motion } from 'motion/react'
import type { ScenarioCard } from '@/lib/api/types'
import { fadeUp, staggerChildren } from '@/lib/motion'
import { cn } from '@/lib/utils'

const KICKER_COLOR: Record<string, string> = {
  Earnings: '#4338ca',
  Policy: '#0e7490',
  Global: '#0369a1',
  Company: '#b45309',
  Valuation: '#be185d',
  Sectors: '#7c3aed',
  'Long term': '#047857',
}

/** Seven learning scenarios. Each one teaches one market idea in under ten minutes. */
export function ScenarioPicker({ scenarios, activeKey, busyKey, onStart }: {
  scenarios: ScenarioCard[]
  activeKey: string | null
  busyKey: string | null
  onStart: (key: string) => void
}) {
  return (
    <motion.ul variants={staggerChildren(0.05)} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {scenarios.map((s, i) => {
        const color = KICKER_COLOR[s.kicker] ?? '#4338ca'
        const active = s.key === activeKey
        return (
          <motion.li key={s.key} variants={fadeUp} className={cn(i === 0 && 'sm:col-span-2 xl:col-span-1')}>
            <article className={cn('lift group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface p-5 shadow-[var(--shadow-card)]', active ? 'border-primary ring-2 ring-primary/20' : 'border-line')}>
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} aria-hidden />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color }}>
                  {s.kicker}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <CalendarDays className="size-3.5" aria-hidden /> {s.unit === 'year' ? `${s.steps - 1} years` : `${s.steps} days`}
                </span>
              </div>
              <h3 className="mt-2 text-base font-extrabold leading-snug">{s.title}</h3>
              <p className="mt-1 flex-1 text-sm text-ink-soft">{s.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.skills.map((k) => (
                  <span key={k} className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    {k}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="flex items-center gap-2 text-xs">
                  {s.understood ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-reward-ink">
                      <Award className="size-3.5" aria-hidden /> Lesson explained
                    </span>
                  ) : s.completed ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-accent-ink">
                      <Check className="size-3.5" aria-hidden /> Played
                    </span>
                  ) : (
                    <span className="text-muted">Ends with a short lesson debrief</span>
                  )}
                  {s.best_result_pct != null && <span className="text-muted">Best {s.best_result_pct > 0 ? '+' : ''}{s.best_result_pct.toFixed(1)}%</span>}
                </span>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => onStart(s.key)}
                  aria-label={`${active ? 'Restart' : s.attempts ? 'Replay' : 'Start'} ${s.title}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent-ink px-3.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#065f46] active:scale-[0.98] disabled:opacity-50"
                >
                  {busyKey === s.key ? 'Opening…' : active ? 'Restart' : s.attempts ? 'Replay' : 'Start'}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            </article>
          </motion.li>
        )
      })}
    </motion.ul>
  )
}
