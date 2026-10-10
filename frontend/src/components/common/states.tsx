import { RefreshCw, SearchX } from 'lucide-react'
import { animate, stagger, svg } from 'animejs'
import { useRef, type ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnime } from '@/lib/anime'
import { useI18n } from '@/lib/i18n'

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

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <SearchX className="mb-3 size-8 text-muted" aria-hidden />
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useAnime(
    ref,
    () => {
      animate('.ph-eyebrow', { opacity: { from: 0 }, x: { from: -12 }, duration: 500, ease: 'outExpo' })
      animate('.ph-word', { opacity: { from: 0 }, y: { from: '0.55em' }, rotate: { from: 4 }, delay: stagger(45, { start: 80 }), duration: 650, ease: 'outExpo' })
      animate('.ph-desc', { opacity: { from: 0 }, y: { from: 10 }, delay: 300, duration: 600, ease: 'outQuad' })
      animate(svg.createDrawable('.ph-rule'), { draw: ['0 0', '0 1'], delay: 250, duration: 1100, ease: 'inOutQuart' })
      animate('.ph-actions', { opacity: { from: 0 }, scale: { from: 0.95 }, delay: 350, duration: 500, ease: 'outBack(1.6)' })
    },
    [title],
  )
  return (
    <header ref={ref} className="mb-7 sm:mb-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="ph-eyebrow mb-2 inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <span className="h-px w-6 bg-primary" aria-hidden />
              {eyebrow}
            </p>
          )}
          <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-[2.5rem]" aria-label={title}>
            {title.split(' ').map((w, i) => (
              <span key={i} className="ph-word mr-[0.24em] inline-block" aria-hidden>
                {w}
              </span>
            ))}
          </h1>
          {description && <div className="ph-desc mt-3 max-w-xl text-[0.95rem] leading-relaxed text-ink-soft">{description}</div>}
        </div>
        {actions && <div className="ph-actions flex shrink-0 gap-2">{actions}</div>}
      </div>
      <svg viewBox="0 0 1000 8" preserveAspectRatio="none" className="mt-6 h-2 w-full" aria-hidden>
        <path className="ph-rule" d="M0 4 H1000" stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
        <circle cx="0" cy="4" r="3.5" fill="var(--color-primary)" />
      </svg>
    </header>
  )
}
