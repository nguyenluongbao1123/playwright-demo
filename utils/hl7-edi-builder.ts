export interface Hl7AdtInput {
  messageControlId: string;
  triggerEvent?: 'ADT^A01' | 'ADT^A04' | 'ORM^O01' | 'SIU^S12';
  sendingFacility: string;
  mrn: string;
  lastName: string;
  firstName: string;
  dobCompact: string; // YYYYMMDD
  gender: 'M' | 'F' | 'O';
  patientClass?: 'I' | 'O' | 'E';
  assignedLocation?: string;
  orderNumber?: string;
  orderSku?: string;
  appointmentId?: string;
  unmaskedSsnForNegativeTest?: string;
}

export interface Edi837ServiceLine {
  cptCode: string;
  chargeAmount: number;
  units: number;
}

export interface Edi837ClaimInput {
  controlNumber: string; // 9-digit ISA13 e.g. '000000905'
  claimId: string;
  patientMrn: string;
  subscriberId?: string; // NM109 Member/Subscriber ID (defaults to patientMrn)
  patientLastName: string;
  patientFirstName: string;
  payerId: string;
  icd10Code: string;
  serviceLines: Edi837ServiceLine[];
  overrideTotalChargeForNegativeTest?: number;
}

/**
 * Builds deterministic HL7 v2.5.1 pipe-delimited messages (ADT^A01, ADT^A04, ORM^O01).
 */
export function buildHl7Message(input: Hl7AdtInput): string {
  const trigger = input.triggerEvent ?? 'ADT^A01';
  const timestamp = '20261124103000';
  const patientClass = input.patientClass ?? 'O';
  const location = input.assignedLocation ?? 'OPD^RM204^BED1';
  const ssnField = input.unmaskedSsnForNegativeTest ?? '';

  const segments: string[] = [
    `MSH|^~\\&|EHR_PORTAL|${input.sendingFacility}|HIS_CORE|NATIONAL_HIE|${timestamp}||${trigger}|${input.messageControlId}|P|2.5.1`,
    `PID|1||${input.mrn}^^^${input.sendingFacility}^MR||${input.lastName}^${input.firstName}||${input.dobCompact}|${input.gender}|||||||||||${ssnField}`,
    `PV1|1|${patientClass}|${location}||||CLN-5082^Tran^Minh^MD`
  ];

  if (trigger === 'ORM^O01') {
    const ordNo = input.orderNumber ?? 'ORD-2026-9001';
    const sku = input.orderSku ?? 'MED-SUP-402';
    segments.push(`ORC|NW|${ordNo}|${ordNo}||||||${timestamp}|||CLN-5082^Tran^Minh`);
    segments.push(`OBR|1|${ordNo}|${ordNo}|${sku}^Clinical Supply Kit|||${timestamp}`);
  }

  if (trigger === 'SIU^S12') {
    const apptId = input.appointmentId ?? 'APT-2026-1001';
    segments.splice(1, 0, `SCH|${apptId}|${apptId}||||SURG_FOLLOWUP^Outpatient Surgical Consult|30|MIN`);
  }

  return segments.join('\r');
}

/**
 * Builds deterministic ASC X12 837P (005010X222A1) Healthcare Claim payload.
 */
