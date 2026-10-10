import { animate, stagger } from 'animejs'
import { ArrowRight, Info } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { RewardAmount } from '@/components/common/rewards'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useAnime } from '@/lib/anime'
import { api } from '@/lib/api/endpoints'
import { inr, relativeDate } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/useAsync'

const SOURCE_LABEL: Record<string, string> = {
  simulation: 'Mission',
  assessment: 'Check or quiz',
}

export default function WalletPage() {
  const wallet = useAsync(() => api.wallet.get(100), [])
  const { user } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const w = wallet.data

  useAnime(
    ref,
    () => {
      if (!w) return
      animate('.pb-cover', { rotateY: { from: -28 }, opacity: { from: 0 }, duration: 1100, ease: 'outExpo' })
      animate('.pb-stamp', { scale: { from: 2.4 }, opacity: { from: 0 }, rotate: { from: -30 }, delay: 650, duration: 600, ease: 'outBack(1.8)' })
      animate('.pb-row', { opacity: { from: 0 }, x: { from: -16 }, delay: stagger(45, { start: 350 }), duration: 500, ease: 'outQuad' })
    },
    [!!w],
  )

  // Passbook-style running balance, newest first: start from today's balance and walk back.
  const history = w?.history ?? []
  const rows = history.map((e, i) => ({
    ...e,
    after: (w?.balance ?? 0) - history.slice(0, i).reduce((sum, x) => sum + x.amount, 0),
  }))

  return (
    <div ref={ref}>
      <PageHeader
        eyebrow="Educational rewards"
        title="Your learning wallet"
        description="Fictional learning money you earn for showing you understand something. It is not mastery, not a grade and not related to any real or simulated investment."
      />
      {wallet.loading && <LoadingState rows={2} />}
      {wallet.error && <ErrorState message={wallet.error.message} onRetry={wallet.reload} />}
      {w && (
        <div className="space-y-8">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr] [perspective:1200px]">
            {/* Passbook cover */}
            <div className="pb-cover relative overflow-hidden rounded-[22px] bg-[#14123a] p-6 text-white shadow-[0_24px_50px_-24px_rgb(49_46_129/0.8)] sm:p-7">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(45deg,white_0,white_1px,transparent_1px,transparent_10px)]"
                aria-hidden
              />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">RupeeRise · learning passbook</p>
                  <p className="mt-1 text-sm text-white/80">Account holder: {user?.display_name ?? 'You'}</p>
                </div>
                <span
                  className="pb-stamp rotate-[-8deg] rounded-lg border-2 border-amber-300/80 px-2 py-1 font-mono text-[10px] font-black tracking-widest text-amber-300"
                  aria-hidden
                >
                  FICTIONAL
                </span>
              </div>
              <p className="relative mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Balance</p>
              <p className="relative mt-1 text-5xl font-extrabold tracking-tight" data-testid="wallet-balance">
                <RewardAmount value={w.balance} />
              </p>
              <div className="relative mt-6 flex items-end justify-between gap-3 border-t border-white/15 pt-4 text-sm">
                <div>
                  <p className="text-xs text-white/60">Earned so far</p>
                  <p className="font-mono text-lg font-bold tabular">{inr(w.total_earned)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/60">Entries</p>
                  <p className="font-mono text-lg font-bold tabular">{w.history.length}</p>
                </div>
              </div>
            </div>

            <div data-reveal="" className="flex flex-col justify-center rounded-[22px] border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
              <h2 className="text-lg font-extrabold">How it fills up</h2>
              <ol className="mt-3 space-y-3 text-sm text-ink-soft">
                {[
                  'Finish a mission with sound choices, or pass a module quiz.',
                  'Each reward is paid once, so repeating an easy activity pays nothing.',
                  'A stronger approach earns the next tier. Guessing fast earns nothing.',
                ].map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-reward-soft font-mono text-xs font-black text-reward-ink">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <Button asChild variant="outline" className="mt-5 self-start">
                <Link to="/app/learn">
                  Find a mission <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>

          <section aria-labelledby="history-title">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="history-title" className="text-lg font-extrabold">
                Reward history
              </h2>
              <p className="font-mono text-xs text-muted">newest first</p>
            </div>
            {rows.length === 0 ? (
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
              <div data-reveal="" className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b-2 border-ink/80 bg-canvas text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                        <th scope="col" className="px-4 py-3 font-bold">When</th>
                        <th scope="col" className="px-4 py-3 font-bold">Particulars</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Credit</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashed divide-line">
                      {rows.map((e) => (
                        <tr key={e.id} className="pb-row transition-colors hover:bg-reward-soft/60">
                          <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-muted">{relativeDate(e.created_at)}</td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-semibold">{e.reason}</p>
                            <p className="mt-0.5 text-xs text-muted">
                              {SOURCE_LABEL[e.source_type] ?? e.source_type}
                              {e.concept && <> · {e.concept.replace(/_/g, ' ')}</>}
                            </p>
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right align-top font-mono font-bold ${e.amount > 0 ? 'text-accent-ink' : 'text-danger-ink'}`}>
                            {e.amount > 0 ? '+' : '−'}
                            {inr(Math.abs(e.amount))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right align-top font-mono font-bold">{inr(e.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <p className="flex items-start gap-2 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {w.notice}
          </p>
        </div>
      )}
    </div>
  )
}
