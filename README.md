# QuerySage

> **AI-Powered PostgreSQL Query Optimizer**

## Overview
QuerySage is an intelligent database performance diagnostic tool designed to eliminate the guesswork from PostgreSQL optimization. By connecting directly to your database, QuerySage leverages `pg_stat_statements` to automatically identify your slowest, most resource-intensive queries. It executes `EXPLAIN ANALYZE` on these bottlenecks and passes the execution plans through Google Gemini AI to generate plain-English performance insights, actionable query rewrites, and precise indexing recommendations.

Crucially, QuerySage acts purely as an advisory tool. It **never** executes SQL mutations or DDL commands against your database. It generates `CREATE INDEX CONCURRENTLY` statements and rewritten queries for you to review and apply safely.

## Architecture & Tech Stack

QuerySage is built as a full-stack application using modern React and Edge computing patterns, optimized for deployment on Netlify.

- **Framework & Routing:** [TanStack Start](https://tanstack.com/start/latest) combined with TanStack Router for type-safe, file-based routing.
- **Frontend:** React 19, styled with Tailwind CSS 4.
- **Visualizations:** [React Flow](https://reactflow.dev/) for interactive execution plan tree diagrams and Recharts for performance metrics.
- **AI Integration:** Google Gemini via `@google/genai`.
- **Database Connectivity:** Node.js `pg` driver for secure, read-only metric gathering.
- **Persistence:** Netlify Blobs for low-latency, key-value storage of encrypted connections and suggestion history.
- **Communications:** Resend API for automated weekly performance digests.

## Key Features

- **Automated Slow Query Detection:** Pulls the worst-performing queries directly from `pg_stat_statements`, ranked by mean execution time and call frequency.
- **Visual Execution Plans:** Translates raw `EXPLAIN ANALYZE` JSON output into an interactive, visual tree diagram to easily spot sequential scans and high-cost nodes.
- **AI Bottleneck Analysis:** Sends execution plans to Gemini AI to receive concise, human-readable explanations of performance issues.
- **Smart Index Recommendations:** Generates exact `CREATE INDEX CONCURRENTLY` SQL commands, complete with estimated performance improvements.
- **Query Rewrite Suggestions:** Identifies queries that can be restructured for better PostgreSQL query planner execution.
- **Suggestion History & Workflows:** Track, apply, or dismiss recommendations over time, with full CSV export capabilities.
- **Weekly Digests:** Automated email summaries of your database's health and new optimization opportunities.
- **Secure by Design:** All database passwords are encrypted at rest using AES-256-GCM. Raw credentials are never sent to the AI; only table metadata and query plans are transmitted.

## Getting Started

### Prerequisites
1. **Node.js** (v18+ recommended)
2. **Netlify CLI** (required for local development to emulate Netlify Blobs)
3. A PostgreSQL database with `pg_stat_statements` enabled.

To enable `pg_stat_statements` on your Postgres server, execute the following as a superuser:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
SELECT pg_reload_conf();
```

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root of your project. The following variables are utilized:

| Variable | Requirement | Description |
|----------|-------------|-------------|
| `ENCRYPTION_KEY` | Recommended | A 32-character string used for AES-256 password encryption. If omitted during development, a placeholder is used. |
| `RESEND_API_KEY` | Optional | Required only if you wish to test or enable the weekly email digest feature. |
| `GEMINI_API_KEY` | Required | Your Google Gemini API key. When deployed to Netlify, this can be managed via the Netlify AI Gateway. |

### Development Server

Start the development server using the Netlify CLI to ensure Edge functions and Blobs are properly emulated:

```bash
netlify dev
```
*The application will typically be available at `http://localhost:8888`.*

## Project Structure

```text
├── src/
│   ├── components/  # Reusable UI elements and charts
│   ├── routes/      # TanStack file-based routing definitions
│   │   ├── index.tsx         # Landing page
│   │   ├── connect.tsx       # Database connection management
│   │   ├── dashboard.tsx     # Main dashboard (Slow queries)
│   │   ├── query.$id.tsx     # Query detail & AI Analysis view
│   │   ├── suggestions.tsx   # Aggregated AI recommendations
│   │   └── settings.tsx      # Application configuration
│   ├── router.tsx   # Router configuration
│   └── styles.css   # Global Tailwind configuration
├── netlify.toml     # Netlify deployment configuration
└── vite.config.ts   # Vite & TanStack Start build settings
```

## Deployment

QuerySage is pre-configured for seamless deployment to Netlify. 

1. Connect your GitHub repository to your Netlify account.
2. Set your `ENCRYPTION_KEY`, `RESEND_API_KEY`, and `GEMINI_API_KEY` in the Netlify UI under **Site configuration > Environment variables**.
3. Netlify will automatically detect the build settings via `netlify.toml` (Build command: `vite build`, Publish directory: `dist/client`).

## Security Considerations

- **Read-Only Operation:** QuerySage only requires permission to read `pg_stat_statements` and execute `EXPLAIN`. It is highly recommended to provide QuerySage with a database user that possesses **only** read permissions.
- **Data Privacy:** Only query structure, table schemas, and execution plans are sent to the AI. Ensure your queries do not contain sensitive PII hardcoded as literals.
