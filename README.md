# QuerySage 
## AI-Powered Postgres Query Optimizer

QuerySage connects to your PostgreSQL databases, automatically identifies the slowest queries using `pg_stat_statements`, runs `EXPLAIN ANALYZE` on each one, and uses Gemini AI to analyze the execution plan and generate specific index recommendations and query rewrites.

## Features

- **Slow Query Detection** — Pulls the worst queries from `pg_stat_statements` ranked by mean execution time
- **EXPLAIN ANALYZE** — Runs query execution plan analysis and visualizes it as an interactive tree diagram
- **Gemini AI Analysis** — Sends the execution plan to Gemini AI for plain-English bottleneck analysis and index recommendations
- **Index Recommendations** — Generates exact `CREATE INDEX CONCURRENTLY` SQL with estimated improvement percentages
- **Query Rewrite Suggestions** — Identifies queries that can be rewritten for better performance
- **Suggestions History** — Tracks all recommendations with apply/dismiss workflow and CSV export
- **Weekly Digest** — Sends automated email summaries via Resend API
- **AES-256 Encryption** — All database passwords are encrypted at rest before storage

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start + TanStack Router |
| Frontend | React 19, Tailwind CSS 4 |
| AI | Google Gemini (via Netlify AI Gateway) |
| Storage | Netlify Blobs (key-value persistence) |
| Database Client | `pg` (Node.js PostgreSQL driver) |
| Charts | Recharts |
| Execution Plan Tree | React Flow (@xyflow/react) |
| Email | Resend API |
| Deployment | Netlify |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with features and demo |
| `/connect` | Add and manage database connections |
| `/dashboard` | Main dashboard with slow queries table |
| `/query/:id` | Query detail, EXPLAIN ANALYZE, AI analysis |
| `/suggestions` | All AI recommendations across databases |
| `/digest` | Weekly email digest preview and configuration |
| `/settings` | Connection management, notifications, account |

## Running Locally

```bash
# Install dependencies
npm install

# Start development server (uses Netlify CLI for Blobs emulation)
netlify dev
```

The app runs at `http://localhost:8888`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | Recommended | 32-char key for AES-256 password encryption. Defaults to a placeholder in dev. |
| `RESEND_API_KEY` | For email | API key for Resend email service |
| `GEMINI_API_KEY` | Auto (Netlify) | Injected automatically by Netlify AI Gateway |

## Security Notes

- Database passwords are encrypted with AES-256-GCM before storing in Netlify Blobs
- QuerySage **never executes SQL on your database** — all suggestions are copy-and-run
- Only the EXPLAIN ANALYZE plan JSON and table metadata are sent to Gemini AI, never raw credentials
- AI analysis is rate-limited to 20 requests per hour

## Enabling pg_stat_statements

QuerySage requires `pg_stat_statements` to detect slow queries. Run on your PostgreSQL server:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
SELECT pg_reload_conf();
```
