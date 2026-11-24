import * as http from 'http';
import { URL } from 'url';
import { parseHl7Segments } from '../utils/hl7-edi-builder';

interface PatientRecord {
  mrn: string;
  fullName: string;
  dob: string;
  gender: 'M' | 'F' | 'O';
  insurancePayerId: string;
  ediEligibilityStatus: 'EDI-271 Active' | 'Pending Verification';
}

interface InventoryItem {
  sku: string;
  itemName: string;
  lotNumber: string;
  availableStock: number;
  reorderThreshold: number;
}

interface AppointmentRecord {
  appointmentId: string;
  mrn: string;
  patientName: string;
  department: string;
  appointmentDate: string;
  slot: string;
  priority: string;
  notes: string;
  hl7Ack: string;
  hl7SiuStatus: string;
}

interface SupplyOrderRecord {
  orderId: string;
  mrn: string;
  sku: string;
  quantity: number;
  urgency: string;
  remainingStock: number;
  reorderTriggered: boolean;
  hl7OrmAck: string;
}

interface PurchaseOrderLine {
  lineNumber: number;
  sku: string;
  orderedQty: number;
  uom: string;
  unitPrice: number;
}

interface PurchaseOrderRecord {
  poNumber: string;
  poStatus: 'ACKNOWLEDGED_AC' | 'BACKORDERED_AT';
  lines: Map<string, PurchaseOrderLine>;
  totalAmount: number;
}

interface AsnShipmentRecord {
  shipmentId: string;
  poNumber: string;
  sscc18: string;
  shippedBySku: Map<string, { shippedQty: number; lotNumber: string; expirationDate: string }>;
}

const PORT = Number(process.env.MOCK_PORT || 4173);

// In-memory deterministic hospital state (resettable via POST /v1/admin/seed)
let patients = new Map<string, PatientRecord>();
let inventory = new Map<string, InventoryItem>();
let appointments: AppointmentRecord[] = [];
let orders: SupplyOrderRecord[] = [];
const purchaseOrders = new Map<string, PurchaseOrderRecord>();
const asnShipments = new Map<string, AsnShipmentRecord>();
let seqCounter = 1000;

function initializePatientsAndAppointments(): void {
  patients = new Map([
    [
      'MRN-2026-8841',
      {
        mrn: 'MRN-2026-8841',
        fullName: 'Nguyen Van An',
        dob: '1988-05-14',
        gender: 'M',
        insurancePayerId: 'EDI-837-VN01',
        ediEligibilityStatus: 'EDI-271 Active'
      }
    ],
    [
      'MRN-2026-9920',
      {
        mrn: 'MRN-2026-9920',
        fullName: 'Le Thi Bich Ngoc',
        dob: '1994-11-02',
        gender: 'F',
        insurancePayerId: 'EDI-837-VN02',
        ediEligibilityStatus: 'EDI-271 Active'
      }
    ]
  ]);
  appointments = [];
}

function initializeInventoryAndOrders(): void {
  inventory = new Map([
    [
      'MED-SUP-402',
      {
        sku: 'MED-SUP-402',
        itemName: 'Sterile Surgical Kit Type-B',
        lotNumber: 'LOT-2026-B91',
        availableStock: 120,
        reorderThreshold: 25
      }
    ],
    [
      'MED-SUP-109',
      {
        sku: 'MED-SUP-109',
        itemName: 'HL7 Smart Infusion Catheter Set',
        lotNumber: 'LOT-2026-C14',
        availableStock: 18,
        reorderThreshold: 15
      }
    ]
  ]);
  orders = [];
}

function initializeDefaultState(scope: 'all' | 'appointments' | 'inventory' = 'all'): void {
  if (scope === 'all' || scope === 'appointments') {
    initializePatientsAndAppointments();
  }
  if (scope === 'all' || scope === 'inventory') {
    initializeInventoryAndOrders();
  }
  if (scope === 'all') {
    seqCounter = 1000;
  }
}

initializeDefaultState();

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendHtml(res: http.ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || '';
  const out: Record<string, string> = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  });
  return out;
}

function renderShellStyles(): string {
  return `
    <style>
      :root { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; }
      body { margin: 0; padding: 0; }
      header { background: #0f172a; color: #f8fafc; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; }
      nav a { color: #38bdf8; margin-right: 18px; text-decoration: none; font-weight: 600; }
      main { max-width: 1040px; margin: 24px auto; padding: 0 20px; }
      section, form { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin-bottom: 18px; }
      label { display: block; font-size: 13px; font-weight: 600; margin: 10px 0 4px; color: #334155; }
      input, select, textarea { width: 100%; max-width: 420px; padding: 8px 10px; border: 1px solid #94a3b8; border-radius: 6px; box-sizing: border-box; }
      button { margin-top: 12px; background: #0284c7; color: white; border: none; padding: 9px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
      button:hover { background: #0369a1; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 14px; }
      .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
      .badge-ok { background: #dcfce7; color: #166534; }
      .badge-warn { background: #fef3c7; color: #92400e; }
      .alert-warn { background: #fffbeb; border: 1px solid #f59e0b; color: #92400e; padding: 10px 14px; border-radius: 6px; margin-top: 10px; font-weight: 600; }
      .alert-err { background: #fef2f2; border: 1px solid #ef4444; color: #991b1b; padding: 10px 14px; border-radius: 6px; margin-top: 10px; font-weight: 600; }
      .toast { background: #e0f2fe; border-left: 4px solid #0284c7; padding: 10px 14px; margin-bottom: 16px; border-radius: 4px; font-weight: 600; }
      .hidden { display: none; }
    </style>
  `;
}

