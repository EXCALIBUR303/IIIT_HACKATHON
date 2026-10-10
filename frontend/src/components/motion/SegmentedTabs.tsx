import { motion } from 'motion/react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

export interface Segment {
  value: string
  label: string
  note?: string
  icon?: LucideIcon
}

/**
 * Segmented control on top of Radix Tabs (so arrow keys, roles and focus are handled), with a
 * shared-layout pill that slides to the active segment. Must be rendered inside <Tabs>.
 */
export function SegmentedTabs({ segments, value, id, className }: { segments: Segment[]; value: string; id: string; className?: string }) {
  return (
    <TabsPrimitive.List className={cn('inline-grid w-full gap-1 rounded-2xl border border-line bg-canvas-deep/60 p-1 sm:w-auto', className)} style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}>
      {segments.map((s) => {
        const active = s.value === value
        return (
          <TabsPrimitive.Trigger
            key={s.value}
            value={s.value}
            className="relative rounded-xl px-4 py-2.5 text-left outline-offset-2 transition-colors"
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]" transition={SPRING} />}
            <span className="relative flex items-center gap-2.5">
              {s.icon && <s.icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted')} aria-hidden />}
              <span className="min-w-0">
                <span className={cn('block text-sm font-bold', active ? 'text-ink' : 'text-ink-soft')}>{s.label}</span>
                {s.note && <span className="hidden truncate text-xs text-muted sm:block">{s.note}</span>}
              </span>
            </span>
          </TabsPrimitive.Trigger>
        )
      })}
    </TabsPrimitive.List>
  )
}
