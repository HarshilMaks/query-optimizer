# QuerySage Project Audit: Current State, Integrations, Gaps, and Implementation Plan

## Executive Summary

QuerySage is a **real integrated MVP**, not just an LLM prompt wrapper.  
It already implements a full pipeline:

1. Connect to real PostgreSQL instances
2. Pull slow queries from `pg_stat_statements`
3. Run `EXPLAIN ANALYZE`
4. Send execution context to Gemini for recommendations
5. Track suggestion lifecycle and export/report outcomes

However, it is **not yet production-grade** for the claim:  
**“automatically find expensive queries and prove which fixes actually work.”**

The biggest missing capability is a **validation and measurement loop** (before/after proof).

---

## What Is Implemented Today

## Frontend (TanStack Start + React)

- Route-driven UI:
  - `/` (landing)
  - `/connect` (database onboarding)
  - `/dashboard` (slow query table + actions)
  - `/query/:id` (query detail + plan visualization + AI output)
  - `/suggestions` (all recommendations + lifecycle controls)
  - `/digest` (weekly digest preview + config)
  - `/settings` (connection management + account/config placeholders)
- Shared app shell and components:
  - Sidebar navigation
  - Status badges and stat cards
  - Skeleton/loading patterns
- API abstraction in `src/lib/api.ts` for all server calls.

## Backend (Netlify Functions)

- Connection APIs:
  - Create/list/get/update/delete connections
  - Connection test endpoint
- Query APIs:
  - Refresh slow queries from Postgres
  - Query detail aggregation
  - Explain endpoint
  - AI analyze endpoint
- Suggestions APIs:
  - List/filter suggestions
  - Apply suggestion
  - Export CSV
- Digest APIs:
  - Get digest preview data/settings
  - Save settings
  - Send digest email

## Storage

- Netlify Blobs-backed key-value store with prefixes:
  - `conn/`
  - `query/`
  - `explain/`
  - `analysis/`
  - `suggestion/`
  - `digest-settings`

## Security and Safety

- Connection passwords encrypted at rest using AES-256-GCM.
- App does not auto-run optimization SQL on customer DB.
- `EXPLAIN ANALYZE` runs inside transaction with rollback pattern.
- AI usage rate-limited in backend.

## Integrations (Real)

- **PostgreSQL (`pg`)**: live connectivity + stats + explain execution.
- **Gemini (`@google/genai`)**: structured recommendation generation.
- **Netlify Blobs**: persistent state.
- **Resend**: digest email delivery.
- **Netlify runtime**: serverless API hosting path (`/api/*`).

---

## Current Gaps and Weaknesses

## A) Functional Bugs / Broken Behavior

1. Suggestion dismiss/update path mismatch:
   - Frontend sends `PUT /api/suggestions?id=<id>`
   - Backend parses ID as if path-based for `/api/suggestions`
   - Result: update/dismiss may fail or behave incorrectly.

2. “Delete all data” in settings is a placeholder action (not implemented).

## B) Missing for “Real Optimizer” Claim

1. No validation pipeline:
   - No automatic verification of suggestions in safe environment/replica.
2. No before/after measurement:
   - No recorded proof that a recommendation improved latency/cost.
3. No confidence/risk scoring:
   - Suggestions are generated but not policy-gated by evidence thresholds.
4. No continuous automation loop:
   - Manual refresh and manual analysis; no scheduled optimization cycle.

## C) Production Readiness Risks

1. No auth and tenant scoping model in current data layer/workflow.
2. Heavy `any` usage reduces reliability and validation guarantees.
3. Blob-prefix scans and in-memory joins will degrade with scale.
4. Settings/notifications UI includes non-persisted or partially implemented controls.
5. Messaging/UX should clearly distinguish:
   - “No auto-apply optimization SQL”
   - vs “App executes safe diagnostic SQL (stats + explain).”

---

## What Must Be Implemented Next (Priority Order)

## P0 — Correctness and Trust

1. Fix suggestions update/dismiss endpoint contract (single canonical path + ID source).
2. Remove/replace placeholders with real implementations or hide features until implemented.
3. Introduce shared request/response schemas and runtime validation.

## P1 — Proof Loop (Core Product Value)

1. Add validation workflow for each recommendation:
   - Candidate change
   - Controlled test run
   - Captured metrics
2. Store before/after measurements:
   - Mean/p95/p99 latency
   - Buffers/rows/cost deltas
3. Add recommendation confidence score and “verified/unverified” states.

## P2 — Continuous Operation

1. Add scheduled scan/analyze jobs.
2. Add scheduled digest execution based on saved day/hour settings.
3. Add failure/retry handling and run logs.

## P3 — Multi-tenant and Scale Hardening

1. Add authentication and tenant-scoped storage keys.
2. Add per-tenant rate limits/quotas.
3. Add pagination and indexing strategy for large datasets.

## P4 — Developer Quality

1. Reduce `any` usage; define domain types.
2. Add integration tests for API contracts and status transitions.
3. Add observability (structured logs + health/error dashboards).

---

## Target State Definition (When It Is “Not a Demo”)

QuerySage should be considered production-ready when it can:

1. Continuously detect high-impact slow queries automatically.
2. Generate recommendations with traceable evidence.
3. Validate recommendations in a safe pipeline.
4. Quantify real measured improvements.
5. Rank and surface only high-confidence, high-impact actions.
6. Operate with tenant isolation, auditability, and operational reliability.

---

## Status Conclusion

Today: **Real integrated MVP**.  
Target: **Production optimization system with proof and policy**.

The core foundation is strong, but the validation/proof loop and production hardening are required to fully match the stated vision.
