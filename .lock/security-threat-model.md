# Security Threat Model
# Postgres Performance Guardrail Platform

## 1. Security Objectives

1. Protect tenant data isolation
2. Protect database credentials and secrets
3. Protect decision integrity (policy, approval, audit)
4. Ensure traceability and tamper-evidence for critical events

---

## 2. Critical Assets

1. Tenant-scoped metadata and recommendation data
2. Data-source credentials/secrets
3. Policy definitions and approval records
4. Validation evidence and impact reports
5. Audit event chain

---

## 3. Trust Boundaries

1. Client/UI boundary -> Control Plane API
2. Control Plane -> Background worker boundary
3. Platform -> Customer database connectors
4. Platform -> Persistence/audit store
5. Tenant boundary (strict logical isolation across all operations)

---

## 4. Threat Actors

1. External attacker without credentials
2. Compromised low-privilege user account
3. Malicious/curious tenant user attempting cross-tenant access
4. Insider misuse of admin capabilities
5. Supply chain/runtime dependency compromise

---

## 5. Threats and Mitigations (STRIDE-oriented)

## Spoofing

Threats:

1. Session/token impersonation
2. Worker identity spoofing

Mitigations:

1. Strong AuthN, signed tokens, short-lived credentials
2. Service identity and signed internal requests
3. Rotation and revocation policies

## Tampering

Threats:

1. Modification of approval outcomes
2. Audit trail mutation

Mitigations:

1. Append-only audit storage
2. Event hash chaining (`prev_event_hash`, `event_hash`)
3. Write-path authorization and immutable event APIs

## Repudiation

Threats:

1. User denies approval/rejection action

Mitigations:

1. Mandatory actor, reason, timestamp, correlation ID on critical actions
2. Immutable audit event recording for all transitions

## Information Disclosure

Threats:

1. Cross-tenant data exposure
2. Secret leakage in logs/responses

Mitigations:

1. Tenant-scoped access checks server-side for every read/write
2. Secret encryption at rest
3. Secrets redaction in logs and UI payloads
4. Least-privilege database access credentials

## Denial of Service

Threats:

1. Job queue saturation
2. Expensive validation abuse

Mitigations:

1. Tenant quotas and rate limits
2. Priority queues and concurrency controls
3. Backoff, circuit breakers, and bounded retries

## Elevation of Privilege

Threats:

1. Viewer becoming reviewer/admin via insecure APIs

Mitigations:

1. RBAC enforced at service layer (not UI only)
2. Privileged actions require explicit role + policy checks
3. Security tests for role boundary enforcement

---

## 6. Security Requirements

1. All secrets encrypted at rest
2. All critical APIs require AuthN + AuthZ
3. All mutating operations emit immutable audit events
4. Tenant boundary checks are mandatory middleware/service guards
5. Security-sensitive actions require reason-captured approvals

---

## 7. Security Logging Requirements

Must log (structured, tenant-safe):

1. Auth failures and permission denials
2. Policy overrides and high-risk approvals
3. Cross-tenant access attempt denials
4. Audit write failures
5. Connector secret create/update/delete events

---

## 8. Incident Response Baseline

1. Detect: security alert trigger
2. Contain: disable affected tokens/keys, isolate tenant scope if needed
3. Eradicate: patch vulnerable path, rotate secrets
4. Recover: restore healthy operations with monitored rollout
5. Postmortem: publish cause, blast radius, remediation, preventive controls

---

## 9. Open Security Design Decisions

1. Key management and rotation mechanism
2. Audit store tamper-resistance implementation details
3. Tenant data encryption strategy at field level
4. Break-glass admin flow and controls

