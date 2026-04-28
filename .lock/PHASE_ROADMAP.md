# Postgres Guardrails Platform - Phase Roadmap

Based on PRD, Architecture, and Release Readiness docs:

## Completed Phases

### ✅ Phase 0: Foundation & Planning (DONE)
- Architecture decisions locked in `.lock/`
- PRD, ARD, Design docs created
- Security threat model defined
- SLO/SLA/runbook documented

### ✅ Phase 1: Guardrail Foundation (DONE)
- Risk scoring algorithm
- Policy decision logic
- Immutable audit trail (SHA256 chaining)
- Basic UI for guardrails/approvals/audit
- Rebranding to "Postgres Guardrails"
- Build verification passed

### ✅ Phase 2: Multi-Tenant Hardening & Enforcement (DONE)
- Request context extraction (tenant/actor)
- Multi-tenant isolation on all endpoints
- Policy enforcement at apply layer
- Scan orchestration (api-runs-scan.mts)
- Approval workflow endpoints
- Admin reset endpoint
- UI gating on query detail
- Security audit passed
- Build verification passed

---

## Remaining Phases

### ⏳ Phase 3: Validation Engine & Evidence (PENDING)
**Objective**: Implement "safe validation paths" and "before/after metrics"

**Scope**:
- Safe test context (isolated query execution)
- Before/after benchmarking logic
- Confidence scoring algorithm
- Validation result storage and display
- Integration with approval workflow (show metrics before approving)

**Components Needed**:
- Validation execution engine (netlify function)
- Test database sandbox setup
- Query execution and timing capture
- Result aggregation and comparison logic
- UI to display validation results + metrics

**Release Readiness Requirement**: 
- "Validation pipeline produces before/after metrics"
- "Confidence score is present for actionable recommendations"
- "High-risk recommendations are blocked or approval-gated" (done in Phase 2)

**Estimated Effort**: ~3-4 weeks

---

### ⏳ Phase 4: Authentication & Authorization (PENDING)
**Objective**: Production-grade AuthN/AuthZ instead of header-based context

**Scope**:
- Integration with auth provider (OAuth2, Netlify Identity, etc.)
- Role-based access control (RBAC)
- User/team/org hierarchy
- Permission checks on all endpoints
- API token support for CLI/integrations

**Components Needed**:
- Auth middleware
- Permission check helpers
- User/org/role schema updates
- Login/logout UI flows
- API token management endpoint

**Release Readiness Requirement**:
- "AuthN/AuthZ verified for all endpoints"

**Estimated Effort**: ~2-3 weeks

---

### ⏳ Phase 5: Validation & Testing Framework (PENDING)
**Objective**: Ensure all critical paths are tested

**Scope**:
- Unit tests for guardrails, audit, request-context
- Integration tests for policy enforcement
- E2E tests for approval workflow
- Load testing (performance targets)
- Security testing (tenant isolation, auth)

**Components Needed**:
- Jest/Vitest test setup
- Test fixtures for suggestions/policies/approvals
- Mock auth/storage for testing
- Performance benchmarks

**Release Readiness Requirement**:
- "Critical state transitions are covered by tests"
- "Policy decisions are reproducible for the same inputs"
- All items in "Correctness Readiness"

**Estimated Effort**: ~2-3 weeks

---

### ⏳ Phase 6: Operations & Monitoring (PENDING)
**Objective**: Production observability and operational readiness

**Scope**:
- Structured logging (JSON format)
- Metrics/telemetry (request count, latency, errors)
- Alert rules (high error rate, auth failures, etc.)
- SLO dashboards
- Incident runbooks
- Health check endpoints

**Components Needed**:
- Logging middleware
- Metrics collection/export
- Monitoring dashboard setup (Datadog/Prometheus/etc.)
- Alert notification channels

**Release Readiness Requirement**:
- "SLO dashboards are live and verified"
- "Alerting rules configured and tested"
- "Correlation IDs visible across API, worker, and audit paths"

**Estimated Effort**: ~1-2 weeks

---

### ⏳ Phase 7: Advanced Features (PENDING)
**Objective**: Enhanced governance and automation

**Scope**:
- Batch approval operations
- Policy templating (pre-built guardrail templates)
- Slack/email notifications
- CLI tool for programmatic access
- Audit export/reporting
- Rollback workflow (reverse applied suggestions)
- Schedule-based auto-scans

**Components Needed**:
- Batch approval endpoints
- Notification service integration
- CLI package (npm)
- Report generation logic
- Scheduling service

**Release Readiness Requirement**:
- "Audit export produces complete decision evidence"

**Estimated Effort**: ~2-4 weeks

---

### ⏳ Phase 8: Production Deployment & Launch (PENDING)
**Objective**: Ready for production use

**Scope**:
- Deployment guide for Netlify
- Environment configuration templates
- Data migration scripts (if any)
- Canary rollout strategy
- Customer onboarding docs
- Support processes

**Components Needed**:
- Deployment automation
- Monitoring during rollout
- Runbooks for common issues
- Customer-facing docs

**Release Readiness Requirement**:
- All 9 release readiness gates passed
- All E2E tests passing
- Production monitoring live

**Estimated Effort**: ~1-2 weeks

---

## Summary

| Phase | Status | Effort | Next? |
|-------|--------|--------|-------|
| 0: Foundation | ✅ DONE | ~1w | - |
| 1: Guardrails | ✅ DONE | ~2w | - |
| 2: Multi-Tenant | ✅ DONE | ~2.5w | - |
| 3: Validation Engine | ⏳ PENDING | ~3-4w | **← NEXT** |
| 4: Auth/AuthZ | ⏳ PENDING | ~2-3w | After Phase 3 |
| 5: Testing Framework | ⏳ PENDING | ~2-3w | In parallel with Phase 4 |
| 6: Monitoring/Ops | ⏳ PENDING | ~1-2w | After Phase 5 |
| 7: Advanced Features | ⏳ PENDING | ~2-4w | After Phase 6 |
| 8: Launch/Deploy | ⏳ PENDING | ~1-2w | Last (gating) |

**Total Remaining Effort**: ~14-21 weeks (3-5 months)

---

## Recommended Next Phase: Phase 3 - Validation Engine

**Why?**
- Completes the core product loop (detect → validate → approve → apply)
- Unblocks approval workflow (users need to see metrics before deciding)
- Required for release readiness (#52, #56)
- High customer value (prove improvements with data)

**What to Build**:
1. Safe query execution sandbox (isolated from production)
2. Before/after metrics collection (query time, rows, execution plan)
3. Confidence scoring (statistical significance of improvement)
4. Result storage + UI display
5. Integration with approval flow

**Start When?**: Ready anytime (no blockers on Phase 2)

