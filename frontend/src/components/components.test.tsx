import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Logo, LogoMark } from '@/components/brand/Logo'
import { FeedbackList } from '@/components/common/feedback'
import { ErrorState } from '@/components/common/states'
import { ProgressBar } from '@/components/ui/progress'
import { I18nProvider } from '@/lib/i18n'

describe('brand', () => {
  it('logo mark has an accessible name', () => {
    render(<LogoMark />)
    expect(screen.getByRole('img', { name: 'RupeeRise' })).toBeInTheDocument()
  })
  it('wordmark renders the product name', () => {
    render(<Logo showTagline />)
    expect(screen.getByText('Learn Money. Make Smarter Moves.')).toBeInTheDocument()
  })
})

describe('ui', () => {
  it('progress bar exposes accessible values and clamps', () => {
    render(<ProgressBar value={140} label="Goal" />)
    const bar = screen.getByRole('progressbar', { name: 'Goal' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
  })
  it('error state retry button calls handler', async () => {
    const onRetry = vi.fn()
    render(
      <I18nProvider>
        <ErrorState message="Server unreachable" onRetry={onRetry} />
      </I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Server unreachable')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('feedback list labels tone for screen readers', () => {
    render(<FeedbackList items={[{ tone: 'negative', concept: 'x', message: 'Needs first' }]} />)
    expect(screen.getByText('Needs first')).toBeInTheDocument()
    expect(screen.getByText('negative')).toHaveClass('sr-only')
  })
})
