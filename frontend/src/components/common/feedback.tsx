import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { Feedback } from '@/lib/api/types'
import { cn } from '@/lib/utils'

const TONE = {
  positive: { Icon: CheckCircle2, cls: 'text-accent-ink bg-accent-soft' },
  caution: { Icon: AlertTriangle, cls: 'text-warning-ink bg-warning-soft' },
  negative: { Icon: XCircle, cls: 'text-danger-ink bg-danger-soft' },
}

/** Engine feedback rendered as an explanation list (the "why" behind every score). */
export function FeedbackList({ items, className }: { items: Feedback[]; className?: string }) {
  if (!items.length) return null
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((f, i) => {
        const { Icon, cls } = TONE[f.tone]
        return (
          <li key={i} className="flex gap-3">
            <span className={cn('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg', cls)}>
              <Icon className="size-4" aria-hidden />
              <span className="sr-only">{f.tone}</span>
            </span>
            <p className="text-sm leading-relaxed text-ink-soft">{f.message}</p>
          </li>
        )
      })}
    </ul>
  )
}

export function Disclaimer({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-muted ring-1 ring-line">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}
