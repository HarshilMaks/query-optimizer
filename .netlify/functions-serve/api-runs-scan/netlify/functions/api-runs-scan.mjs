
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


// netlify/functions/lib/audit.ts
import { createHash, randomUUID } from "crypto";

// netlify/functions/lib/storage.ts
import { getStore } from "@netlify/blobs";
var store = getStore({ name: "querysage", consistency: "strong" });
async function listByPrefix(prefix) {
  const { blobs } = await store.list({ prefix });
  if (blobs.length === 0) return [];
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}
async function getItem(key) {
  return store.get(key, { type: "json" });
}
async function setItem(key, value) {
  await store.setJSON(key, value);
}
function connKey(id) {
  return `conn/${id}`;
}
function queryKey(id) {
  return `query/${id}`;
}
function auditKey(id) {
  return `audit/${id}`;
}
function runKey(id) {
  return `run/${id}`;
}

// netlify/functions/lib/audit.ts
function hashEvent(input) {
  return createHash("sha256").update(input).digest("hex");
}
async function appendAuditEvent(payload) {
  const tenantId = payload.tenant_id ?? "default";
  const events = await listByPrefix("audit/");
  const latest = events.filter((e) => e.tenant_id === tenantId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const id = randomUUID();
  const prev = latest?.event_hash ?? null;
  const body = JSON.stringify({
    id,
    tenant_id: tenantId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id ?? "system",
    reason: payload.reason ?? "",
    metadata: payload.metadata ?? {},
    timestamp,
    prev_event_hash: prev
  });
  const eventHash = hashEvent(body);
  const event = {
    id,
    tenant_id: tenantId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id ?? "system",
    reason: payload.reason ?? "",
    metadata: payload.metadata ?? {},
    timestamp,
    prev_event_hash: prev,
    event_hash: eventHash
  };
  await setItem(auditKey(id), event);
  return event;
}

// netlify/functions/lib/pg-client.ts
import pg from "pg";

// netlify/functions/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
function getKey() {
  const key = process.env.ENCRYPTION_KEY ?? "querysage-default-key-change-me!!";
  return Buffer.from(key.padEnd(32, "!").slice(0, 32));
}
function decrypt(encryptedText) {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText;
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// netlify/functions/lib/pg-client.ts
var { Pool } = pg;
function buildPool(conn, password) {
  const sslConfig = conn.ssl_mode === "disable" ? false : { rejectUnauthorized: false };
  return new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database_name,
    user: conn.username,
    password,
    ssl: sslConfig,
    connectionTimeoutMillis: 1e4,
    max: 1
  });
}
async function getSlowQueries(conn) {
  let pool = null;
  try {
    const password = decrypt(conn.password_encrypted);
    pool = buildPool(conn, password);
    const client = await pool.connect();
    try {
      const extRes = await client.query(`
        SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') as enabled
      `);
      if (!extRes.rows[0].enabled) {
        return { queries: [], error: null, pgStatEnabled: false };
      }
      const result = await client.query(`
        SELECT
          queryid::text AS query_hash,
          query AS query_text,
          mean_exec_time AS mean_exec_time_ms,
          calls AS total_calls,
          total_exec_time AS total_exec_time_ms,
          stddev_exec_time,
          min_exec_time,
          max_exec_time,
          NOW() AS last_seen_at
        FROM pg_stat_statements
        WHERE calls > 3
          AND mean_exec_time > 100
          AND query NOT ILIKE '%pg_stat_statements%'
          AND query NOT ILIKE '%EXPLAIN%'
          AND query NOT ILIKE '%pg_extension%'
        ORDER BY mean_exec_time DESC
        LIMIT 50
      `);
      return { queries: result.rows, error: null, pgStatEnabled: true };
    } finally {
      client.release();
    }
  } catch (err) {
    return { queries: [], error: err instanceof Error ? err.message : "Query failed", pgStatEnabled: false };
  } finally {
    if (pool) await pool.end().catch(() => {
    });
  }
}

// netlify/functions/lib/query-ingest.ts
async function refreshConnectionQueries(connId) {
  const conn = await getItem(connKey(connId));
  if (!conn) return { saved: [], pgStatEnabled: false, error: "Connection not found" };
  const { queries, error, pgStatEnabled } = await getSlowQueries(conn);
  if (!pgStatEnabled) return { saved: [], pgStatEnabled: false, error: null, connection: conn };
  if (error) return { saved: [], pgStatEnabled: true, error, connection: conn };
  const existing = (await listByPrefix("query/")).filter((q) => q.connection_id === connId);
  const existingHashes = new Map(existing.map((q) => [q.query_hash, q]));
  const saved = [];
  for (const q of queries) {
    const existingQuery = existingHashes.get(q.query_hash);
    if (existingQuery) {
      const updated = {
        ...existingQuery,
        mean_exec_time_ms: q.mean_exec_time_ms,
        total_calls: q.total_calls,
        total_exec_time_ms: q.total_exec_time_ms,
        stddev_exec_time: q.stddev_exec_time,
        min_exec_time: q.min_exec_time,
        max_exec_time: q.max_exec_time,
        last_seen_at: q.last_seen_at
      };
      await setItem(queryKey(existingQuery.id), updated);
      saved.push(updated);
    } else {
      const id = crypto.randomUUID();
      const newQuery = {
        id,
        connection_id: connId,
        query_hash: q.query_hash,
        query_text: q.query_text,
        mean_exec_time_ms: q.mean_exec_time_ms,
        total_calls: q.total_calls,
        total_exec_time_ms: q.total_exec_time_ms,
        stddev_exec_time: q.stddev_exec_time,
        min_exec_time: q.min_exec_time,
        max_exec_time: q.max_exec_time,
        last_seen_at: q.last_seen_at,
        status: "pending",
        first_detected_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      await setItem(queryKey(id), newQuery);
      saved.push(newQuery);
    }
  }
  return { saved, pgStatEnabled: true, error: null, connection: conn };
}

// netlify/functions/lib/auth.ts
var JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-not-for-production";
var REFRESH_TOKEN_EXPIRY = 7 * 24 * 3600;
function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("Invalid JWT format");
      return null;
    }
    const [header, payload, signature] = parts;
    const expectedSignature = Buffer.from(
      new TextEncoder().encode(`${header}.${payload}`).buffer,
      0
    ).toString("base64url");
    if (signature !== expectedSignature) {
      console.error("Invalid JWT signature");
      return null;
    }
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const now = Math.floor(Date.now() / 1e3);
    if (claims.exp < now) {
      console.error("JWT token expired");
      return null;
    }
    return claims;
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}
function extractTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

// netlify/functions/lib/request-context.ts
var TENANT_HEADER = "x-tenant-id";
var ACTOR_HEADER = "x-actor-id";
function getRequestContext(req) {
  const token = extractTokenFromRequest(req);
  if (token) {
    const claims = decodeJWT(token);
    if (claims) {
      return {
        tenantId: claims.tenantId,
        userId: claims.sub,
        email: claims.email,
        role: claims.role,
        actorId: claims.sub
        // use userId as actorId
      };
    }
  }
  const tenantHeader = req.headers.get(TENANT_HEADER)?.trim();
  const actorHeader = req.headers.get(ACTOR_HEADER)?.trim();
  return {
    tenantId: tenantHeader || "default",
    actorId: actorHeader || "system"
  };
}

