import { cn } from '@/lib/utils'

/**
 * RupeeRise mark: a cream "R" on a navy tile. The leg and the rising swoosh
 * read as a step up, so the letter itself carries the "rise". Drawn as solid
 * shapes so it stays legible at 16px and in forced-colours modes.
 */
export function LogoMark({ size = 36, className, title = 'RupeeRise' }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="105 110 1045 1040"
      role="img"
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      <rect x="105" y="110" width="1045" height="1040" rx="190" fill="#131A26" />
      <path
        d="M357 313H735C850 313 932 400 932 500C932 610 850 690 738 704L932 940H735L578 757C590 735 600 722 612 708L725 610C745 590 768 560 768 525C768 485 740 450 695 450H357Z"
        fill="#FFFDF7"
      />
      <path
        d="M678 488V598L665 606C600 640 570 670 540 715C500 780 470 835 440 870C400 905 360 925 330 942L322 935V735C322 718 325 715 332 708L480 560C520 520 570 488 640 488Z"
        fill="#FFFDF7"
      />
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
