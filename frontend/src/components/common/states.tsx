import { RefreshCw, SearchX } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/lib/i18n'
import { fadeUp, staggerChildren } from '@/lib/motion'

export function LoadingState({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useI18n()
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <Alert
      tone="danger"
      title={t('common.errorTitle')}
      action={
        onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw /> {t('common.retry')}
          </Button>
        )
      }
    >
      {message}
    </Alert>
  )
}

export function EmptyState({ title, children, action, icon: Icon = SearchX }: { title: string; children?: ReactNode; action?: ReactNode; icon?: typeof SearchX }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-xl bg-canvas text-muted ring-1 ring-line" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Page title block. One quiet entrance; the page content does the talking. */
export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <motion.header variants={staggerChildren(0.05)} initial="hidden" animate="show" className="mb-7 border-b border-line pb-6 sm:mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow && (
            <motion.p variants={fadeUp} className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </motion.p>
          )}
          <motion.h1 variants={fadeUp} className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight sm:text-[2.15rem]">
            {title}
          </motion.h1>
          {description && (
            <motion.div variants={fadeUp} className="mt-2.5 max-w-xl text-[0.95rem] leading-relaxed text-ink-soft">
              {description}
            </motion.div>
          )}
        </div>
        {actions && (
          <motion.div variants={fadeUp} className="flex shrink-0 flex-wrap gap-2">
            {actions}
          </motion.div>
        )}
      </div>
    </motion.header>
  )
}

/** A titled section inside a page, with consistent spacing and an optional action link. */
export function Section({ id, title, description, action, children, className }: {
  id: string
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={id} className="text-base font-extrabold sm:text-lg">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
