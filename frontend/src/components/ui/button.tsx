import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Primary actions are emerald; indigo is the brand accent (see the design tokens).
        primary: 'bg-accent-ink text-white shadow-[0_1px_2px_rgb(4_120_87/0.3),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-[#065f46]',
        accent: 'bg-accent-ink text-white shadow-sm hover:bg-[#065f46]',
        brand: 'bg-primary text-white shadow-sm hover:bg-primary-hover',
        secondary: 'bg-primary-soft text-primary-ink hover:bg-primary-100',
        outline: 'border border-line-strong bg-surface text-ink hover:bg-canvas',
        ghost: 'text-ink-soft hover:bg-primary-soft hover:text-primary-ink',
        danger: 'bg-danger text-white hover:bg-danger-ink',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-11 px-5',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { buttonVariants }
