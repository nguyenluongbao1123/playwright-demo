// Created By AI - Pending Senior QA Architectural Review (Approved: @BaoNL)
import { test, expect } from '@playwright/test';
import {
  buildEdi850PurchaseOrder,
  buildEdi856AdvanceShipNotice,
  buildEdi810Invoice
} from '@utils/hl7-edi-builder';

test.describe('Healthcare Supply Chain Procure-to-Pay EDI — 850 / 855 / 856 / 810 (3-Way Match)', () => {
  test(
    'completes full EDI 850 PO -> 855 Ack -> 856 ASN -> 810 Invoice 3-Way Match lifecycle @edi @smoke',
    async ({ request }) => {
      const poNumber = 'PO-2026-40201';
      const sku = 'MED-SUP-402';
      const orderedQty = 50;
      const unitPrice = 24.5; // Total = $1,225.00 (TDS*122500)

      // Step 1: Hospital sends X12 850 Purchase Order -> Vendor returns X12 855 Acknowledgment (BAK*00*AC / ACK*IA)
      const raw850 = buildEdi850PurchaseOrder({
        controlNumber: '000085001',
        poNumber,
        lines: [{ lineNumber: 1, sku, quantity: orderedQty, unitPrice }]
      });

      const poRes = await request.post('edi/850-po', { data: { rawX12: raw850 } });
      expect(poRes.status()).toBe(201);
      const poBody = await poRes.json();

      expect(poBody).toMatchObject({
        poNumber,
        functionalAck999: 'IK5*A',
        ack855Type: 'AC',
        poStatus: 'ACKNOWLEDGED_AC',
        lineCount: 1,
        totalPoAmount: 1225
      });
      expect(poBody.rawEdi855).toContain(`BAK*00*AC*${poNumber}*`);
      expect(poBody.rawEdi855).toContain(`ACK*IA*50*EA*`);

      // Step 2: Vendor dispatches X12 856 Advance Ship Notice (HL S>O>P>I, GS1 SSCC-18 & Sterile Lot Expiry)
      const raw856 = buildEdi856AdvanceShipNotice({
        controlNumber: '000085601',
        shipmentId: 'SHP-2026-9001',
        poNumber,
        sscc18Barcode: '001088456700001234',
        sku,
        lotNumber: 'LOT-2026-B99',
        shippedQuantity: orderedQty,
        expirationDate: '20281231'
      });

      const asnRes = await request.post('edi/856-asn', { data: { rawX12: raw856 } });
      expect(asnRes.status()).toBe(201);
      const asnBody = await asnRes.json();

      expect(asnBody).toMatchObject({
        shipmentId: 'SHP-2026-9001',
        poNumber,
        functionalAck999: 'IK5*A',
        asnStatus: 'ASN_VERIFIED_RECEIVED',
        sscc18: '001088456700001234',
        shippedQty: 50
      });

      // Step 3: Vendor submits X12 810 Invoice -> Hospital ERP executes 3-Way Match (850 PO == 856 ASN == 810 Invoice)
      const raw810 = buildEdi810Invoice({
        controlNumber: '000081001',
        invoiceNumber: 'INV-2026-8801',
        poNumber,
        lines: [{ lineNumber: 1, sku, invoicedQuantity: orderedQty, unitPrice }]
      });

      const invRes = await request.post('edi/810-invoice', { data: { rawX12: raw810 } });
      expect(invRes.status()).toBe(200);
      const invBody = await invRes.json();

      expect(invBody).toMatchObject({
        invoiceNumber: 'INV-2026-8801',
        poNumber,
        functionalAck999: 'IK5*A',
        matchStatus: 'THREE_WAY_MATCH_APPROVED',
        matchedShippedQty: 50,
        approvedPayableAmount: 1225
      });
    }
  );

  test(
    'flags EDI 855 Purchase Order Acknowledgment with BAK*00*AT and ACK*IB when quantity exceeds single-shipment cap @edi',
    async ({ request }) => {
      const poNumber = 'PO-2026-BACKORD1';
      const raw850 = buildEdi850PurchaseOrder({
        controlNumber: '000085002',
        poNumber,
        lines: [{ lineNumber: 1, sku: 'MED-SUP-402', quantity: 650, unitPrice: 24.5 }] // > 500 cap
      });

      const response = await request.post('edi/850-po', { data: { rawX12: raw850 } });
      expect(response.status()).toBe(201);
      const body = await response.json();

      expect(body.ack855Type).toBe('AT');
      expect(body.poStatus).toBe('BACKORDERED_AT');
      expect(body.rawEdi855).toContain(`BAK*00*AT*${poNumber}*`);
      expect(body.rawEdi855).toContain('ACK*IB*650*EA*');
    }
  );

  test(
    'rejects EDI 856 ASN with malformed GS1 SSCC-18 pallet barcode in MAN*GM segment @edi',
    async ({ request }) => {
      const poNumber = 'PO-2026-ASNERR1';
      await request.post('edi/850-po', {
        data: {
          rawX12: buildEdi850PurchaseOrder({
            controlNumber: '000085003',
            poNumber,
            lines: [{ lineNumber: 1, sku: 'MED-SUP-402', quantity: 20, unitPrice: 24.5 }]
          })
        }
      });

      const invalidSscc856 = buildEdi856AdvanceShipNotice({
        controlNumber: '000085603',
        shipmentId: 'SHP-2026-BADSSCC',
        poNumber,
        sscc18Barcode: '1234567890', // Truncated 10-digit barcode instead of 18-digit SSCC-18
        sku: 'MED-SUP-402',
        lotNumber: 'LOT-2026-B99',
        shippedQuantity: 20,
        expirationDate: '20281231'
      });

      const asnRes = await request.post('edi/856-asn', { data: { rawX12: invalidSscc856 } });
      expect(asnRes.status()).toBe(422);
      const body = await asnRes.json();
      expect(body.errorCode).toBe('EDI_856_INVALID_HL_OR_SSCC18');
      expect(body.functionalAck999).toBe('IK5*R*I6');
    }
  );

  test(
    'enforces FDA shelf-life guardrail by rejecting EDI 856 ASN carrying expired sterile medical lot (DTM*036) @edi',
    async ({ request }) => {
      const poNumber = 'PO-2026-EXP01';
      await request.post('edi/850-po', {
        data: {
          rawX12: buildEdi850PurchaseOrder({
            controlNumber: '000085004',
            poNumber,
            lines: [{ lineNumber: 1, sku: 'MED-SUP-109', quantity: 30, unitPrice: 42.0 }]
          })
        }
      });

      const expiredLot856 = buildEdi856AdvanceShipNotice({
        controlNumber: '000085604',
        shipmentId: 'SHP-2026-EXPLOT',
        poNumber,
        sscc18Barcode: '001088456700005555',
        sku: 'MED-SUP-109',
        lotNumber: 'LOT-2024-EXP',
        shippedQuantity: 30,
        expirationDate: '20250630' // Expired lot
      });

      const asnRes = await request.post('edi/856-asn', { data: { rawX12: expiredLot856 } });
      expect(asnRes.status()).toBe(422);
      const body = await asnRes.json();
      expect(body.errorCode).toBe('FDA_LOT_EXPIRED_REJECTED');
    }
  );

  test(
    'places EDI 810 Invoice on 3-Way Match hold when IT104 unit price exceeds contracted EDI 850 PO104 price @edi',
    async ({ request }) => {
      const poNumber = 'PO-2026-PRICEVAR';
      const sku = 'MED-SUP-402';

      await request.post('edi/850-po', {
        data: {
          rawX12: buildEdi850PurchaseOrder({
            controlNumber: '000085005',
            poNumber,
            lines: [{ lineNumber: 1, sku, quantity: 40, unitPrice: 24.5 }]
          })
        }
      });

      await request.post('edi/856-asn', {
        data: {
          rawX12: buildEdi856AdvanceShipNotice({
            controlNumber: '000085605',
            shipmentId: 'SHP-2026-9005',
            poNumber,
            sscc18Barcode: '001088456700006666',
            sku,
            lotNumber: 'LOT-2026-PV1',
            shippedQuantity: 40,
            expirationDate: '20281231'
          })
        }
      });

      const inflatedPrice810 = buildEdi810Invoice({
        controlNumber: '000081005',
        invoiceNumber: 'INV-2026-PVAR1',
        poNumber,
        lines: [{ lineNumber: 1, sku, invoicedQuantity: 40, unitPrice: 29.0 }] // Billed $29.00 vs $24.50 PO
      });

      const invRes = await request.post('edi/810-invoice', { data: { rawX12: inflatedPrice810 } });
      expect(invRes.status()).toBe(422);
      const body = await invRes.json();
      expect(body).toMatchObject({
        matchStatus: 'HELD_PRICE_VARIANCE',
        errorCode: 'EDI_810_3WAY_MATCH_PRICE_VARIANCE',
        contractedUnitPrice: 24.5,
        invoicedUnitPrice: 29
      });
    }
  );

  test(
    'places EDI 810 Invoice on 3-Way Match hold when invoiced quantity exceeds partial EDI 856 ASN shipment @edi @smoke',
    async ({ request }) => {
      const poNumber = 'PO-2026-QTYVAR';
      const sku = 'MED-SUP-109';

      // Ordered 50 units on 850 PO
      await request.post('edi/850-po', {
        data: {
          rawX12: buildEdi850PurchaseOrder({
            controlNumber: '000085006',
            poNumber,
            lines: [{ lineNumber: 1, sku, quantity: 50, unitPrice: 42.0 }]
          })
        }
      });

      // Vendor partially shipped only 30 units on 856 ASN
      await request.post('edi/856-asn', {
        data: {
          rawX12: buildEdi856AdvanceShipNotice({
            controlNumber: '000085606',
            shipmentId: 'SHP-2026-9006',
            poNumber,
            sscc18Barcode: '001088456700007777',
            sku,
            lotNumber: 'LOT-2026-QV1',
            shippedQuantity: 30,
            expirationDate: '20281231'
          })
        }
      });

      // Vendor attempts to bill all 50 ordered units instead of 30 shipped units
      const overBilled810 = buildEdi810Invoice({
        controlNumber: '000081006',
        invoiceNumber: 'INV-2026-QVAR1',
        poNumber,
        lines: [{ lineNumber: 1, sku, invoicedQuantity: 50, unitPrice: 42.0 }]
      });

      const invRes = await request.post('edi/810-invoice', { data: { rawX12: overBilled810 } });
      expect(invRes.status()).toBe(422);
      const body = await invRes.json();
      expect(body).toMatchObject({
        matchStatus: 'HELD_QTY_VARIANCE',
        errorCode: 'EDI_810_3WAY_MATCH_QTY_VARIANCE',
        shippedAsnQty: 30,
        invoicedQty: 50
      });
    }
  );
});
