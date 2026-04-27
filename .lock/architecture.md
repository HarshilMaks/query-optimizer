# Postgres Performance Guardrail Platform - Architecture

## 1. Product Definition

This platform prevents risky database performance changes and proves beneficial changes with measurable evidence.

Core promise:

1. Detect performance risk continuously
2. Recommend fixes with evidence
3. Validate safely before production rollout
4. Enforce approvals and policy gates
5. Keep immutable audit records

---

## 2. System Goals

1. **Risk reduction:** prevent harmful indexes/rewrites/config changes
2. **Performance outcomes:** improve latency and resource usage
3. **Governance:** enforce approval workflows and policies
4. **Auditability:** preserve who approved what, when, and why
5. **Operational fit:** integrate with real production database operations

---

## 3. Architecture Principles

1. **Evidence before action:** no "trust me" AI-only recommendations
2. **Policy-first execution:** every action passes guardrails
3. **Human-in-the-loop for high risk:** explicit approval required
4. **Tenant isolation by design:** strict boundary across organizations
5. **Append-only audit trail:** historical events are never rewritten
6. **Safe validation paths:** no unsafe production execution

---

## 4. High-Level Architecture

```text
+-----------------------------+
| Web App / API Consumers     |
| (UI, CLI, Integrations)     |
+-------------+---------------+
              |
              v
+-----------------------------+
| Control Plane API           |
| - AuthN/AuthZ               |
| - Policies                  |
| - Recommendations           |
| - Approvals                 |
| - Audit APIs                |
+------+----------------------+
       |
       +----------------------+
       |                      |
       v                      v
+------------------+   +---------------------+
| Scan + Analysis  |   | Policy Engine       |
| Engine           |   | Risk Scoring        |
| - Query ingest   |   | Guardrail checks    |
| - Explain parse  |   | Decisioning         |
| - AI reasoning   |   +---------------------+
+---------+--------+
          |
          v
+-----------------------------+
| Validation Engine           |
| - Safe test context         |
| - Before/after benchmarks   |
| - Confidence scoring        |
+-------------+---------------+
              |
              v
+-----------------------------+
| Decision Layer              |
| - Auto-approve (low risk)   |
| - Manual approval queue     |
| - Block/hold               |
+-------------+---------------+
              |
              v
+-----------------------------+
| Execution Orchestration     |
| - Controlled rollout        |
| - Verification checks       |
| - Rollback guidance         |
+-------------+---------------+
              |
              v
+-----------------------------+
| Audit + Evidence Store      |
| - Recommendations           |
| - Validation runs           |
| - Approvals                 |
| - Events (append-only)      |
+-----------------------------+
```

---

## 5. Core Subsystems

## 5.1 Ingestion and Detection

- Continuously ingest slow query and execution metadata
- Detect regressions and hotspots
- Produce candidate optimization targets

Outputs:

- `DetectedIssue`
- `ScanRun`
- `RegressionSignal`

## 5.2 Recommendation Engine

- Combine deterministic rules and model-generated insights
- Generate index/rewrite/config recommendations
- Attach rationale and expected impact hypothesis

Outputs:

- `Recommendation`
- `EvidenceBundle`

## 5.3 Policy and Risk Engine

- Evaluate each recommendation against defined policies
- Compute risk score and confidence score
- Assign action state:
  - `blocked`
  - `approval_required`
  - `eligible_for_validation`

Outputs:

- `PolicyDecision`
- `RiskAssessment`

## 5.4 Validation Engine

- Run controlled experiments in safe context
- Capture before/after performance metrics
- Estimate confidence in improvement

Outputs:

- `ValidationRun`
- `MeasuredImpact`
- `ValidationVerdict`

## 5.5 Approval Workflow

- Queue recommendations requiring review
- Record approver identity and reason
- Support reject/approve/expire states

Outputs:

- `ApprovalRequest`
- `ApprovalDecision`

## 5.6 Audit and Compliance Trail

- Append-only event stream for all critical actions
- Preserve full lineage from issue detection to final decision
- Provide export-ready evidence for governance reviews

Outputs:

- `AuditEvent`
- `DecisionTimeline`

---

## 6. Domain Model (Canonical Entities)

1. **Tenant**
2. **Environment** (prod/staging/etc.)
3. **DataSource** (database connection target)
4. **Policy**
5. **ScanRun**
6. **DetectedIssue**
7. **Recommendation**
8. **RiskAssessment**
9. **ValidationRun**
10. **MeasuredImpact**
11. **ApprovalRequest**
12. **ApprovalDecision**
13. **AuditEvent** (append-only)

---

## 7. Decision Lifecycle

1. Detect issue
2. Generate recommendation
3. Run policy checks and risk scoring
4. Validate safely and collect measurements
5. Route decision:
   - Block
   - Manual approval
   - Controlled rollout
6. Verify post-change outcome
7. Persist complete audit trail

---

## 8. Guardrail Categories

1. **Safety guardrails**
   - Disallow unsafe production operations
   - Require low-lock/low-blast-radius strategy
2. **Quality guardrails**
   - Minimum evidence threshold before recommendation is actionable
3. **Governance guardrails**
   - Mandatory approvals for high-risk changes
4. **Operational guardrails**
   - Rate limits, retry policies, failure containment

---

## 9. Security and Tenancy

1. Tenant-scoped data and keys
2. Role-based access control:
   - `viewer`
   - `reviewer`
   - `admin`
3. Encrypted secrets and credentials at rest
4. Signed audit events for integrity
5. Principle of least privilege for all runtime connectors

---

## 10. Non-Functional Requirements

1. **Reliability:** idempotent jobs, retry-safe workflows
2. **Scalability:** queue-based execution for scans and validations
3. **Observability:** metrics, traces, structured logs
4. **Performance:** bounded analysis latency and queue delay
5. **Integrity:** immutable historical evidence chain

---

## 11. Platform Outputs (What Users Actually Consume)

1. Prioritized risk-adjusted recommendation queue
2. Validation report with measured before/after impact
3. Approval board and decision history
4. Audit exports for governance/compliance reviews
5. Trend dashboards: regressions avoided, impact delivered

---

## 12. Scope Boundaries

In scope:

- Performance guardrails, validation, approvals, auditability

Out of scope:

- Acting as a full general-purpose database administration console
- Acting as a full legal/compliance certification authority

---

## 13. Product Positioning Statement

**This platform is the control plane for safe, provable Postgres performance improvements.**

