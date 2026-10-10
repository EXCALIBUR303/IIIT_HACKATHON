import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { useI18n } from '@/lib/i18n'

export function AuthLayout({ title, subtitle, children, footer }: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-primary-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="rounded-xl bg-white/95 px-3 py-2 self-start">
          <Logo />
        </Link>
        <div className="max-w-md">
          <p className="text-3xl font-extrabold leading-tight text-white">{t('app.tagline')}</p>
          <p className="mt-4 leading-relaxed text-primary-100">
            Practise real-life money decisions with fictional rupees. Every choice comes with an explanation, and you can
            always try again.
          </p>
        </div>
        <svg className="pointer-events-none absolute -bottom-10 -right-10 h-72 w-72 text-white/5" viewBox="0 0 40 40" aria-hidden>
          <path d="M5 35 L15 22 L22 27 L35 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-primary-100/80">Not financial advice. No real money involved.</p>
      </aside>
      <main className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-soft">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
