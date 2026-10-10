import { Switch as SwitchPrimitive } from 'radix-ui'
import { useId } from 'react'

export function SwitchRow({ label, description, checked, onCheckedChange }: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  const id = useId()
  const descId = `${id}-d`
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {description && (
          <p id={descId} className="mt-0.5 text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={description ? descId : undefined}
        className="group relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors duration-200 data-[state=checked]:bg-accent-ink"
      >
        <SwitchPrimitive.Thumb className="grid size-5 translate-x-0.5 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(11_22_51/0.3)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </div>
  )
}
