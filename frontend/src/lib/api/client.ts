import type { ApiErrorBody } from './types'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** An API-served file (e.g. a proxied news thumbnail) as a URL the page can load. */
export const apiAsset = (path: string) => `${BASE}${path}`

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string

  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

/** The CSRF cookie is readable on purpose. It is also the "probably signed in" hint. */
const CSRF_COOKIE = 'rr_csrf'

export function csrfToken(): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE}=`))
  return hit ? decodeURIComponent(hit.slice(CSRF_COOKIE.length + 1)) : null
}

export function hasSessionHint(): boolean {
  return csrfToken() !== null
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Sign-in style calls must never trigger a refresh-and-retry loop on their own 401.
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const csrf = csrfToken()
  if (csrf && UNSAFE.has(method)) headers['X-CSRF-Token'] = csrf
  try {
    return await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach RupeeRise. Check your connection and try again.')
  }
}

// One refresh at a time: parallel 401s share the same rotation instead of racing it.
let refreshing: Promise<boolean> | null = null
function refreshSession(): Promise<boolean> {
  refreshing ??= send('POST', '/auth/refresh', {})
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body)
  if (res.status === 401 && hasSessionHint() && !NO_REFRESH.some((p) => path.startsWith(p))) {
    if (await refreshSession()) res = await send(method, path, body)
  }
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error
    if (res.status === 401 && !NO_REFRESH.some((p) => path.startsWith(p))) onUnauthorized?.()
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.field)
  }
  return data as T
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
