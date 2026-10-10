import { Coins } from 'lucide-react'
import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { inr } from '@/lib/format'
import type { ResultReward } from '@/lib/api/types'
import { cn } from '@/lib/utils'

/**
 * Domain label. Every figure in RupeeRise is one of three kinds of fictional
 * money/score, and the label says which, so they are never confused.
 */
export function DomainChip({ domain, className }: { domain: 'reward' | 'portfolio' | 'learning'; className?: string }) {
  const map = {
    reward: { text: 'Learning reward · fictional', cls: 'bg-reward-soft text-reward-ink ring-reward/40' },
    portfolio: { text: 'Fictional portfolio', cls: 'bg-investing-soft text-investing ring-investing/30' },
    learning: { text: 'Learning', cls: 'bg-primary-soft text-primary-ink ring-primary/20' },
  }[domain]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider ring-1', map.cls, className)}>
      {map.text}
    </span>
  )
}

/** Animated whole-rupee counter; shows the final value immediately under reduced motion. */
export function RewardAmount({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduce) {
      node.textContent = inr(value)
      return
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        node.textContent = inr(v)
      },
    })
    return () => controls.stop()
  }, [value, reduce])
  return (
    <span ref={ref} className={cn('tabular', className)}>
      {inr(value)}
    </span>
  )
}

/** "Reward earned" panel shown on result screens. Renders nothing when no new reward was issued. */
export function RewardEarned({ rewards }: { rewards: ResultReward[] | undefined }) {
  if (!rewards || rewards.length === 0) return null
  const total = rewards.reduce((sum, r) => sum + r.amount, 0)
  return (
    <div className="rounded-xl border border-reward/40 bg-reward-soft p-4" role="status">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-reward text-ink" aria-hidden>
          <Coins className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-reward-ink">Reward earned</p>
          <p className="text-lg font-extrabold text-ink">
            <RewardAmount value={total} /> <span className="text-sm font-semibold text-reward-ink">fictional learning money</span>
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-ink-soft">
        {rewards.map((r) => (
          <li key={r.rule_key}>
            <span className="tabular font-semibold text-reward-ink">+{inr(r.amount)}</span> · {r.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}
