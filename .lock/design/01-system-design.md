# System Design
# Postgres Performance Guardrail Platform

## 1. Runtime Components

1. **Control Plane API**
   - AuthN/AuthZ
   - Tenant routing
   - Policy/recommendation/approval/audit endpoints
2. **Scan Worker**
   - Scheduled/on-demand query signal collection
   - Regression detection
3. **Recommendation Worker**
   - Deterministic rule engine
   - Model-assisted recommendation generation
4. **Policy and Risk Engine**
   - Guardrail evaluation
   - Risk/confidence scoring
5. **Validation Worker**
   - Safe validation run orchestration
   - Before/after benchmark collection
6. **Approval Service**
   - Queue lifecycle
   - Reviewer decisions
7. **Audit Service**
   - Append-only event recording
   - Decision timeline reconstruction

---

## 2. Deployment Topology

```text
Client UI / API Consumers
         |
         v
  Control Plane API
         |
   +-----+------------------------------+
   |                                    |
   v                                    v
Queue / Job Orchestrator            Data Store
   |                                    |
   +-> Scan Worker                      +-> Tenant, Policy, Recommendation
   +-> Recommendation Worker            +-> Validation, Approval
   +-> Validation Worker                +-> Audit Events (append-only)
```

---

## 3. Primary Workflows

## Workflow A: Detection to Actionability

1. Scan worker creates `ScanRun`
2. Issues created (`DetectedIssue`)
3. Recommendation worker emits `Recommendation`
4. Policy engine emits `PolicyDecision + RiskAssessment`
5. Recommendation becomes:
   - `blocked`
   - `approval_required`
   - `eligible_for_validation`

## Workflow B: Validation

1. Validation request created for recommendation
2. Validation worker runs controlled experiment
3. `ValidationRun` and `MeasuredImpact` stored
4. Recommendation status updated with verdict:
   - `validated`
   - `inconclusive`
   - `failed_validation`

## Workflow C: Approval and Finalization

1. Approval queue receives item
2. Reviewer approves/rejects with reason
3. Decision event emitted (append-only)
4. Final recommendation decision persisted

---

## 4. Component Boundaries

## Control Plane API owns:

- request validation
- identity and tenant context
- command routing
- read models for UI

## Workers own:

- compute-heavy operations
- retries and idempotent execution
- long-running actions

## Audit service owns:

- write-once event store
- timeline projection

---

## 5. Reliability Design

1. Every job has `run_id` + `correlation_id`
2. Job handlers are idempotent by `(tenant_id, entity_id, operation_key)`
3. State transitions are atomic and event-backed
4. Failed jobs move to retry queue with capped exponential backoff
5. Dead-letter queue for manual inspection

---

## 6. Security Design

1. Tenant context resolved server-side (never trusted from client alone)
2. Connector secrets encrypted at rest
3. Least-privilege DB access role for scan/analysis paths
4. Authorization checks for every write path
5. Immutable audit events for all critical transitions

---

## 7. Observability Design

1. Structured logs: `tenant_id`, `run_id`, `entity_id`, `stage`
2. Metrics:
   - scan duration
   - recommendation generation duration
   - policy reject rate
   - validation success rate
   - approval queue depth
3. Traces:
   - API request -> worker job -> data writes -> audit event

---

## 8. Failure Handling

1. Model response failure -> fallback to deterministic-only mode
2. Validation timeout -> mark `inconclusive`, keep recommendation non-actionable
3. Policy engine unavailable -> fail closed (no actionability granted)
4. Audit write failure -> reject final state transition

