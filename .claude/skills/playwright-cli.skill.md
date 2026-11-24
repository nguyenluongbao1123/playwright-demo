---
name: playwright-cli
description: Token-efficient Playwright CLI, seed setup, tag execution, and DOM baseline verification playbook for AI Agents.
---

# Playwright CLI & Agentic Execution Playbook

Follow this low-token operational workflow when inspecting pages, running targeted suites, or triaging failures.

## 1. Pre-Flight Type & Baseline Verification
Always validate TypeScript contracts before invoking browser processes:
```bash
npm run typecheck
```

## 2. Seed-First Environment Bootstrapping
Before generating or healing E2E scenarios, initialize the clinician authentication state (`fixtures/.auth/clinician-state.json`) and deterministic seed data (`fixtures/.auth/seed-baseline.json`):
```bash
npx playwright test --project=seed-setup
```

## 3. Targeted Suite Execution (Minimize Token & Compute Waste)
Prefer scoped runs by project or clinical domain tag rather than running the full matrix during iteration:
```bash
# Run headless HL7 v2 & EDI 837/835 contract tests only (fastest feedback)
npm run test:api
npm run test:hl7
npm run test:edi

# Run critical clinical smoke path (@smoke)
npm run test:smoke

# Run E2E Chromium POM workflows
npm run test:e2e

# Exclude quarantined scenarios during incident triage
npm run test:no-flaky
```

## 4. Local-Disk Accessibility Snapshots & DOM Drift Guardrail (`baselines/dom-structure.yaml`)
- **Prevent Context-Window Overflow (The Token Crisis)**: Never dump full raw HTML trees into the AI chat context when exploring complex EHR forms. Capture structural accessibility snapshots to local temp files (`test-results/dom-snapshot.txt`) and inspect only the target clinical section.
- **Runtime Baseline Enforcement**: Compare live `data-testid` and ARIA landmarks against `baselines/dom-structure.yaml` via `assertDomMatchesBaseline(page, '<pageKey>')`.
- If a legitimate UI release modifies clinical form controls, update `baselines/dom-structure.yaml` and the corresponding `/pages/*.ts` class in the same atomic commit.

## 5. Failure Triage with Trace & JUnit Artifacts
When a CI or local retry fails, inspect the structured JUnit output (`test-results/junit-results.xml`) or trace zip instead of re-running blindly:
```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```