function renderTopHeader(staffId: string): string {
  return `
    <header role="banner" data-testid="ehr-top-nav">
      <div>
        <strong>CareFlow EHR &amp; HL7/EDI Portal</strong>
        <nav aria-label="Clinical Modules" style="display:inline-block; margin-left: 24px;">
          <a href="/portal/appointments" data-testid="nav-appointments">Patient &amp; Appointments</a>
          <a href="/portal/orders-inventory" data-testid="nav-orders-inventory">Orders &amp; Inventory</a>
        </nav>
      </div>
      <span data-testid="clinician-session-badge">Clinician: ${staffId} | Facility: DN-HOSP-01</span>
    </header>
  `;
}

function renderLoginPage(): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head><meta charset="utf-8"><title>Clinician Sign-In | CareFlow EHR</title>${renderShellStyles()}</head>
  <body>
    <main data-testid="login-main" style="max-width:460px; margin-top:70px;">
      <section>
        <h1>Clinician SSO Sign-In</h1>
        <form id="loginForm">
          <label for="staffId">Clinician Staff ID</label>
          <input id="staffId" data-testid="login-staff-id" required placeholder="CLN-5082" />
          <label for="passcode">Passcode</label>
          <input id="passcode" type="password" data-testid="login-passcode" required />
          <div><button type="submit" data-testid="login-submit-btn">Authenticate Session</button></div>
        </form>
      </section>
    </main>
    <script>
      document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const staff = document.getElementById('staffId').value.trim() || 'CLN-5082';
        document.cookie = 'clinician_staff=' + encodeURIComponent(staff) + '; path=/; SameSite=Lax';
        localStorage.setItem('ehr_authenticated_staff', staff);
        window.location.href = '/portal/appointments';
      });
    </script>
  </body>
  </html>`;
}

function renderAppointmentsPage(staffId: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head><meta charset="utf-8"><title>Patient Intake &amp; Appointments | CareFlow EHR</title>${renderShellStyles()}</head>
  <body>
    ${renderTopHeader(staffId)}
    <main data-testid="patient-portal-main">
      <div role="status" data-testid="clinical-toast-banner" id="toastBanner" class="toast hidden"></div>

      <section data-testid="patient-lookup-section">
        <h2>1. Patient Intake &amp; EDI-270/271 Eligibility Lookup</h2>
        <label for="mrnInput">Patient MRN</label>
        <input id="mrnInput" data-testid="patient-mrn-input" placeholder="MRN-2026-8841" />
        <div><button type="button" id="lookupBtn" data-testid="patient-lookup-btn">Lookup Patient</button></div>
        <div id="lookupError" data-testid="patient-lookup-error" class="alert-err hidden"></div>

        <div id="patientCard" data-testid="patient-summary-card" class="hidden" style="margin-top:14px; padding:12px; background:#f1f5f9; border-radius:6px;">
          <div><strong>Full Name:</strong> <span id="ptName" data-testid="patient-full-name"></span></div>
          <div><strong>MRN:</strong> <span id="ptMrn" data-testid="patient-mrn-display"></span> | <strong>DOB:</strong> <span id="ptDob" data-testid="patient-dob-display"></span></div>
          <div><strong>Payer ID:</strong> <span id="ptPayer" data-testid="patient-payer-id"></span> | <span id="ptEdi" data-testid="edi-eligibility-badge" class="badge badge-ok"></span></div>
        </div>
      </section>

      <form id="bookingForm" data-testid="appointment-booking-form">
        <h2>2. Schedule Outpatient Encounter (HL7 ADT^A04)</h2>
        <label for="deptSelect">Clinical Department</label>
        <select id="deptSelect" data-testid="appointment-department-select">
          <option value="SURGERY">Outpatient Surgery</option>
          <option value="CARDIOLOGY">Cardiology Diagnostics</option>
          <option value="RADIOLOGY">Radiology &amp; Imaging</option>
        </select>

        <label for="dateInput">Appointment Date</label>
        <input id="dateInput" type="date" data-testid="appointment-date-input" value="2026-12-05" required />

        <label for="slotSelect">Time Slot</label>
        <select id="slotSelect" data-testid="appointment-slot-select">
          <option value="09:00">09:00 AM</option>
          <option value="10:30">10:30 AM</option>
          <option value="14:00">02:00 PM</option>
        </select>

        <label for="prioritySelect">Encounter Priority</label>
        <select id="prioritySelect" data-testid="appointment-priority-select">
          <option value="ROUTINE">ROUTINE</option>
          <option value="URGENT">URGENT</option>
          <option value="STAT">STAT</option>
        </select>

        <label for="notesInput">Clinical Intake Notes</label>
        <textarea id="notesInput" rows="2" data-testid="appointment-clinical-notes" placeholder="Pre-op surgical kit verification required"></textarea>

        <div><button type="submit" data-testid="appointment-submit-btn">Confirm &amp; Emit HL7 ADT</button></div>
      </form>

      <section data-testid="appointment-confirmation-panel">
        <h2>3. Active Encounter &amp; HL7 Acknowledgment Log</h2>
        <div id="confirmBox" class="hidden" style="margin-bottom:10px;">
          <strong>Confirmation:</strong> <span id="confirmCode" data-testid="appointment-confirmation-code"></span> |
          <span id="hl7AckBadge" data-testid="hl7-ack-status" class="badge badge-ok"></span> |
          <span id="hl7SiuBadge" data-testid="hl7-siu-ack-status" class="badge badge-ok"></span>
        </div>
        <table data-testid="appointments-ledger-table">
          <thead><tr><th>Encounter ID</th><th>MRN</th><th>Patient</th><th>Department</th><th>Date &amp; Slot</th><th>HL7 Status</th></tr></thead>
          <tbody id="appointmentsBody"></tbody>
        </table>
      </section>
    </main>
    <script>
      let activeMrn = '';
      const toast = document.getElementById('toastBanner');
      function showToast(msg) {
        toast.textContent = msg;
        toast.classList.remove('hidden');
      }
      async function refreshLedger() {
        const res = await fetch('/v1/appointments');
        const data = await res.json();
        const tbody = document.getElementById('appointmentsBody');
        tbody.innerHTML = data.appointments.map(a =>
          '<tr data-testid="appointment-row-' + a.appointmentId + '">' +
          '<td>' + a.appointmentId + '</td><td>' + a.mrn + '</td><td>' + a.patientName + '</td>' +
          '<td>' + a.department + '</td><td>' + a.appointmentDate + ' ' + a.slot + '</td>' +
          '<td>' + a.hl7Ack + '</td></tr>'
        ).join('');
      }
      document.getElementById('lookupBtn').addEventListener('click', async () => {
        const mrn = document.getElementById('mrnInput').value.trim();
        const errEl = document.getElementById('lookupError');
        const card = document.getElementById('patientCard');
        errEl.classList.add('hidden');
        const res = await fetch('/v1/patients/' + encodeURIComponent(mrn));
        if (!res.ok) {
          card.classList.add('hidden');
          errEl.textContent = 'Patient MRN not found in Master Patient Index (MPI).';
          errEl.classList.remove('hidden');
          activeMrn = '';
          return;
        }
        const pt = await res.json();
        activeMrn = pt.mrn;
        document.getElementById('ptName').textContent = pt.fullName;
        document.getElementById('ptMrn').textContent = pt.mrn;
        document.getElementById('ptDob').textContent = pt.dob;
        document.getElementById('ptPayer').textContent = pt.insurancePayerId;
        document.getElementById('ptEdi').textContent = pt.ediEligibilityStatus;
        card.classList.remove('hidden');
        showToast('MPI Verified: ' + pt.fullName + ' (' + pt.ediEligibilityStatus + ')');
      });
      document.getElementById('bookingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const mrn = activeMrn || document.getElementById('mrnInput').value.trim();
        const payload = {
          mrn,
          department: document.getElementById('deptSelect').value,
          appointmentDate: document.getElementById('dateInput').value,
          slot: document.getElementById('slotSelect').value,
          priority: document.getElementById('prioritySelect').value,
          notes: document.getElementById('notesInput').value
        };
        const res = await fetch('/v1/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json();
          showToast('Booking Rejected: ' + err.error);
          return;
        }
        const created = await res.json();
        document.getElementById('confirmCode').textContent = created.appointmentId;
        document.getElementById('hl7AckBadge').textContent = created.hl7Ack;
        document.getElementById('hl7SiuBadge').textContent = created.hl7SiuStatus;
        document.getElementById('confirmBox').classList.remove('hidden');
        showToast('Encounter ' + created.appointmentId + ' scheduled (' + created.hl7SiuStatus + ' & HL7 ADT^A04 acknowledged).');
        await refreshLedger();
      });
      refreshLedger();
    </script>
  </body>
  </html>`;
}

