import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RewardEarned } from '@/components/common/rewards'
import { mockFetch, renderWithProviders } from '@/test/utils'
import WalletPage from './WalletPage'

afterEach(() => vi.unstubAllGlobals())

describe('RewardEarned', () => {
  it('renders nothing when no reward was issued', () => {
    const { container } = renderWithProviders(<RewardEarned rewards={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each reason and labels the money as fictional', () => {
    renderWithProviders(
      <RewardEarned
        rewards={[
          { amount: 25, reason: 'Completed the mission with sound choices.', rule_key: 'sim_pass', concept: null },
          { amount: 50, reason: 'Strong, well-reasoned choices in the mission.', rule_key: 'sim_strong', concept: null },
        ]}
      />,
    )
    expect(screen.getByText(/fictional learning money/i)).toBeInTheDocument()
    expect(screen.getByText(/completed the mission with sound choices/i)).toBeInTheDocument()
    expect(screen.getByText('+₹50')).toBeInTheDocument()
  })
})

describe('WalletPage', () => {
  it('shows an empty state with a next step for a new student', async () => {
    mockFetch((url) => {
      if (url.startsWith('/portfolio/streak')) return { body: { ...streak, current: 0, active_days: 0, today_done: false } }
      if (url.startsWith('/portfolio/scenario')) return { body: { scenarios } }
      return { body: { balance: 0, total_earned: 0, history: [], rules: [], notice: 'Fictional learning money.' } }
    })
    renderWithProviders(<WalletPage />)
    expect(await screen.findByText('No rewards yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start a mission/i })).toBeInTheDocument()
  })

  it('shows balance, reason and amount from the server ledger', async () => {
    mockFetch((url) => {
      if (url.startsWith('/portfolio/streak')) return { body: streak }
      if (url.startsWith('/portfolio/scenario')) return { body: { scenarios } }
      return { body: wallet }
    })
    renderWithProviders(<WalletPage />)
    expect(await screen.findByText(/strong, well-reasoned/i)).toBeInTheDocument()
    expect(screen.getByText(/needs vs wants/i)).toBeInTheDocument()
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('75')
    expect(screen.getByRole('heading', { name: 'Practice Streak' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scenario Badges' })).toBeInTheDocument()
    expect(screen.getByText('Finish a mission with sound choices')).toBeInTheDocument()
    expect(screen.getByText('Unlocked')).toBeInTheDocument()
    expect(screen.getAllByText(/never for profit|never change your coins/i).length).toBeGreaterThan(0)
  })
})

const streak = {
  today: '2026-10-11', weeks: 12, current: 3, longest: 5, active_days: 9, today_done: true, next_milestone: 14,
  days: Array.from({ length: 84 }, (_, i) => ({ date: `d${i}`, count: i % 5, level: i % 5 })),
  milestones: [7, 14, 30, 47, 84].map((d) => ({ days: d, label: `${d} days`, reached: d === 7 })),
  habits: [{ key: 'decide', label: 'Make one Market Lab decision', done: true }],
}
const scenarios = [{ key: 'earnings_surprise', title: 'Results day surprise', kicker: 'Earnings', summary: 's', skills: [], steps: 6, unit: 'day', focus: [], attempts: 1, completed: 1, best_result_pct: 1, understood: true, reward: 15 }]
const wallet = {
  balance: 75,
  total_earned: 75,
  rules: [{ key: 'sim_pass', label: 'Finish a mission with sound choices', amount: 25 }],
  history: [{ id: 2, entry_type: 'reward', amount: 50, reason: 'Strong, well-reasoned choices in the mission.', rule_key: 'sim_strong', source_type: 'simulation', source_ref: 'abc', concept: 'needs_vs_wants', created_at: new Date().toISOString() }],
  notice: 'Fictional learning money.',
}
