# Release Readiness Checklist
# Postgres Performance Guardrail Platform

Use this checklist before any production release.

---

## 1. Product and Scope Readiness

1. Release scope is explicitly documented.
2. Out-of-scope items are deferred and tracked.
3. No placeholder/pretend features are exposed in UI.

---

## 2. Correctness Readiness

1. API contracts are schema-validated and versioned.
2. Critical state transitions are covered by tests.
3. Recommendation lifecycle transitions are deterministic.
4. Policy decisions are reproducible for the same inputs.

---

## 3. Security Readiness

1. AuthN/AuthZ verified for all endpoints.
2. Tenant isolation checks enforced on all data access paths.
3. Secrets encryption and rotation workflow validated.
4. Security logging enabled for privileged actions and denials.

---

## 4. Governance and Audit Readiness

1. All critical actions emit immutable audit events.
2. Approval actions require actor + reason metadata.
3. Audit timeline reconstruction works for sample entities.
4. Audit export produces complete decision evidence.

---

## 5. Reliability and Operations Readiness

1. SLO dashboards are live and verified.
2. Alerting rules configured and tested.
3. Queue/worker retry and dead-letter behavior tested.
4. Incident runbooks are reviewed by on-call owner.

---

## 6. Validation and Trust Readiness

1. Validation pipeline produces before/after metrics.
2. Confidence score is present for actionable recommendations.
3. High-risk recommendations are blocked or approval-gated.
4. No recommendation is marked "safe" without evidence threshold.

---

## 7. Deployment Readiness

1. Rollout strategy selected (canary/gradual/full).
2. Rollback criteria and steps are documented.
3. Database/schema changes are backward-compatible or gated.
4. Correlation IDs are visible across API, worker, and audit paths.

---

## 8. Business Readiness

1. Release notes prepared.
2. Customer-facing behavior changes communicated.
3. Known limitations disclosed.
4. Support/on-call team briefed.

---

## 9. Final Go/No-Go Gate

Release is **No-Go** if any of the below is true:

1. Tenant boundary checks are unverified.
2. Critical actions can occur without immutable audit events.
3. High-risk changes can bypass policy or approval controls.
4. Rollback path is undefined or untested.

