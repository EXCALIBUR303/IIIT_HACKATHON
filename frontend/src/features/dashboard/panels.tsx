import { ArrowRight, Coins, Lock, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DomainChip, RewardAmount } from '@/components/common/rewards'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { api } from '@/lib/api/endpoints'
import { inr, inrPaise, signedPaise } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

/**
 * The three kinds of "number" in RupeeRise are shown in three separate panels on
 * purpose: what you understand (learning), what you earned for it (rewards), and a
 * practice portfolio (fictional). They are never added together.
 */
export function ThreePanels() {
  return (
    <section aria-label="Learning, rewards and practice portfolio" className="grid gap-4 lg:grid-cols-3">
      <LearningPanel />
      <RewardsPanel />
      <PortfolioPanel />
    </section>
  )
}

function PanelShell({ chip, title, children, className }: { chip: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold">{title}</h2>
        {chip}
      </div>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </Card>
  )
}

function LearningPanel() {
  const status = useAsync(() => api.learning.status(), [])
  const s = status.data
  return (
    <PanelShell title="Learning" chip={<DomainChip domain="learning" />} className="border-primary-100">
      {!s ? (
        <p className="text-sm text-muted">Loading your learning status…</p>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Level {s.level.current || 0} of 5</p>
          <p className="text-xl font-extrabold">{s.level.current_title}</p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Learning score</p>
              <p className="text-3xl font-extrabold tabular text-primary" data-testid="learning-score">
                {s.score.total}
                <span className="text-base font-semibold text-muted">/100</span>
              </p>
            </div>
            <Link to="/app/progress" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
              How it’s worked out
            </Link>
          </div>
          <ProgressBar value={s.score.total} label="Learning score" className="mt-2" />
          {s.level.next && (
            <div className="mt-4 rounded-xl bg-primary-soft/70 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-bold text-primary-ink">
                <Target className="size-4" aria-hidden /> Next unlock: Level {s.level.next.level}, {s.level.next.title}
              </p>
              <ul className="mt-1.5 space-y-1 text-primary-ink/90">
                {s.level.next.requirements
                  .filter((r) => !r.met)
                  .slice(0, 3)
                  .map((r) => (
                    <li key={r.key}>• {r.label}</li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </PanelShell>
  )
}

function RewardsPanel() {
  const wallet = useAsync(() => api.wallet.get(3), [])
  const w = wallet.data
  return (
    <PanelShell title="Rewards" chip={<DomainChip domain="reward" />} className="border-reward/40">
      {!w ? (
        <p className="text-sm text-muted">Loading your wallet…</p>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wider text-reward-ink">Wallet balance</p>
          <p className="text-3xl font-extrabold tabular">
            <RewardAmount value={w.balance} />
          </p>
          <p className="mt-1 text-xs text-muted">Earned for showing understanding. Not mastery and not related to your portfolio.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {w.history.length === 0 && <li className="text-muted">Finish a mission to earn your first reward.</li>}
            {w.history.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <Coins className="mt-0.5 size-4 shrink-0 text-reward-ink" aria-hidden />
                <span className="min-w-0 flex-1 truncate" title={e.reason}>
                  {e.reason}
                </span>
                <span className="tabular font-semibold text-reward-ink">
                  {e.amount > 0 ? '+' : '−'}
                  {inr(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild variant="link" className="mt-auto pt-3">
            <Link to="/app/wallet">See reward history</Link>
          </Button>
        </>
      )}
    </PanelShell>
  )
}

function PortfolioPanel() {
  const pf = useAsync(() => api.portfolio.get(), [])
  const v = pf.data
  const p = v?.portfolio
  return (
    <PanelShell title="Practice portfolio" chip={<DomainChip domain="portfolio" />} className="border-investing/30">
      {!v ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !v.access.open ? (
        <>
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> {v.access.reason}
          </p>
          <Button asChild variant="link" className="mt-auto pt-3">
            <Link to="/app/portfolio">What unlocks it</Link>
          </Button>
        </>
      ) : !p ? (
        <>
          <p className="text-sm text-ink-soft">Practise with ₹10,000 of pretend money. Nothing here is real or a prediction.</p>
          <Button asChild className="mt-auto" size="sm">
            <Link to="/app/portfolio">
              Start Portfolio Quest <ArrowRight />
            </Link>
          </Button>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-muted">Practice cash</dt>
              <dd className="font-extrabold tabular">{inrPaise(p.cash_paise)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-muted">Invested</dt>
              <dd className="font-extrabold tabular">{inrPaise(p.invested_paise)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-bold uppercase tracking-wider text-muted">Simulated gain / loss (year {p.round} of {p.max_round})</dt>
              <dd className={cn('text-2xl font-extrabold tabular', p.gain_paise > 0 ? 'text-accent-ink' : p.gain_paise < 0 ? 'text-danger-ink' : '')}>{signedPaise(p.gain_paise)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            {v.access.single_company_unlocked ? 'Single-company instruments unlocked.' : 'Single-company instruments stay locked until you show you understand diversification.'}
          </p>
          <Button asChild variant="link" className="mt-auto pt-3">
            <Link to="/app/portfolio">Open Portfolio Quest</Link>
          </Button>
        </>
      )}
    </PanelShell>
  )
}
