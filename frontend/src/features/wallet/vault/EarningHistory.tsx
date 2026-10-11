import { ArrowRight, Coins } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import type { RewardEntry } from '@/lib/api/types'
import { relativeDate } from '@/lib/format'
import { fadeUp, staggerChildren } from '@/lib/motion'
import { cn } from '@/lib/utils'

const SOURCE_LABEL: Record<string, string> = {
  simulation: 'Mission',
  assessment: 'Check or quiz',
  reflection: 'Reflection',
  explorer: 'Banking Explorer',
  market_lab: 'Market lab debrief',
  portfolio: 'Practice portfolio',
}

const coins = (n: number) => Math.abs(n).toLocaleString('en-IN')

/** Every credit and transfer, newest first, with the running balance after each. */
export function EarningHistory({ history, balance }: { history: RewardEntry[]; balance: number }) {
  const rows = history.map((e, i) => ({ ...e, after: balance - history.slice(0, i).reduce((sum, x) => sum + x.amount, 0) }))
  return (
    <section aria-labelledby="vault-history" className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between gap-2 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
        <h2 id="vault-history" className="text-lg font-extrabold">
          Earning History
        </h2>
        <p className="text-xs text-muted">Newest first</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-6 sm:px-6">
          <EmptyState
            title="No rewards yet"
            action={
              <Button asChild>
                <Link to="/app/learn">
                  Start a mission <ArrowRight />
                </Link>
              </Button>
            }
          >
            Finish a mission with sound choices or pass a module quiz to earn your first RR coins.
          </EmptyState>
        </div>
      ) : (
        <motion.ol variants={staggerChildren(0.04)} initial="hidden" animate="show" className="divide-y divide-line border-t border-line">
          {rows.map((e) => (
            <motion.li key={e.id} variants={fadeUp} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-3.5 transition-colors hover:bg-canvas sm:px-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{e.reason}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {SOURCE_LABEL[e.source_type] ?? e.source_type}
                  {e.concept && <> · {e.concept.replace(/_/g, ' ')}</>} · {relativeDate(e.created_at)}
                </p>
              </div>
              <div className="text-right">
                <p className={cn('inline-flex items-center gap-1 text-sm font-bold tabular', e.amount > 0 ? 'text-accent-ink' : 'text-danger-ink')}>
                  <Coins className="size-3.5" aria-hidden />
                  <span aria-hidden>{e.amount > 0 ? '+' : '−'}</span>
                  <span className="sr-only">{e.amount > 0 ? 'Earned ' : 'Moved out '}</span>
                  {coins(e.amount)}
                </p>
                <p className="text-[11px] text-muted tabular">Balance {coins(e.after)}</p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </section>
  )
}
