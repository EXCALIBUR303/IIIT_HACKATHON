import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const STYLES = {
  info: { box: 'bg-primary-soft border-primary-100 text-primary-ink', Icon: Info },
  success: { box: 'bg-accent-soft border-emerald-200 text-accent-ink', Icon: CheckCircle2 },
  warning: { box: 'bg-warning-soft border-amber-200 text-warning-ink', Icon: AlertTriangle },
  danger: { box: 'bg-danger-soft border-red-200 text-danger-ink', Icon: XCircle },
}

export function Alert({ tone = 'info', title, children, className, action }: {
  tone?: keyof typeof STYLES
  title?: string
  children?: ReactNode
  className?: string
  action?: ReactNode
}) {
  const { box, Icon } = STYLES[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4 text-sm', box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}
