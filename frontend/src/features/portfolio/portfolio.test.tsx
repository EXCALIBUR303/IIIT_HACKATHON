import { screen, waitFor } from '@testing-library/react'
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
  gain_paise: 0, holdings: [], history: [{ round: 0, total_paise: 1000000 }], years: [],
}

const scenarios = [
  { key: 'earnings_surprise', title: 'Results day surprise', kicker: 'Earnings', summary: 'Infosys reports results.', skills: ['Earnings'], steps: 6, unit: 'day', focus: ['Infosys'], attempts: 0, completed: 0, best_result_pct: null, understood: false, reward: 15 },
  { key: 'rbi_policy', title: 'RBI policy day', kicker: 'Policy', summary: 'Rates.', skills: ['Interest rates'], steps: 6, unit: 'day', focus: ['HDFC Bank'], attempts: 1, completed: 1, best_result_pct: 2.5, understood: true, reward: 15 },
]
const quote = (key: string, name: string, price: number) => ({
  key, name, ticker: key.toUpperCase(), symbol: `${key.toUpperCase()}.BSE`, sector: 'IT services', about: 'About.', risk_level: 'medium',
  price_paise: price, prev_close_paise: price, change_paise: 0, change_pct: 0, history: [{ date: '2026-10-09', close_paise: price - 500 }, { date: '2026-10-10', close_paise: price }], as_of: '2026-10-10', source: 'demo',
})
const marketData = { status: 'demo', provider: 'Demo data', note: 'Demo reference prices.', as_of: null, disclaimer: 'Fictional.', quotes: [quote('infosys', 'Infosys', 150000), quote('tcs', 'Tata Consultancy Services', 305000)] }
const newsFeed = {
  status: 'demo', provider: 'Demo news', note: 'Demo explainers, not live news.',
  items: [
    { id: 'demo-0', title: 'Explainer: what an RBI rate hold means for banks', snippet: 's', source: 'RupeeRise demo desk', url: null, image_url: null, published_at: new Date().toISOString(), category: 'Policy', impact: 'Mixed', why: 'Borrowing costs matter most for banks.', affected: [], is_demo: true },
    { id: 'demo-1', title: 'How TCS and Infosys are judged against estimates', snippet: 's', source: 'RupeeRise demo desk', url: null, image_url: null, published_at: new Date().toISOString(), category: 'Earnings', impact: 'Watch', why: 'The surprise moves the price.', affected: ['infosys'], is_demo: true },
  ],
}
const streak = {
  today: '2026-10-11', weeks: 12, current: 3, longest: 5, active_days: 9, today_done: true, next_milestone: 7,
  days: Array.from({ length: 84 }, (_, i) => ({ date: `d${i}`, count: i % 5, level: (i % 5) as 0 | 1 | 2 | 3 | 4 })),
  milestones: [7, 14, 30, 47, 84].map((d) => ({ days: d, label: `${d} days`, reached: false })),
  habits: [{ key: 'decide', label: 'Make one Market Lab decision', done: true }],
}
const company = (key: string, name: string, hist: number[], held = 0) => ({
  key, name, ticker: key.toUpperCase(), sector: 'IT services', about: 'About.', risk_level: 'medium', price_paise: hist[hist.length - 1],
  change_paise: 0, change_pct: 1.2, since_start_pct: 1.2, history_paise: hist, held, in_focus: key === 'infosys',
})
const session = {
  id: 's1', status: 'active',
  scenario: { key: 'earnings_surprise', title: 'Results day surprise', kicker: 'Earnings', summary: 'Infosys reports results.', lesson: null, steps: 6, unit: 'day', labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'], event_steps: [1, 2] },
  step: 1, step_label: 'Day 2', is_last_step: false, reference: { source: 'demo', as_of: null },
  cash_paise: 9250000, starting_cash_paise: 10000000, invested_paise: 760000, total_paise: 10010000, pnl_paise: 10000, pnl_pct: 0.1,
  day_change_paise: 10000, day_change_pct: 0.1, drawdown_pct: 0, max_drawdown_pct: 0,
  risk: { score: 12, level: 'Low', top_weight_pct: 7.6, note: 'A few holdings.' },
  allocation: [{ label: 'IT services', pct: 7.6 }, { label: 'Cash', pct: 92.4 }],
  holdings: [{ key: 'infosys', name: 'Infosys', sector: 'IT services', quantity: 5, avg_cost_paise: 150000, price_paise: 152000, value_paise: 760000, day_change_paise: 10000, day_change_pct: 1.33, pnl_paise: 10000, pnl_pct: 1.33, weight_pct: 7.6 }],
  companies: [company('infosys', 'Infosys', [150000, 152000], 5), company('tcs', 'Tata Consultancy Services', [305000, 306000])],
  series: [{ step: 0, label: 'Day 1', total_paise: 10000000, benchmark_paise: 10000000 }, { step: 1, label: 'Day 2', total_paise: 10010000, benchmark_paise: 10004000 }],
  events: [{ step: 1, label: 'Day 2', category: 'Earnings', headline: 'Infosys results due after market hours tomorrow', body: 'b', why: 'The surprise moves the price.', impact: 'Watch', affected: ['infosys', 'tcs'], after: null, is_new: true }],
  recap: { label: 'Day 2', market_pct: 0.4, portfolio_change_paise: 10000, best: { key: 'infosys', name: 'Infosys', pct: 1.33 }, worst: { key: 'tcs', name: 'Tata Consultancy Services', pct: 0.33 }, headlines: [] },
  journal: [{ id: 1, step: 0, label: 'Day 1', action: 'buy', key: 'infosys', name: 'Infosys', qty: 5, price_paise: 150000, reason: 'news', reason_label: 'Reacting to the news', at: '2026-10-11T05:00:00Z', outcome: { move_pct: 1.33, effect_paise: 10000, text: 'Since you bought, Infosys moved +1.3%.', causes: ['Infosys results due after market hours tomorrow'] } }],
  actions_left: 12, max_weight_pct: 25, debrief: null,
}
const overview = (withSession: boolean) => ({
  access: access(true), disclaimer: 'Fictional portfolio with practice money.', starting_cash_paise: 10000000, max_weight_pct: 25,
  reasons: [{ key: 'news', label: 'Reacting to the news' }, { key: 'long_term', label: 'Thinking long term' }],
  wallet_balance: 75, scenarios, session: withSession ? session : null,
})

/** Market Lab endpoints answer with lab data; everything else falls through to ``rest``. */
function lab(withSession: boolean, rest: (url: string, init?: RequestInit) => { status?: number; body?: unknown }) {
  return (url: string, init?: RequestInit) => {
    if (url.startsWith('/portfolio/scenario/decisions')) return { body: { ...session, journal: [{ ...session.journal[0], id: 2, action: 'buy', qty: 2, key: 'tcs', name: 'Tata Consultancy Services', reason_label: 'Thinking long term', outcome: null }, ...session.journal] } }
    if (url.startsWith('/portfolio/scenario')) return { body: overview(withSession) }
    if (url.startsWith('/portfolio/market-data')) return { body: marketData }
    if (url.startsWith('/portfolio/news')) return { body: newsFeed }
    if (url.startsWith('/portfolio/streak')) return { body: streak }
    return rest(url, init)
  }
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

  it('invites an unlocked student to start the ten-year run with practice cash', async () => {
    const user = userEvent.setup()
    mockFetch(lab(false, () => ({ body: { ...base, access: access(true), portfolio: null, instruments } })))
    renderWithProviders(<PortfolioPage />)
    await user.click(await screen.findByRole('tab', { name: /ten-year run/i }))
    expect(await screen.findByText(/₹10,000 of practice cash/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start portfolio quest/i })).toBeInTheDocument()
  })

  it('shows labelled readouts, locks single-company instruments and gives a quote before buying', async () => {
    const user = userEvent.setup()
    mockFetch(
      lab(false, (url) => {
        if (url.startsWith('/portfolio/quote'))
          return { body: { instrument_key: 'steady_deposit', label: 'Steady Deposit', side: 'buy', quantity: 1, price_paise: 10000, total_paise: 10000, cash_after_paise: 990000, warnings: [], disclaimer: 'x' } }
        return { body: { ...base, access: access(true), portfolio, instruments } }
      }),
    )
    renderWithProviders(<PortfolioPage />)
    await user.click(await screen.findByRole('tab', { name: /ten-year run/i }))
    expect(await screen.findByText('Practice cash')).toBeInTheDocument()
    expect(screen.getAllByText('₹10,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText(/show you understand diversification/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy zippy/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /buy steady deposit/i }))
    expect(await screen.findByText('₹9,900.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm purchase/i })).toBeInTheDocument()
  })

  it('marks losses with a sign and arrow, not colour alone', async () => {
    const user = userEvent.setup()
    mockFetch(lab(false, () => ({ body: { ...base, access: access(true), portfolio: { ...portfolio, gain_paise: -28000, total_paise: 972000 }, instruments } })))
    renderWithProviders(<PortfolioPage />)
    await user.click(await screen.findByRole('tab', { name: /ten-year run/i }))
    expect(await screen.findByText('▼ −')).toBeInTheDocument()
    expect(screen.getAllByText('₹280.00').length).toBeGreaterThan(0)
  })

  it('opens on the market lab with scenarios, labelled demo data and no session yet', async () => {
    mockFetch(lab(false, () => ({ body: { ...base, access: access(true), portfolio: null, instruments } })))
    renderWithProviders(<PortfolioPage />)
    expect(await screen.findByRole('button', { name: 'Start market day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start results day surprise/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replay rbi policy day/i })).toBeInTheDocument()
    expect(await screen.findByText('Reference prices:')).toBeInTheDocument()
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0)
    expect(screen.getByText(/practice money only · not financial advice/i)).toBeInTheDocument()
    // Streaks and coin balances live in the Learning Wallet, not in Portfolio Quest.
    expect(screen.queryByText(/day.? in a row/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/RR coins and scenario badges/i)).not.toBeInTheDocument()
  })

  it('shows the live scenario: value, breaking news, journal outcome and a filterable feed', async () => {
    const user = userEvent.setup()
    mockFetch(lab(true, () => ({ body: { ...base, access: access(true), portfolio: null, instruments } })))
    renderWithProviders(<PortfolioPage />)
    expect(await screen.findByRole('heading', { name: 'Portfolio value' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start day 3/i })).toBeInTheDocument()
    expect(screen.getByText(/breaking · day 2/i)).toBeInTheDocument()
    expect(screen.getByText('Since you bought, Infosys moved +1.3%.')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: /risk low/i })).toBeInTheDocument()

    // Category filter is real: Policy hides the earnings items.
    await user.click(await screen.findByRole('button', { name: 'Policy' }))
    await waitFor(() => expect(screen.queryByText('How TCS and Infosys are judged against estimates')).not.toBeInTheDocument())
    expect(screen.getByText('Explainer: what an RBI rate hold means for banks')).toBeInTheDocument()
    const why = screen.getByRole('button', { name: /why this matters/i })
    await user.click(why)
    expect(why).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Borrowing costs matter most for banks.')).toBeInTheDocument()
  })

  it('needs a reason before a practice order and logs it in the journal', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(lab(true, () => ({ body: { ...base, access: access(true), portfolio: null, instruments } })))
    renderWithProviders(<PortfolioPage />)
    await user.click(await screen.findByRole('button', { name: /tata consultancy services, .*open details/i }))
    const place = await screen.findByRole('button', { name: 'Place practice buy' })
    expect(place).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /thinking long term/i }))
    expect(place).toBeEnabled()
    await user.click(place)
    expect(await screen.findByText(/bought 1 tata consultancy services/i)).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/portfolio/scenario/decisions'))
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ action: 'buy', company_key: 'tcs', quantity: 1, reason: 'long_term', confirm: true })
  })

  it('shows the decade timeline: completed years open a summary, future years stay locked', async () => {
    const user = userEvent.setup()
    const years = [
      { round: 1, mood: 'crash', title: 'Year 1: Market crash', summary: 'Prices fell sharply.', market_change_pct: -28, total_before_paise: 1000000, total_after_paise: 950000, change_paise: -50000, change_pct: -5, best: { key: 'steady_deposit', label: 'Steady Deposit', return_pct: 6 }, worst: { key: 'growth_basket', label: 'Growth Basket', return_pct: -28 }, consequence: 'Holding steadier things reduced the damage.', prompt: 'A big fall is happening. Would you hold, add or sell, and why?' },
      { round: 2, mood: 'recovery', title: 'Year 2: Recovery', summary: 'Prices bounced back.', market_change_pct: 18, total_before_paise: 950000, total_after_paise: 1010000, change_paise: 60000, change_pct: 6.3, best: { key: 'growth_basket', label: 'Growth Basket', return_pct: 18 }, worst: { key: 'steady_deposit', label: 'Steady Deposit', return_pct: 6 }, consequence: 'You recovered the fall.', prompt: 'Prices are recovering. Did waiting change how you feel about risk?' },
    ]
    mockFetch(lab(false, () => ({ body: { ...base, access: access(true), portfolio: { ...portfolio, round: 2, total_paise: 1010000, years, history: [{ round: 0, total_paise: 1000000 }, { round: 1, total_paise: 950000 }, { round: 2, total_paise: 1010000 }] }, instruments } })))
    renderWithProviders(<PortfolioPage />)
    await user.click(await screen.findByRole('tab', { name: /ten-year run/i }))
    expect(await screen.findByRole('heading', { name: 'Year 2 of 10' })).toBeInTheDocument()
    expect(screen.getByText('Year 2: Recovery')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /year 5, not reached yet/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /year 1: market crash/i }))
    expect(await screen.findByText('Holding steadier things reduced the damage.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Advance one year' })).toBeEnabled()
  })
})
