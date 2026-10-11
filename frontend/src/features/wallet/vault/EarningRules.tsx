import { Coins, ShieldCheck } from 'lucide-react'
import type { RewardRule } from '@/lib/api/types'

/** What pays and how much, straight from the server's reward rules. Profit never appears. */
export function EarningRules({ rules }: { rules: RewardRule[] }) {
  return (
    <section aria-labelledby="vault-rules" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        <ShieldCheck className="size-3.5 text-accent-ink" aria-hidden /> Learning pays, profit doesn’t
      </p>
      <h2 id="vault-rules" className="mt-1 text-lg font-extrabold">
        How coins are earned
      </h2>
      <ul className="mt-4 divide-y divide-line">
        {rules.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-ink-soft">{r.label}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-reward-soft px-2.5 py-1 text-xs font-bold tabular text-reward-ink">
              <Coins className="size-3.5" aria-hidden /> +{r.amount}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Each reward is paid once, so repeating something easy pays nothing. Rewards are withheld for unsafe choices such as answering a scam message or borrowing when safer options existed. Portfolio gains and losses never change your coins.
      </p>
    </section>
  )
}
