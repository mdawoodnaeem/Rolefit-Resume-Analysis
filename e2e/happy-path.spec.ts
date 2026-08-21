import { expect, test } from '@playwright/test'

/**
 * End-to-end happy path.
 *
 * Runs against the seeded demo account with ROLEFIT_FORCE_DEMO_MODE=true, so
 * it needs no Anthropic key and costs nothing per run. Start the database
 * first (`npm run db:start`, then `npm run db:migrate && npm run db:seed`) —
 * these assertions check real rows, not fixtures baked into the test.
 *
 * Assertions are on figures the database actually holds. A test that only
 * checks "a number is present" passes just as happily when the number is
 * wrong, which is exactly the bug this suite is meant to catch.
 */

const DEMO_EMAIL = 'demo@rolefit.app'
const DEMO_PASSWORD = 'demo1234'

test.describe('marketing', () => {
  test('landing page states the anti-fabrication promise', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'without inventing a career',
    )
    await expect(page.getByText('Will not invent experience')).toBeVisible()

    // The score gauge is the visual hero; it must expose its value to
    // assistive tech rather than being a decorative arc.
    await expect(page.getByRole('img', { name: /Match score \d+ out of 100/ })).toBeVisible()
  })

  test('has no horizontal overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('/')

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflows).toBe(false)
  })
})

test.describe('authentication', () => {
  test('protects the dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('rejects a wrong password without revealing which half failed', async ({ page }) => {
    await page.goto('/sign-in')

    await page.getByLabel('Email').fill(DEMO_EMAIL)
    await page.getByLabel('Password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(DEMO_EMAIL)
    await page.getByLabel('Password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('shows the seeded aggregates, not placeholder zeroes', async ({ page }) => {
    // The count-up animation must never be the only thing that produces a
    // correct number — these should read true even before it runs.
    await expect(page.getByText('11 submitted · 5 answered · scores 38–88')).toBeVisible()

    const applications = page.locator('div', { hasText: /^Applications$/ }).first()
    await expect(applications).toBeVisible()

    // Score bands, each with a written label so colour is never the sole cue.
    await expect(page.getByText('Weak')).toBeVisible()
    await expect(page.getByText('Partial')).toBeVisible()
    await expect(page.getByText('Strong')).toBeVisible()
  })

  test('names the chart window so its total is not mistaken for a bug', async ({ page }) => {
    await expect(page.getByText('Applications — last 8 weeks')).toBeVisible()
  })

  test('exposes the weekly chart as a table for assistive tech', async ({ page }) => {
    const table = page.locator('figure table')
    await expect(table.locator('tbody tr')).toHaveCount(8)
  })

  test('shows remaining quota rather than consumed', async ({ page }) => {
    await expect(page.getByText(/\d+ analys(is|es) left/)).toBeVisible()
  })

  test('lists real seeded applications', async ({ page }) => {
    await expect(page.getByText('Ashgrove Bank', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Recent applications' })).toBeVisible()
  })
})
