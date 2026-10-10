import { ArrowRight, Coins, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DomainChip, RewardAmount } from '@/components/common/rewards'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api/endpoints'
import { inr, relativeDate } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

const SOURCE_LABEL: Record<string, string> = {
  simulation: 'Mission',
  assessment: 'Check or quiz',
}

export default function WalletPage() {
  const wallet = useAsync(() => api.wallet.get(100), [])

  return (
    <div>
      <PageHeader
        eyebrow="Educational rewards"
        title="Your learning wallet"
        description="Fictional learning money you earn for showing you understand something. It is not mastery, not a grade and not related to any real or simulated investment."
      />
      {wallet.loading && <LoadingState rows={2} />}
      {wallet.error && <ErrorState message={wallet.error.message} onRetry={wallet.reload} />}
      {wallet.data && (
        <div className="space-y-6">
          <Card className="overflow-hidden border-reward/40">
            <div className="grid gap-px bg-reward/30 sm:grid-cols-2">
              <div className="bg-reward-soft p-6">
                <DomainChip domain="reward" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-reward-ink">Balance</p>
                <p className="mt-1 text-4xl font-extrabold text-ink" data-testid="wallet-balance">
                  <RewardAmount value={wallet.data.balance} />
                </p>
              </div>
              <div className="bg-surface p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Earned so far</p>
                <p className="mt-1 text-4xl font-extrabold tabular text-ink">{inr(wallet.data.total_earned)}</p>
                <p className="mt-2 text-sm text-ink-soft">Each reward can be earned once, so repeating an easy activity pays nothing. Try a stronger approach to earn the next tier.</p>
              </div>
            </div>
          </Card>

          <section aria-labelledby="history-title">
            <h2 id="history-title" className="mb-3 text-lg font-extrabold">
              Reward history
            </h2>
            {wallet.data.history.length === 0 ? (
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
                Finish a mission with sound choices or pass a module quiz to earn your first fictional reward.
              </EmptyState>
            ) : (
              <Card>
                <ul className="divide-y divide-line">
                  {wallet.data.history.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 p-4">
                      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-reward-soft text-reward-ink" aria-hidden>
                        <Coins className="size-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{e.reason}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {SOURCE_LABEL[e.source_type] ?? e.source_type}
                          {e.concept && <> · {e.concept.replace(/_/g, ' ')}</>} · {relativeDate(e.created_at)}
                        </p>
                      </div>
                      <p className="tabular text-sm font-extrabold text-reward-ink">
                        {e.amount > 0 ? '+' : '−'}
                        {inr(Math.abs(e.amount))}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <p className="flex items-start gap-2 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {wallet.data.notice}
          </p>
        </div>
      )}
    </div>
  )
}
