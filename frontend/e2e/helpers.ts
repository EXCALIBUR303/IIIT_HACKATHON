import { expect, type APIRequestContext, type Page } from '@playwright/test'

const API = 'http://localhost:8001/api/v1'
let counter = 0

export function uniqueName(prefix: string) {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}

/** Create and onboard a student through the API, then load the session token into the browser. */
export async function loginAsNewStudent(page: Page, request: APIRequestContext, persona = 'meera') {
  const username = uniqueName('e2e')
  const reg = await request.post(`${API}/auth/register/student`, {
    data: { username, password: 'e2e-password-1', display_name: 'Asha' },
  })
  expect(reg.ok()).toBeTruthy()
  const { access_token } = await reg.json()
  const headers = { Authorization: `Bearer ${access_token}` }
  const put = await request.put(`${API}/students/me/profile`, {
    headers,
    data: { grade: 12, language: 'en', learning_level: 'beginner', persona_key: persona, onboarding_completed: true },
  })
  expect(put.ok()).toBeTruthy()
  await page.goto('/')
  await page.evaluate((t) => localStorage.setItem('rupeerise.token', t), access_token)
  return { username, headers }
}

export async function setNumber(page: Page, name: RegExp | string, value: number) {
  const input = page.getByRole('spinbutton', { name })
  await input.fill(String(value))
}
