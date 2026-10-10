import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, renderWithProviders } from '@/test/utils'
import PortfolioPage from './PortfolioPage'

afterEach(() => vi.unstubAllGlobals())

const access = (open: boolean, reason: string | null = null) => ({
  open,
  reason,
  single_company_unlocked: false,
  single_company_reason: 'Show you understand diversification.',
  stage: 'future_planner',
})

const base = {
  disclaimer: 'Fictional instruments and made-up prices for practice.',
  wallet_balance: 75,
  transfer_cap_rupees: 5000,
  transactions: [],
}

const instruments = [
  { key: 'steady_deposit', label: 'Steady Deposit', description: 'd', risk_level: 'low', single_company: false, locked: false, lock_reason: null, price_paise: 10000, price_history_paise: [10000] },
  { key: 'zippy_gadgets', label: 'Zippy Gadgets Ltd', description: 'd', risk_level: 'very_high', single_company: true, locked: true, lock_reason: 'Show you understand diversification.', price_paise: 10000, price_history_paise: [10000] },
]

const portfolio = {
  run_number: 1, round: 0, max_round: 10, complete: false, starting_cash_paise: 1000000, transferred_paise: 0,
  transfer_remaining_rupees: 5000, cash_paise: 1000000, invested_paise: 0, total_paise: 1000000, contributed_paise: 1000000,
  gain_paise: 0, holdings: [], history: [{ round: 0, total_paise: 1000000 }],
}

describe('PortfolioPage', () => {
  it('explains why it is locked and links back to learning', async () => {
    mockFetch((url) =>
      url === '/modules'
        ? { body: [{ slug: 'understand-investing', pillar: 'investing' }] }
        : { body: { ...base, access: access(false, 'Finish one investing mission first.'), portfolio: null, instruments: [] } },
    )
    renderWithProviders(<PortfolioPage />)
    expect(await screen.findByText('Not unlocked yet')).toBeInTheDocument()
    expect(screen.getByText(/finish one investing mission first\./i)).toBeInTheDocument()
    // The call to action goes straight to the investing track, and nothing in the preview is a control.
    expect(await screen.findByRole('link', { name: /go to the investing mission/i })).toHaveAttribute('href', '/app/learn/understand-investing')
    expect(screen.getByText('What you will unlock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy|sell|start portfolio quest/i })).not.toBeInTheDocument()
  })

  it('invites an unlocked student to start with practice cash', async () => {
    mockFetch(() => ({ body: { ...base, access: access(true), portfolio: null, instruments } }))
    renderWithProviders(<PortfolioPage />)
    expect(await screen.findByText(/₹10,000 of practice cash/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start portfolio quest/i })).toBeInTheDocument()
  })

  it('shows labelled readouts, locks single-company instruments and gives a quote before buying', async () => {
    const user = userEvent.setup()
    mockFetch((url) => {
      if (url.startsWith('/portfolio/quote'))
        return { body: { instrument_key: 'steady_deposit', label: 'Steady Deposit', side: 'buy', quantity: 1, price_paise: 10000, total_paise: 10000, cash_after_paise: 990000, warnings: [], disclaimer: 'x' } }
      return { body: { ...base, access: access(true), portfolio, instruments } }
    })
    renderWithProviders(<PortfolioPage />)
    expect(await screen.findByText('Practice cash')).toBeInTheDocument()
    expect(screen.getAllByText('₹10,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText(/show you understand diversification/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy zippy/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /buy steady deposit/i }))
    expect(await screen.findByText('₹9,900.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm purchase/i })).toBeInTheDocument()
  })

  it('marks losses with a sign and arrow, not colour alone', async () => {
    mockFetch(() => ({ body: { ...base, access: access(true), portfolio: { ...portfolio, gain_paise: -28000, total_paise: 972000 }, instruments } }))
    renderWithProviders(<PortfolioPage />)
    expect(await screen.findByText('▼ −₹280.00')).toBeInTheDocument()
  })
})
