import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface SupplyOrderInput {
  mrn: string;
  sku: string;
  quantity: number;
  urgency: 'ROUTINE' | 'STAT';
  paVerified?: boolean;
}

export class OrderInventoryPage extends BasePage {
  readonly inventoryMain: Locator;
  readonly inventoryStockTable: Locator;
  readonly orderPatientMrnInput: Locator;
  readonly orderSkuSelect: Locator;
  readonly orderQuantityInput: Locator;
  readonly orderUrgencySelect: Locator;
  readonly orderPaVerifiedCheckbox: Locator;
  readonly orderSubmitBtn: Locator;

  readonly orderIdBadge: Locator;
  readonly orderOrmAckBadge: Locator;
  readonly lowStockAlertBanner: Locator;
  readonly orderErrorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.inventoryMain = page.getByTestId('order-inventory-main');
    this.inventoryStockTable = page.getByTestId('inventory-stock-table');
    this.orderPatientMrnInput = page.getByTestId('order-patient-mrn');
    this.orderSkuSelect = page.getByTestId('order-sku-select');
    this.orderQuantityInput = page.getByTestId('order-quantity-input');
    this.orderUrgencySelect = page.getByTestId('order-urgency-select');
    this.orderPaVerifiedCheckbox = page.getByTestId('order-pa-verified-checkbox');
    this.orderSubmitBtn = page.getByTestId('order-submit-btn');

    this.orderIdBadge = page.getByTestId('order-id-badge');
    this.orderOrmAckBadge = page.getByTestId('order-orm-ack-badge');
    this.lowStockAlertBanner = page.getByTestId('low-stock-alert-banner');
    this.orderErrorAlert = page.getByTestId('order-error-alert');
  }

  private stockRow(sku: string): Locator {
    return this.page.getByTestId(`inventory-row-${sku}`);
  }

  private stockAvailableCell(sku: string): Locator {
    return this.page.getByTestId(`stock-available-${sku}`);
  }

  private stockStatusBadge(sku: string): Locator {
    return this.page.getByTestId(`stock-status-badge-${sku}`);
  }

  async openInventoryPortal(primarySku = 'MED-SUP-402'): Promise<void> {
    await this.gotoRoute('/portal/orders-inventory');
    await expect(this.inventoryMain).toBeVisible();
    await expect(this.stockRow(primarySku)).toBeVisible();
  }

  async expectStockLevel(
    sku: string,
    expectedQuantity: number,
    expectedStatus: 'IN_STOCK' | 'LOW_STOCK_REORDER'
  ): Promise<void> {
    await expect(this.stockAvailableCell(sku)).toHaveText(String(expectedQuantity));
    await expect(this.stockStatusBadge(sku)).toHaveText(expectedStatus);
  }

  async submitSupplyOrder(input: SupplyOrderInput): Promise<void> {
    await this.orderPatientMrnInput.fill(input.mrn);
    await this.orderSkuSelect.selectOption(input.sku);
    await this.orderQuantityInput.fill(String(input.quantity));
    await this.orderUrgencySelect.selectOption(input.urgency);

    if (input.paVerified ?? true) {
      await this.orderPaVerifiedCheckbox.check();
    } else {
      await this.orderPaVerifiedCheckbox.uncheck();
    }

    await this.orderSubmitBtn.click();
  }

  async expectOrderDispatchedWithOrmAck(): Promise<string> {
    await expect(this.orderIdBadge).toHaveText(/^ORD-2026-\d+$/);
    await expect(this.orderOrmAckBadge).toHaveText('HL7 ORM^O01 ACK: AA');
    return (await this.orderIdBadge.textContent())?.trim() ?? '';
  }

  async expectLowStockAutoReorderAlert(sku: string, remainingStock: number): Promise<void> {
    await expect(this.lowStockAlertBanner).toBeVisible();
    await expect(this.lowStockAlertBanner).toContainText(
      `Auto-EDI 850 Purchase Order queued for ${sku} (Remaining: ${remainingStock})`
    );
  }

  async expectInsufficientStockError(sku: string): Promise<void> {
    await expect(this.orderErrorAlert).toBeVisible();
    await expect(this.orderErrorAlert).toContainText(`Insufficient stock for ${sku}`);
  }

  async expectPriorAuthorizationBlocked(sku: string, expectedUnchangedStock: number): Promise<void> {
    await expect(this.orderErrorAlert).toBeVisible();
    await expect(this.orderErrorAlert).toContainText(
      'Prior Authorization (PA) verification is required before inventory deduction'
    );
    await this.expectStockLevel(sku, expectedUnchangedStock, 'IN_STOCK');
  }
}
