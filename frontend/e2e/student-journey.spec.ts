import { expect, test } from '@playwright/test'
import { loginAsNewStudent, setNumber, uniqueName } from './helpers'

test('student signs up, onboards and lands on a personalised dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /start learning/i }).click()
  await page.getByLabel('Your first name or nickname').fill('Meera')
  await page.getByLabel('Username').fill(uniqueName('meera'))
  await page.getByLabel('Password').fill('e2e-password-1')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await page.getByRole('radio', { name: 'Class 11' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('radio', { name: 'Just starting' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('radio', { name: /Meera, Class 11/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Skip for now' }).click()

  await expect(page.getByRole('heading', { name: 'Namaste, Meera' })).toBeVisible()
  await expect(page.getByText('Starting point check')).toBeVisible() // first recommendation
})

test('budgeting challenge: allocate, survive a surprise, see consequences and retry', async ({ page, request }) => {
  await loginAsNewStudent(page, request)
  await page.goto('/app/play/budget-meera-pocket-money')
  await page.getByRole('button', { name: 'Start simulation' }).click()

  // Over budget first (₹2,500 of ₹2,000): the lock button must stay disabled.
  await setNumber(page, /bus pass/i, 1500)
  await setNumber(page, /lunch/i, 1000)
  await expect(page.getByRole('button', { name: /lock in my budget/i })).toBeDisabled()

  const plan: [RegExp, number][] = [
    [/bus pass/i, 600],
    [/lunch/i, 400],
    [/stationery/i, 200],
    [/recharge/i, 149],
    [/outings/i, 150],
    [/game top-ups/i, 50],
    [/savings for calculator/i, 400],
  ]
  for (const [name, value] of plan) await setNumber(page, name, value)
  await page.getByRole('button', { name: /lock in my budget/i }).click()

  await expect(page.getByText('How your plan scored')).toBeVisible()
  const feasible = page.locator('[role=radio]:not([disabled])').first()
  await feasible.click()
  await page.getByRole('button', { name: 'Confirm my choice' }).click()

  await expect(page.getByText(/Attempt 1 complete/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What happened' })).toBeVisible()
  await page.getByRole('button', { name: /try a different strategy/i }).click()
  await expect(page.getByRole('button', { name: /lock in my budget/i })).toBeVisible()
})

test('savings challenge: plan, handle an emergency, see the year', async ({ page, request }) => {
  await loginAsNewStudent(page, request)
  await page.goto('/app/play/savings-meera-calculator')
  await page.getByRole('button', { name: 'Start simulation' }).click()
  await setNumber(page, /calculator/i, 400)
  await setNumber(page, /emergency fund/i, 200)
  await page.getByRole('radio', { name: /student savings account/i }).click()
  await page.getByRole('button', { name: 'Start saving' }).click()
  await page.getByRole('radio', { name: /use my emergency fund first/i }).click()
  await page.getByRole('button', { name: 'See how the year ends' }).click()
  await expect(page.getByText(/Goal reached in month 3/)).toBeVisible()
  await expect(page.getByText(/Achievement unlocked/)).toBeVisible()
})

test('investing scenario: diversify, react to a fall and see the range of outcomes', async ({ page, request }) => {
  await loginAsNewStudent(page, request)
  await page.goto('/app/play/investing-time-horizon')
  await page.getByRole('button', { name: 'Start simulation' }).click()
  await page.getByRole('radio', { name: 'In 10 years' }).click()
  await page.getByLabel('Steady Deposit').fill('30')
  await page.getByLabel('Balanced Basket').fill('40')
  await page.getByLabel('Growth Basket').fill('30')
  await expect(page.getByText(/Total: 100%/)).toBeVisible()
  await expect(page.getByText('Middle')).toBeVisible() // live engine preview
  await page.getByRole('button', { name: /invest and fast-forward/i }).click()
  await expect(page.getByText(/The market fell/)).toBeVisible()
  await page.getByRole('radio', { name: 'Stay invested and wait' }).click()
  await page.getByRole('button', { name: 'Fast-forward to the end' }).click()
  await expect(page.getByText('The bigger picture: 1,000 possible futures')).toBeVisible()
  await expect(page.getByText(/education, not advice/i).first()).toBeVisible()
})

test('financial safety challenge: judge every message and review', async ({ page, request }) => {
  await loginAsNewStudent(page, request)
  await page.goto('/app/play/safety-inbox-basics')
  await page.getByRole('button', { name: 'Start simulation' }).click()
  for (let i = 0; i < 4; i++) {
    await expect(page.getByText(`Message ${i + 1} of 4`)).toBeVisible()
    await page.getByRole('radio', { name: 'Scam' }).click()
    await page.getByRole('radio', { name: 'Report and block the sender' }).click()
    await page.getByRole('button', { name: 'Check my answer' }).click()
    if (i < 3) await page.getByRole('button', { name: 'Next message' }).click()
  }
  await expect(page.getByText(/You judged \d of 4 messages correctly/)).toBeVisible()
})

test('module quiz is locked until the mission is done, then runs with explanations', async ({ page, request }) => {
  await loginAsNewStudent(page, request)
  await page.goto('/app/assessments/quiz-stay-safe')
  await expect(page.getByText(/finish .* mission/i).first()).toBeVisible()

  // Play the safety mission first.
  await page.goto('/app/play/safety-inbox-basics')
  await page.getByRole('button', { name: 'Start simulation' }).click()
  for (let i = 0; i < 4; i++) {
    await page.getByRole('radio', { name: 'Scam' }).click()
    await page.getByRole('radio', { name: 'Report and block the sender' }).click()
    await page.getByRole('button', { name: 'Check my answer' }).click()
    if (i < 3) await page.getByRole('button', { name: 'Next message' }).click()
  }
  await expect(page.getByText(/You judged \d of 4 messages correctly/)).toBeVisible()

  await page.goto('/app/assessments/quiz-stay-safe')
  for (let i = 0; i < 5; i++) {
    await page.locator('[role=radiogroup] [role=radio]').first().click()
    if (i < 4) await page.getByRole('button', { name: 'Next' }).click()
  }
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page).toHaveURL(/\/app\/results\//)
  await expect(page.getByRole('heading', { name: /of 5 correct/ })).toBeVisible()
  await expect(page.getByText('Question review')).toBeVisible()
  await page.getByRole('link', { name: 'View progress' }).click()
  await expect(page.getByRole('heading', { name: 'How your understanding is growing' })).toBeVisible()
  await expect(page.getByText('Checks & quizzes taken').locator('..')).toContainText('1')
})
