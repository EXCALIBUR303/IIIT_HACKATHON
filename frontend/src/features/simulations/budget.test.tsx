import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BudgetSession } from '@/lib/api/types'
import { BudgetSimulator, summarize } from './kinds/BudgetSimulator'

const categories = [
  { key: 'bus', label: 'Bus pass', kind: 'need' as const, essential_min: 600, hint: '' },
  { key: 'fun', label: 'Outings', kind: 'want' as const, essential_min: 0, hint: '' },
  { key: 'save', label: 'Savings', kind: 'savings' as const, essential_min: 0, hint: '' },
]

const session: BudgetSession = {
  id: 's1',
  scenario_slug: 'demo',
  kind: 'budget',
  attempt_number: 1,
  status: 'in_progress',
  phase: 'allocate',
  state: { income: 1000, goal: { label: 'Calculator', amount: 600, months: 3, monthly_target: 200 }, categories },
  result: null,
  score: null,
  previous_best: null,
  new_achievements: [],
  started_at: '',
  completed_at: null,
}

describe('budget summary', () => {
  it('computes totals, remaining and shortfalls', () => {
    const s = summarize(categories, { bus: 500, fun: 300, save: 100 }, 1000)
    expect(s.totals).toEqual({ need: 500, want: 300, savings: 100 })
    expect(s.remaining).toBe(100)
    expect(s.over).toBe(false)
    expect(s.shortfalls.map((c) => c.key)).toEqual(['bus'])
    expect(summarize(categories, { bus: 900, fun: 200 }, 1000).over).toBe(true)
  })
})

describe('BudgetSimulator', () => {
  it('disables locking when over budget and submits allocations', async () => {
    const decide = vi.fn().mockResolvedValue(undefined)
    render(<BudgetSimulator session={session} decide={decide} busy={false} error={null} />)
    const bus = screen.getByRole('spinbutton', { name: /bus pass/i })
    const fun = screen.getByRole('spinbutton', { name: /outings/i })
    await userEvent.clear(bus)
    await userEvent.type(bus, '700')
    await userEvent.clear(fun)
    await userEvent.type(fun, '400')
    const lock = screen.getByRole('button', { name: /lock in my budget/i })
    expect(lock).toBeDisabled()
    expect(screen.getByText(/can’t exceed income/i)).toBeInTheDocument()

    await userEvent.clear(fun)
    await userEvent.type(fun, '100')
    expect(lock).toBeEnabled()
    const plan = screen.getByText('Your plan').closest('div')!.parentElement!
    expect(within(plan).getByText('Left unallocated')).toBeInTheDocument()
    await userEvent.click(lock)
    expect(decide).toHaveBeenCalledWith('allocate', { allocations: { bus: 700, fun: 100, save: 0 } })
  })
})
