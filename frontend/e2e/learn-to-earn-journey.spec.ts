import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { loginAsNewStudent, setNumber } from './helpers'

/**
 * The full v2 student journey in one run:
 * mission -> explanation -> fictional reward -> wallet history -> investing mission ->
 * Portfolio Quest unlock -> transfer -> buy -> market event -> gain/loss + reflection ->
 * learning score and level checklist.
 */
test('learn to earn: mission, reward, wallet, portfolio, market event and learning status', async ({ page, request }) => {
  await loginAsNewStudent(page, request)

  // 1. A budgeting mission with sound choices.
  await page.goto('/app/play/budget-meera-pocket-money')
  await page.getByRole('button', { name: 'Start simulation' }).click()
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
  await page.locator('[role=radio]:not([disabled])').first().click()
  await page.getByRole('button', { name: 'Confirm my choice' }).click()
  await expect(page.getByText(/Attempt 1 complete/)).toBeVisible()

  // 2. A fictional learning reward is shown with its reasons.
  await expect(page.getByText('Reward earned').first()).toBeVisible()
  await expect(page.getByText(/fictional learning money/i).first()).toBeVisible()

  // 3. Explain what happened (multiple choice), then earn the small reflection reward.
  await expect(page.getByText('Explain what happened')).toBeVisible()
  await page.getByRole('radio', { name: /buffer|Needs like transport|fixed amount early/i }).first().click()
  await page.getByRole('button', { name: 'Check my explanation' }).click()
  await expect(page.getByText(/Yes, that explains it/)).toBeVisible()

  // 4. Wallet history lists the rewards with reasons.
  await page.goto('/app/wallet')
  await expect(page.getByRole('heading', { name: 'Learning Wallet' })).toBeVisible()
  await expect(page.getByTestId('wallet-balance')).not.toHaveText('0')
  await expect(page.getByRole('heading', { name: 'Practice Streak' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How coins are earned' })).toBeVisible()
  await expect(page.getByText(/Completed the mission with sound choices/)).toBeVisible()
  await expect(page.getByText(/Explained why your result happened/)).toBeVisible()

  // 5. Portfolio Quest is locked until an investing mission is done.
  await page.goto('/app/portfolio')
  await expect(page.getByText('Not unlocked yet')).toBeVisible()

  // 6. Finish an investing mission.
  await page.goto('/app/play/investing-time-horizon')
  await page.getByRole('button', { name: 'Start simulation' }).click()
  await page.getByRole('radio', { name: 'In 10 years' }).click()
  await page.getByLabel('Steady Deposit').fill('30')
  await page.getByLabel('Balanced Basket').fill('40')
  await page.getByLabel('Growth Basket').fill('30')
  await page.getByRole('button', { name: /invest and fast-forward/i }).click()
  await page.getByRole('radio', { name: 'Stay invested and wait' }).click()
  await page.getByRole('button', { name: 'Fast-forward to the end' }).click()
  await expect(page.getByText('The bigger picture: 1,000 possible futures')).toBeVisible()

  // 7. Portfolio Quest opens on the Market lab; the ten-year run is the second tab.
  await page.goto('/app/portfolio')
  await expect(page.getByRole('button', { name: 'Start market day' })).toBeVisible()
  await expect(page.getByText('Practice money only · Not financial advice')).toBeVisible()
  await page.getByRole('tab', { name: /ten-year run/i }).click()
  await page.getByRole('button', { name: 'Start Portfolio Quest' }).click()
  await expect(page.getByText('Practice cash')).toBeVisible()
  await expect(page.getByText('₹10,000.00').first()).toBeVisible()

  // 8. Explicit, confirmed, one-way transfer from the learning wallet.
  await page.getByLabel('Amount (whole rupees)').fill('20')
  await page.getByRole('button', { name: 'Move' }).click()
  await page.getByRole('button', { name: 'Yes, move it' }).click()
  await expect(page.getByText('₹10,020.00').first()).toBeVisible()

  // 9. Buy a fictional asset after a confirmation step.
  await page.getByRole('button', { name: 'Buy Balanced Basket' }).click()
  await expect(page.getByRole('button', { name: 'Confirm purchase' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm purchase' }).click()
  await expect(page.getByRole('heading', { name: 'Your holdings' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Balanced Basket/ })).toBeVisible()

  // 10. Let a year pass: a deterministic market event with a reflection on the result.
  await page.getByRole('button', { name: 'Advance one year' }).click()
  await page.getByRole('button', { name: 'Yes, next year' }).click()
  await expect(page.getByRole('status').getByText(/the fictional market moved/)).toBeVisible()
  await expect(page.getByText(/Your practice portfolio (rose|fell|stayed)/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Year 1 of 10' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Year 1: / })).toBeVisible()

  // 10b. Market lab: real company names, a reasoned practice buy, then a news-driven day.
  await page.getByRole('tab', { name: /market lab/i }).click()
  await page.getByRole('button', { name: 'Start Results day surprise' }).click()
  await expect(page.getByRole('heading', { name: 'Portfolio value' })).toBeVisible()
  await page.getByRole('button', { name: /^Infosys, .*Open details/ }).click()
  await page.getByRole('radio', { name: 'Reacting to the news' }).click()
  await page.getByRole('button', { name: 'Place practice buy' }).click()
  await expect(page.getByText(/Bought 1 Infosys\. It is in your decision journal\./)).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Start Day 2' }).click()
  await expect(page.getByText(/Breaking · Day 2/)).toBeVisible()
  await expect(page.getByText(/^Since you bought, Infosys moved/)).toBeVisible()

  // 11. The dashboard keeps learning, rewards and the practice portfolio apart.
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Learning', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rewards', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Practice portfolio' })).toBeVisible()
  await expect(page.getByText('Learning reward · fictional').first()).toBeVisible()
  await expect(page.getByText('Fictional portfolio').first()).toBeVisible()

  // 12. Learning score and levels are explained, and unlock only by understanding.
  await page.goto('/app/progress')
  await expect(page.getByText(/Learning score:/)).toBeVisible()
  await expect(page.getByText(/never unlocks? a level|never unlock a level/i)).toBeVisible()
})

// Answer keys are not in the repository. Without the private bundle the API serves labelled
// placeholder keys, so a test that depends on the real answers cannot run.
const realKeys = process.env.RUPEERISE_PRIVATE_CONTENT_DIR !== 'none' && existsSync('../backend/private_content/answer_keys.json')

test('banking explorer: sources are shown and a wrong answer can be retried', async ({ page, request }) => {
  test.skip(!realKeys, 'needs the private answer-key bundle')
  await loginAsNewStudent(page, request)
  await page.goto('/app/banking')
  await expect(page.getByText(/Sources last checked/)).toBeVisible()
  await expect(page.getByText(/never be asked for any real account/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /RBI: Opening of and operation in deposit accounts of minors/ })).toBeVisible()
  await page.getByRole('radio', { name: /Only adults can have bank accounts/ }).click()
  await page.getByRole('button', { name: 'Check my answer' }).click()
  await expect(page.getByText(/Not quite/)).toBeVisible()
  await page.getByRole('radio', { name: /through a guardian/ }).click()
  await page.getByRole('button', { name: 'Check my answer' }).click()
  await expect(page.getByText('Correct.')).toBeVisible()
})

test('money lab: a prepared plan reaches the goal and shows its assumptions', async ({ page, request }) => {
  await loginAsNewStudent(page, request)
  await page.goto('/app/play/money-lab-500')
  await page.getByRole('button', { name: 'Start simulation' }).click()
  await setNumber(page, /Keep ready amount/i, 150)
  await setNumber(page, /Steady deposit amount/i, 250)
  await page.getByRole('button', { name: 'Start the six months' }).click()
  await page.getByRole('radio', { name: /Use the money you kept ready/ }).click()
  await page.getByRole('button', { name: 'See where you end up' }).click()
  await expect(page.getByText(/Goal reached/)).toBeVisible()
  await expect(page.getByText('Assumptions and limits of this lab')).toBeVisible()
  await expect(page.getByText(/Inflation took/)).toBeVisible()
})
