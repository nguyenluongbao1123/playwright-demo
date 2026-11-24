import { test, expect } from '@fixtures/healthcare.fixture';

test.describe('Healthcare Patient Intake & Outpatient Encounter Workflow', () => {
  test.beforeEach(async ({ request, baseURL, seedData }) => {
    await request.post(`${baseURL}/v1/admin/seed`, {
      data: { ...seedData, scope: 'appointments' }
    });
  });

  test(
    'verifies EDI-271 eligibility and schedules outpatient surgical encounter with HL7 ADT^A04 ACK @smoke',
    async ({ patientPortalPage, seedData }) => {
      await patientPortalPage.openPortal();
      await patientPortalPage.verifyDomBaseline('patientPortal');
      await patientPortalPage.expectClinicianAuthenticated(seedData.clinician.staffId);

      await patientPortalPage.lookupPatientByMrn(seedData.samplePatient.mrn);
      await patientPortalPage.expectPatientEligibilityVerified({
        fullName: seedData.samplePatient.fullName,
        mrn: seedData.samplePatient.mrn,
        payerId: seedData.samplePatient.insurancePayerId
      });

      await patientPortalPage.scheduleEncounter({
        department: 'SURGERY',
        date: '2026-12-10',
        slot: '10:30',
        priority: 'URGENT',
        notes: 'Pre-operative sterile kit MED-SUP-402 reservation verified'
      });

      const encounterId = await patientPortalPage.expectEncounterConfirmedWithHl7Ack();
      await patientPortalPage.expectToastContains(
        `Encounter ${encounterId} scheduled (HL7 SIU^S12 Dispatched & HL7 ADT^A04 acknowledged).`
      );
    }
  );

  test(
    'blocks intake lookup for unregistered MRN without leaking PHI',
    async ({ patientPortalPage }) => {
      await patientPortalPage.openPortal();
      await patientPortalPage.lookupPatientByMrn('MRN-9999-0000');
      await patientPortalPage.expectPatientNotFoundError();
    }
  );
});
