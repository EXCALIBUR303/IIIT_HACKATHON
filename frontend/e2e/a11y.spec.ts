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