export function buildEdi837Claim(input: Edi837ClaimInput): string {
  const computedTotal = input.serviceLines.reduce((sum, line) => sum + line.chargeAmount * line.units, 0);
  const declaredTotal = input.overrideTotalChargeForNegativeTest ?? computedTotal;
  const cleanIcd10 = input.icd10Code.replace('.', '');
  const nm109SubscriberId = input.subscriberId ?? input.patientMrn;

  const transactionBody: string[] = [
    `ST*837*0001*005010X222A1`,
    `BHT*0019*00*${input.claimId}*20261124*1030*CH`,
    `NM1*41*2*DANANG GENERAL HOSPITAL*****46*DN-HOSP-01`,
    `NM1*40*2*VIETCARE CLEARINGHOUSE*****46*${input.payerId}`,
    `HL*1**20*1`,
    `NM1*85*2*DANANG SURGICAL CENTER*****XX*1234567893`,
    `HL*2*1*22*0`,
    `SBR*P*18*******CI`,
    `NM1*IL*1*${input.patientLastName.toUpperCase()}*${input.patientFirstName.toUpperCase()}****MI*${nm109SubscriberId}`,
    `NM1*PR*2*VIETCARE PAYER*****PI*${input.payerId}`,
    `CLM*${input.claimId}*${declaredTotal.toFixed(2)}***11:B:1*Y*A*Y*Y`,
    `HI*ABK:${cleanIcd10}`
  ];

  input.serviceLines.forEach((line, index) => {
    const lineTotal = (line.chargeAmount * line.units).toFixed(2);
    transactionBody.push(`LX*${index + 1}`);
    transactionBody.push(`SV1*HC:${line.cptCode}*${lineTotal}*UN*${line.units}***1`);
    transactionBody.push(`DTP*472*D8*20261124`);
  });

  // SE01 includes ST through SE inclusive
  const segmentCount = transactionBody.length + 1;
  transactionBody.push(`SE*${segmentCount}*0001`);

  const envelope: string[] = [
    `ISA*00*          *00*          *ZZ*DNHOSP01       *ZZ*${input.payerId.padEnd(15, ' ').slice(0, 15)}*261124*1030*^*00501*${input.controlNumber}*0*T*:`,
    `GS*HC*DNHOSP01*${input.payerId}*20261124*1030*1*X*005010X222A1`,
    ...transactionBody,
    `GE*1*1`,
    `IEA*1*${input.controlNumber}`
  ];

  return `${envelope.join('~')}~`;
}

/**
 * Parses pipe-delimited HL7 segments into an indexed map for quick contract assertions.
 */
export function parseHl7Segments(rawHl7: string): Record<string, string[][]> {
  const lines = rawHl7
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const map: Record<string, string[][]> = {};
  for (const line of lines) {
    const fields = line.split('|');
    const segName = fields[0];
    if (!map[segName]) {
      map[segName] = [];
    }
    map[segName].push(fields);
  }
  return map;
}

export interface Edi850LineInput {
  lineNumber: number;
  sku: string;
  quantity: number;
  uom?: string;
  unitPrice: number;
}

export interface Edi850PurchaseOrderInput {
  controlNumber: string; // 9-digit ISA13
  poNumber: string;
  poDate?: string; // YYYYMMDD
  buyerFacilityCode?: string;
  vendorId?: string;
  lines: Edi850LineInput[];
}

export interface Edi856AsnInput {
  controlNumber: string;
  shipmentId: string;
  poNumber: string;
  shipDate?: string;
  sscc18Barcode: string; // GS1 18-digit SSCC-18 in MAN*GM*
  sku: string;
  lotNumber: string;
  shippedQuantity: number;
  uom?: string;
  expirationDate: string; // YYYYMMDD in DTM*036*
}

export interface Edi810InvoiceLineInput {
  lineNumber: number;
  sku: string;
  invoicedQuantity: number;
  uom?: string;
  unitPrice: number;
}

export interface Edi810InvoiceInput {
  controlNumber: string;
  invoiceNumber: string;
  poNumber: string;
  invoiceDate?: string;
  lines: Edi810InvoiceLineInput[];
  overrideTdsCentsForNegativeTest?: number;
}

/**
 * Builds ASC X12 850 Purchase Order (Hospital Buyer -> Medical Supply Vendor).
 */
export function buildEdi850PurchaseOrder(input: Edi850PurchaseOrderInput): string {
  const poDate = input.poDate ?? '20261125';
  const buyer = input.buyerFacilityCode ?? 'DN-HOSP-01';
  const vendor = input.vendorId ?? 'MEDLINE-VN01';
  const totalHashQty = input.lines.reduce((sum, l) => sum + l.quantity, 0);

  const body: string[] = [
    `ST*850*0001`,
    `BEG*00*NE*${input.poNumber}**${poDate}`,
    `REF*DP*SURGICAL-PROCUREMENT`,
    `N1*BY*DANANG GENERAL HOSPITAL*92*${buyer}`,
    `N1*SE*MEDLINE HEALTHCARE SUPPLY*92*${vendor}`
  ];

  for (const line of input.lines) {
    const uom = line.uom ?? 'EA';
    body.push(
      `PO1*${line.lineNumber}*${line.quantity}*${uom}*${line.unitPrice.toFixed(2)}*PE*VP*${line.sku}`
    );
  }

  body.push(`CTT*${input.lines.length}*${totalHashQty}`);
  body.push(`SE*${body.length + 1}*0001`);

  const envelope = [
    `ISA*00*          *00*          *ZZ*DNHOSP01       *ZZ*MEDLINEVN01    *261125*0800*^*00501*${input.controlNumber}*0*T*:`,
    `GS*PO*DNHOSP01*MEDLINEVN01*${poDate}*0800*1*X*005010`,
    ...body,
    `GE*1*1`,
    `IEA*1*${input.controlNumber}`
  ];

  return `${envelope.join('~')}~`;
}

