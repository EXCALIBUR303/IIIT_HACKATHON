import { BadgeCheck, Lock } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { ScenarioCard } from '@/lib/api/types'
import { SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

/** One badge per Market lab scenario whose lesson the student explained correctly. */
export function ScenarioBadges({ scenarios }: { scenarios: ScenarioCard[] }) {
  const earned = scenarios.filter((s) => s.understood).length
  return (
    <section aria-labelledby="vault-badges" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <BadgeCheck className="size-3.5 text-reward-ink" aria-hidden /> {earned} of {scenarios.length} earned
          </p>
          <h2 id="vault-badges" className="mt-1 text-lg font-extrabold">
            Scenario Badges
          </h2>
        </div>
        <Link to="/app/portfolio" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-primary hover:underline">
          Earn more
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Explain a Market lab scenario’s lesson correctly to unlock its badge and 15 RR coins. Each pays once.</p>
      <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {scenarios.map((s, i) => (
          <motion.li
            key={s.key}
            initial={s.understood ? { opacity: 0, scale: 0.85, y: 8 } : { opacity: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ ...SPRING, delay: s.understood ? 0.12 + i * 0.05 : 0 }}
            whileHover={{ y: -2 }}
            className={cn('flex min-h-[4.5rem] items-center gap-3 rounded-2xl border p-3', s.understood ? 'border-reward/50 bg-reward-soft' : 'border-dashed border-line-strong bg-canvas')}
          >
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', s.understood ? 'bg-reward text-navy' : 'bg-surface text-muted ring-1 ring-line-strong')}>
              {s.understood ? <BadgeCheck className="size-5" aria-hidden /> : <Lock className="size-4" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-bold leading-tight', !s.understood && 'text-ink-soft')}>{s.title}</span>
              <span className="block text-[11px] text-muted">{s.understood ? `${s.kicker} · earned` : `${s.kicker} · locked`}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}
