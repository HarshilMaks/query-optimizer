# Data and API Design
# Postgres Performance Guardrail Platform

## 1. Canonical Entities

1. `Tenant`
2. `Environment`
3. `DataSource`
4. `Policy`
5. `ScanRun`
6. `DetectedIssue`
7. `Recommendation`
8. `RiskAssessment`
9. `ValidationRun`
10. `MeasuredImpact`
11. `ApprovalRequest`
12. `ApprovalDecision`
13. `AuditEvent` (append-only)

---

## 2. Recommendation State Machine

```text
draft
  -> blocked
  -> approval_required
  -> eligible_for_validation
      -> validating
      -> validated
      -> inconclusive
      -> failed_validation
validated
  -> approved
  -> rejected
approved
  -> rolled_out
```

Rules:

1. `blocked` is terminal unless policy changes and recommendation is re-evaluated.
2. `approved` requires a non-null `approval_decision_id`.
3. `rolled_out` requires validated evidence unless emergency override policy exists.

---

## 3. Validation Metrics Model

`MeasuredImpact` fields (minimum):

1. `baseline_mean_ms`
2. `baseline_p95_ms`
3. `candidate_mean_ms`
4. `candidate_p95_ms`
5. `improvement_pct_mean`
6. `improvement_pct_p95`
7. `sample_size`
8. `confidence_score`
9. `verdict` (`validated` | `inconclusive` | `failed`)

---

## 4. Policy Model

`Policy` fields (minimum):

1. `id`
2. `tenant_id`
3. `name`
4. `scope` (environment/type)
5. `rules` (JSON rule set)
6. `enforcement_mode` (`enforce` | `warn`)
7. `active`
8. `version`

Example rule categories:

1. lock risk threshold
2. minimum expected gain threshold
3. validation-required for production rollout
4. mandatory manual approval for high-risk changes

---

## 5. API Design (v1)

## 5.1 Policies

1. `GET /api/v1/policies`
2. `POST /api/v1/policies`
3. `PUT /api/v1/policies/:id`
4. `POST /api/v1/policies/:id/activate`
5. `POST /api/v1/policies/:id/deactivate`

## 5.2 Runs

1. `POST /api/v1/runs/scan`
2. `GET /api/v1/runs/scan/:id`
3. `POST /api/v1/runs/recommendation`
4. `GET /api/v1/runs/recommendation/:id`

## 5.3 Recommendations

1. `GET /api/v1/recommendations`
2. `GET /api/v1/recommendations/:id`
3. `POST /api/v1/recommendations/:id/evaluate-policy`
4. `POST /api/v1/recommendations/:id/request-validation`

## 5.4 Validation

1. `POST /api/v1/validations`
2. `GET /api/v1/validations/:id`
3. `GET /api/v1/recommendations/:id/validation-report`

## 5.5 Approvals

1. `GET /api/v1/approvals`
2. `POST /api/v1/approvals/:id/approve`
3. `POST /api/v1/approvals/:id/reject`

## 5.6 Audit

1. `GET /api/v1/audit/events`
2. `GET /api/v1/audit/recommendations/:id/timeline`
3. `GET /api/v1/audit/export`

---

## 6. Request/Response Contract Requirements

1. All APIs require tenant context from auth token/session.
2. All write operations support idempotency keys.
3. Standard response envelope:
   - `data`
   - `meta`
   - `error` (nullable)
   - `correlation_id`

Error shape:

1. `code`
2. `message`
3. `details`
4. `retryable`

---

## 7. Audit Event Schema

`AuditEvent` minimum fields:

1. `id`
2. `tenant_id`
3. `entity_type`
4. `entity_id`
5. `action`
6. `actor_id`
7. `reason`
8. `timestamp`
9. `metadata`
10. `prev_event_hash` (for tamper-evidence chain)
11. `event_hash`

---

## 8. Data Retention and Integrity

1. Audit events are append-only with no update/delete endpoints.
2. Validation artifacts retained with policy-defined TTL (except governance-critical snapshots).
3. Recommendation and decision records retained for traceability lifecycle.

