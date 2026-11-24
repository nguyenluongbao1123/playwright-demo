import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface SeedBaselineData {
  environment: string;
  facilityId: string;
  clinician: {
    staffId: string;
    role: string;
    department: string;
  };
  samplePatient: {
    mrn: string;
    fullName: string;
    dob: string;
    gender: 'M' | 'F' | 'O';
    insurancePayerId: string;
  };
  sampleInventoryItem: {
    sku: string;
    itemName: string;
    lotNumber: string;
    initialStock: number;
    reorderThreshold: number;
  };
  criticalThresholdItem: {
    sku: string;
    itemName: string;
    lotNumber: string;
    initialStock: number;
    reorderThreshold: number;
  };
  generatedAt: string;
}

const AUTH_DIR = path.join(__dirname, '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'clinician-state.json');
const SEED_DATA_FILE = path.join(AUTH_DIR, 'seed-baseline.json');

setup('initialize healthcare test environment & baseline seed data', async ({ page, request, baseURL }) => {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // HIPAA Safe-Harbor de-identified synthetic seed baseline for Planner Agent & E2E suites
  const baselineSeed: SeedBaselineData = {
    environment: process.env.TEST_ENV || 'staging-local',
    facilityId: process.env.FACILITY_CODE || 'DN-HOSP-01',
    clinician: {
      staffId: 'CLN-5082',
      role: 'Senior Charge Nurse',
      department: 'Outpatient Surgical & Diagnostics'
    },
    samplePatient: {
      mrn: 'MRN-2026-8841',
      fullName: 'Nguyen Van An',
      dob: '1988-05-14',
      gender: 'M',
      insurancePayerId: 'EDI-837-VN01'
    },
    sampleInventoryItem: {
      sku: 'MED-SUP-402',
      itemName: 'Sterile Surgical Kit Type-B',
      lotNumber: 'LOT-2026-B91',
      initialStock: 120,
      reorderThreshold: 25
    },
    criticalThresholdItem: {
      sku: 'MED-SUP-109',
      itemName: 'HL7 Smart Infusion Catheter Set',
      lotNumber: 'LOT-2026-C14',
      initialStock: 18,
      reorderThreshold: 15
    },
    generatedAt: new Date().toISOString()
  };

  // Reset deterministic state on the Healthcare Mock Gateway when running locally/CI
  if (baseURL) {
    const resetResponse = await request.post(`${baseURL}/v1/admin/seed`, {
      data: baselineSeed
    });
    expect(resetResponse.ok()).toBeTruthy();
  }

  fs.writeFileSync(SEED_DATA_FILE, JSON.stringify(baselineSeed, null, 2), 'utf-8');

  // Establish authenticated clinician browser state (cookies + localStorage session)
  await page.goto('/portal/login');
  await page.getByTestId('login-staff-id').fill(baselineSeed.clinician.staffId);
  await page.getByTestId('login-passcode').fill(process.env.CLINICIAN_PASSCODE || 'HC-QA-2026!');
  await page.getByTestId('login-submit-btn').click();

  await expect(page.getByTestId('clinician-session-badge')).toContainText(baselineSeed.clinician.staffId);
  await page.context().storageState({ path: AUTH_FILE });

  expect(fs.existsSync(SEED_DATA_FILE)).toBeTruthy();
  expect(fs.existsSync(AUTH_FILE)).toBeTruthy();
});
