import { Locator, Page, expect } from '@playwright/test';
import { assertDomMatchesBaseline } from '@utils/baseline-validator';

export abstract class BasePage {
  protected readonly page: Page;
  readonly topNavBanner: Locator;
  readonly clinicianSessionBadge: Locator;
  readonly toastBanner: Locator;
  readonly navAppointmentsLink: Locator;
  readonly navOrdersInventoryLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.topNavBanner = page.getByTestId('ehr-top-nav');
    this.clinicianSessionBadge = page.getByTestId('clinician-session-badge');
    this.toastBanner = page.getByTestId('clinical-toast-banner');
    this.navAppointmentsLink = page.getByTestId('nav-appointments');
    this.navOrdersInventoryLink = page.getByTestId('nav-orders-inventory');
  }

  async gotoRoute(routePath: string): Promise<void> {
    await this.page.goto(routePath);
    await expect(this.topNavBanner).toBeVisible();
  }

  async expectClinicianAuthenticated(staffId: string): Promise<void> {
    await expect(this.clinicianSessionBadge).toContainText(staffId);
  }

  async expectToastContains(expectedMessage: string): Promise<void> {
    await expect(this.toastBanner).toBeVisible();
    await expect(this.toastBanner).toContainText(expectedMessage);
  }

  async verifyDomBaseline(pageKey: 'patientPortal' | 'orderInventory'): Promise<void> {
    await assertDomMatchesBaseline(this.page, pageKey);
  }
}
