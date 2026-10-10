import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { Button } from './button'

/** Accessible confirm/cancel modal for actions that change fictional balances. */
export function ConfirmDialog({ open, onOpenChange, title, description, children, confirmLabel, onConfirm, busy, error, danger }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  error?: string | null
  danger?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-2xl focus:outline-none">
          <Dialog.Title className="text-lg font-extrabold">{title}</Dialog.Title>
          {description && <Dialog.Description className="mt-1 text-sm text-ink-soft">{description}</Dialog.Description>}
          {children && <div className="mt-4">{children}</div>}
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
