# QuerySage Hardening Plan

## Problem Statement

The project has real integrations (Postgres, Gemini, Blobs, Resend) and a working optimization workflow, but it still lacks critical pieces to be a production-grade optimizer: contract correctness in some endpoints, recommendation validation, measurable proof of impact, automation, and multi-tenant hardening.

## Proposed Approach

Deliver in staged phases:

1. Fix correctness and contract mismatches first.
2. Implement validation + measurement as the core trust loop.
3. Add automation and operations.
4. Harden for multi-tenant reliability and scale.

## Todos

1. **Endpoint contract fixes**
   - Align suggestion update/dismiss API path and ID handling.
   - Ensure frontend/backend request contract is consistent and tested.

2. **Feature completeness cleanup**
   - Remove or implement placeholder actions in settings.
   - Persist or remove UI-only controls that imply backend behavior.

3. **Schema and type safety**
   - Add shared request/response schemas.
   - Replace high-risk `any` usage in core API paths.

4. **Validation pipeline**
   - Introduce recommendation validation workflow in safe execution context.
   - Capture validation runs and results per recommendation.

5. **Impact measurement**
   - Record before/after metrics and computed improvement.
   - Add verified/unverified states with confidence scoring.

6. **Automation**
   - Add scheduled scan/analyze jobs.
   - Execute digest schedules from saved configuration.

7. **Auth and tenancy**
   - Add user/tenant identity.
   - Scope storage keys and rate limits by tenant.

8. **Scalability and observability**
   - Add pagination/query optimization for list endpoints.
   - Add structured logs and error/audit visibility.

## Notes

- The core architecture is viable; the missing trust loop (validate + measure + rank by evidence) is the main blocker to claiming production optimization value.
- Priority should remain correctness and proof over adding more UI features.
