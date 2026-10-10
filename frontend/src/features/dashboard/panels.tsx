import { ArrowRight, ArrowUpRight, Check, Coins, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/common/panel'
import { DomainChip } from '@/components/common/rewards'
import { AnimatedNumber } from '@/components/motion/AnimatedNumber'
import { ProgressRing } from '@/components/motion/ProgressRing'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api/endpoints'
import type { ScoreComponent } from '@/lib/api/types'
import { inr, inrPaise, signedPaise } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

/*
 * The three kinds of "number" in RupeeRise sit in three separate panels on purpose: what you
 * understand (learning), what you earned for it (rewards) and a practice portfolio. They are
 * never added together, and each keeps its own colour: indigo, amber and teal.
 */

const SEGMENT: Record<ScoreComponent['key'], { label: string; color: string }> = {
  assessments: { label: 'Checks', color: 'var(--color-primary)' },
  decisions: { label: 'Decisions', color: 'var(--color-investing)' },
  reflection: { label: 'Reflection', color: 'var(--color-saving)' },
  safe_behavior: { label: 'Safe choices', color: 'var(--color-safety)' },
}

function PanelLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="group mt-auto inline-flex items-center gap-1 self-start pt-4 text-sm font-semibold text-primary hover:text-primary-hover">
      {children} <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

export function LearningPanel({ className }: { className?: string }) {
  const status = useAsync(() => api.learning.status(), [])
  const s = status.data
  const [focus, setFocus] = useState<ScoreComponent | null>(null)

  return (
    <Panel id="panel-learning" kicker="Understanding" title="Learning" color="var(--color-primary)" className={className}>
      {!s ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="flex items-center gap-5">
            <ProgressRing value={s.score.total} size={108} stroke={9} track="var(--color-primary-100)" label="Learning score">
              <span className="flex flex-col items-center">
                <AnimatedNumber value={s.score.total} className="text-3xl font-extrabold text-primary" />
                <span className="text-[11px] font-semibold text-muted" data-testid="learning-score">
                  of 100
                </span>
              </span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Level {s.level.current || 0} of 5</p>
              <p className="text-xl font-extrabold leading-tight">{s.level.current_title}</p>
              <Link to="/app/progress" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                How it’s worked out <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>

          {/* What the score is made of. Hover, focus or tap a segment to read its part. */}
          <div className="mt-5">
            <div className="flex h-2.5 gap-1" role="group" aria-label="Score breakdown">
              {s.score.components.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`${SEGMENT[c.key].label}: ${Math.round(c.points)} of ${c.weight} points`}
                  onMouseEnter={() => setFocus(c)}
                  onFocus={() => setFocus(c)}
                  onClick={() => setFocus(c)}
                  onMouseLeave={() => setFocus(null)}
                  onBlur={() => setFocus(null)}
                  className={cn('relative h-full overflow-hidden rounded-full bg-line transition-[transform,opacity] duration-150 hover:scale-y-150', focus && focus.key !== c.key && 'opacity-50')}
                  style={{ flexGrow: c.weight }}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.points / c.weight) * 100}%`, background: SEGMENT[c.key].color }} />
                </button>
              ))}
            </div>
            <p className="mt-2 min-h-[2.6em] text-xs leading-snug text-muted" aria-live="polite">
              {focus ? (
                <>
                  <span className="font-bold text-ink">
                    {SEGMENT[focus.key].label} · {Math.round(focus.points)}/{focus.weight}.
                  </span>{' '}
                  {focus.recovery || focus.explanation}
                </>
              ) : (
                'Checks 40 · Decisions 30 · Reflection 20 · Safe choices 10. Point at a segment to see yours.'
              )}
            </p>
          </div>

          {s.level.next && (
            <div className="mt-auto rounded-xl bg-primary-soft/70 p-3.5 text-sm">
              <p className="font-bold text-primary-ink">
                Next: Level {s.level.next.level} · {s.level.next.title}
              </p>
              <ul className="mt-2 space-y-1.5">
                {s.level.next.requirements.slice(0, 3).map((r) => (
                  <li key={r.key} className="flex items-start gap-2 text-primary-ink/90">
                    <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', r.met ? 'border-accent bg-accent text-white' : 'border-primary/40 bg-white')}>
                      {r.met && <Check className="size-3" strokeWidth={3} aria-hidden />}
                    </span>
                    <span className={cn(r.met && 'text-muted line-through')}>{r.label}</span>
                    <span className="sr-only">{r.met ? '(done)' : '(to do)'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

export function RewardsPanel({ className }: { className?: string }) {
  const wallet = useAsync(() => api.wallet.get(3), [])
  const w = wallet.data
  return (
    <Panel id="panel-rewards" kicker="Earned" title="Rewards" color="var(--color-reward)" className={className}>
      {!w ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-reward-soft text-reward-ink ring-1 ring-reward/30" aria-hidden>
              <Coins className="size-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-reward-ink">Wallet balance</p>
              <p className="text-[2rem] font-extrabold leading-none">
                <AnimatedNumber value={w.balance} format={(n) => inr(Math.round(n))} />
              </p>
              <p className="mt-1 text-xs text-muted">Total earned {inr(w.total_earned)}</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
            {w.history.length === 0 && <li className="p-3 text-muted">Finish a mission to earn your first reward.</li>}
            {w.history.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-ink-soft" title={e.reason}>
                  {e.reason}
                </span>
                <span className={cn('tabular font-bold', e.amount > 0 ? 'text-accent-ink' : 'text-danger-ink')}>
                  {e.amount > 0 ? '+' : '−'}
                  {inr(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-muted">
            <DomainChip domain="reward" /> Earned for showing understanding, separate from your score and portfolio.
          </p>
          <PanelLink to="/app/wallet">Reward history</PanelLink>
        </>
      )}
    </Panel>
  )
}

export function PortfolioPanel({ className }: { className?: string }) {
  const pf = useAsync(() => api.portfolio.get(), [])
  const v = pf.data
  const p = v?.portfolio
  return (
    <Panel id="panel-portfolio" kicker="Practice" title="Practice portfolio" color="var(--color-practice)" action={<DomainChip domain="portfolio" className="shrink-0" />} className={className}>
      {!v ? (
        <Skeleton className="h-40 w-full" />
      ) : !v.access.open ? (
        <>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-practice-soft text-practice ring-1 ring-practice/20" aria-hidden>
              <Lock className="size-5" />
            </span>
            <p className="text-sm leading-relaxed text-ink-soft">{v.access.reason}</p>
          </div>
          <p className="mt-4 rounded-xl border border-dashed border-practice/40 p-3 text-sm text-ink-soft">
            Opens with <strong className="text-ink">₹10,000 of pretend money</strong> to practise buying, selling and holding through ten fictional years.
          </p>
          <PanelLink to="/app/portfolio">What unlocks it</PanelLink>
        </>
      ) : !p ? (
        <>
          <p className="text-sm text-ink-soft">Practise with ₹10,000 of pretend money. Nothing here is real or a prediction.</p>
          <PanelLink to="/app/portfolio">Start Portfolio Quest</PanelLink>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Practice cash</dt>
              <dd className="mt-1 font-extrabold tabular">{inrPaise(p.cash_paise)}</dd>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Invested</dt>
              <dd className="mt-1 font-extrabold tabular">{inrPaise(p.invested_paise)}</dd>
            </div>
            <div className="col-span-2 rounded-xl bg-canvas p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Simulated gain / loss · year {p.round} of {p.max_round}
              </dt>
              <dd className={cn('mt-1 text-xl font-extrabold tabular', p.gain_paise > 0 ? 'text-accent-ink' : p.gain_paise < 0 ? 'text-danger-ink' : '')}>{signedPaise(p.gain_paise)}</dd>
            </div>
          </dl>
          <PanelLink to="/app/portfolio">Open Portfolio Quest</PanelLink>
        </>
      )}
    </Panel>
  )
}
