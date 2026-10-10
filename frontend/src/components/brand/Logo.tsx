import { cn } from '@/lib/utils'

/**
 * RupeeRise mark: a rupee glyph whose top stroke continues upward into an
 * arrow. The rupee anchors it in Indian money; the rising stroke signals
 * growth, progress and confidence. Built from strokes so it stays legible at 16px.
 */
export function LogoMark({ size = 36, className, title = 'RupeeRise' }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <rect width="40" height="40" rx="11" fill="#4338CA" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 12.5H20.5" />
        <path d="M11 18H24" />
        <path d="M15.5 12.5C22.6 12.5 22.6 23.5 15.5 23.5H11.5L21.5 31" />
      </g>
      <g fill="none" stroke="#34D399" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 12.5L28.5 5.5" />
        <path d="M23.5 5.5H28.5V10.5" />
      </g>
    </svg>
  )
}

export function Logo({ className, size = 34, showTagline = false }: { className?: string; size?: number; showTagline?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} title="" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.2rem] font-extrabold tracking-tight text-ink">
          Rupee<span className="text-primary">Rise</span>
        </span>
        {showTagline && <span className="mt-1 text-[0.7rem] font-medium text-muted">Learn Money. Make Smarter Moves.</span>}
      </span>
      <span className="sr-only">RupeeRise</span>
    </span>
  )
}