function renderOrdersInventoryPage(staffId: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head><meta charset="utf-8"><title>Clinical Orders &amp; Inventory Sync | CareFlow EHR</title>${renderShellStyles()}</head>
  <body>
    ${renderTopHeader(staffId)}
    <main data-testid="order-inventory-main">
      <div role="status" data-testid="clinical-toast-banner" id="toastBanner" class="toast hidden"></div>

      <section data-testid="inventory-stock-panel">
        <h2>1. Real-Time Clinical Supply Inventory</h2>
        <table data-testid="inventory-stock-table">
          <thead><tr><th>SKU</th><th>Supply Item</th><th>Lot Number</th><th>Available Stock</th><th>Status</th></tr></thead>
          <tbody id="stockBody"></tbody>
        </table>
      </section>

      <form id="orderForm" data-testid="supply-order-form">
        <h2>2. Create Clinical Supply Order (HL7 ORM^O01)</h2>
        <label for="orderMrn">Patient MRN</label>
        <input id="orderMrn" data-testid="order-patient-mrn" placeholder="MRN-2026-8841" required />

        <label for="orderSku">Medical Supply SKU</label>
        <select id="orderSku" data-testid="order-sku-select">
          <option value="MED-SUP-402">MED-SUP-402 — Sterile Surgical Kit Type-B</option>
          <option value="MED-SUP-109">MED-SUP-109 — HL7 Smart Infusion Catheter Set</option>
        </select>

        <label for="orderQty">Quantity to Dispense</label>
        <input id="orderQty" type="number" data-testid="order-quantity-input" value="1" min="1" required />

        <label for="orderUrgency">Order Urgency</label>
        <select id="orderUrgency" data-testid="order-urgency-select">
          <option value="ROUTINE">ROUTINE</option>
          <option value="STAT">STAT</option>
        </select>

        <label style="display:flex; align-items:center; gap:8px; margin-top:12px;">
          <input id="orderPaCheckbox" type="checkbox" data-testid="order-pa-verified-checkbox" checked style="width:auto;" />
          <span>Prior Authorization (PA / EDI 278) Verified</span>
        </label>

        <div><button type="submit" data-testid="order-submit-btn">Dispatch Order &amp; Deduct Stock</button></div>
      </form>

      <section data-testid="order-sync-result-panel">
        <h2>3. Order Fulfillment &amp; Stock Reconciliation</h2>
        <div id="orderResultBox" class="hidden">
          <strong>Order ID:</strong> <span id="orderIdBadge" data-testid="order-id-badge"></span> |
          <span id="ormAckBadge" data-testid="order-orm-ack-badge" class="badge badge-ok"></span>
        </div>
        <div id="lowStockBanner" data-testid="low-stock-alert-banner" class="alert-warn hidden"></div>
        <div id="orderErrBanner" data-testid="order-error-alert" class="alert-err hidden"></div>
      </section>
    </main>
    <script>
      const toast = document.getElementById('toastBanner');
      function showToast(msg) {
        toast.textContent = msg;
        toast.classList.remove('hidden');
      }
      async function loadStock() {
        const res = await fetch('/v1/inventory');
        const data = await res.json();
        const tbody = document.getElementById('stockBody');
        tbody.innerHTML = data.items.map(item => {
          const isLow = item.availableStock <= item.reorderThreshold;
          const statusLabel = isLow ? 'LOW_STOCK_REORDER' : 'IN_STOCK';
          const badgeCls = isLow ? 'badge badge-warn' : 'badge badge-ok';
          return '<tr data-testid="inventory-row-' + item.sku + '">' +
            '<td data-testid="stock-sku-' + item.sku + '">' + item.sku + '</td>' +
            '<td>' + item.itemName + '</td>' +
            '<td data-testid="stock-lot-' + item.sku + '">' + item.lotNumber + '</td>' +
            '<td data-testid="stock-available-' + item.sku + '">' + item.availableStock + '</td>' +
            '<td><span data-testid="stock-status-badge-' + item.sku + '" class="' + badgeCls + '">' + statusLabel + '</span></td>' +
          '</tr>';
        }).join('');
      }
      document.getElementById('orderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBanner = document.getElementById('orderErrBanner');
        const lowBanner = document.getElementById('lowStockBanner');
        const resBox = document.getElementById('orderResultBox');
        errBanner.classList.add('hidden');
        lowBanner.classList.add('hidden');

        const payload = {
          mrn: document.getElementById('orderMrn').value.trim(),
          sku: document.getElementById('orderSku').value,
          quantity: Number(document.getElementById('orderQty').value),
          urgency: document.getElementById('orderUrgency').value,
          paVerified: document.getElementById('orderPaCheckbox').checked
        };
        const res = await fetch('/v1/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await res.json();
        if (!res.ok) {
          resBox.classList.add('hidden');
          errBanner.textContent = body.error;
          errBanner.classList.remove('hidden');
          return;
        }
        document.getElementById('orderIdBadge').textContent = body.orderId;
        document.getElementById('ormAckBadge').textContent = body.hl7OrmAck;
        resBox.classList.remove('hidden');
        if (body.reorderTriggered) {
          lowBanner.textContent = 'LOW STOCK ALERT: Auto-EDI 850 Purchase Order queued for ' + body.sku + ' (Remaining: ' + body.remainingStock + ')';
          lowBanner.classList.remove('hidden');
        }
        showToast('Order ' + body.orderId + ' synced. Stock updated for ' + body.sku + '.');
        await loadStock();
      });
      loadStock();
    </script>
  </body>
  </html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const pathname = reqUrl.pathname;
    const method = req.method || 'GET';

    // 0. Healthcheck
    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'UP', service: 'healthcare-ehr-hl7-edi-gateway' });
      return;
    }

    // 1. Seed / Reset state endpoint (supports domain-isolated parallel workers)
    if (method === 'POST' && pathname === '/v1/admin/seed') {
      const body = await readJsonBody(req);
      const rawScope = body.scope;
      const scope =
        rawScope === 'appointments' || rawScope === 'inventory' ? rawScope : 'all';
      initializeDefaultState(scope);
      const samplePt = body.samplePatient as Record<string, string> | undefined;
      if (samplePt?.mrn) {
        patients.set(samplePt.mrn, {
          mrn: samplePt.mrn,
          fullName: samplePt.fullName,
          dob: samplePt.dob,
          gender: (samplePt.gender as 'M' | 'F' | 'O') || 'M',
          insurancePayerId: samplePt.insurancePayerId,
          ediEligibilityStatus: 'EDI-271 Active'
        });
      }
      sendJson(res, 200, { seeded: true, patientCount: patients.size, inventoryCount: inventory.size });
      return;
    }

    // 2. UI Portal Routes
    if (method === 'GET' && pathname === '/portal/login') {
      sendHtml(res, renderLoginPage());
      return;
    }

    if (method === 'GET' && (pathname === '/' || pathname === '/portal/appointments' || pathname === '/portal/orders-inventory')) {
      const cookies = parseCookies(req);
      if (!cookies.clinician_staff) {
        res.writeHead(302, { Location: '/portal/login' });
        res.end();
        return;
      }
      if (pathname === '/portal/orders-inventory') {
        sendHtml(res, renderOrdersInventoryPage(cookies.clinician_staff));
      } else {
        sendHtml(res, renderAppointmentsPage(cookies.clinician_staff));
      }
      return;
    }

    // 3. Master Patient Index API
    if (method === 'GET' && pathname.startsWith('/v1/patients/')) {
      const mrn = decodeURIComponent(pathname.replace('/v1/patients/', ''));
      const patient = patients.get(mrn);
      if (!patient) {
        sendJson(res, 404, { error: `MRN ${mrn} not found in MPI` });
        return;
      }
      sendJson(res, 200, patient);
      return;
    }

    // 4. Appointments API
    if (method === 'GET' && pathname === '/v1/appointments') {
      sendJson(res, 200, { appointments });
      return;
    }

    if (method === 'POST' && pathname === '/v1/appointments') {
      const body = await readJsonBody(req);
      const mrn = String(body.mrn || '');
      const patient = patients.get(mrn);
      if (!patient) {
        sendJson(res, 404, { error: `Cannot book encounter: Unknown MRN ${mrn}` });
        return;
      }
      seqCounter += 1;
      const record: AppointmentRecord = {
        appointmentId: `APT-2026-${seqCounter}`,
        mrn: patient.mrn,
        patientName: patient.fullName,
        department: String(body.department || 'SURGERY'),
        appointmentDate: String(body.appointmentDate || '2026-12-05'),
        slot: String(body.slot || '09:00'),
        priority: String(body.priority || 'ROUTINE'),
        notes: String(body.notes || ''),
        hl7Ack: 'HL7 ADT^A04 ACK: AA',
        hl7SiuStatus: 'HL7 SIU^S12 Dispatched'
      };
      appointments.push(record);
      sendJson(res, 201, record);
      return;
    }

    // 5. Inventory & Supply Orders API
    if (method === 'GET' && pathname === '/v1/inventory') {
      sendJson(res, 200, { items: Array.from(inventory.values()) });
      return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/inventory/')) {
      const sku = decodeURIComponent(pathname.replace('/v1/inventory/', ''));
      const item = inventory.get(sku);
      if (!item) {
        sendJson(res, 404, { error: `SKU ${sku} not found` });
        return;
      }
      sendJson(res, 200, {
        ...item,
        status: item.availableStock <= item.reorderThreshold ? 'LOW_STOCK_REORDER' : 'IN_STOCK'
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/orders') {
      const body = await readJsonBody(req);
      const mrn = String(body.mrn || '');
      const sku = String(body.sku || '');
      const quantity = Number(body.quantity || 0);
      const urgency = String(body.urgency || 'ROUTINE');
      const paVerified = body.paVerified !== false;

      if (!patients.has(mrn)) {
        sendJson(res, 404, { error: `Invalid Patient MRN: ${mrn}` });
        return;
      }
      const item = inventory.get(sku);
      if (!item) {
        sendJson(res, 404, { error: `Unknown Supply SKU: ${sku}` });
        return;
      }
      if (!paVerified) {
        sendJson(res, 422, {
          code: 'PA_VERIFICATION_REQUIRED',
          error: 'BLOCKED: Prior Authorization (PA) verification is required before inventory deduction.'
        });
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        sendJson(res, 400, { error: 'Quantity must be a positive integer' });
        return;
      }
      if (quantity > item.availableStock) {
        sendJson(res, 409, {
          code: 'INSUFFICIENT_STOCK',
          error: `Insufficient stock for ${sku}: requested ${quantity}, available ${item.availableStock}`
        });
        return;
      }

      item.availableStock -= quantity;
      const reorderTriggered = item.availableStock <= item.reorderThreshold;
      seqCounter += 1;

      const orderRecord: SupplyOrderRecord = {
        orderId: `ORD-2026-${seqCounter}`,
        mrn,
        sku,
        quantity,
        urgency,
        remainingStock: item.availableStock,
        reorderTriggered,
        hl7OrmAck: 'HL7 ORM^O01 ACK: AA'
      };
      orders.push(orderRecord);
      sendJson(res, 201, orderRecord);
      return;
    }

    // 6. HL7 v2.5.1 Ingestion Contract Endpoint
    if (method === 'POST' && pathname === '/v1/hl7/ingest') {
      const facilityHeader = req.headers['x-facility-code'];
      if (!facilityHeader) {
        sendJson(res, 401, { error: 'Missing mandatory X-Facility-Code header' });
        return;
      }

      const body = await readJsonBody(req);
      const rawHl7 = String(body.rawHl7 || '');
      const parsed = parseHl7Segments(rawHl7);

      const msh = parsed.MSH?.[0];
      if (!msh || msh[11] !== '2.5.1') {
        sendJson(res, 400, {
          ackCode: 'AR',
          errorCode: 'UNSUPPORTED_HL7_VERSION',
          rawAck: 'MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-ERR|P|2.5.1\rMSA|AR|UNKNOWN|UNSUPPORTED_HL7_VERSION'
        });
        return;
      }

      const messageType = msh[8] || '';
      const controlId = msh[9] || 'CTRL-0';
      const pid = parsed.PID?.[0];

      if (!pid) {
        sendJson(res, 400, {
          ackCode: 'AR',
          messageControlId: controlId,
          errorCode: 'MISSING_REQUIRED_PID_SEGMENT',
          rawAck: `MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-${controlId}|P|2.5.1\rMSA|AR|${controlId}|MISSING_REQUIRED_PID_SEGMENT`
        });
        return;
      }

      const mrnComponent = (pid[3] || '').split('^')[0];
      if (!/^MRN-\d{4}-\d{4}$/.test(mrnComponent)) {
        sendJson(res, 422, {
          ackCode: 'AE',
          messageControlId: controlId,
          errorCode: 'INVALID_PID3_MRN_FORMAT',
          rawAck: `MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-${controlId}|P|2.5.1\rMSA|AE|${controlId}|INVALID_PID3_MRN_FORMAT`
        });
        return;
      }

      // HIPAA Safe-Harbor Guardrail: Reject unmasked 9-digit SSN in PID-19
      const pid19Ssn = pid[19] || '';
      if (/^\d{3}-\d{2}-\d{4}$/.test(pid19Ssn) || /^\d{9}$/.test(pid19Ssn)) {
        sendJson(res, 422, {
          ackCode: 'AE',
          messageControlId: controlId,
          errorCode: 'HIPAA_PHI_UNMASKED_SSN_REJECTED',
          rawAck: `MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-${controlId}|P|2.5.1\rMSA|AE|${controlId}|HIPAA_PHI_UNMASKED_SSN_REJECTED`
        });
        return;
      }

      if (messageType === 'ORM^O01' && (!parsed.ORC?.[0] || !parsed.OBR?.[0])) {
        sendJson(res, 422, {
          ackCode: 'AE',
          messageControlId: controlId,
          errorCode: 'MISSING_ORC_OBR_ORDER_SEGMENTS',
          rawAck: `MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-${controlId}|P|2.5.1\rMSA|AE|${controlId}|MISSING_ORC_OBR_ORDER_SEGMENTS`
        });
        return;
      }

      if (messageType === 'SIU^S12' && !parsed.SCH?.[0]) {
        sendJson(res, 422, {
          ackCode: 'AE',
          messageControlId: controlId,
          errorCode: 'MISSING_SCH_SCHEDULING_SEGMENT',
          rawAck: `MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-${controlId}|P|2.5.1\rMSA|AE|${controlId}|MISSING_SCH_SCHEDULING_SEGMENT`
        });
        return;
      }

      sendJson(res, 200, {
        ackCode: 'AA',
        messageControlId: controlId,
        triggerEvent: messageType,
        parsedPatientMrn: mrnComponent,
        facilityCode: facilityHeader,
        rawAck: `MSH|^~\\&|HIS_CORE|NATIONAL_HIE|||20261124103001||ACK|ACK-${controlId}|P|2.5.1\rMSA|AA|${controlId}|MESSAGE_ACCEPTED`
      });
      return;
    }

    // 7. ASC X12 EDI 837P -> 999 & 835 Remittance Adjudication Endpoint
    if (method === 'POST' && pathname === '/v1/edi/837-claim') {
      const body = await readJsonBody(req);
      const rawX12 = String(body.rawX12 || '');
      const segments = rawX12
        .split('~')
        .map((s) => s.trim())
        .filter(Boolean);

      const isa = segments.find((s) => s.startsWith('ISA*'));
      const st = segments.find((s) => s.startsWith('ST*837*'));
      const nm1Subscriber = segments.find((s) => s.startsWith('NM1*IL*'));
      const clm = segments.find((s) => s.startsWith('CLM*'));
      const hi = segments.find((s) => s.startsWith('HI*'));
      const sv1List = segments.filter((s) => s.startsWith('SV1*'));

      if (!isa || !st || !nm1Subscriber || !clm || !hi || sv1List.length === 0) {
        sendJson(res, 400, {
          status: 'REJECTED_999',
          functionalAck999: 'IK5*R*I5',
          errorCode: 'EDI_837_MISSING_MANDATORY_SEGMENTS'
        });
        return;
      }

      const clmFields = clm.split('*');
      const claimId = clmFields[1];
      const declaredCharge = Number(clmFields[2]);

      // Guard against silent NM109 Subscriber ID truncation (< 8 chars) before clearinghouse submission
      const nm1Fields = nm1Subscriber.split('*');
      const subscriberId = (nm1Fields[9] || '').trim();
      if (subscriberId.length < 8) {
        sendJson(res, 400, {
          claimId,
          status: 'REJECTED_999',
          functionalAck999: 'IK5*R*I6',
          defectCode: 'EDI_SEGMENT_TRUNCATION',
          errorCode: 'EDI_NM109_SUBSCRIBER_ID_TRUNCATED',
          reason: `NM109 Subscriber ID "${subscriberId}" truncated below 8 characters`
        });
        return;
      }

      const sumSv1 = sv1List.reduce((acc, seg) => {
        const parts = seg.split('*');
        return acc + Number(parts[2] || 0);
      }, 0);

      if (Math.abs(declaredCharge - sumSv1) > 0.01) {
        sendJson(res, 422, {
          claimId,
          functionalAck999: 'IK5*R*5',
          errorCode: 'EDI_837_CLM_SV1_CHARGE_IMBALANCE',
          declaredCharge,
          computedLineSum: Number(sumSv1.toFixed(2))
        });
        return;
      }

      // Adjudicate into X12 835 Electronic Remittance Advice (80% payer paid, 20% patient coinsurance)
      const allowedAmount = Number(declaredCharge.toFixed(2));
      const payerPaidAmount = Number((allowedAmount * 0.8).toFixed(2));
      const patientResponsibility = Number((allowedAmount - payerPaidAmount).toFixed(2));
      const eftTraceNumber = `EFT2026${claimId.replace(/[^A-Z0-9]/gi, '')}`;

      const raw835 = [
        `ISA*00*          *00*          *ZZ*VIETCAREPAYER  *ZZ*DNHOSP01       *261124*1035*^*00501*000008351*0*T*:`,
        `GS*HP*VIETCAREPAYER*DNHOSP01*20261124*1035*1*X*005010X221A1`,
        `ST*835*0001`,
        `BPR*I*${payerPaidAmount.toFixed(2)}*C*ACH*CCP*01*011000015*DA*987654321*1512345678**01*021000021*DA*123456789*20261124`,
        `TRN*1*${eftTraceNumber}*1512345678`,
        `CLP*${claimId}*1*${allowedAmount.toFixed(2)}*${payerPaidAmount.toFixed(2)}*${patientResponsibility.toFixed(2)}*12*PAYERCTRL991*11*1`,
        `SE*6*0001`,
        `GE*1*1`,
        `IEA*1*000008351`
      ].join('~') + '~';

      sendJson(res, 201, {
        claimId,
        functionalAck999: 'IK5*A',
        claimStatusCode: '1', // Processed as Primary
        allowedAmount,
        payerPaidAmount,
        patientResponsibility,
        eftTraceNumber,
        rawEdi835: raw835
      });
      return;
    }

    // 8. ASC X12 EDI 850 Purchase Order -> Synchronous EDI 855 PO Acknowledgment
    if (method === 'POST' && pathname === '/v1/edi/850-po') {
      const body = await readJsonBody(req);
      const rawX12 = String(body.rawX12 || '');
      const segments = rawX12
        .split('~')
        .map((s) => s.trim())
        .filter(Boolean);

      const st = segments.find((s) => s.startsWith('ST*850*'));
      const beg = segments.find((s) => s.startsWith('BEG*'));
      const po1Segments = segments.filter((s) => s.startsWith('PO1*'));
      const ctt = segments.find((s) => s.startsWith('CTT*'));

      if (!st || !beg || po1Segments.length === 0 || !ctt) {
        sendJson(res, 400, {
          functionalAck999: 'IK5*R*I5',
          errorCode: 'EDI_850_MISSING_MANDATORY_SEGMENTS'
        });
        return;
      }

      const poNumber = beg.split('*')[3] || '';
      const declaredLineCount = Number(ctt.split('*')[1] || 0);
      if (declaredLineCount !== po1Segments.length) {
        sendJson(res, 422, {
          poNumber,
          functionalAck999: 'IK5*R*5',
          errorCode: 'EDI_850_CTT_LINE_COUNT_MISMATCH'
        });
        return;
      }

      const VENDOR_SINGLE_SHIP_CAP = 500;
      const linesMap = new Map<string, PurchaseOrderLine>();
      const ack855Lines: string[] = [];
      let hasBackorder = false;
      let totalAmount = 0;

      for (const po1 of po1Segments) {
        const parts = po1.split('*');
        const lineNumber = Number(parts[1]);
        const orderedQty = Number(parts[2]);
        const uom = parts[3] || 'EA';
        const unitPrice = Number(parts[4]);
        const sku = parts[7] || '';

        linesMap.set(sku, { lineNumber, sku, orderedQty, uom, unitPrice });
        totalAmount += orderedQty * unitPrice;

        const lineAckCode = orderedQty > VENDOR_SINGLE_SHIP_CAP ? 'IB' : 'IA';
        if (lineAckCode === 'IB') {
          hasBackorder = true;
        }
        ack855Lines.push(`PO1*${lineNumber}*${orderedQty}*${uom}*${unitPrice.toFixed(2)}*PE*VP*${sku}`);
        ack855Lines.push(`ACK*${lineAckCode}*${orderedQty}*${uom}*068*20261127`);
      }

      const bakAckType = hasBackorder ? 'AT' : 'AC'; // AC = Acknowledge With No Detail Change, AT = Accepted/Backordered
      const poStatus = hasBackorder ? 'BACKORDERED_AT' : 'ACKNOWLEDGED_AC';

      purchaseOrders.set(poNumber, {
        poNumber,
        poStatus,
        lines: linesMap,
        totalAmount: Number(totalAmount.toFixed(2))
      });

      const body855 = [
        `ST*855*0001`,
        `BAK*00*${bakAckType}*${poNumber}*20261125`,
        ...ack855Lines,
        `CTT*${po1Segments.length}`
      ];
      body855.push(`SE*${body855.length + 1}*0001`);

      const rawEdi855 =
        [
          `ISA*00*          *00*          *ZZ*MEDLINEVN01    *ZZ*DNHOSP01       *261125*0805*^*00501*000008551*0*T*:`,
          `GS*PR*MEDLINEVN01*DNHOSP01*20261125*0805*1*X*005010`,
          ...body855,
          `GE*1*1`,
          `IEA*1*000008551`
        ].join('~') + '~';

      sendJson(res, 201, {
        poNumber,
        functionalAck999: 'IK5*A',
        ack855Type: bakAckType,
        poStatus,
        lineCount: po1Segments.length,
        totalPoAmount: Number(totalAmount.toFixed(2)),
        rawEdi855
      });
      return;
    }

    // 9. ASC X12 EDI 856 Advance Ship Notice (HL Hierarchy, GS1 SSCC-18 & FDA Lot Expiry Check)
    if (method === 'POST' && pathname === '/v1/edi/856-asn') {
      const body = await readJsonBody(req);
      const rawX12 = String(body.rawX12 || '');
      const segments = rawX12
        .split('~')
        .map((s) => s.trim())
        .filter(Boolean);

      const st = segments.find((s) => s.startsWith('ST*856*'));
      const bsn = segments.find((s) => s.startsWith('BSN*'));
      const prf = segments.find((s) => s.startsWith('PRF*'));
      const man = segments.find((s) => s.startsWith('MAN*GM*'));
      const lin = segments.find((s) => s.startsWith('LIN*'));
      const sn1 = segments.find((s) => s.startsWith('SN1*'));
      const dtmExpiry = segments.find((s) => s.startsWith('DTM*036*'));
      const hlLevels = segments.filter((s) => s.startsWith('HL*')).map((s) => s.split('*')[3]);

      if (!st || !bsn || !prf || !lin || !sn1 || !dtmExpiry) {
        sendJson(res, 400, {
          functionalAck999: 'IK5*R*I5',
          errorCode: 'EDI_856_MISSING_MANDATORY_SEGMENTS'
        });
        return;
      }

      const shipmentId = bsn.split('*')[2] || '';
      const poNumber = prf.split('*')[1] || '';

      if (!purchaseOrders.has(poNumber)) {
        sendJson(res, 404, {
          shipmentId,
          poNumber,
          errorCode: 'EDI_856_REFERENCED_PO_NOT_FOUND'
        });
        return;
      }

      // Validate HL Shipment->Order->Pack->Item hierarchy & 18-digit GS1 SSCC-18 pallet/carton label
      const sscc18 = (man?.split('*')[2] || '').trim();
      const expectedHierarchy = hlLevels.join('>') === 'S>O>P>I';
      if (!expectedHierarchy || !/^\d{18}$/.test(sscc18)) {
        sendJson(res, 422, {
          shipmentId,
          poNumber,
          functionalAck999: 'IK5*R*I6',
          errorCode: 'EDI_856_INVALID_HL_OR_SSCC18',
          reason: 'ASN requires HL S>O>P>I hierarchy and valid 18-digit GS1 SSCC-18 in MAN*GM'
        });
        return;
      }

      // FDA UDI / Sterile Medical Supply Shelf-Life Guardrail
      const expirationDate = dtmExpiry.split('*')[2] || '';
      if (expirationDate <= '20261125') {
        sendJson(res, 422, {
          shipmentId,
          poNumber,
          errorCode: 'FDA_LOT_EXPIRED_REJECTED',
          expirationDate,
          reason: `Medical supply lot expired (${expirationDate}) on inbound ASN inspection`
        });
        return;
      }

      const linParts = lin.split('*');
      const sku = linParts[3] || '';
      const lotNumber = linParts[5] || '';
      const shippedQty = Number(sn1.split('*')[2] || 0);

      const shippedBySku = new Map<
        string,
        { shippedQty: number; lotNumber: string; expirationDate: string }
      >();
      shippedBySku.set(sku, { shippedQty, lotNumber, expirationDate });

      asnShipments.set(poNumber, {
        shipmentId,
        poNumber,
        sscc18,
        shippedBySku
      });

      sendJson(res, 201, {
        shipmentId,
        poNumber,
        functionalAck999: 'IK5*A',
        asnStatus: 'ASN_VERIFIED_RECEIVED',
        sscc18,
        sku,
        lotNumber,
        shippedQty,
        expirationDate
      });
      return;
    }

    // 10. ASC X12 EDI 810 Invoice (Automated 3-Way Match: 850 PO <-> 856 ASN <-> 810 Invoice)
    if (method === 'POST' && pathname === '/v1/edi/810-invoice') {
      const body = await readJsonBody(req);
      const rawX12 = String(body.rawX12 || '');
      const segments = rawX12
        .split('~')
        .map((s) => s.trim())
        .filter(Boolean);

      const st = segments.find((s) => s.startsWith('ST*810*'));
      const big = segments.find((s) => s.startsWith('BIG*'));
      const it1Segments = segments.filter((s) => s.startsWith('IT1*'));
      const tds = segments.find((s) => s.startsWith('TDS*'));

      if (!st || !big || it1Segments.length === 0 || !tds) {
        sendJson(res, 400, {
          functionalAck999: 'IK5*R*I5',
          errorCode: 'EDI_810_MISSING_MANDATORY_SEGMENTS'
        });
        return;
      }

      const bigParts = big.split('*');
      const invoiceNumber = bigParts[2] || '';
      const poNumber = bigParts[4] || '';
      const declaredTdsCents = Number(tds.split('*')[1] || 0);

      const poRecord = purchaseOrders.get(poNumber);
      const asnRecord = asnShipments.get(poNumber);

      if (!poRecord || !asnRecord) {
        sendJson(res, 409, {
          invoiceNumber,
          poNumber,
          errorCode: 'EDI_810_MISSING_PO_OR_ASN_RECEIPT',
          reason: '3-Way Match blocked: Both approved 850 PO and verified 856 ASN receipt are required'
        });
        return;
      }

      let computedCents = 0;
      let totalInvoicedQty = 0;

      for (const it1 of it1Segments) {
        const parts = it1.split('*');
        const invoicedQty = Number(parts[2] || 0);
        const invoicedUnitPrice = Number(parts[4] || 0);
        const sku = parts[7] || '';

        const poLine = poRecord.lines.get(sku);
        const asnLine = asnRecord.shippedBySku.get(sku);

        if (!poLine || !asnLine) {
          sendJson(res, 422, {
            invoiceNumber,
            poNumber,
            errorCode: 'EDI_810_UNORDERED_SKU',
            sku
          });
          return;
        }

        // 3-Way Match Gate 1: Unit Price Tolerance (0% variance on contracted medical supplies)
        if (Math.abs(invoicedUnitPrice - poLine.unitPrice) > 0.001) {
          sendJson(res, 422, {
            invoiceNumber,
            poNumber,
            matchStatus: 'HELD_PRICE_VARIANCE',
            errorCode: 'EDI_810_3WAY_MATCH_PRICE_VARIANCE',
            contractedUnitPrice: poLine.unitPrice,
            invoicedUnitPrice
          });
          return;
        }

        // 3-Way Match Gate 2: Billed Quantity cannot exceed 856 ASN Received Quantity
        if (invoicedQty > asnLine.shippedQty) {
          sendJson(res, 422, {
            invoiceNumber,
            poNumber,
            matchStatus: 'HELD_QTY_VARIANCE',
            errorCode: 'EDI_810_3WAY_MATCH_QTY_VARIANCE',
            shippedAsnQty: asnLine.shippedQty,
            invoicedQty
          });
          return;
        }

        computedCents += Math.round(invoicedQty * invoicedUnitPrice * 100);
        totalInvoicedQty += invoicedQty;
      }

      // 3-Way Match Gate 3: TDS01 implied-cents summary balance check
      if (declaredTdsCents !== computedCents) {
        sendJson(res, 422, {
          invoiceNumber,
          poNumber,
          functionalAck999: 'IK5*R*5',
          errorCode: 'EDI_810_TDS_SUMMARY_MISMATCH',
          declaredTdsCents,
          computedCents
        });
        return;
      }

      sendJson(res, 200, {
        invoiceNumber,
        poNumber,
        functionalAck999: 'IK5*A',
        matchStatus: 'THREE_WAY_MATCH_APPROVED',
        matchedShippedQty: totalInvoicedQty,
        approvedPayableAmount: Number((computedCents / 100).toFixed(2))
      });
      return;
    }

    sendJson(res, 404, { error: `Route not found: ${method} ${pathname}` });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Internal Healthcare Mock Server Error'
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`CareFlow EHR & HL7/EDI Mock Gateway listening on http://127.0.0.1:${PORT}\n`);
});
