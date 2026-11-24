// Created By AI - Pending Senior QA Architectural Review (Approved: @BaoNL)
import { test, expect } from '@playwright/test';
import {
  buildHl7Message,
  buildEdi837Claim,
  parseHl7Segments
} from '@utils/hl7-edi-builder';

test.describe('Healthcare Interoperability API Contracts — HL7 v2.5.1 & ASC X12 EDI 837/835', () => {
  test(
    'accepts valid HL7 v2.5.1 ADT^A01 patient admission payload and returns MSA|AA acknowledgment @hl7 @smoke',
    async ({ request }) => {
      const controlId = 'MSG-ADT-2026001';
      const rawHl7 = buildHl7Message({
        messageControlId: controlId,
        triggerEvent: 'ADT^A01',
        sendingFacility: 'DN-HOSP-01',
        mrn: 'MRN-2026-8841',
        lastName: 'NGUYEN',
        firstName: 'AN',
        dobCompact: '19880514',
        gender: 'M',
        patientClass: 'I',
        assignedLocation: 'SURG^OR02^BED01'
      });

      const response = await request.post('hl7/ingest', {
        data: { rawHl7 }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        ackCode: 'AA',
        messageControlId: controlId,
        triggerEvent: 'ADT^A01',
        parsedPatientMrn: 'MRN-2026-8841'
      });

      const ackSegments = parseHl7Segments(body.rawAck);
      expect(ackSegments.MSA[0][1]).toBe('AA');
      expect(ackSegments.MSA[0][2]).toBe(controlId);
    }
  );

  test(
    'validates HL7 v2.5.1 ORM^O01 clinical supply order segments (ORC + OBR) @hl7',
    async ({ request }) => {
      const controlId = 'MSG-ORM-2026002';
      const rawHl7 = buildHl7Message({
        messageControlId: controlId,
        triggerEvent: 'ORM^O01',
        sendingFacility: 'DN-HOSP-01',
        mrn: 'MRN-2026-8841',
        lastName: 'NGUYEN',
        firstName: 'AN',
        dobCompact: '19880514',
        gender: 'M',
        orderNumber: 'ORD-2026-7710',
        orderSku: 'MED-SUP-402'
      });

      const response = await request.post('hl7/ingest', {
        data: { rawHl7 }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.ackCode).toBe('AA');
      expect(body.triggerEvent).toBe('ORM^O01');
    }
  );

  test(
    'accepts valid HL7 v2.5.1 SIU^S12 appointment scheduling notification with SCH segment @hl7',
    async ({ request }) => {
      const controlId = 'MSG-SIU-2026003';
      const rawHl7 = buildHl7Message({
        messageControlId: controlId,
        triggerEvent: 'SIU^S12',
        sendingFacility: 'DN-HOSP-01',
        mrn: 'MRN-2026-8841',
        lastName: 'NGUYEN',
        firstName: 'AN',
        dobCompact: '19880514',
        gender: 'M',
        appointmentId: 'APT-2026-1088'
      });

      const response = await request.post('hl7/ingest', {
        data: { rawHl7 }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        ackCode: 'AA',
        messageControlId: controlId,
        triggerEvent: 'SIU^S12'
      });
    }
  );

  test(
    'enforces HIPAA Safe-Harbor guardrail by rejecting unmasked SSN in PID-19 with MSA|AE @hl7',
    async ({ request }) => {
      const rawHl7 = buildHl7Message({
        messageControlId: 'MSG-PHI-VIOLATION-01',
        triggerEvent: 'ADT^A01',
        sendingFacility: 'DN-HOSP-01',
        mrn: 'MRN-2026-8841',
        lastName: 'NGUYEN',
        firstName: 'AN',
        dobCompact: '19880514',
        gender: 'M',
        unmaskedSsnForNegativeTest: '123-45-6789'
      });

      const response = await request.post('hl7/ingest', {
        data: { rawHl7 }
      });

      expect(response.status()).toBe(422);
      const body = await response.json();
      expect(body.ackCode).toBe('AE');
      expect(body.errorCode).toBe('HIPAA_PHI_UNMASKED_SSN_REJECTED');
    }
  );

  test(
    'rejects malformed HL7 message missing mandatory PID segment with MSA|AR @hl7',
    async ({ request }) => {
      const malformedHl7 =
        'MSH|^~\\&|EHR_PORTAL|DN-HOSP-01|HIS_CORE|NATIONAL_HIE|20261124103000||ADT^A01|MSG-NO-PID|P|2.5.1\rPV1|1|O|OPD^RM101';

      const response = await request.post('hl7/ingest', {
        data: { rawHl7: malformedHl7 }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.ackCode).toBe('AR');
      expect(body.errorCode).toBe('MISSING_REQUIRED_PID_SEGMENT');
    }
  );

  test(
    'adjudicates balanced X12 EDI 837P healthcare claim into 999 (IK5*A) & 835 Remittance Advice @edi @smoke',
    async ({ request }) => {
      const rawX12 = buildEdi837Claim({
        controlNumber: '000000905',
        claimId: 'CLM20268841A',
        patientMrn: 'MRN-2026-8841',
        patientLastName: 'Nguyen',
        patientFirstName: 'An',
        payerId: 'EDI-837-VN01',
        icd10Code: 'K35.80',
        serviceLines: [
          { cptCode: '99214', chargeAmount: 150.0, units: 1 },
          { cptCode: '36415', chargeAmount: 50.0, units: 2 }
        ] // Total = $250.00
      });

      const response = await request.post('edi/837-claim', {
        data: { rawX12 }
      });

      expect(response.status()).toBe(201);
      const body = await response.json();

      expect(body).toMatchObject({
        claimId: 'CLM20268841A',
        functionalAck999: 'IK5*A',
        claimStatusCode: '1',
        allowedAmount: 250,
        payerPaidAmount: 200,
        patientResponsibility: 50
      });
      expect(body.rawEdi835).toContain('ST*835*0001~');
      expect(body.rawEdi835).toContain('CLP*CLM20268841A*1*250.00*200.00*50.00*');
    }
  );

  test(
    'rejects unbalanced X12 EDI 837P claim when CLM02 total disagrees with SV1 service lines @edi',
    async ({ request }) => {
      const imbalancedX12 = buildEdi837Claim({
        controlNumber: '000000906',
        claimId: 'CLM2026ERR09',
        patientMrn: 'MRN-2026-8841',
        patientLastName: 'Nguyen',
        patientFirstName: 'An',
        payerId: 'EDI-837-VN01',
        icd10Code: 'J18.9',
        serviceLines: [{ cptCode: '99213', chargeAmount: 120.0, units: 1 }],
        overrideTotalChargeForNegativeTest: 450.0 // Intentional CLM02 != SV1 sum
      });

      const response = await request.post('edi/837-claim', {
        data: { rawX12: imbalancedX12 }
      });

      expect(response.status()).toBe(422);
      const body = await response.json();
      expect(body.functionalAck999).toBe('IK5*R*5');
      expect(body.errorCode).toBe('EDI_837_CLM_SV1_CHARGE_IMBALANCE');
      expect(body.declaredCharge).toBe(450);
      expect(body.computedLineSum).toBe(120);
    }
  );

  test(
    'catches silent X12 EDI 837P NM109 subscriber ID truncation before downstream payer rejection @edi @smoke',
    async ({ request }) => {
      const truncatedNm109X12 = buildEdi837Claim({
        controlNumber: '000000907',
        claimId: 'CLM2026TRUNC1',
        patientMrn: 'MRN-2026-8841',
        subscriberId: 'SUB-99', // Truncated below 8-character payer contract minimum
        patientLastName: 'Nguyen',
        patientFirstName: 'An',
        payerId: 'EDI-837-VN01',
        icd10Code: 'K35.80',
        serviceLines: [{ cptCode: '99214', chargeAmount: 150.0, units: 1 }]
      });

      const response = await request.post('edi/837-claim', {
        data: { rawX12: truncatedNm109X12 }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toMatchObject({
        claimId: 'CLM2026TRUNC1',
        status: 'REJECTED_999',
        functionalAck999: 'IK5*R*I6',
        defectCode: 'EDI_SEGMENT_TRUNCATION',
        errorCode: 'EDI_NM109_SUBSCRIBER_ID_TRUNCATED'
      });
    }
  );
});
