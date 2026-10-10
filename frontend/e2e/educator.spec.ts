import { expect, test } from '@playwright/test'
import { createEducatorInvite, signIn, uniqueName } from './helpers'

const API = 'http://localhost:8001/api/v1'

test('educator creates a class, a student joins and appears in the cohort overview', async ({ page, request }) => {
  await page.goto('/register?role=educator')
  await page.getByLabel('Your first name or nickname').fill('Ms Rao')
  await page.getByLabel('Username').fill(uniqueName('teacher'))
  await page.getByLabel('Password').fill('e2e-password-1')
  await page.getByLabel('Invitation token').fill(createEducatorInvite())
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/educator/)
  await page.getByLabel('New class name').fill('Class 12-B')
  await page.getByRole('button', { name: 'Create class' }).click()
  const code = (await page.getByTestId('join-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  await expect(page.getByText('No students yet')).toBeVisible()

  const reg = await request.post(`${API}/auth/register/student`, {
    headers: { 'X-Auth-Mode': 'bearer' },
    data: { username: uniqueName('kid'), password: 'e2e-password-1', display_name: 'Zoya', join_code: code },
  })
  expect(reg.ok()).toBeTruthy()

  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByRole('cell', { name: /Zoya/ })).toBeVisible()
  await expect(page.getByText('Module completion')).toBeVisible()
})

test('students cannot open the educator dashboard', async ({ page, request }) => {
  const username = uniqueName('kid')
  const reg = await request.post(`${API}/auth/register/student`, {
    headers: { 'X-Auth-Mode': 'bearer' },
    data: { username, password: 'e2e-password-1', display_name: 'Ravi' },
  })
  expect(reg.ok()).toBeTruthy()
  await signIn(page, username, 'e2e-password-1')
  await page.goto('/educator')
  await expect(page).not.toHaveURL(/\/educator$/)
})
