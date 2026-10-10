import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The dashboard's panel: a kicker with a colour key, a title, an optional action, and content.
 * The colour key is the only decoration, so a grid of panels reads as one system.
 */
export function Panel({ id, kicker, title, color = 'var(--color-primary)', action, children, className }: {
  id: string
  kicker?: string
  title: string
  color?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker && (
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
              {kicker}
            </p>
          )}
          <h2 id={id} className="mt-1 text-lg font-extrabold leading-tight">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}