// netlify/functions/api-runs-scan.mts
function json(data, status = 200) {
  return Response.json(data, { status });
}
var api_runs_scan_default = async (req, _ctx) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { tenantId, actorId } = getRequestContext(req);
  const body = await req.json().catch(() => ({}));
  const requestedConnectionId = body.connection_id;
  const runId = crypto.randomUUID();
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const run = {
    id: runId,
    tenant_id: tenantId,
    type: "scan",
    status: "running",
    started_at: startedAt,
    started_by: actorId,
    summary: null
  };
  await setItem(runKey(runId), run);
  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: "run",
    entity_id: runId,
    action: "run.scan.started",
    actor_id: actorId,
    reason: "Scan run started"
  });
  const connections = await listByPrefix("conn/");
  const targets = requestedConnectionId ? connections.filter((c) => c.id === requestedConnectionId) : connections;
  if (requestedConnectionId && targets.length === 0) {
    await setItem(runKey(runId), {
      ...run,
      status: "failed",
      finished_at: (/* @__PURE__ */ new Date()).toISOString(),
      summary: { error: "Connection not found" }
    });
    return json({ error: "Connection not found" }, 404);
  }
  const perConnection = [];
  let totalSaved = 0;
  let failures = 0;
  for (const conn of targets) {
    const result = await refreshConnectionQueries(conn.id);
    const row = {
      connection_id: conn.id,
      connection_name: conn.name,
      count: result.saved.length,
      pgStatEnabled: result.pgStatEnabled,
      error: result.error
    };
    perConnection.push(row);
    totalSaved += result.saved.length;
    if (result.error || !result.pgStatEnabled) failures += 1;
  }
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const summary = {
    scanned_connections: targets.length,
    total_saved_queries: totalSaved,
    failures,
    per_connection: perConnection
  };
  const finalStatus = failures === targets.length ? "failed" : failures > 0 ? "partial" : "succeeded";
  await setItem(runKey(runId), {
    ...run,
    status: finalStatus,
    finished_at: finishedAt,
    summary
  });
  await appendAuditEvent({
    tenant_id: tenantId,
    entity_type: "run",
    entity_id: runId,
    action: "run.scan.completed",
    actor_id: actorId,
    reason: "Scan run completed",
    metadata: { status: finalStatus, scanned_connections: targets.length, total_saved_queries: totalSaved, failures }
  });
  return json({ id: runId, status: finalStatus, summary });
};
var config = { path: "/api/runs/scan" };
export {
  config,
  api_runs_scan_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvbGliL2F1ZGl0LnRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9zdG9yYWdlLnRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9wZy1jbGllbnQudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL2NyeXB0by50cyIsICJuZXRsaWZ5L2Z1bmN0aW9ucy9saWIvcXVlcnktaW5nZXN0LnRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9hdXRoLnRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9yZXF1ZXN0LWNvbnRleHQudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvYXBpLXJ1bnMtc2Nhbi5tdHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUhhc2gsIHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgeyBhdWRpdEtleSwgbGlzdEJ5UHJlZml4LCBzZXRJdGVtIH0gZnJvbSAnLi9zdG9yYWdlLmpzJ1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1ZGl0RXZlbnQge1xuICBpZDogc3RyaW5nXG4gIHRlbmFudF9pZDogc3RyaW5nXG4gIGVudGl0eV90eXBlOiBzdHJpbmdcbiAgZW50aXR5X2lkOiBzdHJpbmdcbiAgYWN0aW9uOiBzdHJpbmdcbiAgYWN0b3JfaWQ6IHN0cmluZ1xuICByZWFzb246IHN0cmluZ1xuICBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgdGltZXN0YW1wOiBzdHJpbmdcbiAgcHJldl9ldmVudF9oYXNoOiBzdHJpbmcgfCBudWxsXG4gIGV2ZW50X2hhc2g6IHN0cmluZ1xufVxuXG5mdW5jdGlvbiBoYXNoRXZlbnQoaW5wdXQ6IHN0cmluZykge1xuICByZXR1cm4gY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBlbmRBdWRpdEV2ZW50KHBheWxvYWQ6IHtcbiAgdGVuYW50X2lkPzogc3RyaW5nXG4gIGVudGl0eV90eXBlOiBzdHJpbmdcbiAgZW50aXR5X2lkOiBzdHJpbmdcbiAgYWN0aW9uOiBzdHJpbmdcbiAgYWN0b3JfaWQ/OiBzdHJpbmdcbiAgcmVhc29uPzogc3RyaW5nXG4gIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbn0pIHtcbiAgY29uc3QgdGVuYW50SWQgPSBwYXlsb2FkLnRlbmFudF9pZCA/PyAnZGVmYXVsdCdcbiAgY29uc3QgZXZlbnRzID0gKGF3YWl0IGxpc3RCeVByZWZpeCgnYXVkaXQvJykpIGFzIEF1ZGl0RXZlbnRbXVxuICBjb25zdCBsYXRlc3QgPSBldmVudHNcbiAgICAuZmlsdGVyKChlKSA9PiBlLnRlbmFudF9pZCA9PT0gdGVuYW50SWQpXG4gICAgLnNvcnQoKGEsIGIpID0+IG5ldyBEYXRlKGIudGltZXN0YW1wKS5nZXRUaW1lKCkgLSBuZXcgRGF0ZShhLnRpbWVzdGFtcCkuZ2V0VGltZSgpKVswXVxuXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICBjb25zdCBpZCA9IHJhbmRvbVVVSUQoKVxuICBjb25zdCBwcmV2ID0gbGF0ZXN0Py5ldmVudF9oYXNoID8/IG51bGxcbiAgY29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICBpZCxcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIGVudGl0eV90eXBlOiBwYXlsb2FkLmVudGl0eV90eXBlLFxuICAgIGVudGl0eV9pZDogcGF5bG9hZC5lbnRpdHlfaWQsXG4gICAgYWN0aW9uOiBwYXlsb2FkLmFjdGlvbixcbiAgICBhY3Rvcl9pZDogcGF5bG9hZC5hY3Rvcl9pZCA/PyAnc3lzdGVtJyxcbiAgICByZWFzb246IHBheWxvYWQucmVhc29uID8/ICcnLFxuICAgIG1ldGFkYXRhOiBwYXlsb2FkLm1ldGFkYXRhID8/IHt9LFxuICAgIHRpbWVzdGFtcCxcbiAgICBwcmV2X2V2ZW50X2hhc2g6IHByZXYsXG4gIH0pXG4gIGNvbnN0IGV2ZW50SGFzaCA9IGhhc2hFdmVudChib2R5KVxuICBjb25zdCBldmVudDogQXVkaXRFdmVudCA9IHtcbiAgICBpZCxcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIGVudGl0eV90eXBlOiBwYXlsb2FkLmVudGl0eV90eXBlLFxuICAgIGVudGl0eV9pZDogcGF5bG9hZC5lbnRpdHlfaWQsXG4gICAgYWN0aW9uOiBwYXlsb2FkLmFjdGlvbixcbiAgICBhY3Rvcl9pZDogcGF5bG9hZC5hY3Rvcl9pZCA/PyAnc3lzdGVtJyxcbiAgICByZWFzb246IHBheWxvYWQucmVhc29uID8/ICcnLFxuICAgIG1ldGFkYXRhOiBwYXlsb2FkLm1ldGFkYXRhID8/IHt9LFxuICAgIHRpbWVzdGFtcCxcbiAgICBwcmV2X2V2ZW50X2hhc2g6IHByZXYsXG4gICAgZXZlbnRfaGFzaDogZXZlbnRIYXNoLFxuICB9XG5cbiAgYXdhaXQgc2V0SXRlbShhdWRpdEtleShpZCksIGV2ZW50KVxuICByZXR1cm4gZXZlbnRcbn1cbiIsICJpbXBvcnQgeyBnZXRTdG9yZSB9IGZyb20gJ0BuZXRsaWZ5L2Jsb2JzJ1xuXG5jb25zdCBzdG9yZSA9IGdldFN0b3JlKHsgbmFtZTogJ3F1ZXJ5c2FnZScsIGNvbnNpc3RlbmN5OiAnc3Ryb25nJyB9KVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGlzdEJ5UHJlZml4KHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTxhbnlbXT4ge1xuICBjb25zdCB7IGJsb2JzIH0gPSBhd2FpdCBzdG9yZS5saXN0KHsgcHJlZml4IH0pXG4gIGlmIChibG9icy5sZW5ndGggPT09IDApIHJldHVybiBbXVxuICBjb25zdCBpdGVtcyA9IGF3YWl0IFByb21pc2UuYWxsKGJsb2JzLm1hcCgoYikgPT4gc3RvcmUuZ2V0KGIua2V5LCB7IHR5cGU6ICdqc29uJyB9KSkpXG4gIHJldHVybiBpdGVtcy5maWx0ZXIoQm9vbGVhbikgYXMgYW55W11cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RLZXlzQnlQcmVmaXgocHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IHsgYmxvYnMgfSA9IGF3YWl0IHN0b3JlLmxpc3QoeyBwcmVmaXggfSlcbiAgcmV0dXJuIGJsb2JzLm1hcCgoYikgPT4gYi5rZXkpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRJdGVtPFQ+KGtleTogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4ge1xuICByZXR1cm4gc3RvcmUuZ2V0KGtleSwgeyB0eXBlOiAnanNvbicgfSkgYXMgUHJvbWlzZTxUIHwgbnVsbD5cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEl0ZW0oa2V5OiBzdHJpbmcsIHZhbHVlOiBvYmplY3QpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgc3RvcmUuc2V0SlNPTihrZXksIHZhbHVlKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlSXRlbShrZXk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBzdG9yZS5kZWxldGUoa2V5KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubktleShpZDogc3RyaW5nKSB7IHJldHVybiBgY29ubi8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIHF1ZXJ5S2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBxdWVyeS8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIGV4cGxhaW5LZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYGV4cGxhaW4vJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBhbmFseXNpc0tleShpZDogc3RyaW5nKSB7IHJldHVybiBgYW5hbHlzaXMvJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBzdWdnZXN0aW9uS2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBzdWdnZXN0aW9uLyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gcG9saWN5S2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBwb2xpY3kvJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBhcHByb3ZhbEtleShpZDogc3RyaW5nKSB7IHJldHVybiBgYXBwcm92YWwvJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBhdWRpdEtleShpZDogc3RyaW5nKSB7IHJldHVybiBgYXVkaXQvJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBydW5LZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYHJ1bi8ke2lkfWAgfVxuIiwgImltcG9ydCBwZyBmcm9tICdwZydcbmltcG9ydCB7IGRlY3J5cHQgfSBmcm9tICcuL2NyeXB0by5qcydcblxuY29uc3QgeyBQb29sIH0gPSBwZ1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbm5lY3Rpb25SZWNvcmQge1xuICBpZDogc3RyaW5nXG4gIG5hbWU6IHN0cmluZ1xuICBob3N0OiBzdHJpbmdcbiAgcG9ydDogbnVtYmVyXG4gIGRhdGFiYXNlX25hbWU6IHN0cmluZ1xuICB1c2VybmFtZTogc3RyaW5nXG4gIHBhc3N3b3JkX2VuY3J5cHRlZDogc3RyaW5nXG4gIHNzbF9tb2RlOiAncHJlZmVyJyB8ICdyZXF1aXJlJyB8ICdkaXNhYmxlJ1xuICBzdGF0dXM6IHN0cmluZ1xuICBsYXN0X3Rlc3RlZF9hdDogc3RyaW5nIHwgbnVsbFxuICBjcmVhdGVkX2F0OiBzdHJpbmdcbn1cblxuZnVuY3Rpb24gYnVpbGRQb29sKGNvbm46IENvbm5lY3Rpb25SZWNvcmQsIHBhc3N3b3JkOiBzdHJpbmcpOiBJbnN0YW5jZVR5cGU8dHlwZW9mIFBvb2w+IHtcbiAgY29uc3Qgc3NsQ29uZmlnID0gY29ubi5zc2xfbW9kZSA9PT0gJ2Rpc2FibGUnID8gZmFsc2UgOiB7IHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2UgfVxuICByZXR1cm4gbmV3IFBvb2woe1xuICAgIGhvc3Q6IGNvbm4uaG9zdCxcbiAgICBwb3J0OiBjb25uLnBvcnQsXG4gICAgZGF0YWJhc2U6IGNvbm4uZGF0YWJhc2VfbmFtZSxcbiAgICB1c2VyOiBjb25uLnVzZXJuYW1lLFxuICAgIHBhc3N3b3JkLFxuICAgIHNzbDogc3NsQ29uZmlnLFxuICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiAxMDAwMCxcbiAgICBtYXg6IDEsXG4gIH0pXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0ZXN0Q29ubmVjdGlvbihjb25uOiBDb25uZWN0aW9uUmVjb3JkKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nOyBwZ1N0YXRFbmFibGVkPzogYm9vbGVhbiB9PiB7XG4gIGxldCBwb29sOiBJbnN0YW5jZVR5cGU8dHlwZW9mIFBvb2w+IHwgbnVsbCA9IG51bGxcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXNzd29yZCA9IGRlY3J5cHQoY29ubi5wYXNzd29yZF9lbmNyeXB0ZWQpXG4gICAgcG9vbCA9IGJ1aWxkUG9vbChjb25uLCBwYXNzd29yZClcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCBwb29sLmNvbm5lY3QoKVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1NFTEVDVCAxJylcbiAgICAgIGNvbnN0IGV4dFJlcyA9IGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgIFNFTEVDVCBFWElTVFMoU0VMRUNUIDEgRlJPTSBwZ19leHRlbnNpb24gV0hFUkUgZXh0bmFtZSA9ICdwZ19zdGF0X3N0YXRlbWVudHMnKSBhcyBlbmFibGVkXG4gICAgICBgKVxuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcGdTdGF0RW5hYmxlZDogZXh0UmVzLnJvd3NbMF0uZW5hYmxlZCB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKClcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdDb25uZWN0aW9uIGZhaWxlZCcgfVxuICB9IGZpbmFsbHkge1xuICAgIGlmIChwb29sKSBhd2FpdCBwb29sLmVuZCgpLmNhdGNoKCgpID0+IHt9KVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTbG93UXVlcmllcyhjb25uOiBDb25uZWN0aW9uUmVjb3JkKTogUHJvbWlzZTx7IHF1ZXJpZXM6IGFueVtdOyBlcnJvcjogc3RyaW5nIHwgbnVsbDsgcGdTdGF0RW5hYmxlZDogYm9vbGVhbiB9PiB7XG4gIGxldCBwb29sOiBJbnN0YW5jZVR5cGU8dHlwZW9mIFBvb2w+IHwgbnVsbCA9IG51bGxcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXNzd29yZCA9IGRlY3J5cHQoY29ubi5wYXNzd29yZF9lbmNyeXB0ZWQpXG4gICAgcG9vbCA9IGJ1aWxkUG9vbChjb25uLCBwYXNzd29yZClcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCBwb29sLmNvbm5lY3QoKVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBleHRSZXMgPSBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICBTRUxFQ1QgRVhJU1RTKFNFTEVDVCAxIEZST00gcGdfZXh0ZW5zaW9uIFdIRVJFIGV4dG5hbWUgPSAncGdfc3RhdF9zdGF0ZW1lbnRzJykgYXMgZW5hYmxlZFxuICAgICAgYClcbiAgICAgIGlmICghZXh0UmVzLnJvd3NbMF0uZW5hYmxlZCkge1xuICAgICAgICByZXR1cm4geyBxdWVyaWVzOiBbXSwgZXJyb3I6IG51bGwsIHBnU3RhdEVuYWJsZWQ6IGZhbHNlIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgIFNFTEVDVFxuICAgICAgICAgIHF1ZXJ5aWQ6OnRleHQgQVMgcXVlcnlfaGFzaCxcbiAgICAgICAgICBxdWVyeSBBUyBxdWVyeV90ZXh0LFxuICAgICAgICAgIG1lYW5fZXhlY190aW1lIEFTIG1lYW5fZXhlY190aW1lX21zLFxuICAgICAgICAgIGNhbGxzIEFTIHRvdGFsX2NhbGxzLFxuICAgICAgICAgIHRvdGFsX2V4ZWNfdGltZSBBUyB0b3RhbF9leGVjX3RpbWVfbXMsXG4gICAgICAgICAgc3RkZGV2X2V4ZWNfdGltZSxcbiAgICAgICAgICBtaW5fZXhlY190aW1lLFxuICAgICAgICAgIG1heF9leGVjX3RpbWUsXG4gICAgICAgICAgTk9XKCkgQVMgbGFzdF9zZWVuX2F0XG4gICAgICAgIEZST00gcGdfc3RhdF9zdGF0ZW1lbnRzXG4gICAgICAgIFdIRVJFIGNhbGxzID4gM1xuICAgICAgICAgIEFORCBtZWFuX2V4ZWNfdGltZSA+IDEwMFxuICAgICAgICAgIEFORCBxdWVyeSBOT1QgSUxJS0UgJyVwZ19zdGF0X3N0YXRlbWVudHMlJ1xuICAgICAgICAgIEFORCBxdWVyeSBOT1QgSUxJS0UgJyVFWFBMQUlOJSdcbiAgICAgICAgICBBTkQgcXVlcnkgTk9UIElMSUtFICclcGdfZXh0ZW5zaW9uJSdcbiAgICAgICAgT1JERVIgQlkgbWVhbl9leGVjX3RpbWUgREVTQ1xuICAgICAgICBMSU1JVCA1MFxuICAgICAgYClcbiAgICAgIHJldHVybiB7IHF1ZXJpZXM6IHJlc3VsdC5yb3dzLCBlcnJvcjogbnVsbCwgcGdTdGF0RW5hYmxlZDogdHJ1ZSB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKClcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiB7IHF1ZXJpZXM6IFtdLCBlcnJvcjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdRdWVyeSBmYWlsZWQnLCBwZ1N0YXRFbmFibGVkOiBmYWxzZSB9XG4gIH0gZmluYWxseSB7XG4gICAgaWYgKHBvb2wpIGF3YWl0IHBvb2wuZW5kKCkuY2F0Y2goKCkgPT4ge30pXG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bkV4cGxhaW5BbmFseXplKGNvbm46IENvbm5lY3Rpb25SZWNvcmQsIHF1ZXJ5VGV4dDogc3RyaW5nKTogUHJvbWlzZTx7IHBsYW46IGFueTsgZXJyb3I6IHN0cmluZyB8IG51bGwgfT4ge1xuICBsZXQgcG9vbDogSW5zdGFuY2VUeXBlPHR5cGVvZiBQb29sPiB8IG51bGwgPSBudWxsXG4gIHRyeSB7XG4gICAgY29uc3QgcGFzc3dvcmQgPSBkZWNyeXB0KGNvbm4ucGFzc3dvcmRfZW5jcnlwdGVkKVxuICAgIHBvb2wgPSBidWlsZFBvb2woY29ubiwgcGFzc3dvcmQpXG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgcG9vbC5jb25uZWN0KClcbiAgICB0cnkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdCRUdJTicpXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjbGllbnQucXVlcnkoYEVYUExBSU4gKEFOQUxZWkUsIEJVRkZFUlMsIEZPUk1BVCBKU09OKSAke3F1ZXJ5VGV4dH1gKVxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpXG4gICAgICByZXR1cm4geyBwbGFuOiByZXN1bHQucm93c1swXVsnUVVFUlkgUExBTiddLCBlcnJvcjogbnVsbCB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJykuY2F0Y2goKCkgPT4ge30pXG4gICAgICByZXR1cm4geyBwbGFuOiBudWxsLCBlcnJvcjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdFWFBMQUlOIEFOQUxZWkUgZmFpbGVkJyB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNsaWVudC5yZWxlYXNlKClcbiAgICB9XG4gIH0gZmluYWxseSB7XG4gICAgaWYgKHBvb2wpIGF3YWl0IHBvb2wuZW5kKCkuY2F0Y2goKCkgPT4ge30pXG4gIH1cbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVDaXBoZXJpdiwgY3JlYXRlRGVjaXBoZXJpdiwgcmFuZG9tQnl0ZXMgfSBmcm9tICdjcnlwdG8nXG5cbmZ1bmN0aW9uIGdldEtleSgpOiBCdWZmZXIge1xuICBjb25zdCBrZXkgPSBwcm9jZXNzLmVudi5FTkNSWVBUSU9OX0tFWSA/PyAncXVlcnlzYWdlLWRlZmF1bHQta2V5LWNoYW5nZS1tZSEhJ1xuICByZXR1cm4gQnVmZmVyLmZyb20oa2V5LnBhZEVuZCgzMiwgJyEnKS5zbGljZSgwLCAzMikpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmNyeXB0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGl2ID0gcmFuZG9tQnl0ZXMoMTYpXG4gIGNvbnN0IGNpcGhlciA9IGNyZWF0ZUNpcGhlcml2KCdhZXMtMjU2LWdjbScsIGdldEtleSgpLCBpdilcbiAgbGV0IGVuY3J5cHRlZCA9IGNpcGhlci51cGRhdGUodGV4dCwgJ3V0ZjgnLCAnaGV4JylcbiAgZW5jcnlwdGVkICs9IGNpcGhlci5maW5hbCgnaGV4JylcbiAgY29uc3QgYXV0aFRhZyA9IGNpcGhlci5nZXRBdXRoVGFnKClcbiAgcmV0dXJuIGAke2l2LnRvU3RyaW5nKCdoZXgnKX06JHthdXRoVGFnLnRvU3RyaW5nKCdoZXgnKX06JHtlbmNyeXB0ZWR9YFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjcnlwdChlbmNyeXB0ZWRUZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBwYXJ0cyA9IGVuY3J5cHRlZFRleHQuc3BsaXQoJzonKVxuICBpZiAocGFydHMubGVuZ3RoICE9PSAzKSByZXR1cm4gZW5jcnlwdGVkVGV4dCAvLyBub3QgZW5jcnlwdGVkIChsZWdhY3kpXG4gIGNvbnN0IFtpdkhleCwgYXV0aFRhZ0hleCwgZW5jcnlwdGVkXSA9IHBhcnRzXG4gIGNvbnN0IGl2ID0gQnVmZmVyLmZyb20oaXZIZXgsICdoZXgnKVxuICBjb25zdCBhdXRoVGFnID0gQnVmZmVyLmZyb20oYXV0aFRhZ0hleCwgJ2hleCcpXG4gIGNvbnN0IGRlY2lwaGVyID0gY3JlYXRlRGVjaXBoZXJpdignYWVzLTI1Ni1nY20nLCBnZXRLZXkoKSwgaXYpXG4gIGRlY2lwaGVyLnNldEF1dGhUYWcoYXV0aFRhZylcbiAgbGV0IGRlY3J5cHRlZCA9IGRlY2lwaGVyLnVwZGF0ZShlbmNyeXB0ZWQsICdoZXgnLCAndXRmOCcpXG4gIGRlY3J5cHRlZCArPSBkZWNpcGhlci5maW5hbCgndXRmOCcpXG4gIHJldHVybiBkZWNyeXB0ZWRcbn1cbiIsICJpbXBvcnQgeyBjb25uS2V5LCBsaXN0QnlQcmVmaXgsIHF1ZXJ5S2V5LCBnZXRJdGVtLCBzZXRJdGVtIH0gZnJvbSAnLi9zdG9yYWdlLmpzJ1xuaW1wb3J0IHsgZ2V0U2xvd1F1ZXJpZXMgfSBmcm9tICcuL3BnLWNsaWVudC5qcydcbmltcG9ydCB0eXBlIHsgQ29ubmVjdGlvbiB9IGZyb20gJy4uL2FwaS1jb25uZWN0aW9ucy5tanMnXG5pbXBvcnQgdHlwZSB7IFNsb3dRdWVyeSB9IGZyb20gJy4uL2FwaS1xdWVyaWVzLm1qcydcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hDb25uZWN0aW9uUXVlcmllcyhjb25uSWQ6IHN0cmluZyk6IFByb21pc2U8eyBzYXZlZDogU2xvd1F1ZXJ5W107IHBnU3RhdEVuYWJsZWQ6IGJvb2xlYW47IGVycm9yOiBzdHJpbmcgfCBudWxsOyBjb25uZWN0aW9uPzogQ29ubmVjdGlvbiB9PiB7XG4gIGNvbnN0IGNvbm4gPSBhd2FpdCBnZXRJdGVtPENvbm5lY3Rpb24+KGNvbm5LZXkoY29ubklkKSlcbiAgaWYgKCFjb25uKSByZXR1cm4geyBzYXZlZDogW10sIHBnU3RhdEVuYWJsZWQ6IGZhbHNlLCBlcnJvcjogJ0Nvbm5lY3Rpb24gbm90IGZvdW5kJyB9XG5cbiAgY29uc3QgeyBxdWVyaWVzLCBlcnJvciwgcGdTdGF0RW5hYmxlZCB9ID0gYXdhaXQgZ2V0U2xvd1F1ZXJpZXMoY29ubiBhcyBhbnkpXG4gIGlmICghcGdTdGF0RW5hYmxlZCkgcmV0dXJuIHsgc2F2ZWQ6IFtdLCBwZ1N0YXRFbmFibGVkOiBmYWxzZSwgZXJyb3I6IG51bGwsIGNvbm5lY3Rpb246IGNvbm4gfVxuICBpZiAoZXJyb3IpIHJldHVybiB7IHNhdmVkOiBbXSwgcGdTdGF0RW5hYmxlZDogdHJ1ZSwgZXJyb3IsIGNvbm5lY3Rpb246IGNvbm4gfVxuXG4gIGNvbnN0IGV4aXN0aW5nID0gKGF3YWl0IGxpc3RCeVByZWZpeCgncXVlcnkvJykgYXMgU2xvd1F1ZXJ5W10pLmZpbHRlcigocSkgPT4gcS5jb25uZWN0aW9uX2lkID09PSBjb25uSWQpXG4gIGNvbnN0IGV4aXN0aW5nSGFzaGVzID0gbmV3IE1hcChleGlzdGluZy5tYXAoKHEpID0+IFtxLnF1ZXJ5X2hhc2gsIHFdKSlcblxuICBjb25zdCBzYXZlZDogU2xvd1F1ZXJ5W10gPSBbXVxuICBmb3IgKGNvbnN0IHEgb2YgcXVlcmllcykge1xuICAgIGNvbnN0IGV4aXN0aW5nUXVlcnkgPSBleGlzdGluZ0hhc2hlcy5nZXQocS5xdWVyeV9oYXNoKVxuICAgIGlmIChleGlzdGluZ1F1ZXJ5KSB7XG4gICAgICBjb25zdCB1cGRhdGVkOiBTbG93UXVlcnkgPSB7XG4gICAgICAgIC4uLmV4aXN0aW5nUXVlcnksXG4gICAgICAgIG1lYW5fZXhlY190aW1lX21zOiBxLm1lYW5fZXhlY190aW1lX21zLFxuICAgICAgICB0b3RhbF9jYWxsczogcS50b3RhbF9jYWxscyxcbiAgICAgICAgdG90YWxfZXhlY190aW1lX21zOiBxLnRvdGFsX2V4ZWNfdGltZV9tcyxcbiAgICAgICAgc3RkZGV2X2V4ZWNfdGltZTogcS5zdGRkZXZfZXhlY190aW1lLFxuICAgICAgICBtaW5fZXhlY190aW1lOiBxLm1pbl9leGVjX3RpbWUsXG4gICAgICAgIG1heF9leGVjX3RpbWU6IHEubWF4X2V4ZWNfdGltZSxcbiAgICAgICAgbGFzdF9zZWVuX2F0OiBxLmxhc3Rfc2Vlbl9hdCxcbiAgICAgIH1cbiAgICAgIGF3YWl0IHNldEl0ZW0ocXVlcnlLZXkoZXhpc3RpbmdRdWVyeS5pZCksIHVwZGF0ZWQpXG4gICAgICBzYXZlZC5wdXNoKHVwZGF0ZWQpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGlkID0gY3J5cHRvLnJhbmRvbVVVSUQoKVxuICAgICAgY29uc3QgbmV3UXVlcnk6IFNsb3dRdWVyeSA9IHtcbiAgICAgICAgaWQsXG4gICAgICAgIGNvbm5lY3Rpb25faWQ6IGNvbm5JZCxcbiAgICAgICAgcXVlcnlfaGFzaDogcS5xdWVyeV9oYXNoLFxuICAgICAgICBxdWVyeV90ZXh0OiBxLnF1ZXJ5X3RleHQsXG4gICAgICAgIG1lYW5fZXhlY190aW1lX21zOiBxLm1lYW5fZXhlY190aW1lX21zLFxuICAgICAgICB0b3RhbF9jYWxsczogcS50b3RhbF9jYWxscyxcbiAgICAgICAgdG90YWxfZXhlY190aW1lX21zOiBxLnRvdGFsX2V4ZWNfdGltZV9tcyxcbiAgICAgICAgc3RkZGV2X2V4ZWNfdGltZTogcS5zdGRkZXZfZXhlY190aW1lLFxuICAgICAgICBtaW5fZXhlY190aW1lOiBxLm1pbl9leGVjX3RpbWUsXG4gICAgICAgIG1heF9leGVjX3RpbWU6IHEubWF4X2V4ZWNfdGltZSxcbiAgICAgICAgbGFzdF9zZWVuX2F0OiBxLmxhc3Rfc2Vlbl9hdCxcbiAgICAgICAgc3RhdHVzOiAncGVuZGluZycsXG4gICAgICAgIGZpcnN0X2RldGVjdGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB9XG4gICAgICBhd2FpdCBzZXRJdGVtKHF1ZXJ5S2V5KGlkKSwgbmV3UXVlcnkpXG4gICAgICBzYXZlZC5wdXNoKG5ld1F1ZXJ5KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IHNhdmVkLCBwZ1N0YXRFbmFibGVkOiB0cnVlLCBlcnJvcjogbnVsbCwgY29ubmVjdGlvbjogY29ubiB9XG59XG4iLCAiLyoqXG4gKiBKV1QgQXV0aGVudGljYXRpb24gVXRpbGl0aWVzXG4gKiBIYW5kbGVzIHRva2VuIGdlbmVyYXRpb24sIHZhbGlkYXRpb24sIGFuZCByZWZyZXNoXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBKV1RDbGFpbXMsIFVzZXJSb2xlLCBUb2tlblBhaXIgfSBmcm9tICcuLi8uLi8uLi9zcmMvbGliL2F1dGgtdHlwZXMuanMnXG5cbmNvbnN0IEpXVF9TRUNSRVQgPSBwcm9jZXNzLmVudi5KV1RfU0VDUkVUIHx8ICdkZXYtc2VjcmV0LWtleS1ub3QtZm9yLXByb2R1Y3Rpb24nXG5jb25zdCBKV1RfQUxHT1JJVEhNID0gJ0hTMjU2J1xuY29uc3QgQUNDRVNTX1RPS0VOX0VYUElSWSA9IDM2MDAgLy8gMSBob3VyIGluIHNlY29uZHNcbmNvbnN0IFJFRlJFU0hfVE9LRU5fRVhQSVJZID0gNyAqIDI0ICogMzYwMCAvLyA3IGRheXMgaW4gc2Vjb25kc1xuXG4vLyBTaW1wbGUgSldUIGltcGxlbWVudGF0aW9uIGZvciBzZXJ2ZXJsZXNzIChubyBleHRlcm5hbCBkZXBzIG5lZWRlZCBmb3IgYmFzaWMgSFMyNTYpXG5leHBvcnQgZnVuY3Rpb24gZW5jb2RlSldUKGNsYWltczogT21pdDxKV1RDbGFpbXMsICdpYXQnIHwgJ2V4cCc+LCBleHBpcnlTZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBub3cgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKVxuICBjb25zdCBwYXlsb2FkOiBKV1RDbGFpbXMgPSB7XG4gICAgLi4uY2xhaW1zLFxuICAgIGlhdDogbm93LFxuICAgIGV4cDogbm93ICsgZXhwaXJ5U2Vjb25kcyxcbiAgfVxuXG4gIGNvbnN0IGhlYWRlciA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHsgYWxnOiBKV1RfQUxHT1JJVEhNLCB0eXA6ICdKV1QnIH0pKS50b1N0cmluZygnYmFzZTY0dXJsJylcbiAgY29uc3QgYm9keSA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKS50b1N0cmluZygnYmFzZTY0dXJsJylcbiAgY29uc3Qgc2lnbmF0dXJlID0gQnVmZmVyLmZyb20oXG4gICAgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGAke2hlYWRlcn0uJHtib2R5fWApLmJ1ZmZlcixcbiAgICAwXG4gICkudG9TdHJpbmcoJ2Jhc2U2NHVybCcpXG5cbiAgcmV0dXJuIGAke2hlYWRlcn0uJHtib2R5fS4ke3NpZ25hdHVyZX1gXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVKV1QodG9rZW46IHN0cmluZyk6IEpXVENsYWltcyB8IG51bGwge1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnRzID0gdG9rZW4uc3BsaXQoJy4nKVxuICAgIGlmIChwYXJ0cy5sZW5ndGggIT09IDMpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgSldUIGZvcm1hdCcpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGNvbnN0IFtoZWFkZXIsIHBheWxvYWQsIHNpZ25hdHVyZV0gPSBwYXJ0c1xuXG4gICAgLy8gVmVyaWZ5IHNpZ25hdHVyZSAoYmFzaWMgSFMyNTYpXG4gICAgY29uc3QgZXhwZWN0ZWRTaWduYXR1cmUgPSBCdWZmZXIuZnJvbShcbiAgICAgIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShgJHtoZWFkZXJ9LiR7cGF5bG9hZH1gKS5idWZmZXIsXG4gICAgICAwXG4gICAgKS50b1N0cmluZygnYmFzZTY0dXJsJylcblxuICAgIGlmIChzaWduYXR1cmUgIT09IGV4cGVjdGVkU2lnbmF0dXJlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdJbnZhbGlkIEpXVCBzaWduYXR1cmUnKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBjb25zdCBjbGFpbXMgPSBKU09OLnBhcnNlKEJ1ZmZlci5mcm9tKHBheWxvYWQsICdiYXNlNjR1cmwnKS50b1N0cmluZygpKSBhcyBKV1RDbGFpbXNcblxuICAgIC8vIENoZWNrIGV4cGlyYXRpb25cbiAgICBjb25zdCBub3cgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKVxuICAgIGlmIChjbGFpbXMuZXhwIDwgbm93KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdKV1QgdG9rZW4gZXhwaXJlZCcpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiBjbGFpbXNcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZGVjb2RlIEpXVDonLCBlcnJvcilcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVRva2VuUGFpcihcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGVtYWlsOiBzdHJpbmcsXG4gIHRlbmFudElkOiBzdHJpbmcsXG4gIHJvbGU6IFVzZXJSb2xlXG4pOiBUb2tlblBhaXIge1xuICBjb25zdCBhY2Nlc3NUb2tlbiA9IGVuY29kZUpXVChcbiAgICB7XG4gICAgICBzdWI6IHVzZXJJZCxcbiAgICAgIGVtYWlsLFxuICAgICAgdGVuYW50SWQsXG4gICAgICByb2xlLFxuICAgIH0sXG4gICAgQUNDRVNTX1RPS0VOX0VYUElSWVxuICApXG5cbiAgY29uc3QgcmVmcmVzaFRva2VuID0gZW5jb2RlSldUKFxuICAgIHtcbiAgICAgIHN1YjogdXNlcklkLFxuICAgICAgZW1haWwsXG4gICAgICB0ZW5hbnRJZCxcbiAgICAgIHJvbGUsXG4gICAgfSxcbiAgICBSRUZSRVNIX1RPS0VOX0VYUElSWVxuICApXG5cbiAgcmV0dXJuIHtcbiAgICBhY2Nlc3NUb2tlbixcbiAgICByZWZyZXNoVG9rZW4sXG4gICAgZXhwaXJlc0luOiBBQ0NFU1NfVE9LRU5fRVhQSVJZLFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0VG9rZW5Gcm9tUmVxdWVzdChyZXE6IFJlcXVlc3QpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgYXV0aEhlYWRlciA9IHJlcS5oZWFkZXJzLmdldCgnYXV0aG9yaXphdGlvbicpXG4gIGlmICghYXV0aEhlYWRlciB8fCAhYXV0aEhlYWRlci5zdGFydHNXaXRoKCdCZWFyZXIgJykpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG4gIHJldHVybiBhdXRoSGVhZGVyLnNsaWNlKDcpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVJlcXVlc3QocmVxOiBSZXF1ZXN0KTogSldUQ2xhaW1zIHwgbnVsbCB7XG4gIGNvbnN0IHRva2VuID0gZXh0cmFjdFRva2VuRnJvbVJlcXVlc3QocmVxKVxuICBpZiAoIXRva2VuKSB7XG4gICAgY29uc29sZS5lcnJvcignTm8gdG9rZW4gcHJvdmlkZWQnKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBjb25zdCBjbGFpbXMgPSBkZWNvZGVKV1QodG9rZW4pXG4gIGlmICghY2xhaW1zKSB7XG4gICAgY29uc29sZS5lcnJvcignSW52YWxpZCBvciBleHBpcmVkIHRva2VuJylcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIGNsYWltc1xufVxuXG5leHBvcnQgZnVuY3Rpb24ganNvbihkYXRhOiB1bmtub3duLCBzdGF0dXMgPSAyMDApOiBSZXNwb25zZSB7XG4gIHJldHVybiBSZXNwb25zZS5qc29uKGRhdGEsIHsgc3RhdHVzIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvclJlc3BvbnNlKG1lc3NhZ2U6IHN0cmluZywgc3RhdHVzID0gNDAwKTogUmVzcG9uc2Uge1xuICByZXR1cm4ganNvbih7IGVycm9yOiBtZXNzYWdlIH0sIHN0YXR1cylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVuYXV0aG9yaXplZFJlc3BvbnNlKCk6IFJlc3BvbnNlIHtcbiAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1VuYXV0aG9yaXplZCcsIDQwMSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcmJpZGRlblJlc3BvbnNlKCk6IFJlc3BvbnNlIHtcbiAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0ZvcmJpZGRlbicsIDQwMylcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEpXVENsYWltcyB9IGZyb20gJy4uLy4uLy4uL3NyYy9saWIvYXV0aC10eXBlcy5qcydcbmltcG9ydCB7IGRlY29kZUpXVCwgZXh0cmFjdFRva2VuRnJvbVJlcXVlc3QgfSBmcm9tICcuL2F1dGguanMnXG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVxdWVzdENvbnRleHQge1xuICB0ZW5hbnRJZDogc3RyaW5nXG4gIHVzZXJJZD86IHN0cmluZ1xuICBlbWFpbD86IHN0cmluZ1xuICByb2xlPzogc3RyaW5nXG4gIGFjdG9ySWQ6IHN0cmluZyAvLyBrZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG59XG5cbmNvbnN0IFRFTkFOVF9IRUFERVIgPSAneC10ZW5hbnQtaWQnXG5jb25zdCBBQ1RPUl9IRUFERVIgPSAneC1hY3Rvci1pZCdcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RDb250ZXh0KHJlcTogUmVxdWVzdCk6IFJlcXVlc3RDb250ZXh0IHtcbiAgLy8gVHJ5IEpXVCBmaXJzdFxuICBjb25zdCB0b2tlbiA9IGV4dHJhY3RUb2tlbkZyb21SZXF1ZXN0KHJlcSlcbiAgaWYgKHRva2VuKSB7XG4gICAgY29uc3QgY2xhaW1zID0gZGVjb2RlSldUKHRva2VuKVxuICAgIGlmIChjbGFpbXMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRlbmFudElkOiBjbGFpbXMudGVuYW50SWQsXG4gICAgICAgIHVzZXJJZDogY2xhaW1zLnN1YixcbiAgICAgICAgZW1haWw6IGNsYWltcy5lbWFpbCxcbiAgICAgICAgcm9sZTogY2xhaW1zLnJvbGUsXG4gICAgICAgIGFjdG9ySWQ6IGNsYWltcy5zdWIsIC8vIHVzZSB1c2VySWQgYXMgYWN0b3JJZFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGhlYWRlci1iYXNlZCBjb250ZXh0IChmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAgY29uc3QgdGVuYW50SGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KFRFTkFOVF9IRUFERVIpPy50cmltKClcbiAgY29uc3QgYWN0b3JIZWFkZXIgPSByZXEuaGVhZGVycy5nZXQoQUNUT1JfSEVBREVSKT8udHJpbSgpXG5cbiAgcmV0dXJuIHtcbiAgICB0ZW5hbnRJZDogdGVuYW50SGVhZGVyIHx8ICdkZWZhdWx0JyxcbiAgICBhY3RvcklkOiBhY3RvckhlYWRlciB8fCAnc3lzdGVtJyxcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gJ0BuZXRsaWZ5L2Z1bmN0aW9ucydcbmltcG9ydCB7IGFwcGVuZEF1ZGl0RXZlbnQgfSBmcm9tICcuL2xpYi9hdWRpdC5qcydcbmltcG9ydCB7IGxpc3RCeVByZWZpeCwgcnVuS2V5LCBzZXRJdGVtIH0gZnJvbSAnLi9saWIvc3RvcmFnZS5qcydcbmltcG9ydCB7IHJlZnJlc2hDb25uZWN0aW9uUXVlcmllcyB9IGZyb20gJy4vbGliL3F1ZXJ5LWluZ2VzdC5qcydcbmltcG9ydCB7IGdldFJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi9saWIvcmVxdWVzdC1jb250ZXh0LmpzJ1xuXG5mdW5jdGlvbiBqc29uKGRhdGE6IHVua25vd24sIHN0YXR1cyA9IDIwMCkge1xuICByZXR1cm4gUmVzcG9uc2UuanNvbihkYXRhLCB7IHN0YXR1cyB9KVxufVxuXG5leHBvcnQgZGVmYXVsdCBhc3luYyAocmVxOiBSZXF1ZXN0LCBfY3R4OiBDb250ZXh0KSA9PiB7XG4gIGlmIChyZXEubWV0aG9kICE9PSAnUE9TVCcpIHJldHVybiBqc29uKHsgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQnIH0sIDQwNSlcblxuICBjb25zdCB7IHRlbmFudElkLCBhY3RvcklkIH0gPSBnZXRSZXF1ZXN0Q29udGV4dChyZXEpXG4gIGNvbnN0IGJvZHkgPSBhd2FpdCByZXEuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpXG4gIGNvbnN0IHJlcXVlc3RlZENvbm5lY3Rpb25JZCA9IGJvZHkuY29ubmVjdGlvbl9pZCBhcyBzdHJpbmcgfCB1bmRlZmluZWRcblxuICBjb25zdCBydW5JZCA9IGNyeXB0by5yYW5kb21VVUlEKClcbiAgY29uc3Qgc3RhcnRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG5cbiAgY29uc3QgcnVuID0ge1xuICAgIGlkOiBydW5JZCxcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIHR5cGU6ICdzY2FuJyxcbiAgICBzdGF0dXM6ICdydW5uaW5nJyxcbiAgICBzdGFydGVkX2F0OiBzdGFydGVkQXQsXG4gICAgc3RhcnRlZF9ieTogYWN0b3JJZCxcbiAgICBzdW1tYXJ5OiBudWxsIGFzIGFueSxcbiAgfVxuICBhd2FpdCBzZXRJdGVtKHJ1bktleShydW5JZCksIHJ1bilcblxuICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIGVudGl0eV90eXBlOiAncnVuJyxcbiAgICBlbnRpdHlfaWQ6IHJ1bklkLFxuICAgIGFjdGlvbjogJ3J1bi5zY2FuLnN0YXJ0ZWQnLFxuICAgIGFjdG9yX2lkOiBhY3RvcklkLFxuICAgIHJlYXNvbjogJ1NjYW4gcnVuIHN0YXJ0ZWQnLFxuICB9KVxuXG4gIGNvbnN0IGNvbm5lY3Rpb25zID0gKGF3YWl0IGxpc3RCeVByZWZpeCgnY29ubi8nKSkgYXMgYW55W11cbiAgY29uc3QgdGFyZ2V0cyA9IHJlcXVlc3RlZENvbm5lY3Rpb25JZFxuICAgID8gY29ubmVjdGlvbnMuZmlsdGVyKChjKSA9PiBjLmlkID09PSByZXF1ZXN0ZWRDb25uZWN0aW9uSWQpXG4gICAgOiBjb25uZWN0aW9uc1xuXG4gIGlmIChyZXF1ZXN0ZWRDb25uZWN0aW9uSWQgJiYgdGFyZ2V0cy5sZW5ndGggPT09IDApIHtcbiAgICBhd2FpdCBzZXRJdGVtKHJ1bktleShydW5JZCksIHtcbiAgICAgIC4uLnJ1bixcbiAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICBmaW5pc2hlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgc3VtbWFyeTogeyBlcnJvcjogJ0Nvbm5lY3Rpb24gbm90IGZvdW5kJyB9LFxuICAgIH0pXG4gICAgcmV0dXJuIGpzb24oeyBlcnJvcjogJ0Nvbm5lY3Rpb24gbm90IGZvdW5kJyB9LCA0MDQpXG4gIH1cblxuICBjb25zdCBwZXJDb25uZWN0aW9uOiBBcnJheTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4gPSBbXVxuICBsZXQgdG90YWxTYXZlZCA9IDBcbiAgbGV0IGZhaWx1cmVzID0gMFxuXG4gIGZvciAoY29uc3QgY29ubiBvZiB0YXJnZXRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVmcmVzaENvbm5lY3Rpb25RdWVyaWVzKGNvbm4uaWQpXG4gICAgY29uc3Qgcm93ID0ge1xuICAgICAgY29ubmVjdGlvbl9pZDogY29ubi5pZCxcbiAgICAgIGNvbm5lY3Rpb25fbmFtZTogY29ubi5uYW1lLFxuICAgICAgY291bnQ6IHJlc3VsdC5zYXZlZC5sZW5ndGgsXG4gICAgICBwZ1N0YXRFbmFibGVkOiByZXN1bHQucGdTdGF0RW5hYmxlZCxcbiAgICAgIGVycm9yOiByZXN1bHQuZXJyb3IsXG4gICAgfVxuICAgIHBlckNvbm5lY3Rpb24ucHVzaChyb3cpXG4gICAgdG90YWxTYXZlZCArPSByZXN1bHQuc2F2ZWQubGVuZ3RoXG4gICAgaWYgKHJlc3VsdC5lcnJvciB8fCAhcmVzdWx0LnBnU3RhdEVuYWJsZWQpIGZhaWx1cmVzICs9IDFcbiAgfVxuXG4gIGNvbnN0IGZpbmlzaGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgY29uc3Qgc3VtbWFyeSA9IHtcbiAgICBzY2FubmVkX2Nvbm5lY3Rpb25zOiB0YXJnZXRzLmxlbmd0aCxcbiAgICB0b3RhbF9zYXZlZF9xdWVyaWVzOiB0b3RhbFNhdmVkLFxuICAgIGZhaWx1cmVzLFxuICAgIHBlcl9jb25uZWN0aW9uOiBwZXJDb25uZWN0aW9uLFxuICB9XG5cbiAgY29uc3QgZmluYWxTdGF0dXMgPSBmYWlsdXJlcyA9PT0gdGFyZ2V0cy5sZW5ndGggPyAnZmFpbGVkJyA6IGZhaWx1cmVzID4gMCA/ICdwYXJ0aWFsJyA6ICdzdWNjZWVkZWQnXG5cbiAgYXdhaXQgc2V0SXRlbShydW5LZXkocnVuSWQpLCB7XG4gICAgLi4ucnVuLFxuICAgIHN0YXR1czogZmluYWxTdGF0dXMsXG4gICAgZmluaXNoZWRfYXQ6IGZpbmlzaGVkQXQsXG4gICAgc3VtbWFyeSxcbiAgfSlcblxuICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIGVudGl0eV90eXBlOiAncnVuJyxcbiAgICBlbnRpdHlfaWQ6IHJ1bklkLFxuICAgIGFjdGlvbjogJ3J1bi5zY2FuLmNvbXBsZXRlZCcsXG4gICAgYWN0b3JfaWQ6IGFjdG9ySWQsXG4gICAgcmVhc29uOiAnU2NhbiBydW4gY29tcGxldGVkJyxcbiAgICBtZXRhZGF0YTogeyBzdGF0dXM6IGZpbmFsU3RhdHVzLCBzY2FubmVkX2Nvbm5lY3Rpb25zOiB0YXJnZXRzLmxlbmd0aCwgdG90YWxfc2F2ZWRfcXVlcmllczogdG90YWxTYXZlZCwgZmFpbHVyZXMgfSxcbiAgfSlcblxuICByZXR1cm4ganNvbih7IGlkOiBydW5JZCwgc3RhdHVzOiBmaW5hbFN0YXR1cywgc3VtbWFyeSB9KVxufVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0geyBwYXRoOiAnL2FwaS9ydW5zL3NjYW4nIH1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFBQSxTQUFTLFlBQVksa0JBQWtCOzs7QUNBdkMsU0FBUyxnQkFBZ0I7QUFFekIsSUFBTSxRQUFRLFNBQVMsRUFBRSxNQUFNLGFBQWEsYUFBYSxTQUFTLENBQUM7QUFFbkUsZUFBc0IsYUFBYSxRQUFnQztBQUNqRSxRQUFNLEVBQUUsTUFBTSxJQUFJLE1BQU0sTUFBTSxLQUFLLEVBQUUsT0FBTyxDQUFDO0FBQzdDLE1BQUksTUFBTSxXQUFXLEVBQUcsUUFBTyxDQUFDO0FBQ2hDLFFBQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxNQUFNLElBQUksQ0FBQyxNQUFNLE1BQU0sSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDcEYsU0FBTyxNQUFNLE9BQU8sT0FBTztBQUM3QjtBQU9BLGVBQXNCLFFBQVcsS0FBZ0M7QUFDL0QsU0FBTyxNQUFNLElBQUksS0FBSyxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBQ3hDO0FBRUEsZUFBc0IsUUFBUSxLQUFhLE9BQThCO0FBQ3ZFLFFBQU0sTUFBTSxRQUFRLEtBQUssS0FBSztBQUNoQztBQU1PLFNBQVMsUUFBUSxJQUFZO0FBQUUsU0FBTyxRQUFRLEVBQUU7QUFBRztBQUNuRCxTQUFTLFNBQVMsSUFBWTtB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
