// Created By AI - Pending Senior QA Architectural Review (Approved: @BaoNL)
import { test, expect } from '@fixtures/healthcare.fixture';

test.describe('Clinical Supply Order & Real-Time Inventory Reconciliation', () => {
  test.beforeEach(async ({ request, baseURL, seedData }) => {
    await request.post(`${baseURL}/v1/admin/seed`, {
      data: { ...seedData, scope: 'inventory' }
    });
  });

  test(
    'creates clinical supply order, emits HL7 ORM^O01 ACK, and deducts available stock atomically @smoke',
    async ({ orderInventoryPage, seedData }) => {
      const { sku, initialStock } = seedData.sampleInventoryItem;
      const orderQty = 5;

      await orderInventoryPage.openInventoryPortal(sku);
      await orderInventoryPage.verifyDomBaseline('orderInventory');
      await orderInventoryPage.expectStockLevel(sku, initialStock, 'IN_STOCK');

      await orderInventoryPage.submitSupplyOrder({
        mrn: seedData.samplePatient.mrn,
        sku,
        quantity: orderQty,
        urgency: 'ROUTINE'
      });

      const orderId = await orderInventoryPage.expectOrderDispatchedWithOrmAck();
      expect(orderId).toMatch(/^ORD-2026-\d+$/);

      await orderInventoryPage.expectStockLevel(sku, initialStock - orderQty, 'IN_STOCK');
      await orderInventoryPage.expectToastContains(`Order ${orderId} synced. Stock updated for ${sku}.`);
    }
  );

  test(
    'triggers LOW_STOCK_REORDER badge and automated EDI 850 purchase alert when stock crosses threshold',
    async ({ orderInventoryPage, seedData }) => {
      const { sku, initialStock } = seedData.criticalThresholdItem; // 18 initial, threshold 15
      const dispenseQty = 4;
      const expectedRemaining = initialStock - dispenseQty; // 14 <= 15

      await orderInventoryPage.openInventoryPortal(sku);
      await orderInventoryPage.expectStockLevel(sku, initialStock, 'IN_STOCK');

      await orderInventoryPage.submitSupplyOrder({
        mrn: seedData.samplePatient.mrn,
        sku,
        quantity: dispenseQty,
        urgency: 'STAT'
      });

      await orderInventoryPage.expectOrderDispatchedWithOrmAck();
      await orderInventoryPage.expectStockLevel(sku, expectedRemaining, 'LOW_STOCK_REORDER');
      await orderInventoryPage.expectLowStockAutoReorderAlert(sku, expectedRemaining);
    }
  );

  test(
    'rejects over-allocation order exceeding on-hand inventory and preserves stock integrity',
    async ({ orderInventoryPage, seedData }) => {
      const { sku, initialStock } = seedData.sampleInventoryItem;

      await orderInventoryPage.openInventoryPortal(sku);
      await orderInventoryPage.submitSupplyOrder({
        mrn: seedData.samplePatient.mrn,
        sku,
        quantity: initialStock + 50,
        urgency: 'STAT'
      });

      await orderInventoryPage.expectInsufficientStockError(sku);
      await orderInventoryPage.expectStockLevel(sku, initialStock, 'IN_STOCK');
    }
  );

  test(
    'blocks inventory deduction when Prior Authorization (PA / EDI 278) is unverified @edi',
    async ({ orderInventoryPage, seedData }) => {
      const { sku, initialStock } = seedData.sampleInventoryItem;

      await orderInventoryPage.openInventoryPortal(sku);
      await orderInventoryPage.submitSupplyOrder({
        mrn: seedData.samplePatient.mrn,
        sku,
        quantity: 15,
        urgency: 'ROUTINE',
        paVerified: false
      });

      await orderInventoryPage.expectPriorAuthorizationBlocked(sku, initialStock);
    }
  );
});
