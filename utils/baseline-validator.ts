import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

interface ElementRule {
  testId: string;
  tag?: string;
  role?: string;
  required: boolean;
}

interface PageBaselineSchema {
  route: string;
  landmarkTestId: string;
  elements: ElementRule[];
}

interface DomBaselineDocument {
  version: string;
  application: string;
  pages: Record<string, PageBaselineSchema>;
}

const BASELINE_PATH = path.resolve(__dirname, '..', 'baselines', 'dom-structure.yaml');

/**
 * Agentic AI Guardrail: Validates live DOM structure against `baselines/dom-structure.yaml`
 * to detect silent locator drift or unauthorized UI mutations before E2E assertions run.
 */
export async function assertDomMatchesBaseline(
  page: Page,
  pageKey: 'patientPortal' | 'orderInventory'
): Promise<void> {
  const rawYaml = fs.readFileSync(BASELINE_PATH, 'utf-8');
  const baseline = parse(rawYaml) as DomBaselineDocument;
  const pageSpec = baseline.pages[pageKey];

  if (!pageSpec) {
    throw new Error(`Missing baseline definition for page key "${pageKey}" in dom-structure.yaml`);
  }

  await expect(
    page.getByTestId(pageSpec.landmarkTestId),
    `Baseline root landmark [data-testid="${pageSpec.landmarkTestId}"] drifted on ${pageKey}`
  ).toBeVisible();

  for (const rule of pageSpec.elements) {
    if (!rule.required) {
      continue;
    }
    const locator = page.getByTestId(rule.testId);
    await expect(
      locator,
      `DOM Baseline Drift Detected: Required element [data-testid="${rule.testId}"] is missing on ${pageKey}`
    ).toBeAttached();
  }
}
