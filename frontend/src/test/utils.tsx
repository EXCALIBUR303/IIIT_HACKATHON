import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '@/lib/auth'
import { I18nProvider } from '@/lib/i18n'

export function renderWithProviders(ui: ReactElement, { route = '/', ...opts }: RenderOptions & { route?: string } = {}) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </MemoryRouter>
  )
  return render(ui, { wrapper: Wrapper, ...opts })
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown }

/** Minimal fetch mock: route handlers receive the path after /api/v1. */
export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^.*\/api\/v1/, '')
    const { status = 200, body = {} } = handler(url, init)
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
