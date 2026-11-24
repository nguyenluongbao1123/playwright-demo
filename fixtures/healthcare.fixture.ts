import { test as base, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { PatientPortalPage } from '@pages/PatientPortalPage';
import { OrderInventoryPage } from '@pages/OrderInventoryPage';
import { SeedBaselineData } from './seed.spec';

interface HealthcareFixtures {
  patientPortalPage: PatientPortalPage;
  orderInventoryPage: OrderInventoryPage;
  seedData: SeedBaselineData;
}

const SEED_DATA_FILE = path.join(__dirname, '.auth', 'seed-baseline.json');

export const test = base.extend<HealthcareFixtures>({
  seedData: async ({}, use) => {
    const raw = fs.readFileSync(SEED_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as SeedBaselineData;
    await use(parsed);
  },

  patientPortalPage: async ({ page }, use) => {
    await use(new PatientPortalPage(page));
  },

  orderInventoryPage: async ({ page }, use) => {
    await use(new OrderInventoryPage(page));
  }
});

export { expect };
