import { Award, Coins } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import type { ScenarioCard } from '@/lib/api/types'
import { cn } from '@/lib/utils'

/** RR coins (the learning wallet) and one badge per scenario lesson explained. */
export function RewardsPanel({ balance, scenarios }: { balance: number; scenarios: ScenarioCard[] }) {
  const earned = scenarios.filter((s) => s.understood).length
  const per = scenarios[0]?.reward ?? 15
  return (
    <section aria-labelledby="pq-rewards" className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        <span className="size-1.5 rounded-full bg-reward" aria-hidden /> Learning rewards
      </p>
      <h2 id="pq-rewards" className="mt-1 text-lg font-extrabold">
        RR coins and scenario badges
      </h2>
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-reward-soft p-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-reward text-navy">
          <Coins className="size-6" aria-hidden />
        </span>
        <div>
          <p className="text-3xl font-extrabold tabular text-reward-ink">
            <AnimatedNumber value={balance} format={(n) => Math.round(n).toLocaleString('en-IN')} /> <span className="text-base">RR coins</span>
          </p>
          <p className="text-xs text-reward-ink/80">Your learning wallet balance (1 coin = ₹1 of fictional reward money). Not real money.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        Explain a scenario’s lesson correctly to earn <strong>{per} RR coins</strong> once per scenario. Profit never earns coins: understanding does.
      </p>
      <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label={`${earned} of ${scenarios.length} scenario badges earned`}>
        {scenarios.map((s) => (
          <li key={s.key} className="flex flex-col items-center gap-1 text-center" title={s.title}>
            <span className={cn('grid size-11 place-items-center rounded-2xl border-2', s.understood ? 'border-reward bg-reward-soft text-reward-ink' : 'border-dashed border-line-strong text-line-strong')}>
              <Award className="size-5" aria-hidden />
            </span>
            <span className={cn('text-[10px] font-semibold leading-tight', s.understood ? 'text-ink' : 'text-muted')}>{s.kicker}</span>
            <span className="sr-only">{s.understood ? `${s.title}: earned` : `${s.title}: not yet`}</span>
          </li>
        ))}
      </ul>
      <Link to="/app/wallet" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
        Open learning wallet
      </Link>
    </section>
  )
}
