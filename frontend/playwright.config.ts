import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run the real stack: FastAPI on :8001 against a dedicated
 * PostgreSQL database (default rupeerise_e2e) and the Vite dev server on :5174 (override with E2E_WEB_PORT).
 * Override the database with E2E_DATABASE_URL.
 */
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://localhost:5432/rupeerise_e2e'

const webPort = process.env.E2E_WEB_PORT ?? '5174'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'uv run alembic upgrade head && uv run python -m app.seed && uv run uvicorn app.main:app --port 8001',
      cwd: '../backend',
      url: 'http://localhost:8001/api/health',
      env: {
        RUPEERISE_DATABASE_URL: databaseUrl,
        RUPEERISE_BCRYPT_ROUNDS: '4',
        // The browser talks to the Vite origin; CSRF checks compare it to this list.
        RUPEERISE_CORS_ORIGINS: JSON.stringify([`http://localhost:${webPort}`]),
        // One machine registers dozens of throwaway accounts, so the per-IP limits are off here.
        // The limits themselves are covered by the backend test suite.
        RUPEERISE_RATE_LIMIT_ENABLED: 'false',
        RUPEERISE_ANTHROPIC_API_KEY: '',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      env: { VITE_DEV_API_PROXY: 'http://localhost:8001' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
