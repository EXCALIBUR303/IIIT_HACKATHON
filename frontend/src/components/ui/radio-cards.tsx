import { Check } from 'lucide-react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RadioCardOption<T extends string> {
  value: T
  label: string
  content?: ReactNode
}

/**
 * Selectable cards that behave like a native radio group: one tab stop, arrow keys move and
 * select, Home/End jump. Selected cards get a ring and a check mark, not just a colour.
 */
export function RadioCards<T extends string>({ label, options, value, onChange, columns = 'sm:grid-cols-2', size = 'md' }: {
  label: string
  options: RadioCardOption<T>[]
  value: T | null
  onChange: (v: T) => void
  columns?: string
  size?: 'sm' | 'md'
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const active = Math.max(0, options.findIndex((o) => o.value === value))

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = options.length - 1
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last }[e.key]
    if (to === undefined) return
    e.preventDefault()
    const n = (to + options.length) % options.length
    onChange(options[n].value)
    refs.current[n]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2.5', columns)}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            tabIndex={i === active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative w-full rounded-xl border bg-surface text-left transition-[border-color,box-shadow,background-color] duration-150',
              size === 'sm' ? 'px-3.5 py-2.5' : 'p-4',
              on ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]' : 'border-line hover:border-line-strong hover:bg-canvas/60',
            )}
          >
            <span
              className={cn(
                'absolute right-3 top-3 grid size-5 place-items-center rounded-full border transition-colors duration-150',
                on ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface',
                size === 'sm' && 'top-1/2 -translate-y-1/2',
              )}
              aria-hidden
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="block pr-7">{o.content ?? <span className="text-sm font-semibold">{o.label}</span>}</span>
          </button>
        )
      })}
    </div>
  )
}
