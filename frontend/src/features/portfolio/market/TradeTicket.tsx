import { Minus, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { RadioCards } from '@/components/ui/radio-cards'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { api } from '@/lib/api/endpoints'
import type { LabCompany, LabSession } from '@/lib/api/types'
import { inrPaise } from '@/lib/format'
import { SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { newRequestId } from './lib'

type Side = 'buy' | 'sell' | 'hold'

/** Buy, sell or deliberately hold one company, always with the reason why. Server prices it. */
export function TradeTicket({ company, session, reasons, onDone, initialSide = 'buy' }: {
  company: LabCompany
  session: LabSession
  reasons: { key: string; label: string }[]
  onDone: (s: LabSession) => void
  initialSide?: Side
}) {
  const [side, setSide] = useState<Side>(company.held === 0 && initialSide === 'sell' ? 'buy' : initialSide)
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const rid = useRef(newRequestId())

  const price = company.price_paise
  const n = Number(qty)
  const validQty = Number.isInteger(n) && n >= 1
  const limit = session.max_weight_pct
  const maxBuy = Math.max(0, Math.min(Math.floor(session.cash_paise / price), Math.floor((session.total_paise * limit) / 100 / price) - company.held))
  const maxFor = side === 'buy' ? maxBuy : side === 'sell' ? company.held : 0
  const amount = validQty ? n * price : 0
  const weightAfter = side === 'buy' && validQty ? ((company.held + n) * price * 100) / session.total_paise : (company.held * price * 100) / session.total_paise
  const overLimit = side === 'buy' && validQty && weightAfter > limit
  const blocked = session.status !== 'active' || session.actions_left === 0
  const canSubmit = !blocked && !!reason && (side === 'hold' || (validQty && n <= maxFor))

  const segments: { value: Side; label: string; disabled?: boolean }[] = [
    { value: 'buy', label: 'Buy' },
    { value: 'sell', label: 'Sell', disabled: company.held === 0 },
    { value: 'hold', label: 'Hold' },
  ]

  async function submit() {
    if (!canSubmit || !reason) return
    setBusy(true)
    setError(null)
    try {
      const next = await api.market.decide({ request_id: rid.current, action: side, company_key: company.key, quantity: side === 'hold' ? 0 : n, reason })
      rid.current = newRequestId()
      setDone(side === 'buy' ? `Bought ${n} ${company.name}` : side === 'sell' ? `Sold ${n} ${company.name}` : `Logged a hold on ${company.name}`)
      setReason(null)
      setQty('1')
      onDone(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That order could not be placed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Order type" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-canvas p-1">
        {segments.map((sg) => (
          <button
            key={sg.value}
            type="button"
            aria-pressed={side === sg.value}
            disabled={sg.disabled}
            onClick={() => {
              setSide(sg.value)
              setError(null)
              setDone(null)
            }}
            className="relative rounded-lg py-2 text-sm font-bold disabled:opacity-40"
          >
            {side === sg.value && (
              <motion.span
                layoutId="ticket-side"
                className={cn('absolute inset-0 rounded-lg shadow-sm', sg.value === 'buy' ? 'bg-accent-ink' : sg.value === 'sell' ? 'bg-danger' : 'bg-ink')}
                transition={SPRING}
              />
            )}
            <span className={cn('relative', side === sg.value ? 'text-white' : 'text-ink-soft')}>{sg.label}</span>
          </button>
        ))}
      </div>

      {side === 'hold' ? (
        <p className="rounded-xl bg-canvas p-3 text-sm text-ink-soft">
          Holding is a decision too. Log it with your reason and the journal will show what happened after.
          {company.held > 0 ? ` You hold ${company.held} shares.` : ' You hold none, so this records that you chose to wait.'}
        </p>
      ) : (
        <div>
          <label htmlFor="ticket-qty" className="text-sm font-semibold">
            Shares
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="One fewer share" onClick={() => setQty(String(Math.max(1, (validQty ? n : 1) - 1)))}>
              <Minus />
            </Button>
            <input
              id="ticket-qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="h-10 w-20 rounded-xl border border-line-strong bg-surface text-center text-base font-bold tabular focus:border-primary focus:outline-none"
              aria-describedby="ticket-max"
            />
            <Button type="button" variant="outline" size="icon" aria-label="One more share" onClick={() => setQty(String((validQty ? n : 0) + 1))}>
              <Plus />
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={maxFor < 1} onClick={() => setQty(String(Math.max(1, maxFor)))}>
              Max {maxFor}
            </Button>
          </div>
          <p id="ticket-max" className="mt-1.5 text-xs text-muted">
            {side === 'buy' ? `Up to ${maxBuy} with your cash and the ${limit}% single-company limit.` : `You hold ${company.held}.`}
          </p>

          <dl className="mt-4 space-y-1.5 rounded-xl border border-line p-3 text-sm">
            <Row label="Price per share" value={inrPaise(price)} />
            <Row label={side === 'buy' ? 'Estimated cost' : 'Estimated proceeds'} value={validQty ? inrPaise(amount) : '—'} strong />
            <Row label="Practice cash after" value={validQty ? inrPaise(session.cash_paise + (side === 'buy' ? -amount : amount)) : '—'} />
            {side === 'buy' && (
              <div>
                <div className="flex justify-between">
                  <dt className="text-muted">Share of portfolio after</dt>
                  <dd className={cn('font-semibold tabular', overLimit && 'text-danger-ink')}>{weightAfter.toFixed(1)}%</dd>
                </div>
                <div className="relative mt-1.5 h-1.5 rounded-full bg-line" aria-hidden>
                  <div className={cn('h-full rounded-full', overLimit ? 'bg-danger' : 'bg-investing')} style={{ width: `${Math.min(100, (weightAfter / limit) * 100)}%` }} />
                </div>
              </div>
            )}
          </dl>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-semibold" aria-hidden>
          Why are you doing this?
        </p>
        <RadioCards label="Why are you doing this?" options={reasons.map((r) => ({ value: r.key, label: r.label }))} value={reason} onChange={(v) => setReason(v)} columns="grid-cols-2" size="sm" />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
      {done && !error && (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent-ink">
          {done}. It is in your decision journal.
        </p>
      )}
      <Button className="w-full" variant={side === 'sell' ? 'danger' : 'primary'} disabled={!canSubmit} loading={busy} onClick={submit}>
        {side === 'buy' ? 'Place practice buy' : side === 'sell' ? 'Place practice sell' : 'Log hold decision'}
      </Button>
      <p className="text-center text-[11px] text-muted">
        {blocked ? (session.status !== 'active' ? 'This scenario has ended.' : 'No decisions left this step. Move on to continue.') : !reason ? 'Pick a reason to continue.' : 'Practice money only. Not a real order.'}
      </p>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('tabular', strong ? 'font-extrabold' : 'font-semibold')}>{value}</dd>
    </div>
  )
}
