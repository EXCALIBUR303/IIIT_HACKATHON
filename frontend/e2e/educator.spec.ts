import { expect, test } from '@playwright/test'
import { uniqueName } from './helpers'

const API = 'http://localhost:8001/api/v1'

test('educator creates a class, a student joins and appears in the cohort overview', async ({ page, request }) => {
  await page.goto('/register?role=educator')
  await page.getByLabel('Your first name or nickname').fill('Ms Rao')
  await page.getByLabel('Username').fill(uniqueName('teacher'))
  await page.getByLabel('Password').fill('e2e-password-1')
  await page.getByLabel('Organisation or school name').fill(uniqueName('E2E NGO '))
  await page.getByLabel('Educator invite code').fill('e2e-invite')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/educator/)
  await page.getByLabel('New class name').fill('Class 12-B')
  await page.getByRole('button', { name: 'Create class' }).click()
  const code = (await page.locator('p.font-mono').textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  await expect(page.getByText('No students yet')).toBeVisible()

  const reg = await request.post(`${API}/auth/register/student`, {
    data: { username: uniqueName('kid'), password: 'e2e-password-1', display_name: 'Zoya', join_code: code },
  })
  expect(reg.ok()).toBeTruthy()

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByRole('cell', { name: /Zoya/ })).toBeVisible()
  await expect(page.getByText('Module completion')).toBeVisible()
})

test('students cannot open the educator dashboard', async ({ page, request }) => {
  const reg = await request.post(`${API}/auth/register/student`, {
    data: { username: uniqueName('kid'), password: 'e2e-password-1', display_name: 'Ravi' },
  })
  const { access_token } = await reg.json()
  await page.goto('/')
  await page.evaluate((t) => localStorage.setItem('rupeerise.token', t), access_token)
  await page.goto('/educator')
  await expect(page).not.toHaveURL(/\/educator$/)
})
