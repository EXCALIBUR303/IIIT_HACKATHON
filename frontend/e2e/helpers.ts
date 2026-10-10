import { execFileSync } from 'node:child_process'
import { expect, type APIRequestContext, type Page } from '@playwright/test'

const API = 'http://localhost:8001/api/v1'
let counter = 0

export function uniqueName(prefix: string) {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}

const BEARER = { 'X-Auth-Mode': 'bearer' }

/**
 * Create and onboard a student through the API, then sign the browser in.
 *
 * Setup calls use bearer mode so they need no cookies; the final login goes through the
 * browser context so the HttpOnly session cookies land in the page, exactly as a real sign-in.
 */
export async function loginAsNewStudent(page: Page, request: APIRequestContext, persona = 'meera') {
  const username = uniqueName('e2e')
  const password = 'e2e-password-1'
  const reg = await request.post(`${API}/auth/register/student`, {
    headers: BEARER,
    data: { username, password, display_name: 'Asha' },
  })
  expect(reg.ok()).toBeTruthy()
  const { access_token } = await reg.json()
  const headers = { Authorization: `Bearer ${access_token}` }
  const put = await request.put(`${API}/students/me/profile`, {
    headers,
    data: { grade: 12, language: 'en', learning_level: 'beginner', persona_key: persona, onboarding_completed: true },
  })
  expect(put.ok()).toBeTruthy()
  await signIn(page, username, password)
  return { username, headers }
}

/** Sign the browser context in. Cookie sessions are shared by the page and `page.request`. */
export async function signIn(page: Page, username: string, password: string) {
  const res = await page.context().request.post(`${API}/auth/login`, { data: { username, password } })
  expect(res.ok()).toBeTruthy()
  await page.goto('/')
}

/** Operators create organisations and invitations; there is no HTTP route for it. */
export function createEducatorInvite(): string {
  const env = {
    ...process.env,
    RUPEERISE_DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://localhost:5432/rupeerise_e2e',
  }
  const run = (...args: string[]) =>
    execFileSync('uv', ['run', 'python', '-m', 'app.admin', ...args], { cwd: '../backend', env, encoding: 'utf8' })
  const org = uniqueName('E2E NGO ')
  run('create-org', org)
  return (JSON.parse(run('create-invite', '--org', org, '--json').trim().split('\n').pop()!) as { token: string }).token
}

export async function setNumber(page: Page, name: RegExp | string, value: number) {
  const input = page.getByRole('spinbutton', { name })
  await input.fill(String(value))
}
