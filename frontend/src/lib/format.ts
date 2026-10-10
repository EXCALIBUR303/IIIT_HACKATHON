const rupees0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const rupees2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

/** Format fictional rupee amounts using Indian digit grouping (₹1,25,000). */
export function inr(value: number | null | undefined, opts: { paise?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (opts.paise) return rupees2.format(value)
  return rupees0.format(Math.round(value))
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function signedPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Whole paise -> '₹1,234.50'. Portfolio money is integer paise end to end. */
export function inrPaise(paise: number): string {
  return rupees2.format(paise / 100)
}

/** Signed paise with an explicit ▲/▼ so gain and loss never rely on colour alone. */
export function signedPaise(paise: number): string {
  if (paise === 0) return '₹0.00'
  return `${paise > 0 ? '▲ +' : '▼ −'}${rupees2.format(Math.abs(paise) / 100)}`
}
