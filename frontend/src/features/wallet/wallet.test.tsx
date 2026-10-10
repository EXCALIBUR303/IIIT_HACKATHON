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
    mockFetch((url) =>
      url.startsWith('/wallet') ? { body: { balance: 0, total_earned: 0, history: [], notice: 'Fictional learning money.' } } : {},
    )
    renderWithProviders(<WalletPage />)
    expect(await screen.findByText('No rewards yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start a mission/i })).toBeInTheDocument()
  })

  it('shows balance, reason and amount from the server ledger', async () => {
    mockFetch(() => ({
      body: {
        balance: 75,
        total_earned: 75,
        history: [
          {
            id: 2,
            entry_type: 'reward',
            amount: 50,
            reason: 'Strong, well-reasoned choices in the mission.',
            rule_key: 'sim_strong',
            source_type: 'simulation',
            source_ref: 'abc',
            concept: 'needs_vs_wants',
            created_at: new Date().toISOString(),
          },
        ],
        notice: 'Fictional learning money.',
      },
    }))
    renderWithProviders(<WalletPage />)
    expect(await screen.findByText(/strong, well-reasoned/i)).toBeInTheDocument()
    expect(screen.getByText(/needs vs wants/i)).toBeInTheDocument()
    expect(screen.getAllByText('₹75').length).toBeGreaterThan(0)
  })
})
