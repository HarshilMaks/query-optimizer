# SLO, SLA, and Runbook
# Postgres Performance Guardrail Platform

## 1. Service Level Indicators (SLIs)

1. API availability
2. API latency (p95/p99)
3. Scan run completion latency
4. Validation run completion latency
5. Approval queue freshness
6. Audit event write success rate

---

## 2. Initial SLO Targets

## Control Plane API

1. Availability: **99.9%** monthly
2. p95 latency (read APIs): **< 800 ms**
3. p95 latency (write APIs): **< 1.2 s**

## Background Workflows

1. Scheduled scan success rate: **>= 99%**
2. Validation run success (non-user-cancelled): **>= 97%**
3. Approval queue item visibility after creation: **< 60 s**

## Audit Integrity

1. Audit event persistence success: **100% for critical state transitions**
2. Missing-audit-event tolerance on critical actions: **0**

---

## 3. SLA Commitments (External)

Initial customer-facing SLA (recommended starting point):

1. Platform availability: **99.5%** monthly
2. Incident acknowledgment:
   - Sev1: **15 min**
   - Sev2: **1 hour**
   - Sev3: **1 business day**

---

## 4. Error Budget Policy

1. Monthly API availability budget for 99.9% SLO: ~43 min
2. If error budget burn > 50% before mid-month:
   - freeze non-critical releases
   - prioritize reliability fixes
3. If error budget exhausted:
   - reliability-only work until recovery threshold met

---

## 5. Alerting Rules (Minimum)

1. API availability below threshold for 5 min
2. p95 latency breach sustained for 10 min
3. Scan failure rate > 5% in rolling hour
4. Validation queue backlog above defined threshold
5. Any critical action without corresponding audit event

---

## 6. Incident Severity Model

1. **Sev1**: core platform unavailable, tenant boundary risk, audit integrity risk
2. **Sev2**: major feature degradation (validation or approvals unstable)
3. **Sev3**: partial degradation, non-critical failures, workaround exists

---

## 7. Operational Runbooks

## Runbook A - API Availability Incident

1. Confirm breadth: all tenants or subset
2. Identify failing dependency/service
3. Apply rollback or traffic shaping
4. Verify recovery metrics
5. Log incident timeline and publish summary

## Runbook B - Validation Pipeline Stalled

1. Check queue depth and worker health
2. Identify stuck run IDs and failure reasons
3. Restart/resume idempotent jobs
4. Drain backlog with temporary scaling
5. Validate queue returns to SLO

## Runbook C - Missing Audit Event Detected

1. Freeze related mutating actions
2. Trace correlation IDs for affected workflows
3. Restore guaranteed audit-write path
4. Backfill event gap only if cryptographically traceable
5. Publish incident with integrity impact assessment

## Runbook D - Tenant Boundary Alert

1. Isolate affected endpoints/features immediately
2. Revoke suspect tokens/credentials
3. Verify blast radius and access logs
4. Patch boundary check failure
5. Rotate relevant secrets and notify impacted tenants

---

## 8. Post-Incident Requirements

1. Incident report within 48 hours
2. Root cause, blast radius, and corrective actions documented
3. At least one preventive control added per Sev1/Sev2 incident
4. SLO/SLA thresholds reviewed when recurring patterns emerge

