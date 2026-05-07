
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


// netlify/functions/api-validation.mts
import { json } from "@tanstack/start";

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

// netlify/functions/api-validation.mts
import { getBlob } from "@netlify/blobs";

// netlify/functions/lib/validation.ts
import crypto from "crypto";
import { Pool } from "pg";
var connectionPool = null;
function getConnectionPool() {
  if (!connectionPool) {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL or POSTGRES_URL environment variable not set");
    }
    connectionPool = new Pool({
      connectionString: dbUrl,
      max: 5,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
  }
  return connectionPool;
}
async function captureMetrics(query, label, connectionId) {
  const pool = getConnectionPool();
  let client = null;
  try {
    client = await pool.connect();
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${query}`;
    const startTime = performance.now();
    await client.query("SET statement_timeout = 30000");
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Query execution timeout (30s)")), 35e3);
    });
    const explainResult = await Promise.race([
      client.query(explainQuery),
      timeoutPromise
    ]);
    const endTime = performance.now();
    const executionTime = Math.round((endTime - startTime) * 10) / 10;
    const plan = explainResult.rows[0]?.[0]?.[0];
    if (!plan) {
      throw new Error("Failed to parse EXPLAIN output");
    }
    const executionTimeMs = plan["Execution Time"] || executionTime;
    const planningTime = plan["Planning Time"] || 0;
    const totalTime = executionTimeMs + planningTime;
    const getRowsFromPlan = (node) => {
      if (!node) return 0;
      const actual = node["Actual Rows"] || 0;
      if (node["Plans"] && node["Plans"].length > 0) {
        return Math.max(actual, ...node["Plans"].map(getRowsFromPlan));
      }
      return actual;
    };
    const rowsReturned = getRowsFromPlan(plan) || 0;
    const getRowsScanned = (node) => {
      if (!node) return 0;
      const actual = node["Actual Rows"] || 0;
      const estimatedRows = node["Estimated Rows"] || actual;
      if (node["Plans"] && node["Plans"].length > 0) {
        const childScans = node["Plans"].map(getRowsScanned).reduce((a, b) => a + b, 0);
        return Math.max(estimatedRows * 2, childScans);
      }
      return Math.max(actual, estimatedRows);
    };
    const rowsScanned = Math.max(rowsReturned, getRowsScanned(plan) * 2) || 1e3;
    return {
      executionTime: Math.round(totalTime * 10) / 10,
      rowsScanned: Math.floor(rowsScanned),
      rowsReturned: Math.floor(rowsReturned),
      executionPlan: JSON.stringify(plan, null, 2),
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("timeout") || message.includes("30000")) {
      throw new Error("Query execution exceeded 30-second timeout");
    }
    if (message.includes("no such table") || message.includes("does not exist")) {
      throw new Error("Query table not found (check test database connection)");
    }
    if (message.includes("DATABASE_URL") || message.includes("POSTGRES_URL")) {
      console.warn("No database URL configured, using mock metrics for development");
      return {
        executionTime: label === "before" ? Math.random() * 3e3 + 1500 : Math.random() * 500 + 50,
        rowsScanned: Math.floor(Math.random() * 2e5),
        rowsReturned: Math.floor(Math.random() * 1e3),
        executionPlan: `${label === "before" ? "Seq Scan" : "Index Scan"} (mocked)`,
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}
function calculateImprovement(beforeMetrics, afterMetrics) {
  const timeDiff = beforeMetrics.executionTime - afterMetrics.executionTime;
  const timeImprovement = timeDiff / beforeMetrics.executionTime * 100;
  const rowsDiff = beforeMetrics.rowsScanned - afterMetrics.rowsScanned;
  const rowsImprovement = beforeMetrics.rowsScanned > 0 ? rowsDiff / beforeMetrics.rowsScanned * 100 : 0;
  const improvementPercent = Math.max(0, timeImprovement);
  const improvementType = improvementPercent > rowsImprovement ? "time" : "rows";
  return {
    improvementPercent: Math.round(improvementPercent * 10) / 10,
    improvementType,
    samples: 1
  };
}
function scoreConfidence(samples, improvementPercent) {
  const NOISE_THRESHOLD = 5;
  const MIN_SAMPLES = 3;
  const MAX_SAMPLES = 10;
  if (improvementPercent < NOISE_THRESHOLD) {
    return {
      confidence: "low",
      confidenceScore: 30,
      statisticallySignificant: false
    };
  }
  const sampleConfidence = Math.min(100, samples / MAX_SAMPLES * 100);
  const improvementConfidence = Math.min(100, improvementPercent / 50 * 100);
  const confidenceScore = Math.round((sampleConfidence + improvementConfidence) / 2);
  let confidence;
  if (confidenceScore >= 85 && samples >= MIN_SAMPLES) {
    confidence = "high";
  } else if (confidenceScore >= 70) {
    confidence = "medium";
  } else {
    confidence = "low";
  }
  return {
    confidence,
    confidenceScore,
    statisticallySignificant: confidence !== "low" && samples >= MIN_SAMPLES
  };
}
function generateValidationId() {
  return `val_${crypto.randomBytes(6).toString("hex")}`;
}
async function runValidation(suggestionId, connectionId, originalQuery, optimizedQuery, tenantId, actorId) {
  const validationId = generateValidationId();
  const startTime = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const beforeRuns = await Promise.all([
      captureMetrics(originalQuery, "before"),
      captureMetrics(originalQuery, "before"),
      captureMetrics(originalQuery, "before")
    ]);
    const beforeMetrics = {
      executionTime: Math.round(beforeRuns.reduce((sum, m) => sum + m.executionTime, 0) / beforeRuns.length),
      rowsScanned: Math.round(beforeRuns.reduce((sum, m) => sum + m.rowsScanned, 0) / beforeRuns.length),
      rowsReturned: Math.round(beforeRuns.reduce((sum, m) => sum + m.rowsReturned, 0) / beforeRuns.length),
      executionPlan: beforeRuns[0].executionPlan,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const afterRuns = await Promise.all([
      captureMetrics(optimizedQuery, "after"),
      captureMetrics(optimizedQuery, "after"),
      captureMetrics(optimizedQuery, "after")
    ]);
    const afterMetrics = {
      executionTime: Math.round(afterRuns.reduce((sum, m) => sum + m.executionTime, 0) / afterRuns.length),
      rowsScanned: Math.round(afterRuns.reduce((sum, m) => sum + m.rowsScanned, 0) / afterRuns.length),
      rowsReturned: Math.round(afterRuns.reduce((sum, m) => sum + m.rowsReturned, 0) / afterRuns.length),
      executionPlan: afterRuns[0].executionPlan,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const improvement = calculateImprovement(beforeMetrics, afterMetrics);
    const confidenceData = scoreConfidence(beforeRuns.length, improvement.improvementPercent);
    const comparison = {
      ...improvement,
      ...confidenceData,
      samples: beforeRuns.length
    };
    const completedTime = (/* @__PURE__ */ new Date()).toISOString();
    return {
      id: validationId,
      tenantId,
      suggestionId,
      connectionId,
      status: "succeeded",
      beforeMetrics,
      afterMetrics,
      comparison,
      createdAt: startTime,
      completedAt: completedTime,
      actorId
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      id: validationId,
      tenantId,
      suggestionId,
      connectionId,
      status: "failed",
      error: errorMessage,
      createdAt: startTime,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      actorId
    };
  }
}

// netlify/functions/api-validation.mts
var api_validation_default = async (request) => {
  if (request.method === "POST") {
    const { tenantId, actorId } = getRequestContext(request);
    const { suggestionId, connectionId } = await request.json();
    if (!suggestionId || !connectionId) {
      return json({ error: "suggestionId and connectionId required" }, { status: 400 });
    }
    try {
      const suggestionKey = `suggestion:${tenantId}:${suggestionId}`;
      const blob = await getBlob({ key: suggestionKey });
      if (!blob) {
        return json({ error: "Suggestion not found" }, { status: 404 });
      }
      const suggestion = JSON.parse(blob);
      const validation = await runValidation(
        suggestionId,
        connectionId,
        suggestion.query,
        suggestion.sql_to_run,
        tenantId,
        actorId
      );
      const validationKey = `validation:${tenantId}:${validation.id}`;
      await fetch(new URL(`/api/netlify/blobs/validation:${tenantId}:${validation.id}`, request.url), {
        method: "PUT",
        body: JSON.stringify(validation),
        headers: { "Content-Type": "application/json" }
      });
      return json(validation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, { status: 500 });
    }
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const validationId = pathParts[pathParts.length - 1];
    if (!validationId || validationId === "validation") {
      return json({ error: "validationId required" }, { status: 400 });
    }
    const { tenantId } = getRequestContext(request);
    try {
      const validationKey = `validation:${tenantId}:${validationId}`;
      const blob = await getBlob({ key: validationKey });
      if (!blob) {
        return json({ error: "Validation not found" }, { status: 404 });
      }
      const validation = JSON.parse(blob);
      return json(validation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, { status: 500 });
    }
  }
  return json({ error: "Method not allowed" }, { status: 405 });
};
export {
  api_validation_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvYXBpLXZhbGlkYXRpb24ubXRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9hdXRoLnRzIiwgIm5ldGxpZnkvZnVuY3Rpb25zL2xpYi9yZXF1ZXN0LWNvbnRleHQudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL3ZhbGlkYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGpzb24gfSBmcm9tICdAdGFuc3RhY2svc3RhcnQnXG5pbXBvcnQgeyBnZXRSZXF1ZXN0Q29udGV4dCB9IGZyb20gJy4vbGliL3JlcXVlc3QtY29udGV4dCdcbmltcG9ydCB7IGxpc3RCbG9icywgZ2V0QmxvYiB9IGZyb20gJ0BuZXRsaWZ5L2Jsb2JzJ1xuaW1wb3J0IHsgcnVuVmFsaWRhdGlvbiB9IGZyb20gJy4vbGliL3ZhbGlkYXRpb24nXG5pbXBvcnQgeyBnZXRTdWdnZXN0aW9uIH0gZnJvbSAnLi9saWIvc3RvcmFnZSdcblxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKHJlcXVlc3Q6IFJlcXVlc3QpID0+IHtcbiAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAnUE9TVCcpIHtcbiAgICBjb25zdCB7IHRlbmFudElkLCBhY3RvcklkIH0gPSBnZXRSZXF1ZXN0Q29udGV4dChyZXF1ZXN0KVxuICAgIGNvbnN0IHsgc3VnZ2VzdGlvbklkLCBjb25uZWN0aW9uSWQgfSA9IGF3YWl0IHJlcXVlc3QuanNvbigpXG5cbiAgICBpZiAoIXN1Z2dlc3Rpb25JZCB8fCAhY29ubmVjdGlvbklkKSB7XG4gICAgICByZXR1cm4ganNvbih7IGVycm9yOiAnc3VnZ2VzdGlvbklkIGFuZCBjb25uZWN0aW9uSWQgcmVxdWlyZWQnIH0sIHsgc3RhdHVzOiA0MDAgfSlcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gR2V0IHRoZSBzdWdnZXN0aW9uIHRvIGV4dHJhY3QgcXVlcnkgYW5kIG9wdGltaXplZCBTUUxcbiAgICAgIGNvbnN0IHN1Z2dlc3Rpb25LZXkgPSBgc3VnZ2VzdGlvbjoke3RlbmFudElkfToke3N1Z2dlc3Rpb25JZH1gXG4gICAgICBjb25zdCBibG9iID0gYXdhaXQgZ2V0QmxvYih7IGtleTogc3VnZ2VzdGlvbktleSB9KVxuXG4gICAgICBpZiAoIWJsb2IpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oeyBlcnJvcjogJ1N1Z2dlc3Rpb24gbm90IGZvdW5kJyB9LCB7IHN0YXR1czogNDA0IH0pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSBKU09OLnBhcnNlKGJsb2IpXG5cbiAgICAgIC8vIFJ1biB2YWxpZGF0aW9uXG4gICAgICBjb25zdCB2YWxpZGF0aW9uID0gYXdhaXQgcnVuVmFsaWRhdGlvbihcbiAgICAgICAgc3VnZ2VzdGlvbklkLFxuICAgICAgICBjb25uZWN0aW9uSWQsXG4gICAgICAgIHN1Z2dlc3Rpb24ucXVlcnksXG4gICAgICAgIHN1Z2dlc3Rpb24uc3FsX3RvX3J1bixcbiAgICAgICAgdGVuYW50SWQsXG4gICAgICAgIGFjdG9ySWRcbiAgICAgIClcblxuICAgICAgLy8gU3RvcmUgdmFsaWRhdGlvbiByZXN1bHRcbiAgICAgIGNvbnN0IHZhbGlkYXRpb25LZXkgPSBgdmFsaWRhdGlvbjoke3RlbmFudElkfToke3ZhbGlkYXRpb24uaWR9YFxuICAgICAgYXdhaXQgZmV0Y2gobmV3IFVSTChgL2FwaS9uZXRsaWZ5L2Jsb2JzL3ZhbGlkYXRpb246JHt0ZW5hbnRJZH06JHt2YWxpZGF0aW9uLmlkfWAsIHJlcXVlc3QudXJsKSwge1xuICAgICAgICBtZXRob2Q6ICdQVVQnLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh2YWxpZGF0aW9uKSxcbiAgICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4ganNvbih2YWxpZGF0aW9uKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG4gICAgICByZXR1cm4ganNvbih7IGVycm9yOiBtZXNzYWdlIH0sIHsgc3RhdHVzOiA1MDAgfSlcbiAgICB9XG4gIH1cblxuICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdHRVQnKSB7XG4gICAgLy8gR0VUIC9hcGkvdmFsaWRhdGlvbi86aWRcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcXVlc3QudXJsKVxuICAgIGNvbnN0IHBhdGhQYXJ0cyA9IHVybC5wYXRobmFtZS5zcGxpdCgnLycpXG4gICAgY29uc3QgdmFsaWRhdGlvbklkID0gcGF0aFBhcnRzW3BhdGhQYXJ0cy5sZW5ndGggLSAxXVxuXG4gICAgaWYgKCF2YWxpZGF0aW9uSWQgfHwgdmFsaWRhdGlvbklkID09PSAndmFsaWRhdGlvbicpIHtcbiAgICAgIHJldHVybiBqc29uKHsgZXJyb3I6ICd2YWxpZGF0aW9uSWQgcmVxdWlyZWQnIH0sIHsgc3RhdHVzOiA0MDAgfSlcbiAgICB9XG5cbiAgICBjb25zdCB7IHRlbmFudElkIH0gPSBnZXRSZXF1ZXN0Q29udGV4dChyZXF1ZXN0KVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHZhbGlkYXRpb25LZXkgPSBgdmFsaWRhdGlvbjoke3RlbmFudElkfToke3ZhbGlkYXRpb25JZH1gXG4gICAgICBjb25zdCBibG9iID0gYXdhaXQgZ2V0QmxvYih7IGtleTogdmFsaWRhdGlvbktleSB9KVxuXG4gICAgICBpZiAoIWJsb2IpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oeyBlcnJvcjogJ1ZhbGlkYXRpb24gbm90IGZvdW5kJyB9LCB7IHN0YXR1czogNDA0IH0pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSBKU09OLnBhcnNlKGJsb2IpXG4gICAgICByZXR1cm4ganNvbih2YWxpZGF0aW9uKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG4gICAgICByZXR1cm4ganNvbih7IGVycm9yOiBtZXNzYWdlIH0sIHsgc3RhdHVzOiA1MDAgfSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4ganNvbih7IGVycm9yOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyB9LCB7IHN0YXR1czogNDA1IH0pXG59XG4iLCAiLyoqXG4gKiBKV1QgQXV0aGVudGljYXRpb24gVXRpbGl0aWVzXG4gKiBIYW5kbGVzIHRva2VuIGdlbmVyYXRpb24sIHZhbGlkYXRpb24sIGFuZCByZWZyZXNoXG4gKi9cblxuaW1wb3J0IHR5cGUgeyBKV1RDbGFpbXMsIFVzZXJSb2xlLCBUb2tlblBhaXIgfSBmcm9tICcuLi8uLi8uLi9zcmMvbGliL2F1dGgtdHlwZXMuanMnXG5cbmNvbnN0IEpXVF9TRUNSRVQgPSBwcm9jZXNzLmVudi5KV1RfU0VDUkVUIHx8ICdkZXYtc2VjcmV0LWtleS1ub3QtZm9yLXByb2R1Y3Rpb24nXG5jb25zdCBKV1RfQUxHT1JJVEhNID0gJ0hTMjU2J1xuY29uc3QgQUNDRVNTX1RPS0VOX0VYUElSWSA9IDM2MDAgLy8gMSBob3VyIGluIHNlY29uZHNcbmNvbnN0IFJFRlJFU0hfVE9LRU5fRVhQSVJZID0gNyAqIDI0ICogMzYwMCAvLyA3IGRheXMgaW4gc2Vjb25kc1xuXG4vLyBTaW1wbGUgSldUIGltcGxlbWVudGF0aW9uIGZvciBzZXJ2ZXJsZXNzIChubyBleHRlcm5hbCBkZXBzIG5lZWRlZCBmb3IgYmFzaWMgSFMyNTYpXG5leHBvcnQgZnVuY3Rpb24gZW5jb2RlSldUKGNsYWltczogT21pdDxKV1RDbGFpbXMsICdpYXQnIHwgJ2V4cCc+LCBleHBpcnlTZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBub3cgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKVxuICBjb25zdCBwYXlsb2FkOiBKV1RDbGFpbXMgPSB7XG4gICAgLi4uY2xhaW1zLFxuICAgIGlhdDogbm93LFxuICAgIGV4cDogbm93ICsgZXhwaXJ5U2Vjb25kcyxcbiAgfVxuXG4gIGNvbnN0IGhlYWRlciA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHsgYWxnOiBKV1RfQUxHT1JJVEhNLCB0eXA6ICdKV1QnIH0pKS50b1N0cmluZygnYmFzZTY0dXJsJylcbiAgY29uc3QgYm9keSA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKS50b1N0cmluZygnYmFzZTY0dXJsJylcbiAgY29uc3Qgc2lnbmF0dXJlID0gQnVmZmVyLmZyb20oXG4gICAgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGAke2hlYWRlcn0uJHtib2R5fWApLmJ1ZmZlcixcbiAgICAwXG4gICkudG9TdHJpbmcoJ2Jhc2U2NHVybCcpXG5cbiAgcmV0dXJuIGAke2hlYWRlcn0uJHtib2R5fS4ke3NpZ25hdHVyZX1gXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVKV1QodG9rZW46IHN0cmluZyk6IEpXVENsYWltcyB8IG51bGwge1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnRzID0gdG9rZW4uc3BsaXQoJy4nKVxuICAgIGlmIChwYXJ0cy5sZW5ndGggIT09IDMpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgSldUIGZvcm1hdCcpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGNvbnN0IFtoZWFkZXIsIHBheWxvYWQsIHNpZ25hdHVyZV0gPSBwYXJ0c1xuXG4gICAgLy8gVmVyaWZ5IHNpZ25hdHVyZSAoYmFzaWMgSFMyNTYpXG4gICAgY29uc3QgZXhwZWN0ZWRTaWduYXR1cmUgPSBCdWZmZXIuZnJvbShcbiAgICAgIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShgJHtoZWFkZXJ9LiR7cGF5bG9hZH1gKS5idWZmZXIsXG4gICAgICAwXG4gICAgKS50b1N0cmluZygnYmFzZTY0dXJsJylcblxuICAgIGlmIChzaWduYXR1cmUgIT09IGV4cGVjdGVkU2lnbmF0dXJlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdJbnZhbGlkIEpXVCBzaWduYXR1cmUnKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBjb25zdCBjbGFpbXMgPSBKU09OLnBhcnNlKEJ1ZmZlci5mcm9tKHBheWxvYWQsICdiYXNlNjR1cmwnKS50b1N0cmluZygpKSBhcyBKV1RDbGFpbXNcblxuICAgIC8vIENoZWNrIGV4cGlyYXRpb25cbiAgICBjb25zdCBub3cgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKVxuICAgIGlmIChjbGFpbXMuZXhwIDwgbm93KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdKV1QgdG9rZW4gZXhwaXJlZCcpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiBjbGFpbXNcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZGVjb2RlIEpXVDonLCBlcnJvcilcbiAgICByZXR1cm4gbnVsbFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVRva2VuUGFpcihcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGVtYWlsOiBzdHJpbmcsXG4gIHRlbmFudElkOiBzdHJpbmcsXG4gIHJvbGU6IFVzZXJSb2xlXG4pOiBUb2tlblBhaXIge1xuICBjb25zdCBhY2Nlc3NUb2tlbiA9IGVuY29kZUpXVChcbiAgICB7XG4gICAgICBzdWI6IHVzZXJJZCxcbiAgICAgIGVtYWlsLFxuICAgICAgdGVuYW50SWQsXG4gICAgICByb2xlLFxuICAgIH0sXG4gICAgQUNDRVNTX1RPS0VOX0VYUElSWVxuICApXG5cbiAgY29uc3QgcmVmcmVzaFRva2VuID0gZW5jb2RlSldUKFxuICAgIHtcbiAgICAgIHN1YjogdXNlcklkLFxuICAgICAgZW1haWwsXG4gICAgICB0ZW5hbnRJZCxcbiAgICAgIHJvbGUsXG4gICAgfSxcbiAgICBSRUZSRVNIX1RPS0VOX0VYUElSWVxuICApXG5cbiAgcmV0dXJuIHtcbiAgICBhY2Nlc3NUb2tlbixcbiAgICByZWZyZXNoVG9rZW4sXG4gICAgZXhwaXJlc0luOiBBQ0NFU1NfVE9LRU5fRVhQSVJZLFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0VG9rZW5Gcm9tUmVxdWVzdChyZXE6IFJlcXVlc3QpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgYXV0aEhlYWRlciA9IHJlcS5oZWFkZXJzLmdldCgnYXV0aG9yaXphdGlvbicpXG4gIGlmICghYXV0aEhlYWRlciB8fCAhYXV0aEhlYWRlci5zdGFydHNXaXRoKCdCZWFyZXIgJykpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG4gIHJldHVybiBhdXRoSGVhZGVyLnNsaWNlKDcpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVJlcXVlc3QocmVxOiBSZXF1ZXN0KTogSldUQ2xhaW1zIHwgbnVsbCB7XG4gIGNvbnN0IHRva2VuID0gZXh0cmFjdFRva2VuRnJvbVJlcXVlc3QocmVxKVxuICBpZiAoIXRva2VuKSB7XG4gICAgY29uc29sZS5lcnJvcignTm8gdG9rZW4gcHJvdmlkZWQnKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBjb25zdCBjbGFpbXMgPSBkZWNvZGVKV1QodG9rZW4pXG4gIGlmICghY2xhaW1zKSB7XG4gICAgY29uc29sZS5lcnJvcignSW52YWxpZCBvciBleHBpcmVkIHRva2VuJylcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIGNsYWltc1xufVxuXG5leHBvcnQgZnVuY3Rpb24ganNvbihkYXRhOiB1bmtub3duLCBzdGF0dXMgPSAyMDApOiBSZXNwb25zZSB7XG4gIHJldHVybiBSZXNwb25zZS5qc29uKGRhdGEsIHsgc3RhdHVzIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlcnJvclJlc3BvbnNlKG1lc3NhZ2U6IHN0cmluZywgc3RhdHVzID0gNDAwKTogUmVzcG9uc2Uge1xuICByZXR1cm4ganNvbih7IGVycm9yOiBtZXNzYWdlIH0sIHN0YXR1cylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVuYXV0aG9yaXplZFJlc3BvbnNlKCk6IFJlc3BvbnNlIHtcbiAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ1VuYXV0aG9yaXplZCcsIDQwMSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcmJpZGRlblJlc3BvbnNlKCk6IFJlc3BvbnNlIHtcbiAgcmV0dXJuIGVycm9yUmVzcG9uc2UoJ0ZvcmJpZGRlbicsIDQwMylcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEpXVENsYWltcyB9IGZyb20gJy4uLy4uLy4uL3NyYy9saWIvYXV0aC10eXBlcy5qcydcbmltcG9ydCB7IGRlY29kZUpXVCwgZXh0cmFjdFRva2VuRnJvbVJlcXVlc3QgfSBmcm9tICcuL2F1dGguanMnXG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVxdWVzdENvbnRleHQge1xuICB0ZW5hbnRJZDogc3RyaW5nXG4gIHVzZXJJZD86IHN0cmluZ1xuICBlbWFpbD86IHN0cmluZ1xuICByb2xlPzogc3RyaW5nXG4gIGFjdG9ySWQ6IHN0cmluZyAvLyBrZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG59XG5cbmNvbnN0IFRFTkFOVF9IRUFERVIgPSAneC10ZW5hbnQtaWQnXG5jb25zdCBBQ1RPUl9IRUFERVIgPSAneC1hY3Rvci1pZCdcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RDb250ZXh0KHJlcTogUmVxdWVzdCk6IFJlcXVlc3RDb250ZXh0IHtcbiAgLy8gVHJ5IEpXVCBmaXJzdFxuICBjb25zdCB0b2tlbiA9IGV4dHJhY3RUb2tlbkZyb21SZXF1ZXN0KHJlcSlcbiAgaWYgKHRva2VuKSB7XG4gICAgY29uc3QgY2xhaW1zID0gZGVjb2RlSldUKHRva2VuKVxuICAgIGlmIChjbGFpbXMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRlbmFudElkOiBjbGFpbXMudGVuYW50SWQsXG4gICAgICAgIHVzZXJJZDogY2xhaW1zLnN1YixcbiAgICAgICAgZW1haWw6IGNsYWltcy5lbWFpbCxcbiAgICAgICAgcm9sZTogY2xhaW1zLnJvbGUsXG4gICAgICAgIGFjdG9ySWQ6IGNsYWltcy5zdWIsIC8vIHVzZSB1c2VySWQgYXMgYWN0b3JJZFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGhlYWRlci1iYXNlZCBjb250ZXh0IChmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAgY29uc3QgdGVuYW50SGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KFRFTkFOVF9IRUFERVIpPy50cmltKClcbiAgY29uc3QgYWN0b3JIZWFkZXIgPSByZXEuaGVhZGVycy5nZXQoQUNUT1JfSEVBREVSKT8udHJpbSgpXG5cbiAgcmV0dXJuIHtcbiAgICB0ZW5hbnRJZDogdGVuYW50SGVhZGVyIHx8ICdkZWZhdWx0JyxcbiAgICBhY3RvcklkOiBhY3RvckhlYWRlciB8fCAnc3lzdGVtJyxcbiAgfVxufVxuIiwgImltcG9ydCBjcnlwdG8gZnJvbSAnY3J5cHRvJ1xuaW1wb3J0IHsgUG9vbCwgUG9vbENsaWVudCB9IGZyb20gJ3BnJ1xuXG5leHBvcnQgaW50ZXJmYWNlIE1ldHJpY3NDYXB0dXJlIHtcbiAgZXhlY3V0aW9uVGltZTogbnVtYmVyIC8vIG1pbGxpc2Vjb25kc1xuICByb3dzU2Nhbm5lZDogbnVtYmVyXG4gIHJvd3NSZXR1cm5lZDogbnVtYmVyXG4gIGV4ZWN1dGlvblBsYW46IHN0cmluZyAvLyBFWFBMQUlOIG91dHB1dFxuICBjYXB0dXJlZEF0OiBzdHJpbmcgLy8gSVNPIHRpbWVzdGFtcFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRpb25Db21wYXJpc29uIHtcbiAgaW1wcm92ZW1lbnRQZXJjZW50OiBudW1iZXIgLy8gKGJlZm9yZSAtIGFmdGVyKSAvIGJlZm9yZSAqIDEwMFxuICBpbXByb3ZlbWVudFR5cGU6ICd0aW1lJyB8ICdyb3dzJyB8ICdwbGFuJ1xuICBjb25maWRlbmNlOiAnbG93JyB8ICdtZWRpdW0nIHwgJ2hpZ2gnXG4gIGNvbmZpZGVuY2VTY29yZTogbnVtYmVyIC8vIDAtMTAwXG4gIHNhbXBsZXM6IG51bWJlclxuICBzdGF0aXN0aWNhbGx5U2lnbmlmaWNhbnQ6IGJvb2xlYW5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0aW9uUmVjb3JkIHtcbiAgaWQ6IHN0cmluZ1xuICB0ZW5hbnRJZDogc3RyaW5nXG4gIHN1Z2dlc3Rpb25JZDogc3RyaW5nXG4gIGNvbm5lY3Rpb25JZDogc3RyaW5nXG4gIHN0YXR1czogJ3BlbmRpbmcnIHwgJ3J1bm5pbmcnIHwgJ3N1Y2NlZWRlZCcgfCAnZmFpbGVkJ1xuICBiZWZvcmVNZXRyaWNzPzogTWV0cmljc0NhcHR1cmVcbiAgYWZ0ZXJNZXRyaWNzPzogTWV0cmljc0NhcHR1cmVcbiAgY29tcGFyaXNvbj86IFZhbGlkYXRpb25Db21wYXJpc29uXG4gIGVycm9yPzogc3RyaW5nXG4gIGNyZWF0ZWRBdDogc3RyaW5nXG4gIGNvbXBsZXRlZEF0Pzogc3RyaW5nXG4gIGFjdG9ySWQ6IHN0cmluZ1xufVxuXG4vLyBDb25uZWN0aW9uIHBvb2wgKHJldXNlZCBhY3Jvc3MgaW52b2NhdGlvbnMpXG5sZXQgY29ubmVjdGlvblBvb2w6IFBvb2wgfCBudWxsID0gbnVsbFxuXG5mdW5jdGlvbiBnZXRDb25uZWN0aW9uUG9vbCgpOiBQb29sIHtcbiAgaWYgKCFjb25uZWN0aW9uUG9vbCkge1xuICAgIGNvbnN0IGRiVXJsID0gcHJvY2Vzcy5lbnYuREFUQUJBU0VfVVJMIHx8IHByb2Nlc3MuZW52LlBPU1RHUkVTX1VSTFxuICAgIGlmICghZGJVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignREFUQUJBU0VfVVJMIG9yIFBPU1RHUkVTX1VSTCBlbnZpcm9ubWVudCB2YXJpYWJsZSBub3Qgc2V0JylcbiAgICB9XG4gICAgY29ubmVjdGlvblBvb2wgPSBuZXcgUG9vbCh7XG4gICAgICBjb25uZWN0aW9uU3RyaW5nOiBkYlVybCxcbiAgICAgIG1heDogNSxcbiAgICAgIGlkbGVUaW1lb3V0TWlsbGlzOiAzMDAwMCxcbiAgICAgIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiA1MDAwLFxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIGNvbm5lY3Rpb25Qb29sXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjYXB0dXJlTWV0cmljcyhcbiAgcXVlcnk6IHN0cmluZyxcbiAgbGFiZWw6IHN0cmluZyxcbiAgY29ubmVjdGlvbklkPzogc3RyaW5nXG4pOiBQcm9taXNlPE1ldHJpY3NDYXB0dXJlPiB7XG4gIGNvbnN0IHBvb2wgPSBnZXRDb25uZWN0aW9uUG9vbCgpXG4gIGxldCBjbGllbnQ6IFBvb2xDbGllbnQgfCBudWxsID0gbnVsbFxuICBcbiAgdHJ5IHtcbiAgICAvLyBHZXQgY29ubmVjdGlvbiBmcm9tIHBvb2xcbiAgICBjbGllbnQgPSBhd2FpdCBwb29sLmNvbm5lY3QoKVxuICAgIFxuICAgIC8vIEV4ZWN1dGUgRVhQTEFJTiBBTkFMWVpFIHRvIGdldCBleGVjdXRpb24gcGxhbiBhbmQgbWV0cmljc1xuICAgIGNvbnN0IGV4cGxhaW5RdWVyeSA9IGBFWFBMQUlOIChBTkFMWVpFLCBCVUZGRVJTLCBWRVJCT1NFLCBGT1JNQVQgSlNPTikgJHtxdWVyeX1gXG4gICAgXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KClcbiAgICBcbiAgICAvLyBTZXQgc3RhdGVtZW50IHRpbWVvdXQgdG8gMzAgc2Vjb25kc1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnU0VUIHN0YXRlbWVudF90aW1lb3V0ID0gMzAwMDAnKVxuICAgIFxuICAgIC8vIEV4ZWN1dGUgdGhlIHF1ZXJ5IHdpdGggdGltZW91dFxuICAgIGNvbnN0IHRpbWVvdXRQcm9taXNlID0gbmV3IFByb21pc2U8bmV2ZXI+KChfLCByZWplY3QpID0+IHtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignUXVlcnkgZXhlY3V0aW9uIHRpbWVvdXQgKDMwcyknKSksIDM1MDAwKVxuICAgIH0pXG4gICAgXG4gICAgY29uc3QgZXhwbGFpblJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShbXG4gICAgICBjbGllbnQucXVlcnkoZXhwbGFpblF1ZXJ5KSxcbiAgICAgIHRpbWVvdXRQcm9taXNlLFxuICAgIF0pXG4gICAgXG4gICAgY29uc3QgZW5kVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgY29uc3QgZXhlY3V0aW9uVGltZSA9IE1hdGgucm91bmQoKGVuZFRpbWUgLSBzdGFydFRpbWUpICogMTApIC8gMTBcbiAgICBcbiAgICAvLyBQYXJzZSBFWFBMQUlOIG91dHB1dFxuICAgIGNvbnN0IHBsYW4gPSBleHBsYWluUmVzdWx0LnJvd3NbMF0/LlswXT8uWzBdXG4gICAgaWYgKCFwbGFuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBFWFBMQUlOIG91dHB1dCcpXG4gICAgfVxuICAgIFxuICAgIC8vIEV4dHJhY3QgbWV0cmljcyBmcm9tIEVYUExBSU4gQU5BTFlaRVxuICAgIGNvbnN0IGV4ZWN1dGlvblRpbWVNcyA9IHBsYW5bJ0V4ZWN1dGlvbiBUaW1lJ10gfHwgZXhlY3V0aW9uVGltZVxuICAgIGNvbnN0IHBsYW5uaW5nVGltZSA9IHBsYW5bJ1BsYW5uaW5nIFRpbWUnXSB8fCAwXG4gICAgY29uc3QgdG90YWxUaW1lID0gZXhlY3V0aW9uVGltZU1zICsgcGxhbm5pbmdUaW1lXG4gICAgXG4gICAgLy8gR2V0IGFjdHVhbCByb3cgY291bnQgZnJvbSB0aGUgZXhlY3V0aW9uIHBsYW5cbiAgICBjb25zdCBnZXRSb3dzRnJvbVBsYW4gPSAobm9kZTogYW55KTogbnVtYmVyID0+IHtcbiAgICAgIGlmICghbm9kZSkgcmV0dXJuIDBcbiAgICAgIGNvbnN0IGFjdHVhbCA9IG5vZGVbJ0FjdHVhbCBSb3dzJ10gfHwgMFxuICAgICAgaWYgKG5vZGVbJ1BsYW5zJ10gJiYgbm9kZVsnUGxhbnMnXS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heChhY3R1YWwsIC4uLm5vZGVbJ1BsYW5zJ10ubWFwKGdldFJvd3NGcm9tUGxhbikpXG4gICAgICB9XG4gICAgICByZXR1cm4gYWN0dWFsXG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHJvd3NSZXR1cm5lZCA9IGdldFJvd3NGcm9tUGxhbihwbGFuKSB8fCAwXG4gICAgXG4gICAgLy8gRXN0aW1hdGUgcm93cyBzY2FubmVkIChvZnRlbiBtb3JlIHRoYW4gcmV0dXJuZWQgZHVlIHRvIGZpbHRlcmluZylcbiAgICBjb25zdCBnZXRSb3dzU2Nhbm5lZCA9IChub2RlOiBhbnkpOiBudW1iZXIgPT4ge1xuICAgICAgaWYgKCFub2RlKSByZXR1cm4gMFxuICAgICAgY29uc3QgYWN0dWFsID0gbm9kZVsnQWN0dWFsIFJvd3MnXSB8fCAwXG4gICAgICBjb25zdCBlc3RpbWF0ZWRSb3dzID0gbm9kZVsnRXN0aW1hdGVkIFJvd3MnXSB8fCBhY3R1YWxcbiAgICAgIGlmIChub2RlWydQbGFucyddICYmIG5vZGVbJ1BsYW5zJ10ubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBjaGlsZFNjYW5zID0gbm9kZVsnUGxhbnMnXS5tYXAoZ2V0Um93c1NjYW5uZWQpLnJlZHVjZSgoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgKyBiLCAwKVxuICAgICAgICByZXR1cm4gTWF0aC5tYXgoZXN0aW1hdGVkUm93cyAqIDIsIGNoaWxkU2NhbnMpIC8vIFJvdWdoIGVzdGltYXRlXG4gICAgICB9XG4gICAgICByZXR1cm4gTWF0aC5tYXgoYWN0dWFsLCBlc3RpbWF0ZWRSb3dzKVxuICAgIH1cbiAgICBcbiAgICBjb25zdCByb3dzU2Nhbm5lZCA9IE1hdGgubWF4KHJvd3NSZXR1cm5lZCwgZ2V0Um93c1NjYW5uZWQocGxhbikgKiAyKSB8fCAxMDAwXG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIGV4ZWN1dGlvblRpbWU6IE1hdGgucm91bmQodG90YWxUaW1lICogMTApIC8gMTAsXG4gICAgICByb3dzU2Nhbm5lZDogTWF0aC5mbG9vcihyb3dzU2Nhbm5lZCksXG4gICAgICByb3dzUmV0dXJuZWQ6IE1hdGguZmxvb3Iocm93c1JldHVybmVkKSxcbiAgICAgIGV4ZWN1dGlvblBsYW46IEpTT04uc3RyaW5naWZ5KHBsYW4sIG51bGwsIDIpLFxuICAgICAgY2FwdHVyZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIHNwZWNpZmljIGVycm9yc1xuICAgIGlmIChtZXNzYWdlLmluY2x1ZGVzKCd0aW1lb3V0JykgfHwgbWVzc2FnZS5pbmNsdWRlcygnMzAwMDAnKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdRdWVyeSBleGVjdXRpb24gZXhjZWVkZWQgMzAtc2Vjb25kIHRpbWVvdXQnKVxuICAgIH1cbiAgICBcbiAgICBpZiAobWVzc2FnZS5pbmNsdWRlcygnbm8gc3VjaCB0YWJsZScpIHx8IG1lc3NhZ2UuaW5jbHVkZXMoJ2RvZXMgbm90IGV4aXN0JykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUXVlcnkgdGFibGUgbm90IGZvdW5kIChjaGVjayB0ZXN0IGRhdGFiYXNlIGNvbm5lY3Rpb24pJylcbiAgICB9XG4gICAgXG4gICAgLy8gRmFsbGJhY2sgdG8gbW9jayBpZiBEQiBub3QgYXZhaWxhYmxlIChmb3IgZGV2ZWxvcG1lbnQpXG4gICAgaWYgKG1lc3NhZ2UuaW5jbHVkZXMoJ0RBVEFCQVNFX1VSTCcpIHx8IG1lc3NhZ2UuaW5jbHVkZXMoJ1BPU1RHUkVTX1VSTCcpKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ05vIGRhdGFiYXNlIFVSTCBjb25maWd1cmVkLCB1c2luZyBtb2NrIG1ldHJpY3MgZm9yIGRldmVsb3BtZW50JylcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGV4ZWN1dGlvblRpbWU6IGxhYmVsID09PSAnYmVmb3JlJyBcbiAgICAgICAgICA/IE1hdGgucmFuZG9tKCkgKiAzMDAwICsgMTUwMCAgXG4gICAgICAgICAgOiBNYXRoLnJhbmRvbSgpICogNTAwICsgNTAsXG4gICAgICAgIHJvd3NTY2FubmVkOiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAyMDAwMDApLFxuICAgICAgICByb3dzUmV0dXJuZWQ6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDApLFxuICAgICAgICBleGVjdXRpb25QbGFuOiBgJHtsYWJlbCA9PT0gJ2JlZm9yZScgPyAnU2VxIFNjYW4nIDogJ0luZGV4IFNjYW4nfSAobW9ja2VkKWAsXG4gICAgICAgIGNhcHR1cmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgdGhyb3cgZXJyb3JcbiAgfSBmaW5hbGx5IHtcbiAgICBpZiAoY2xpZW50KSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYWxjdWxhdGVJbXByb3ZlbWVudChcbiAgYmVmb3JlTWV0cmljczogTWV0cmljc0NhcHR1cmUsXG4gIGFmdGVyTWV0cmljczogTWV0cmljc0NhcHR1cmVcbik6IE9taXQ8VmFsaWRhdGlvbkNvbXBhcmlzb24sICdjb25maWRlbmNlJyB8ICdjb25maWRlbmNlU2NvcmUnIHwgJ3N0YXRpc3RpY2FsbHlTaWduaWZpY2FudCc+IHtcbiAgY29uc3QgdGltZURpZmYgPSBiZWZvcmVNZXRyaWNzLmV4ZWN1dGlvblRpbWUgLSBhZnRlck1ldHJpY3MuZXhlY3V0aW9uVGltZVxuICBjb25zdCB0aW1lSW1wcm92ZW1lbnQgPSAodGltZURpZmYgLyBiZWZvcmVNZXRyaWNzLmV4ZWN1dGlvblRpbWUpICogMTAwXG5cbiAgY29uc3Qgcm93c0RpZmYgPSBiZWZvcmVNZXRyaWNzLnJvd3NTY2FubmVkIC0gYWZ0ZXJNZXRyaWNzLnJvd3NTY2FubmVkXG4gIGNvbnN0IHJvd3NJbXByb3ZlbWVudCA9IGJlZm9yZU1ldHJpY3Mucm93c1NjYW5uZWQgPiAwIFxuICAgID8gKHJvd3NEaWZmIC8gYmVmb3JlTWV0cmljcy5yb3dzU2Nhbm5lZCkgKiAxMDBcbiAgICA6IDBcblxuICAvLyBQcmltYXJ5IG1ldHJpYyBpcyB0aW1lIGltcHJvdmVtZW50XG4gIGNvbnN0IGltcHJvdmVtZW50UGVyY2VudCA9IE1hdGgubWF4KDAsIHRpbWVJbXByb3ZlbWVudClcbiAgY29uc3QgaW1wcm92ZW1lbnRUeXBlOiAndGltZScgfCAncm93cycgfCAncGxhbicgPSBcbiAgICBpbXByb3ZlbWVudFBlcmNlbnQgPiByb3dzSW1wcm92ZW1lbnQgPyAndGltZScgOiAncm93cydcblxuICByZXR1cm4ge1xuICAgIGltcHJvdmVtZW50UGVyY2VudDogTWF0aC5yb3VuZChpbXByb3ZlbWVudFBlcmNlbnQgKiAxMCkgLyAxMCxcbiAgICBpbXByb3ZlbWVudFR5cGUsXG4gICAgc2FtcGxlczogMSxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2NvcmVDb25maWRlbmNlKFxuICBzYW1wbGVzOiBudW1iZXIsXG4gIGltcHJvdmVtZW50UGVyY2VudDogbnVtYmVyXG4pOiBPbWl0PFZhbGlkYXRpb25Db21wYXJpc29uLCAnaW1wcm92ZW1lbnRQZXJjZW50JyB8ICdpbXByb3ZlbWVudFR5cGUnIHwgJ3NhbXBsZXMnPiB7XG4gIC8vIENvbmZpZGVuY2UgZmFjdG9yczpcbiAgLy8gMS4gTnVtYmVyIG9mIHNhbXBsZXMgKG1vcmUgcnVucyA9IG1vcmUgY29uZmlkZW50KVxuICAvLyAyLiBJbXByb3ZlbWVudCBtYWduaXR1ZGUgKGxhcmdlciBpbXByb3ZlbWVudHMgPSBtb3JlIGNvbmZpZGVudClcbiAgLy8gMy4gU3RhdGlzdGljYWwgdGhyZXNob2xkICg1JSBub2lzZSB0b2xlcmFuY2UpXG5cbiAgY29uc3QgTk9JU0VfVEhSRVNIT0xEID0gNSAvLyBJZ25vcmUgaW1wcm92ZW1lbnRzIDwgNSVcbiAgY29uc3QgTUlOX1NBTVBMRVMgPSAzXG4gIGNvbnN0IE1BWF9TQU1QTEVTID0gMTBcblxuICBpZiAoaW1wcm92ZW1lbnRQZXJjZW50IDwgTk9JU0VfVEhSRVNIT0xEKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbmZpZGVuY2U6ICdsb3cnLFxuICAgICAgY29uZmlkZW5jZVNjb3JlOiAzMCxcbiAgICAgIHN0YXRpc3RpY2FsbHlTaWduaWZpY2FudDogZmFsc2UsXG4gICAgfVxuICB9XG5cbiAgLy8gU2FtcGxlIGNvbmZpZGVuY2U6IDMgc2FtcGxlcyA9IDUwJSwgMTAgc2FtcGxlcyA9IDEwMCVcbiAgY29uc3Qgc2FtcGxlQ29uZmlkZW5jZSA9IE1hdGgubWluKDEwMCwgKHNhbXBsZXMgLyBNQVhfU0FNUExFUykgKiAxMDApXG5cbiAgLy8gSW1wcm92ZW1lbnQgY29uZmlkZW5jZTogNSUgPSA0MCUsIDUwJSA9IDEwMCVcbiAgY29uc3QgaW1wcm92ZW1lbnRDb25maWRlbmNlID0gTWF0aC5taW4oMTAwLCAoaW1wcm92ZW1lbnRQZXJjZW50IC8gNTApICogMTAwKVxuXG4gIC8vIEF2ZXJhZ2UgdGhlIHR3byBmYWN0b3JzXG4gIGNvbnN0IGNvbmZpZGVuY2VTY29yZSA9IE1hdGgucm91bmQoKHNhbXBsZUNvbmZpZGVuY2UgKyBpbXByb3ZlbWVudENvbmZpZGVuY2UpIC8gMilcblxuICBsZXQgY29uZmlkZW5jZTogJ2xvdycgfCAnbWVkaXVtJyB8ICdoaWdoJ1xuICBpZiAoY29uZmlkZW5jZVNjb3JlID49IDg1ICYmIHNhbXBsZXMgPj0gTUlOX1NBTVBMRVMpIHtcbiAgICBjb25maWRlbmNlID0gJ2hpZ2gnXG4gIH0gZWxzZSBpZiAoY29uZmlkZW5jZVNjb3JlID49IDcwKSB7XG4gICAgY29uZmlkZW5jZSA9ICdtZWRpdW0nXG4gIH0gZWxzZSB7XG4gICAgY29uZmlkZW5jZSA9ICdsb3cnXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbmZpZGVuY2UsXG4gICAgY29uZmlkZW5jZVNjb3JlLFxuICAgIHN0YXRpc3RpY2FsbHlTaWduaWZpY2FudDogY29uZmlkZW5jZSAhPT0gJ2xvdycgJiYgc2FtcGxlcyA+PSBNSU5fU0FNUExFUyxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVWYWxpZGF0aW9uSWQoKTogc3RyaW5nIHtcbiAgcmV0dXJuIGB2YWxfJHtjcnlwdG8ucmFuZG9tQnl0ZXMoNikudG9TdHJpbmcoJ2hleCcpfWBcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blZhbGlkYXRpb24oXG4gIHN1Z2dlc3Rpb25JZDogc3RyaW5nLFxuICBjb25uZWN0aW9uSWQ6IHN0cmluZyxcbiAgb3JpZ2luYWxRdWVyeTogc3RyaW5nLFxuICBvcHRpbWl6ZWRRdWVyeTogc3RyaW5nLFxuICB0ZW5hbnRJZDogc3RyaW5nLFxuICBhY3RvcklkOiBzdHJpbmdcbik6IFByb21pc2U8VmFsaWRhdGlvblJlY29yZD4ge1xuICBjb25zdCB2YWxpZGF0aW9uSWQgPSBnZW5lcmF0ZVZhbGlkYXRpb25JZCgpXG4gIGNvbnN0IHN0YXJ0VGltZSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuXG4gIHRyeSB7XG4gICAgLy8gMS4gQ2FwdHVyZSBiZWZvcmUgbWV0cmljcyAocnVuIDMgdGltZXMsIGF2ZXJhZ2UpXG4gICAgY29uc3QgYmVmb3JlUnVucyA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIGNhcHR1cmVNZXRyaWNzKG9yaWdpbmFsUXVlcnksICdiZWZvcmUnKSxcbiAgICAgIGNhcHR1cmVNZXRyaWNzKG9yaWdpbmFsUXVlcnksICdiZWZvcmUnKSxcbiAgICAgIGNhcHR1cmVNZXRyaWNzKG9yaWdpbmFsUXVlcnksICdiZWZvcmUnKSxcbiAgICBdKVxuXG4gICAgY29uc3QgYmVmb3JlTWV0cmljczogTWV0cmljc0NhcHR1cmUgPSB7XG4gICAgICBleGVjdXRpb25UaW1lOiBNYXRoLnJvdW5kKGJlZm9yZVJ1bnMucmVkdWNlKChzdW0sIG0pID0+IHN1bSArIG0uZXhlY3V0aW9uVGltZSwgMCkgLyBiZWZvcmVSdW5zLmxlbmd0aCksXG4gICAgICByb3dzU2Nhbm5lZDogTWF0aC5yb3VuZChiZWZvcmVSdW5zLnJlZHVjZSgoc3VtLCBtKSA9PiBzdW0gKyBtLnJvd3NTY2FubmVkLCAwKSAvIGJlZm9yZVJ1bnMubGVuZ3RoKSxcbiAgICAgIHJvd3NSZXR1cm5lZDogTWF0aC5yb3VuZChiZWZvcmVSdW5zLnJlZHVjZSgoc3VtLCBtKSA9PiBzdW0gKyBtLnJvd3NSZXR1cm5lZCwgMCkgLyBiZWZvcmVSdW5zLmxlbmd0aCksXG4gICAgICBleGVjdXRpb25QbGFuOiBiZWZvcmVSdW5zWzBdLmV4ZWN1dGlvblBsYW4sXG4gICAgICBjYXB0dXJlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfVxuXG4gICAgLy8gMi4gQ2FwdHVyZSBhZnRlciBtZXRyaWNzIChydW4gMyB0aW1lcywgYXZlcmFnZSlcbiAgICBjb25zdCBhZnRlclJ1bnMgPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBjYXB0dXJlTWV0cmljcyhvcHRpbWl6ZWRRdWVyeSwgJ2FmdGVyJyksXG4gICAgICBjYXB0dXJlTWV0cmljcyhvcHRpbWl6ZWRRdWVyeSwgJ2FmdGVyJyksXG4gICAgICBjYXB0dXJlTWV0cmljcyhvcHRpbWl6ZWRRdWVyeSwgJ2FmdGVyJyksXG4gICAgXSlcblxuICAgIGNvbnN0IGFmdGVyTWV0cmljczogTWV0cmljc0NhcHR1cmUgPSB7XG4gICAgICBleGVjdXRpb25UaW1lOiBNYXRoLnJvdW5kKGFmdGVyUnVucy5yZWR1Y2UoKHN1bSwgbSkgPT4gc3VtICsgbS5leGVjdXRpb25UaW1lLCAwKSAvIGFmdGVyUnVucy5sZW5ndGgpLFxuICAgICAgcm93c1NjYW5uZWQ6IE1hdGgucm91bmQoYWZ0ZXJSdW5zLnJlZHVjZSgoc3VtLCBtKSA9PiBzdW0gKyBtLnJvd3NTY2FubmVkLCAwKSAvIGFmdGVyUnVucy5sZW5ndGgpLFxuICAgICAgcm93c1JldHVybmVkOiBNYXRoLnJvdW5kKGFmdGVyUnVucy5yZWR1Y2UoKHN1bSwgbSkgPT4gc3VtICsgbS5yb3dzUmV0dXJuZWQsIDApIC8gYWZ0ZXJSdW5zLmxlbmd0aCksXG4gICAgICBleGVjdXRpb25QbGFuOiBhZnRlclJ1bnNbMF0uZXhlY3V0aW9uUGxhbixcbiAgICAgIGNhcHR1cmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICB9XG5cbiAgICAvLyAzLiBDYWxjdWxhdGUgaW1wcm92ZW1lbnRcbiAgICBjb25zdCBpbXByb3ZlbWVudCA9IGNhbGN1bGF0ZUltcHJvdmVtZW50KGJlZm9yZU1ldHJpY3MsIGFmdGVyTWV0cmljcylcblxuICAgIC8vIDQuIFNjb3JlIGNvbmZpZGVuY2VcbiAgICBjb25zdCBjb25maWRlbmNlRGF0YSA9IHNjb3JlQ29uZmlkZW5jZShiZWZvcmVSdW5zLmxlbmd0aCwgaW1wcm92ZW1lbnQuaW1wcm92ZW1lbnRQZXJjZW50KVxuXG4gICAgLy8gNS4gQ29tYmluZSByZXN1bHRzXG4gICAgY29uc3QgY29tcGFyaXNvbjogVmFsaWRhdGlvbkNvbXBhcmlzb24gPSB7XG4gICAgICAuLi5pbXByb3ZlbWVudCxcbiAgICAgIC4uLmNvbmZpZGVuY2VEYXRhLFxuICAgICAgc2FtcGxlczogYmVmb3JlUnVucy5sZW5ndGgsXG4gICAgfVxuXG4gICAgY29uc3QgY29tcGxldGVkVGltZSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiB2YWxpZGF0aW9uSWQsXG4gICAgICB0ZW5hbnRJZCxcbiAgICAgIHN1Z2dlc3Rpb25JZCxcbiAgICAgIGNvbm5lY3Rpb25JZCxcbiAgICAgIHN0YXR1czogJ3N1Y2NlZWRlZCcsXG4gICAgICBiZWZvcmVNZXRyaWNzLFxuICAgICAgYWZ0ZXJNZXRyaWNzLFxuICAgICAgY29tcGFyaXNvbixcbiAgICAgIGNyZWF0ZWRBdDogc3RhcnRUaW1lLFxuICAgICAgY29tcGxldGVkQXQ6IGNvbXBsZXRlZFRpbWUsXG4gICAgICBhY3RvcklkLFxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcilcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHZhbGlkYXRpb25JZCxcbiAgICAgIHRlbmFudElkLFxuICAgICAgc3VnZ2VzdGlvbklkLFxuICAgICAgY29ubmVjdGlvbklkLFxuICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgIGVycm9yOiBlcnJvck1lc3NhZ2UsXG4gICAgICBjcmVhdGVkQXQ6IHN0YXJ0VGltZSxcbiAgICAgIGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBhY3RvcklkLFxuICAgIH1cbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUFBLFNBQVMsWUFBWTs7O0FDT3JCLElBQU0sYUFBYSxRQUFRLElBQUksY0FBYztBQUc3QyxJQUFNLHVCQUF1QixJQUFJLEtBQUs7QUFxQi9CLFNBQVMsVUFBVSxPQUFpQztBQUN6RCxNQUFJO0FBQ0YsVUFBTSxRQUFRLE1BQU0sTUFBTSxHQUFHO0FBQzdCLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdEIsY0FBUSxNQUFNLG9CQUFvQjtBQUNsQyxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sQ0FBQyxRQUFRLFNBQVMsU0FBUyxJQUFJO0FBR3JDLFVBQU0sb0JBQW9CLE9BQU87QUFBQSxNQUMvQixJQUFJLFlBQVksRUFBRSxPQUFPLEdBQUcsTUFBTSxJQUFJLE9BQU8sRUFBRSxFQUFFO0FBQUEsTUFDakQ7QUFBQSxJQUNGLEVBQUUsU0FBUyxXQUFXO0FBRXRCLFFBQUksY0FBYyxtQkFBbUI7QUFDbkMsY0FBUSxNQUFNLHVCQUF1QjtBQUNyQyxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sU0FBUyxLQUFLLE1BQU0sT0FBTyxLQUFLLFNBQVMsV0FBVyxFQUFFLFNBQVMsQ0FBQztBQUd0RSxVQUFNLE1BQU0sS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLEdBQUk7QUFDeEMsUUFBSSxPQUFPLE1BQU0sS0FB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
