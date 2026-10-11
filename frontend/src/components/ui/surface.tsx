import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'plain' | 'soft' | 'raised' | 'reward' | 'market'

const TONE: Record<Tone, string> = {
  plain: 'border border-line bg-surface shadow-[var(--shadow-card)]',
  soft: 'surface-soft shadow-[var(--shadow-card)]',
  raised: 'surface-raised',
  reward: 'border border-line bg-surface depth-glow [--depth-glow-color:rgb(232_163_23/0.35)]',
  market: 'border border-line bg-surface depth-glow [--depth-glow-color:rgb(14_116_144/0.3)]',
}

/** A card that sits above the atmosphere. `interactive` adds hover and focus elevation. */
export function SurfaceCard({ tone = 'plain', interactive, className, ...props }: ComponentProps<'div'> & { tone?: Tone; interactive?: boolean }) {
  return <div data-card="" className={cn('rounded-[var(--radius-card)]', TONE[tone], interactive && 'surface-interactive', className)} {...props} />
}

/** A full-width band that groups a run of cards, set off by hairlines. */
export function SectionBand({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-[var(--radius-panel)] border-y border-[var(--hairline)] bg-white/45 px-4 py-5 sm:px-6', className)} {...props} />
}