/**
 * Builds ASC X12 856 Advance Ship Notice (Shipment -> Order -> Pack/SSCC-18 -> Item/Lot/Expiry).
 */
export function buildEdi856AdvanceShipNotice(input: Edi856AsnInput): string {
  const shipDate = input.shipDate ?? '20261125';
  const uom = input.uom ?? 'EA';

  const body: string[] = [
    `ST*856*0001`,
    `BSN*00*${input.shipmentId}*${shipDate}*1315*0001`,
    `HL*1**S`,
    `TD5*B*2*DHLH*M*COLD_CHAIN_MED`,
    `REF*BM*BOL-${input.shipmentId}`,
    `HL*2*1*O`,
    `PRF*${input.poNumber}`,
    `HL*3*2*P`,
    `MAN*GM*${input.sscc18Barcode}`,
    `HL*4*3*I`,
    `LIN*1*VP*${input.sku}*LT*${input.lotNumber}`,
    `SN1*1*${input.shippedQuantity}*${uom}`,
    `DTM*036*${input.expirationDate}`,
    `CTT*4`
  ];

  body.push(`SE*${body.length + 1}*0001`);

  const envelope = [
    `ISA*00*          *00*          *ZZ*MEDLINEVN01    *ZZ*DNHOSP01       *261125*1315*^*00501*${input.controlNumber}*0*T*:`,
    `GS*SH*MEDLINEVN01*DNHOSP01*${shipDate}*1315*1*X*005010`,
    ...body,
    `GE*1*1`,
    `IEA*1*${input.controlNumber}`
  ];

  return `${envelope.join('~')}~`;
}

/**
 * Builds ASC X12 810 Invoice (Vendor -> Hospital Accounts Payable for 3-Way Match).
 * Note: X12 TDS01 formats total invoice amount in implied 2-decimal cents (e.g. $1,225.00 -> 122500).
 */
export function buildEdi810Invoice(input: Edi810InvoiceInput): string {
  const invoiceDate = input.invoiceDate ?? '20261126';
  const computedDollars = input.lines.reduce(
    (sum, line) => sum + line.invoicedQuantity * line.unitPrice,
    0
  );
  const tdsCents = input.overrideTdsCentsForNegativeTest ?? Math.round(computedDollars * 100);

  const body: string[] = [
    `ST*810*0001`,
    `BIG*${invoiceDate}*${input.invoiceNumber}*20261125*${input.poNumber}`,
    `N1*SE*MEDLINE HEALTHCARE SUPPLY*92*MEDLINE-VN01`,
    `N1*BY*DANANG GENERAL HOSPITAL*92*DN-HOSP-01`
  ];

  for (const line of input.lines) {
    const uom = line.uom ?? 'EA';
    body.push(
      `IT1*${line.lineNumber}*${line.invoicedQuantity}*${uom}*${line.unitPrice.toFixed(2)}**VP*${line.sku}`
    );
  }

  body.push(`TDS*${tdsCents}`);
  body.push(`CTT*${input.lines.length}`);
  body.push(`SE*${body.length + 1}*0001`);

  const envelope = [
    `ISA*00*          *00*          *ZZ*MEDLINEVN01    *ZZ*DNHOSP01       *261126*0900*^*00501*${input.controlNumber}*0*T*:`,
    `GS*IN*MEDLINEVN01*DNHOSP01*${invoiceDate}*0900*1*X*005010`,
    ...body,
    `GE*1*1`,
    `IEA*1*${input.controlNumber}`
  ];

  return `${envelope.join('~')}~`;
}
