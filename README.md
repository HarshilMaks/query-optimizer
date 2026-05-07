# QuerySage

> **Multi‑tenant PostgreSQL Performance Platform**

---

## 1. What QuerySage Is
QuerySage is a production‑grade advisory platform that continuously monitors PostgreSQL instances, detects slow queries, runs `EXPLAIN ANALYZE`, and sends the execution plans to Google Gemini (or compatible LLM) for automated bottleneck analysis and safe optimization suggestions.  All recommendations are presented to the user for review and manual application; the system never mutates customer data on its own.

---

## 2. Problem Statement and Scope
* **Problem** – Database teams spend valuable time hunting down inefficient queries, interpreting raw planner output, and manually crafting indexes or query rewrites.  Errors in DDL can cause outages.
* **Scope** – QuerySage solves the *diagnosis* and *advisory* phases: it ingests queries, analyses plans with AI, scores confidence, and enforces guard‑rail policies before a suggestion can be approved.  It **does not** automatically execute DDL, run migrations, or alter production data.

---

## 3. Core Capabilities (status)
| Capability | Implemented | Notes |
|------------|------------|-------|
| Query ingestion / scanning (`pg_stat_statements`) | ✅ | Reads only, read‑only DB role required |
| `EXPLAIN ANALYZE` + AI analysis | ✅ | Gemini integration; fallback can be added |
| Suggestion lifecycle (pending → approved → applied / dismissed) | ✅ | UI tracks state, CSV export available |
| Guardrail policies & approval gates | ✅ | Configurable per‑tenant policies |
| Validation & confidence scoring | ✅ | Confidence % returned from AI prompt |
| Auth / RBAC / audit / password reset / email verification | ✅ | Netlify Identity + JWT refresh tokens |
| Rate limiting | ✅ | Configurable per‑tenant limits |
| Weekly digest / email surfaces | ✅ | Powered by Resend API |

---

## 4. System Architecture
```
+------------------------+      +-----------------------+
|   Frontend (React 19) |<---->| Netlify Functions API |
|   TanStack Start       |      |   - Auth (JWT)        |
|   Tailwind CSS 4       |      |   - Query endpoints   |
+------------------------+      |   - Suggestion logic |
        |                         +-----------------------+
        |                                   |
        v                                   v
+----------------------+       +-------------------------+
|  Netlify Blobs (KV)  |<----->|  PostgreSQL (read‑only) |
|  Encrypted secrets   |       |  pg_stat_statements      |
+----------------------+       +-------------------------+
        ^                                   ^
        |                                   |
        |   AI Integration (Gemini)          |
        +-----------------------------------+
```
* **Frontend** – TanStack Start + TanStack Router provides type‑safe, file‑based routing.
* **API layer** – Netlify Functions run on the edge, exposing a REST‑style JSON API.
* **Storage** – Connection credentials are stored encrypted in Netlify Blobs; suggestions, audits, and policies are persisted there as well.
* **Multi‑tenant context** – Each request carries a tenant identifier derived from the authenticated user; all data is isolated per tenant.

---

## 5. Security and Compliance Model
| Aspect | Detail |
|--------|--------|
| **Auth strategy** | JWT access token + refresh token issued by Netlify Identity. Tokens are short‑lived (15 min) and rotated via refresh endpoint. |
| **RBAC** | Roles: `admin`, `engineer`, `viewer`. Permissions are enforced in the API layer for each endpoint. |
| **Audit logging** | Every API call, suggestion creation, approval, and dismissal is logged to Netlify Blobs with timestamps and user ID. |
| **Encryption** | Connection strings encrypted at rest using AES‑256‑GCM (`ENCRYPTION_KEY`). Keys are never stored in the repo. |
| **Rate limiting** | Per‑tenant request quota (configurable, default 500 req/min). Exceeded limits return `429`. |
| **Data sent to AI** | Only query text, table/column metadata, and the `EXPLAIN ANALYZE` JSON. No literal values or personally identifiable information are transmitted. |
| **Least‑privilege DB guidance** | Deploy a dedicated PostgreSQL role with `SELECT` on `pg_stat_statements` and permission to run `EXPLAIN`. No `INSERT/UPDATE/DELETE` rights. |

---

## 6. Data Model and Storage
```
User
 └─ Session
Connection (encrypted credentials)
 └─ Tenant (multi‑tenant identifier)
Query
 └─ Analysis (EXPLAIN JSON, AI summary, confidence)
Suggestion
 └─ Approval (status, approver, timestamp)
Policy (guardrails, rate limits)
AuditLog (event, actor, timestamp)
```
* **Retention** – Audits are retained 90 days; suggestions are kept 180 days. Data older than the retention window is securely deleted.
* **Privacy** – Plain query text is never persisted after analysis; only the anonymised plan is stored.

---

