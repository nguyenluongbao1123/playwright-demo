---
name: pom-governance
description: Enterprise Page Object Model, HIPAA data hygiene, and Human-in-the-Loop guardrails for AI-generated Playwright tests.
---

# Healthcare Playwright POM & Agentic AI Governance

All AI Agents (Planner, Generator, Healer) and human engineers contributing to this repository MUST enforce the rules below without exception.

## 1. The 80/20 Automation Split & Human-in-the-Loop Attribution
- **AI Scope (80%)**: Scaffolding Page Object methods, generating repeatable E2E/API regression scenarios from `fixtures/.auth/seed-baseline.json`, and proposing locator healing against `baselines/dom-structure.yaml`.
- **Human Senior QA Scope (20%)**: Clinical risk modeling, HL7 v2 / X12 EDI 837-835 financial balancing assertions, HIPAA PHI boundary review, and final PR sign-off.
- **Mandatory Attribution Header Lifecycle**:
  - Newly generated or AI-modified `.spec.ts` / Page Object files MUST include the probationary stamp at line 1:
    ```ts
    // Created By AI - Pending Senior QA Architectural Review
    ```
  - Once verified by a Senior Healthcare QA Engineer (HL7 segment rules, EDI 837/835 balancing, PA gate, and inventory math), append sign-off:
    ```ts
    // Created By AI - Pending Senior QA Architectural Review (Approved: @BaoNL)
    ```
- **No Silent Merges**: AI agents are strictly prohibited from committing directly to `main` or `master`.

## 5. Guarded Healer Agent Protocol (Advisory Mode Only)
- **Never Touch Domain Source Code**: Under no circumstances may a Healer Agent alter, patch, or modify application HTML, frontend components, or backend/API source files.
- **Advisory Commenting Only**: When a locator fails at runtime, do NOT silently rewrite assertions to force a pass. Diagnose DOM drift against `baselines/dom-structure.yaml` and insert a diagnostic alert directly above the broken locator inside `pages/*.ts`:
  ```ts
  // [HEALER ALERT]: Locator failed runtime check. Verify DOM attribute change against dom-structure.yaml before updating.
  ```

## 2. Strict Page Object Encapsulation (Zero Raw Selectors in Specs)
- **FORBIDDEN in `tests/**/*.spec.ts`**: Calling `page.locator()`, `page.getByTestId()`, `page.getByRole()`, XPath (`//div`), or brittle CSS chains (`div > span:nth-child(2)`).
- **REQUIRED**: Encapsulate all `Locator` definitions as `readonly` properties inside `/pages/*.ts` extending `BasePage`.
- **Locator Priority Order**:
  1. `page.getByRole()` / `page.getByLabel()` (accessible clinical UI semantics)
  2. `page.getByTestId()` (registered in `baselines/dom-structure.yaml`)

## 3. TypeScript & Deterministic Synchronization Rules
- `tsconfig.json` runs with `"strict": true` and `"noImplicitAny": true`. Never use `any` or `@ts-ignore`.
- **FORBIDDEN**: Hardcoded sleeps (`await page.waitForTimeout(...)`), `test.only(...)` committed to source control, or shared mutable variables across spec files.
- **REQUIRED**: Web-first assertions (`await expect(locator).toBeVisible()`, `await expect(locator).toHaveText()`) and custom typed fixtures from `@fixtures/healthcare.fixture`.

## 4. Healthcare & HIPAA Safe-Harbor Guardrails
- Never commit real Protected Health Information (PHI), live MRNs, or unmasked 9-digit SSNs (`PID-19`).
- All synthetic patients, payers (`EDI-837-VN01`), and medical supply SKUs (`MED-SUP-402`) must originate from `fixtures/seed.spec.ts` or `@utils/hl7-edi-builder`.
