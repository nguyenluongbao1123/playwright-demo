import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface ScheduleEncounterInput {
  department: 'SURGERY' | 'CARDIOLOGY' | 'RADIOLOGY';
  date: string;
  slot: '09:00' | '10:30' | '14:00';
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  notes: string;
}

export class PatientPortalPage extends BasePage {
  readonly portalMain: Locator;
  readonly mrnInput: Locator;
  readonly lookupBtn: Locator;
  readonly lookupErrorAlert: Locator;
  readonly patientSummaryCard: Locator;
  readonly patientFullName: Locator;
  readonly patientMrnDisplay: Locator;
  readonly patientPayerId: Locator;
  readonly ediEligibilityBadge: Locator;

  readonly departmentSelect: Locator;
  readonly appointmentDateInput: Locator;
  readonly slotSelect: Locator;
  readonly prioritySelect: Locator;
  readonly clinicalNotesInput: Locator;
  readonly submitAppointmentBtn: Locator;

  readonly confirmationCode: Locator;
  readonly hl7AckStatus: Locator;
  readonly hl7SiuAckStatus: Locator;
  readonly appointmentsLedgerTable: Locator;

  constructor(page: Page) {
    super(page);
    this.portalMain = page.getByTestId('patient-portal-main');
    this.mrnInput = page.getByTestId('patient-mrn-input');
    this.lookupBtn = page.getByTestId('patient-lookup-btn');
    this.lookupErrorAlert = page.getByTestId('patient-lookup-error');
    this.patientSummaryCard = page.getByTestId('patient-summary-card');
    this.patientFullName = page.getByTestId('patient-full-name');
    this.patientMrnDisplay = page.getByTestId('patient-mrn-display');
    this.patientPayerId = page.getByTestId('patient-payer-id');
    this.ediEligibilityBadge = page.getByTestId('edi-eligibility-badge');

    this.departmentSelect = page.getByTestId('appointment-department-select');
    this.appointmentDateInput = page.getByTestId('appointment-date-input');
    this.slotSelect = page.getByTestId('appointment-slot-select');
    this.prioritySelect = page.getByTestId('appointment-priority-select');
    this.clinicalNotesInput = page.getByTestId('appointment-clinical-notes');
    this.submitAppointmentBtn = page.getByTestId('appointment-submit-btn');

    this.confirmationCode = page.getByTestId('appointment-confirmation-code');
    this.hl7AckStatus = page.getByTestId('hl7-ack-status');
    this.hl7SiuAckStatus = page.getByTestId('hl7-siu-ack-status');
    this.appointmentsLedgerTable = page.getByTestId('appointments-ledger-table');
  }

  async openPortal(): Promise<void> {
    await this.gotoRoute('/portal/appointments');
    await expect(this.portalMain).toBeVisible();
  }

  async lookupPatientByMrn(mrn: string): Promise<void> {
    await this.mrnInput.fill(mrn);
    await this.lookupBtn.click();
  }

  async expectPatientEligibilityVerified(expected: {
    fullName: string;
    mrn: string;
    payerId: string;
  }): Promise<void> {
    await expect(this.patientSummaryCard).toBeVisible();
    await expect(this.patientFullName).toHaveText(expected.fullName);
    await expect(this.patientMrnDisplay).toHaveText(expected.mrn);
    await expect(this.patientPayerId).toHaveText(expected.payerId);
    await expect(this.ediEligibilityBadge).toHaveText('EDI-271 Active');
  }

  async expectPatientNotFoundError(): Promise<void> {
    await expect(this.lookupErrorAlert).toBeVisible();
    await expect(this.lookupErrorAlert).toContainText('not found in Master Patient Index');
    await expect(this.patientSummaryCard).toBeHidden();
  }

  async scheduleEncounter(input: ScheduleEncounterInput): Promise<void> {
    await this.departmentSelect.selectOption(input.department);
    await this.appointmentDateInput.fill(input.date);
    await this.slotSelect.selectOption(input.slot);
    await this.prioritySelect.selectOption(input.priority);
    await this.clinicalNotesInput.fill(input.notes);
    await this.submitAppointmentBtn.click();
  }

  async expectEncounterConfirmedWithHl7Ack(): Promise<string> {
    await expect(this.confirmationCode).toHaveText(/^APT-2026-\d+$/);
    await expect(this.hl7AckStatus).toHaveText('HL7 ADT^A04 ACK: AA');
    await expect(this.hl7SiuAckStatus).toHaveText('HL7 SIU^S12 Dispatched');

    const encounterId = (await this.confirmationCode.textContent())?.trim() ?? '';
    const ledgerRow = this.page.getByTestId(`appointment-row-${encounterId}`);
    await expect(ledgerRow).toBeVisible();
    await expect(ledgerRow).toContainText('HL7 ADT^A04 ACK: AA');
    return encounterId;
  }
}
