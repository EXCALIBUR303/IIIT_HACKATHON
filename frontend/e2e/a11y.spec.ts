import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { loginAsNewStudent } from './helpers'

const PAGES = ['/', '/journey-demo', '/login', '/app', '/app/learn', '/app/wallet', '/app/portfolio', '/app/banking', '/app/progress', '/app/explore', '/app/settings', '/app/assessments', '/app/play/money-lab-500']

for (const path of PAGES) {
  test(`axe: no serious or critical violations on ${path}`, async ({ page, request }) => {
    // Scan the settled page: entrance animations fade text in, and axe would otherwise
    // measure contrast mid-fade. Reduced motion is also a mode real users choose.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    if (path.startsWith('/app')) await loginAsNewStudent(page, request)
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

test('axe: no serious or critical violations on the Market lab with a live scenario', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { headers } = await loginAsNewStudent(page, request)
  const api = 'http://localhost:8001/api/v1'
  // Unlock Portfolio Quest the real way (one investing mission), then open a scenario with a holding.
  const s = await (await request.post(`${api}/simulations/sessions`, { headers, data: { scenario_slug: 'investing-time-horizon' } })).json()
  await request.post(`${api}/simulations/sessions/${s.id}/decisions`, {
    headers,
    data: { type: 'allocate', payload: { allocation: { steady_deposit: 30, balanced_basket: 40, growth_basket: 30 }, horizon_years: 10 } },
  })
  await request.post(`${api}/simulations/sessions/${s.id}/decisions`, { headers, data: { type: 'respond_event', payload: { action: 'hold' } } })
  const rid = () => `${Date.now()}${Math.random().toString(16).slice(2)}`.slice(0, 32)
  expect((await request.post(`${api}/portfolio/scenario/start`, { headers, data: { request_id: rid(), scenario_key: 'rbi_policy' } })).ok()).toBeTruthy()
  await request.post(`${api}/portfolio/scenario/decisions`, { headers, data: { request_id: rid(), action: 'buy', company_key: 'hdfcbank', quantity: 5, reason: 'news', confirm: true } })
  await request.post(`${api}/portfolio/scenario/advance`, { headers, data: { request_id: rid() } })
  await page.goto('/app/portfolio')
  await expect(page.getByRole('heading', { name: 'Portfolio value' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})
