import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type AtmosphereMode = 'aurora' | 'aurora-quiet' | 'bento' | 'wire' | 'tape' | 'muted' | 'ledger' | 'reward'

const MODE_CLASS: Record<AtmosphereMode, string> = {
  aurora: 'bg-aurora-grid',
  'aurora-quiet': 'bg-aurora-grid is-quiet',
  bento: 'bg-bento',
  wire: 'bg-technical-wire',
  tape: 'bg-market-tape',
  muted: 'bg-muted-glow',
  ledger: 'bg-ledger-paper',
  reward: 'bg-reward-glow',
}

/** Which atmosphere a route gets. Most specific path first. */
export function modeForPath(pathname: string): AtmosphereMode {
  if (pathname.startsWith('/app/settings') || pathname.startsWith('/educator/settings')) return 'aurora-quiet'
  if (pathname.startsWith('/app/wallet')) return 'reward'
  if (pathname.startsWith('/app/portfolio')) return 'tape'
  if (pathname.startsWith('/app/banking')) return 'ledger'
  if (pathname.startsWith('/app/progress')) return 'wire'
  if (pathname.startsWith('/app/learn')) return 'bento'
  if (pathname.startsWith('/app/assessments') || pathname.startsWith('/app/explore')) return 'muted'
  if (pathname === '/app' || pathname === '/app/') return 'aurora'
  return 'muted'
}

/** Ghosted market marks for the tape strip: tickers only, no prices, so nothing reads as a quote. */
const TICKERS = ['NIFTY 50', 'SENSEX', 'RELIANCE', 'TCS', 'HDFC BANK', 'INFOSYS', 'ITC', 'TATA MOTORS', 'SBI', 'MARUTI', 'NIFTY BANK', 'HUL']

/**
 * The lowest layer of the main area. Sits at z-index -1 inside an isolated container,
 * crossfades when the page's mood changes and never takes pointer events.
 */
export function PageAtmosphere({ mode }: { mode?: AtmosphereMode }) {
  const { pathname } = useLocation()
  const reduce = useReducedMotion()
  const active = mode ?? modeForPath(pathname)
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={active}
        aria-hidden
        data-atmosphere={active}
        className={cn('atmosphere', MODE_CLASS[active])}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: 'easeOut' }}
      >
        {active === 'tape' && (
          <div className="atmosphere-tape">
            {TICKERS.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/** The main content area: the atmosphere behind, the page above it. */
export function DashboardCanvas({ children, className, mode }: { children: React.ReactNode; className?: string; mode?: AtmosphereMode }) {
  return (
    <div className={cn('relative isolate overflow-x-clip bg-[var(--bg-base)]', className)}>
      <PageAtmosphere mode={mode} />
      {children}
    </div>
  )
}
