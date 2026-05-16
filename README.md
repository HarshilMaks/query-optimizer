# QuerySage

QuerySage is a multi-tenant PostgreSQL query optimization platform. It captures slow queries, analyzes execution plans, generates AI-assisted optimization suggestions, enforces guardrails and approvals, and keeps an auditable operational trail.

## What this product is for

QuerySage is built for platform teams, DBAs, and backend engineers who need a safer and more repeatable workflow for query performance improvement.

Primary outcomes:

- Detect slow or expensive queries quickly.
- Understand root-cause bottlenecks from execution plans.
- Generate optimization suggestions with clear rationale.
- Validate improvements before rollout.
- Enforce governance through RBAC, policy guardrails, approvals, and audit history.

## Scope and non-goals

In scope:

- Recommendation lifecycle: detect, analyze, approve, apply tracking, validate, audit.
- Authentication and authorization for a multi-tenant platform.
- Policy-based controls on risky suggestions.

Out of scope:

- Automatic execution of optimization SQL in customer databases.
- Complete identity federation and social account linking (partially implemented).
- Full production-hardening of every auth flow persistence path (some MVP paths still in-memory).

## Current implementation status

| Area | Status | Notes |
| --- | --- | --- |
| Slow query ingestion and dashboarding | Implemented | Query/runs workflows available |
| EXPLAIN + AI analysis | Implemented | Gemini-based analysis and suggestion generation |
| Suggestion lifecycle + approvals + audit | Implemented | Policy and approval APIs available |
| Validation engine | Implemented | Before/after capture with confidence scoring |
| Core auth (JWT, refresh, RBAC) | Implemented | Includes tenant-aware schema hardening |
| Password reset | Implemented (MVP) | Flow exists; persistence path is not fully durable yet |
| Email verification | Implemented (MVP) | Flow exists; persistence path is not fully durable yet |
| Account settings UI | Implemented (MVP) | Profile/password/security screens present |
| Session management UI (view/revoke active sessions) | Planned | Pending |
| GitHub OAuth integration | Planned | Pending end-to-end implementation |

## Architecture overview

```text
Frontend (TanStack Start + React)
  -> API layer (Netlify Functions)
    -> Domain services (auth, guardrails, analysis, validation)
      -> Storage
         - Netlify Blobs (operational objects, audit chain, suggestions, runs)
         - PostgreSQL (users, sessions, audit_logs, validation DB access)
      -> AI provider (Gemini) for execution-plan analysis
```

## Core workflows

### Query optimization lifecycle

1. Connect PostgreSQL datasource.
2. Scan and ingest slow query signals.
3. Run EXPLAIN and AI analysis.
4. Generate suggestions.
5. Enforce policy decision: allow, block, or require approval.
6. Track apply/dismiss actions.
7. Run validation and compare before/after metrics.
8. Review audit timeline.

### Authentication lifecycle

1. Signup/login issues access + refresh tokens.
2. Protected endpoints enforce auth and role checks.
3. Refresh endpoint rotates token pair.
4. Password reset and email verification support account recovery and verification.

## Security model

- JWT-based authentication with role-aware middleware (`admin`, `editor`, `viewer` model in code).
- Tenant-aware request context and tenant-aware schema constraints/indexes.
- Session model includes tenant-safe FK (`sessions.user_id, sessions.tenant_id -> users.id, users.tenant_id`).
- Audit events for key mutable workflows.
- Rate limiting on auth-sensitive endpoints.
- Encrypted connection secret handling through `ENCRYPTION_KEY`.

Operational boundary:

- QuerySage is advisory-first. Suggested SQL is not auto-executed on customer databases by backend automation.

## API overview

Main route groups:

- Auth: `/api/auth/*`, `/api/auth/password/*`, `/api/auth/verify/*`
- Connections: `/api/connections*`, `/api/connections/:id/test`
- Queries: `/api/queries*`, `/api/queries/:id/explain`, `/api/queries/:id/analyze`
- Suggestions and approvals: `/api/suggestions*`, `/api/approvals*`
- Guardrails/policy: `/api/policies*`
- Audit: `/api/audit/events`, `/api/audit/recommendations/:id/timeline`
- Runs and validation: `/api/runs*`, `/api/validation`, `/api/validations`
- Admin: `/api/admin/migrate`, `/api/admin/reset`

## Environment configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes for DB-backed auth/migrations | PostgreSQL connection for users/sessions/audit tables |
| `POSTGRES_URL` | Optional fallback | Used by validation engine if `DATABASE_URL` is absent |
| `JWT_SECRET` | Yes in production | JWT signing secret |
| `ENCRYPTION_KEY` | Yes in production | Encryption key for stored connection secrets |
| `GEMINI_API_KEY` | Yes for AI analysis | Gemini provider credential |
| `RESEND_API_KEY` | Optional | Weekly digest email delivery |
| `EMAIL_FROM` | Optional | Sender identity for transactional emails (defaults to `QuerySage <onboarding@resend.dev>`) |

## Local development

Install dependencies:

```bash
npm install
```

Run frontend-only dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

For full function/runtime parity (including Netlify Blobs behavior), use Netlify runtime locally:

```bash
npx netlify dev
```

## Production deployment guide

1. Configure required environment variables in your hosting platform.
2. Deploy using `vite build`.
3. Run migrations through `/api/admin/migrate` with admin auth, or apply migration SQL directly.
4. Execute smoke checks:
   - login and refresh token flow
   - protected endpoint authorization behavior
   - query scan and analysis path
   - audit event visibility
5. Enable optional email features (`RESEND_API_KEY`) after core checks pass.

## GitHub OAuth setup guidance (planned integration)

OAuth user-linking endpoints are not fully implemented yet. Production setup should follow:

1. Register a GitHub OAuth app.
2. Set callback URL to your production auth callback endpoint.
3. Store client ID and secret in environment variables.
4. Implement callback flow:
   - exchange code for access token
   - fetch user identity
   - link/create QuerySage user
   - issue QuerySage tokens and create session
5. Add account link/unlink UX and audit events.

## Settings page user guide

Current settings UX includes:

- Connection management (test, edit, delete).
- Profile editing.
- Password change form integration (`/api/auth/password/change`).
- Security view from token claims.
- OAuth connection toggle UI (MVP local-state behavior).
- Admin danger-zone full data reset.

## Known limitations

- Some auth-adjacent flows still use in-memory token/code storage in MVP paths.
- OAuth account linking and active-session revoke UI are pending.
- Local E2E parity for some function paths depends on Netlify runtime configuration.
- Password hashing is simplified in parts of the auth path and should be upgraded to full bcrypt workflow end-to-end.

## Roadmap focus

Near-term priorities:

1. Session management (view and revoke active sessions).
2. GitHub OAuth integration end-to-end.
3. Durable persistence for reset/verification token flows.
4. End-to-end auth regression suite.
5. Phase 6 operations: structured logs, metrics, alerting.
