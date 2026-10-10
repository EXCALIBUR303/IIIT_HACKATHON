import { describe, expect, it } from 'vitest'
import { inr, pct, signedPct } from './format'

describe('format', () => {
  it('formats rupees with Indian digit grouping', () => {
    expect(inr(125000)).toBe('₹1,25,000')
    expect(inr(1250.5, { paise: true })).toBe('₹1,250.50')
    expect(inr(null)).toBe('—')
  })
  it('formats percentages', () => {
    expect(pct(0.256)).toBe('26%')
    expect(signedPct(3.21)).toBe('+3.2%')
    expect(signedPct(-6.8)).toBe('-6.8%')
  })
})
