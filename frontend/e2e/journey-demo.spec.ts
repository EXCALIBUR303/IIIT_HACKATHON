import { expect, test } from '@playwright/test'

test('journey demo is public, labelled as a local demo and interactive', async ({ page }) => {
  await page.goto('/journey-demo')
  await expect(page.getByText('Local demo · nothing is saved')).toBeVisible()
  await page.getByRole('button', { name: /Builder/ }).click()
  await expect(page.getByText(/Money Lab/).first()).toBeVisible()
  await expect(page.getByText(/not advice/i)).toBeVisible()
})
