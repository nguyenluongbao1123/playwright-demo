import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const MOCK_PORT = process.env.MOCK_PORT || '4173';
const USE_EXTERNAL_ENV = process.env.USE_EXTERNAL_ENV === 'true';

const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${MOCK_PORT}`;
const rawApiBaseUrl = process.env.API_BASE_URL || `${BASE_URL}/v1/`;
const API_BASE_URL = rawApiBaseUrl.endsWith('/') ? rawApiBaseUrl : `${rawApiBaseUrl}/`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Deterministic inventory state progression across clinical workflows
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit-results.xml' }]
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  },

  // Auto-boot embedded EHR Portal & HL7/EDI API Gateway unless pointing to external staging
  webServer: USE_EXTERNAL_ENV
    ? undefined
    : {
        command: 'npm run mock:server',
        url: `${BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
      },

  projects: [
    // 1. Seed & Clinician Authentication Setup (Runs before E2E workflows)
    {
      name: 'seed-setup',
      testDir: './fixtures',
      testMatch: /seed\.spec\.ts/
    },

    // 2. Healthcare E2E UI Tests on Chromium (Consumes clinician storageState & seed baseline)
    {
      name: 'chromium-e2e',
      testDir: './tests/e2e',
      dependencies: ['seed-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'fixtures/.auth/clinician-state.json'
      }
    },

    // 3. HL7 v2 & X12 EDI 837/835 Contract API Tests (Headless HTTP RequestContext)
    {
      name: 'healthcare-api',
      testDir: './tests/api',
      dependencies: ['seed-setup'],
      use: {
        baseURL: API_BASE_URL,
        extraHTTPHeaders: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Facility-Code': process.env.FACILITY_CODE || 'DN-HOSP-01',
          'Authorization': `Bearer ${process.env.API_TOKEN || 'clinician-jwt-seed-token-2026'}`
        }
      }
    }
  ]
});