## 7. API Overview
| Domain | Endpoint(s) | Auth Required |
|--------|------------|--------------|
| Auth | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/password-reset` | No (credential) |
| Connections | `GET /api/connections`, `POST /api/connections` | ✅ (role `engineer`/`admin`) |
| Queries | `GET /api/queries`, `GET /api/queries/:id` | ✅ |
| Analyses | `GET /api/analyses/:queryId` | ✅ |
| Suggestions | `GET /api/suggestions`, `POST /api/suggestions/:id/approve`, `POST /api/suggestions/:id/dismiss` | ✅ (policy enforced) |
| Policies | `GET /api/policies`, `PUT /api/policies/:id` | ✅ (admin) |
| Audits | `GET /api/audits` | ✅ (admin) |
| Admin | `GET /api/health`, `GET /api/metrics` | ✅ (admin) |

---

## 8. Local Development
**Prerequisites**
1. Node 18+  
2. Netlify CLI (`npm i -g netlify-cli`)  
3. PostgreSQL 15+ with `pg_stat_statements` enabled.

**Installation**
```bash
git clone https://github.com/your-org/querysage.git
cd querysage
npm install
```

**Environment variables** – placed in a `.env` at the project root:
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | Recommended | (generated dev key) | AES‑256‑GCM key for Blob encryption |
| `GEMINI_API_KEY` | **Required** | – | Google Gemini API credentials |
| `RESEND_API_KEY` | Optional | – | Enables weekly digest emails |
| `PORT` | Optional | `8888` | Netlify dev server port |
| `RATE_LIMIT` | Optional | `500` | Requests per minute per tenant |

**Running locally**
```bash
netlify dev   # starts functions, blobs emulation, and frontend on http://localhost:8888
```
**Caveats** – Netlify dev emulates Edge Functions but does not provide true edge latency; Blobs are stored in a local filesystem fallback.

---

## 9. Configuration (Environment Variables)
See the table above. In production, set these variables in the Netlify UI under **Site settings → Build & deploy → Environment**.

---

## 10. Deployment (Production)
1. Push your repository to GitHub (or GitLab).
2. Connect the repo to Netlify (Site → **Deploys → Link repository**).
3. Add required environment variables (`ENCRYPTION_KEY`, `GEMINI_API_KEY`, optional `RESEND_API_KEY`).
4. Netlify will run `vite build` (as defined in `netlify.toml`) and publish `dist/client`.

**Post‑deploy smoke checks**
- `GET /api/health` returns `200 OK`.
- Verify a test connection can be added via the UI.
- Confirm a sample query yields a suggestion and that the suggestion appears in the audit log.

---

## 11. Operations Runbook
### Health Checks
| Check | Expected | Method |
|-------|----------|--------|
| HTTP `/` | 200 + HTML | `curl -f https://<site>.netlify.app/` |
| API health (`/api/health`) | `{status:"ok"}` | `curl https://<site>.netlify.app/api/health` |
| Blob read/write | Success | Internal `/api/internal/ping` endpoint |
| DB connectivity | `SELECT 1` succeeds | Netlify function log tail |
| AI latency | < 500 ms | Monitor function logs |

### Logs & Metrics
- **Netlify Function Logs** – streamed to the Netlify UI; also aggregated to Logflare if configured.
- **Prometheus endpoint** – `/api/metrics` exposes request counts, error rates, and latency histograms.
- **Sentry** (optional) – captures uncaught exceptions.

### Common Failure Modes & Recovery
| Symptom | Likely cause | Recovery |
|---------|--------------|----------|
| No suggestions | `pg_stat_statements` disabled or empty | Enable extension, grant `pg_read_all_stats` to the service role |
| 429 from Gemini | API quota exhausted | Request higher quota or enable exponential back‑off; temporarily disable digests |
| Blob permission error | `ENCRYPTION_KEY` mismatch | Re‑set the key, run migration script `npm run migrations:rekey` |
| Startup hangs | Missing `GEMINI_API_KEY` | Add key to `.env` or Netlify env vars, restart dev server |

### Incident Checklist
1. Ping `/api/health` and `/api/internal/ping`.
2. Review latest Netlify function logs for errors.
3. Test DB connectivity with `psql` using the service role credentials.
4. Check Gemini API status on Google Cloud console.
5. Restart Netlify dev (`netlify dev --restart`) or trigger a fresh Netlify deploy.

---

## 12. Testing and Release Quality Gates
**Automated testing**
- Unit tests: `npm test` (≥ 90 % coverage). 
- Integration tests: `npm run test:integration` against a Dockerized PostgreSQL with `pg_stat_statements`. 
- End‑to‑end UI tests: `npm run cypress:run`.

**Security checks**
- Lint & type‑check: `npm run lint`.
- Dependency audit: `npm audit` (must have no high‑severity findings). 
- Secrets scan: `git secrets --scan`.

**Release checklist**
1. All CI jobs pass. 
2. Lint and audit clean. 
3. Docs (README, API spec) updated. 
4. Version bump following semver. 
5. Deploy to a staging Netlify site and run smoke checks.

---

## 13. Known Limitations
- **AI payload size** – Gemini limits request bodies to ~2 MiB; extremely large plans are truncated.
- **Read‑only only** – System never applies DDL; customers must manually run generated statements.
- **Single‑tenant dev mode** – Local dev uses a hard‑coded encryption key; multi‑tenant isolation is only enforced in production.
- **PostgreSQL version** – Tested on 15.x; newer features from 16+ are not yet supported.

---

## 14. Roadmap
| Milestone | Target | Description |
|-----------|--------|-------------|
| v1.1 | Q3 2026 | RBAC integration with Netlify Identity; audit‑log UI improvements |
| v1.2 | Q4 2026 | PostgreSQL 16 planner enhancements (incremental sort, partition pruning) |
| v2.0 | Q2 2027 | Pluggable AI back‑ends (OpenAI, Anthropic) and configurable prompts |
| v2.1 | Q3 2027 | Real‑time streaming of AI analysis via Server‑Sent Events |

---

## 15. Contributing
1. Fork the repository and create a feature branch (`git checkout -b feat/xyz`).
2. Write tests for any new code.
3. Run the full test matrix (`npm test && npm run test:integration && npm run cypress:run`).
4. Lint (`npm run lint`) and ensure no new warnings.
5. Open a PR with a clear description; reviewers will enforce the security and quality gates.

---

## 16. License
© 2024‑2026 QuerySage Contributors. Distributed under the **MIT License**. See `LICENSE` for full terms.
