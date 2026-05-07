
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);


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
function queryKey(id) {
  return `query/${id}`;
}
function explainKey(id) {
  return `explain/${id}`;
}
function analysisKey(id) {
  return `analysis/${id}`;
}
function suggestionKey(id) {
  return `suggestion/${id}`;
}
function policyKey(id) {
  return `policy/${id}`;
}
function approvalKey(id) {
  return `approval/${id}`;
}
function auditKey(id) {
  return `audit/${id}`;
}

// netlify/functions/lib/gemini.ts
import { GoogleGenAI } from "@google/genai";
import { getStore as getStore2 } from "@netlify/blobs";
var ai = new GoogleGenAI({});
async function analyzeExecutionPlan(queryText, planJson) {
  const planStr = JSON.stringify(planJson, null, 2).substring(0, 8e3);
  const queryStr = queryText.substring(0, 2e3);
  const prompt = `You are a PostgreSQL performance expert. Analyze this EXPLAIN ANALYZE output and provide actionable optimization recommendations.

Query:
\`\`\`sql
${queryStr}
\`\`\`

Execution Plan (JSON):
\`\`\`json
${planStr}
\`\`\`

Respond with ONLY a valid JSON object (no markdown fences, no extra text). Use this exact schema:
{
  "summary": "2-3 sentence plain English explanation of what the query does and the primary performance issues",
  "bottlenecks": [
    {
      "type": "critical",
      "title": "Sequential Scan on large table",
      "description": "The orders table is being fully scanned (2.4M rows) but only 847 rows are returned. Adding an index on (user_id, created_at) would reduce this to 847 row lookups."
    }
  ],
  "index_recommendations": [
    {
      "title": "Composite index on orders(user_id, created_at)",
      "sql": "CREATE INDEX CONCURRENTLY idx_orders_user_created ON orders(user_id, created_at DESC);",
      "estimated_improvement_pct": 85,
      "explanation": "This index directly supports the WHERE clause filter and ORDER BY, eliminating the sequential scan."
    }
  ],
  "query_rewrite": null
}

Rules:
- If no rewrite is helpful, set query_rewrite to null
- estimated_improvement_pct should be a realistic 0-99 integer
- bottleneck type: "critical" for sequential scans on large tables, missing indexes on join keys; "warning" for suboptimal joins, high row estimates; "info" for minor issues
- Always use CONCURRENTLY for index creation SQL
- If the query is already optimal, say so in the summary and return empty arrays`;
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt
  });
  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response was not valid JSON");
  const parsed = JSON.parse(jsonMatch[0]);
  return { ...parsed, tokens_used: text.length };
}
async function checkRateLimit(userId = "default") {
  const store2 = getStore2({ name: "querysage-ratelimits", consistency: "strong" });
  const hour = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
  const key = `ai-limit/${userId}/${hour}`;
  const current = await store2.get(key, { type: "json" }) ?? 0;
  const limit = 20;
  if (current >= limit) return { allowed: false, remaining: 0 };
  await store2.setJSON(key, current + 1);
  return { allowed: true, remaining: limit - current - 1 };
}

// netlify/functions/lib/guardrails.ts
var DEFAULT_POLICY_RULES = {
  min_improvement_pct: 10,
  approval_risk_threshold: 60,
  block_risk_threshold: 85
};
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function buildDefaultPolicy(tenantId = "default") {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: "default-policy",
    tenant_id: tenantId,
    name: "Default Guardrail Policy",
    active: true,
    rules: DEFAULT_POLICY_RULES,
    created_at: now,
    updated_at: now
  };
}
async function getActivePolicy(tenantId = "default") {
  const policies = await listByPrefix("policy/");
  const active = policies.find((p) => p.tenant_id === tenantId && p.active);
  if (active) return active;
  const fallback = buildDefaultPolicy(tenantId);
  await setItem(policyKey(fallback.id), fallback);
  return fallback;
}
function assessSuggestion(suggestion, policy) {
  const improvement = clamp(Number(suggestion.estimated_improvement_pct ?? 0), 0, 99);
  const lowerSql = String(suggestion.sql_to_run ?? "").toLowerCase();
  const typeBaseRisk = suggestion.suggestion_type === "config" ? 70 : suggestion.suggestion_type === "rewrite" ? 55 : 45;
  const concurrentReduction = suggestion.suggestion_type === "index" && lowerSql.includes("create index concurrently") ? 15 : 0;
  const estimatedRisk = clamp(typeBaseRisk + (45 - improvement) - concurrentReduction, 5, 99);
  const confidence = clamp(Math.round(improvement * 0.7 + (100 - estimatedRisk) * 0.3), 1, 99);
  if (improvement < policy.rules.min_improvement_pct) {
    return {
      risk_score: estimatedRisk,
      confidence_score: confidence,
      policy_decision: "blocked",
      decision_reason: `Estimated improvement ${improvement}% is below policy minimum ${policy.rules.min_improvement_pct}%`
    };
  }
  if (estimatedRisk >= policy.rules.block_risk_threshold) {
    return {
      risk_score: estimatedRisk,
      confidence_score: confidence,
      policy_decision: "blocked",
      decision_reason: `Risk score ${estimatedRisk} exceeds block threshold ${policy.rules.block_risk_threshold}`
    };
  }
  if (estimatedRisk >= policy.rules.approval_risk_threshold) {
    return {
      risk_score: estimatedRisk,
      confidence_score: confidence,
      policy_decision: "approval_required",
      decision_reason: `Risk score ${estimatedRisk} requires manual approval`
    };
  }
  return {
    risk_score: estimatedRisk,
    confidence_score: confidence,
    policy_decision: "eligible_for_validation",
    decision_reason: "Low-risk recommendation eligible for validation"
  };
}

// netlify/functions/lib/audit.ts
import { createHash, randomUUID } from "crypto";
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

// netlify/functions/api-query-analyze.mts
function json(data, status = 200) {
  return Response.json(data, { status });
}
var api_query_analyze_default = async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { id } = ctx.params;
  const rateCheck = await checkRateLimit();
  if (!rateCheck.allowed) return json({ error: "Rate limit exceeded. Max 20 AI analyses per hour." }, 429);
  const query = await getItem(queryKey(id));
  if (!query) return json({ error: "Query not found" }, 404);
  const { tenantId, actorId } = getRequestContext(req);
  const explains = (await listByPrefix("explain/")).filter((e) => e.query_id === id).sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());
  const body = await req.json().catch(() => ({}));
  let planJson = explains[0]?.raw_plan_json;
  if (body.explain_result_id) {
    const specific = await getItem(explainKey(body.explain_result_id));
    if (specific) planJson = specific.raw_plan_json;
  }
  if (!planJson) return json({ error: "No EXPLAIN ANALYZE result found. Run EXPLAIN ANALYZE first." }, 422);
  try {
    const result = await analyzeExecutionPlan(query.query_text, planJson);
    const analysisId = crypto.randomUUID();
    const analysis = {
      id: analysisId,
      query_id: id,
      explain_result_id: explains[0]?.id ?? null,
      summary: result.summary,
      bottlenecks_json: result.bottlenecks,
      model_used: "gemini-2.0-flash",
      tokens_used: result.tokens_used,
      cost_usd: 0,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      tenant_id: tenantId
    };
    await setItem(analysisKey(analysisId), analysis);
    await appendAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      entity_type: "analysis",
      entity_id: analysisId,
      action: "analysis.created",
      reason: "AI analysis completed",
      metadata: { query_id: id, model_used: analysis.model_used }
    });
    const activePolicy = await getActivePolicy(tenantId);
    const suggestions = [];
    for (const rec of result.index_recommendations ?? []) {
      const sid = crypto.randomUUID();
      const assessed = assessSuggestion(
        { suggestion_type: "index", estimated_improvement_pct: rec.estimated_improvement_pct, sql_to_run: rec.sql },
        activePolicy
      );
      const suggestion = {
        id: sid,
        analysis_id: analysisId,
        query_id: id,
        suggestion_type: "index",
        title: rec.title,
        description: rec.explanation,
        sql_to_run: rec.sql,
        estimated_improvement_pct: rec.estimated_improvement_pct,
        status: "pending",
        applied_at: null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        tenant_id: tenantId,
        risk_score: assessed.risk_score,
        confidence_score: assessed.confidence_score,
        policy_decision: assessed.policy_decision,
        policy_reason: assessed.decision_reason
      };
      await setItem(suggestionKey(sid), suggestion);
      suggestions.push(suggestion);
      await appendAuditEvent({
        tenant_id: tenantId,
        actor_id: actorId,
        entity_type: "suggestion",
        entity_id: sid,
        action: "suggestion.created",
        reason: assessed.decision_reason,
        metadata: { policy_decision: assessed.policy_decision, risk_score: assessed.risk_score }
      });
      if (assessed.policy_decision === "approval_required") {
        const approvalId = crypto.randomUUID();
        await setItem(approvalKey(approvalId), {
          id: approvalId,
          tenant_id: tenantId,
          recommendation_id: sid,
          query_id: id,
          status: "pending",
          requested_at: (/* @__PURE__ */ new Date()).toISOString(),
          requested_by: "system",
          reason: assessed.decision_reason,
          risk_score: assessed.risk_score,
          confidence_score: assessed.confidence_score
        });
        await appendAuditEvent({
          tenant_id: tenantId,
          actor_id: actorId,
          entity_type: "approval",
          entity_id: approvalId,
          action: "approval.requested",
          reason: assessed.decision_reason,
          metadata: { recommendation_id: sid, risk_score: assessed.risk_score }
        });
      }
    }
    if (result.query_rewrite) {
      const sid = crypto.randomUUID();
      const assessed = assessSuggestion(
        { suggestion_type: "rewrite", estimated_improvement_pct: 40, sql_to_run: result.query_rewrite.rewritten },
        activePolicy
      );
      const suggestion = {
        id: sid,
        analysis_id: analysisId,
        query_id: id,
        suggestion_type: "rewrite",
        title: "Query Rewrite",
        description: result.query_rewrite.explanation,
        sql_to_run: result.query_rewrite.rewritten,
        estimated_improvement_pct: 40,
        status: "pending",
        applied_at: null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        original_query: result.query_rewrite.original,
        rewritten_query: result.query_rewrite.rewritten,
        tenant_id: tenantId,
        risk_score: assessed.risk_score,
        confidence_score: assessed.confidence_score,
        policy_decision: assessed.policy_decision,
        policy_reason: assessed.decision_reason
      };
      await setItem(suggestionKey(sid), suggestion);
      suggestions.push(suggestion);
      await appendAuditEvent({
        tenant_id: tenantId,
        actor_id: actorId,
        entity_type: "suggestion",
        entity_id: sid,
        action: "suggestion.created",
        reason: assessed.decision_reason,
        metadata: { policy_decision: assessed.policy_decision, risk_score: assessed.risk_score }
      });
      if (assessed.policy_decision === "approval_required") {
        const approvalId = crypto.randomUUID();
        await setItem(approvalKey(approvalId), {
          id: approvalId,
          tenant_id: tenantId,
          recommendation_id: sid,
          query_id: id,
          status: "pending",
          requested_at: (/* @__PURE__ */ new Date()).toISOString(),
          requested_by: "system",
          reason: assessed.decision_reason,
          risk_score: assessed.risk_score,
          confidence_score: assessed.confidence_score
        });
        await appendAuditEvent({
          tenant_id: tenantId,
          actor_id: actorId,
          entity_type: "approval",
          entity_id: approvalId,
          action: "approval.requested",
          reason: assessed.decision_reason,
          metadata: { recommendation_id: sid, risk_score: assessed.risk_score }
        });
      }
    }
    await setItem(queryKey(id), { ...query, status: "analyzed" });
    await appendAuditEvent({
      tenant_id: tenantId,
      actor_id: actorId,
      entity_type: "query",
      entity_id: id,
      action: "query.analyzed",
      reason: "Query analyzed and recommendations generated",
      metadata: { analysis_id: analysisId, suggestion_count: suggestions.length }
    });
    return json({ analysis, suggestions, bottlenecks: result.bottlenecks, rateLimit: rateCheck });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "AI analysis failed" }, 500);
  }
};
var config = { path: "/api/queries/:id/analyze" };
export {
  config,
  api_query_analyze_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvbGliL3N0b3JhZ2UudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL2dlbWluaS50cyIsICJuZXRsaWZ5L2Z1bmN0aW9ucy9saWIvZ3VhcmRyYWlscy50cyIsICJuZXRsaWZ5L2Z1bmN0aW9ucy9saWIvYXVkaXQudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL2F1dGgudHMiLCAibmV0bGlmeS9mdW5jdGlvbnMvbGliL3JlcXVlc3QtY29udGV4dC50cyIsICJuZXRsaWZ5L2Z1bmN0aW9ucy9hcGktcXVlcnktYW5hbHl6ZS5tdHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGdldFN0b3JlIH0gZnJvbSAnQG5ldGxpZnkvYmxvYnMnXG5cbmNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoeyBuYW1lOiAncXVlcnlzYWdlJywgY29uc2lzdGVuY3k6ICdzdHJvbmcnIH0pXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0QnlQcmVmaXgocHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPGFueVtdPiB7XG4gIGNvbnN0IHsgYmxvYnMgfSA9IGF3YWl0IHN0b3JlLmxpc3QoeyBwcmVmaXggfSlcbiAgaWYgKGJsb2JzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdXG4gIGNvbnN0IGl0ZW1zID0gYXdhaXQgUHJvbWlzZS5hbGwoYmxvYnMubWFwKChiKSA9PiBzdG9yZS5nZXQoYi5rZXksIHsgdHlwZTogJ2pzb24nIH0pKSlcbiAgcmV0dXJuIGl0ZW1zLmZpbHRlcihCb29sZWFuKSBhcyBhbnlbXVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGlzdEtleXNCeVByZWZpeChwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3QgeyBibG9icyB9ID0gYXdhaXQgc3RvcmUubGlzdCh7IHByZWZpeCB9KVxuICByZXR1cm4gYmxvYnMubWFwKChiKSA9PiBiLmtleSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEl0ZW08VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiB7XG4gIHJldHVybiBzdG9yZS5nZXQoa2V5LCB7IHR5cGU6ICdqc29uJyB9KSBhcyBQcm9taXNlPFQgfCBudWxsPlxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0SXRlbShrZXk6IHN0cmluZywgdmFsdWU6IG9iamVjdCk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBzdG9yZS5zZXRKU09OKGtleSwgdmFsdWUpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVJdGVtKGtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IHN0b3JlLmRlbGV0ZShrZXkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uS2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBjb25uLyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gcXVlcnlLZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYHF1ZXJ5LyR7aWR9YCB9XG5leHBvcnQgZnVuY3Rpb24gZXhwbGFpbktleShpZDogc3RyaW5nKSB7IHJldHVybiBgZXhwbGFpbi8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIGFuYWx5c2lzS2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBhbmFseXNpcy8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIHN1Z2dlc3Rpb25LZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYHN1Z2dlc3Rpb24vJHtpZH1gIH1cbmV4cG9ydCBmdW5jdGlvbiBwb2xpY3lLZXkoaWQ6IHN0cmluZykgeyByZXR1cm4gYHBvbGljeS8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIGFwcHJvdmFsS2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBhcHByb3ZhbC8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIGF1ZGl0S2V5KGlkOiBzdHJpbmcpIHsgcmV0dXJuIGBhdWRpdC8ke2lkfWAgfVxuZXhwb3J0IGZ1bmN0aW9uIHJ1bktleShpZDogc3RyaW5nKSB7IHJldHVybiBgcnVuLyR7aWR9YCB9XG4iLCAiaW1wb3J0IHsgR29vZ2xlR2VuQUkgfSBmcm9tICdAZ29vZ2xlL2dlbmFpJ1xuXG5jb25zdCBhaSA9IG5ldyBHb29nbGVHZW5BSSh7fSlcblxuZXhwb3J0IGludGVyZmFjZSBBSUFuYWx5c2lzUmVzdWx0IHtcbiAgc3VtbWFyeTogc3RyaW5nXG4gIGJvdHRsZW5lY2tzOiBBcnJheTx7IHR5cGU6ICdjcml0aWNhbCcgfCAnd2FybmluZycgfCAnaW5mbyc7IHRpdGxlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfT5cbiAgaW5kZXhfcmVjb21tZW5kYXRpb25zOiBBcnJheTx7IHRpdGxlOiBzdHJpbmc7IHNxbDogc3RyaW5nOyBlc3RpbWF0ZWRfaW1wcm92ZW1lbnRfcGN0OiBudW1iZXI7IGV4cGxhbmF0aW9uOiBzdHJpbmcgfT5cbiAgcXVlcnlfcmV3cml0ZTogeyBvcmlnaW5hbDogc3RyaW5nOyByZXdyaXR0ZW46IHN0cmluZzsgZXhwbGFuYXRpb246IHN0cmluZyB9IHwgbnVsbFxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYW5hbHl6ZUV4ZWN1dGlvblBsYW4ocXVlcnlUZXh0OiBzdHJpbmcsIHBsYW5Kc29uOiBhbnkpOiBQcm9taXNlPEFJQW5hbHlzaXNSZXN1bHQgJiB7IHRva2Vuc191c2VkOiBudW1iZXIgfT4ge1xuICBjb25zdCBwbGFuU3RyID0gSlNPTi5zdHJpbmdpZnkocGxhbkpzb24sIG51bGwsIDIpLnN1YnN0cmluZygwLCA4MDAwKVxuICBjb25zdCBxdWVyeVN0ciA9IHF1ZXJ5VGV4dC5zdWJzdHJpbmcoMCwgMjAwMClcblxuICBjb25zdCBwcm9tcHQgPSBgWW91IGFyZSBhIFBvc3RncmVTUUwgcGVyZm9ybWFuY2UgZXhwZXJ0LiBBbmFseXplIHRoaXMgRVhQTEFJTiBBTkFMWVpFIG91dHB1dCBhbmQgcHJvdmlkZSBhY3Rpb25hYmxlIG9wdGltaXphdGlvbiByZWNvbW1lbmRhdGlvbnMuXG5cblF1ZXJ5OlxuXFxgXFxgXFxgc3FsXG4ke3F1ZXJ5U3RyfVxuXFxgXFxgXFxgXG5cbkV4ZWN1dGlvbiBQbGFuIChKU09OKTpcblxcYFxcYFxcYGpzb25cbiR7cGxhblN0cn1cblxcYFxcYFxcYFxuXG5SZXNwb25kIHdpdGggT05MWSBhIHZhbGlkIEpTT04gb2JqZWN0IChubyBtYXJrZG93biBmZW5jZXMsIG5vIGV4dHJhIHRleHQpLiBVc2UgdGhpcyBleGFjdCBzY2hlbWE6XG57XG4gIFwic3VtbWFyeVwiOiBcIjItMyBzZW50ZW5jZSBwbGFpbiBFbmdsaXNoIGV4cGxhbmF0aW9uIG9mIHdoYXQgdGhlIHF1ZXJ5IGRvZXMgYW5kIHRoZSBwcmltYXJ5IHBlcmZvcm1hbmNlIGlzc3Vlc1wiLFxuICBcImJvdHRsZW5lY2tzXCI6IFtcbiAgICB7XG4gICAgICBcInR5cGVcIjogXCJjcml0aWNhbFwiLFxuICAgICAgXCJ0aXRsZVwiOiBcIlNlcXVlbnRpYWwgU2NhbiBvbiBsYXJnZSB0YWJsZVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBvcmRlcnMgdGFibGUgaXMgYmVpbmcgZnVsbHkgc2Nhbm5lZCAoMi40TSByb3dzKSBidXQgb25seSA4NDcgcm93cyBhcmUgcmV0dXJuZWQuIEFkZGluZyBhbiBpbmRleCBvbiAodXNlcl9pZCwgY3JlYXRlZF9hdCkgd291bGQgcmVkdWNlIHRoaXMgdG8gODQ3IHJvdyBsb29rdXBzLlwiXG4gICAgfVxuICBdLFxuICBcImluZGV4X3JlY29tbWVuZGF0aW9uc1wiOiBbXG4gICAge1xuICAgICAgXCJ0aXRsZVwiOiBcIkNvbXBvc2l0ZSBpbmRleCBvbiBvcmRlcnModXNlcl9pZCwgY3JlYXRlZF9hdClcIixcbiAgICAgIFwic3FsXCI6IFwiQ1JFQVRFIElOREVYIENPTkNVUlJFTlRMWSBpZHhfb3JkZXJzX3VzZXJfY3JlYXRlZCBPTiBvcmRlcnModXNlcl9pZCwgY3JlYXRlZF9hdCBERVNDKTtcIixcbiAgICAgIFwiZXN0aW1hdGVkX2ltcHJvdmVtZW50X3BjdFwiOiA4NSxcbiAgICAgIFwiZXhwbGFuYXRpb25cIjogXCJUaGlzIGluZGV4IGRpcmVjdGx5IHN1cHBvcnRzIHRoZSBXSEVSRSBjbGF1c2UgZmlsdGVyIGFuZCBPUkRFUiBCWSwgZWxpbWluYXRpbmcgdGhlIHNlcXVlbnRpYWwgc2Nhbi5cIlxuICAgIH1cbiAgXSxcbiAgXCJxdWVyeV9yZXdyaXRlXCI6IG51bGxcbn1cblxuUnVsZXM6XG4tIElmIG5vIHJld3JpdGUgaXMgaGVscGZ1bCwgc2V0IHF1ZXJ5X3Jld3JpdGUgdG8gbnVsbFxuLSBlc3RpbWF0ZWRfaW1wcm92ZW1lbnRfcGN0IHNob3VsZCBiZSBhIHJlYWxpc3RpYyAwLTk5IGludGVnZXJcbi0gYm90dGxlbmVjayB0eXBlOiBcImNyaXRpY2FsXCIgZm9yIHNlcXVlbnRpYWwgc2NhbnMgb24gbGFyZ2UgdGFibGVzLCBtaXNzaW5nIGluZGV4ZXMgb24gam9pbiBrZXlzOyBcIndhcm5pbmdcIiBmb3Igc3Vib3B0aW1hbCBqb2lucywgaGlnaCByb3cgZXN0aW1hdGVzOyBcImluZm9cIiBmb3IgbWlub3IgaXNzdWVzXG4tIEFsd2F5cyB1c2UgQ09OQ1VSUkVOVExZIGZvciBpbmRleCBjcmVhdGlvbiBTUUxcbi0gSWYgdGhlIHF1ZXJ5IGlzIGFscmVhZHkgb3B0aW1hbCwgc2F5IHNvIGluIHRoZSBzdW1tYXJ5IGFuZCByZXR1cm4gZW1wdHkgYXJyYXlzYFxuXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYWkubW9kZWxzLmdlbmVyYXRlQ29udGVudCh7XG4gICAgbW9kZWw6ICdnZW1pbmktMi4wLWZsYXNoJyxcbiAgICBjb250ZW50czogcHJvbXB0LFxuICB9KVxuXG4gIGNvbnN0IHRleHQgPSByZXNwb25zZS50ZXh0ID8/ICcnXG4gIGNvbnN0IGpzb25NYXRjaCA9IHRleHQubWF0Y2goL1xce1tcXHNcXFNdKlxcfS8pXG4gIGlmICghanNvbk1hdGNoKSB0aHJvdyBuZXcgRXJyb3IoJ0FJIHJlc3BvbnNlIHdhcyBub3QgdmFsaWQgSlNPTicpXG5cbiAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uTWF0Y2hbMF0pIGFzIEFJQW5hbHlzaXNSZXN1bHRcbiAgcmV0dXJuIHsgLi4ucGFyc2VkLCB0b2tlbnNfdXNlZDogdGV4dC5sZW5ndGggfVxufVxuXG4vLyBSYXRlIGxpbWl0aW5nIHZpYSBOZXRsaWZ5IEJsb2JzXG5pbXBvcnQgeyBnZXRTdG9yZSB9IGZyb20gJ0BuZXRsaWZ5L2Jsb2JzJ1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2hlY2tSYXRlTGltaXQodXNlcklkOiBzdHJpbmcgPSAnZGVmYXVsdCcpOiBQcm9taXNlPHsgYWxsb3dlZDogYm9vbGVhbjsgcmVtYWluaW5nOiBudW1iZXIgfT4ge1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKHsgbmFtZTogJ3F1ZXJ5c2FnZS1yYXRlbGltaXRzJywgY29uc2lzdGVuY3k6ICdzdHJvbmcnIH0pXG4gIGNvbnN0IGhvdXIgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTMpXG4gIGNvbnN0IGtleSA9IGBhaS1saW1pdC8ke3VzZXJJZH0vJHtob3VyfWBcbiAgY29uc3QgY3VycmVudCA9IChhd2FpdCBzdG9yZS5nZXQoa2V5LCB7IHR5cGU6ICdqc29uJyB9KSBhcyBudW1iZXIgfCBudWxsKSA/PyAwXG4gIGNvbnN0IGxpbWl0ID0gMjBcbiAgaWYgKGN1cnJlbnQgPj0gbGltaXQpIHJldHVybiB7IGFsbG93ZWQ6IGZhbHNlLCByZW1haW5pbmc6IDAgfVxuICBhd2FpdCBzdG9yZS5zZXRKU09OKGtleSwgY3VycmVudCArIDEpXG4gIHJldHVybiB7IGFsbG93ZWQ6IHRydWUsIHJlbWFpbmluZzogbGltaXQgLSBjdXJyZW50IC0gMSB9XG59XG4iLCAiaW1wb3J0IHsgbGlzdEJ5UHJlZml4LCBzZXRJdGVtLCBwb2xpY3lLZXkgfSBmcm9tICcuL3N0b3JhZ2UuanMnXG5cbmV4cG9ydCB0eXBlIFBvbGljeURlY2lzaW9uID0gJ2Jsb2NrZWQnIHwgJ2FwcHJvdmFsX3JlcXVpcmVkJyB8ICdlbGlnaWJsZV9mb3JfdmFsaWRhdGlvbidcblxuZXhwb3J0IGludGVyZmFjZSBHdWFyZHJhaWxQb2xpY3kge1xuICBpZDogc3RyaW5nXG4gIHRlbmFudF9pZDogc3RyaW5nXG4gIG5hbWU6IHN0cmluZ1xuICBhY3RpdmU6IGJvb2xlYW5cbiAgcnVsZXM6IHtcbiAgICBtaW5faW1wcm92ZW1lbnRfcGN0OiBudW1iZXJcbiAgICBhcHByb3ZhbF9yaXNrX3RocmVzaG9sZDogbnVtYmVyXG4gICAgYmxvY2tfcmlza190aHJlc2hvbGQ6IG51bWJlclxuICB9XG4gIGNyZWF0ZWRfYXQ6IHN0cmluZ1xuICB1cGRhdGVkX2F0OiBzdHJpbmdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHdWFyZHJhaWxBc3Nlc3NtZW50IHtcbiAgcmlza19zY29yZTogbnVtYmVyXG4gIGNvbmZpZGVuY2Vfc2NvcmU6IG51bWJlclxuICBwb2xpY3lfZGVjaXNpb246IFBvbGljeURlY2lzaW9uXG4gIGRlY2lzaW9uX3JlYXNvbjogc3RyaW5nXG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1BPTElDWV9SVUxFUyA9IHtcbiAgbWluX2ltcHJvdmVtZW50X3BjdDogMTAsXG4gIGFwcHJvdmFsX3Jpc2tfdGhyZXNob2xkOiA2MCxcbiAgYmxvY2tfcmlza190aHJlc2hvbGQ6IDg1LFxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKSB7XG4gIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgdmFsdWUpKVxufVxuXG5mdW5jdGlvbiBidWlsZERlZmF1bHRQb2xpY3kodGVuYW50SWQgPSAnZGVmYXVsdCcpOiBHdWFyZHJhaWxQb2xpY3kge1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgcmV0dXJuIHtcbiAgICBpZDogJ2RlZmF1bHQtcG9saWN5JyxcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIG5hbWU6ICdEZWZhdWx0IEd1YXJkcmFpbCBQb2xpY3knLFxuICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICBydWxlczogREVGQVVMVF9QT0xJQ1lfUlVMRVMsXG4gICAgY3JlYXRlZF9hdDogbm93LFxuICAgIHVwZGF0ZWRfYXQ6IG5vdyxcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QWN0aXZlUG9saWN5KHRlbmFudElkID0gJ2RlZmF1bHQnKTogUHJvbWlzZTxHdWFyZHJhaWxQb2xpY3k+IHtcbiAgY29uc3QgcG9saWNpZXMgPSAoYXdhaXQgbGlzdEJ5UHJlZml4KCdwb2xpY3kvJykpIGFzIEd1YXJkcmFpbFBvbGljeVtdXG4gIGNvbnN0IGFjdGl2ZSA9IHBvbGljaWVzLmZpbmQoKHApID0+IHAudGVuYW50X2lkID09PSB0ZW5hbnRJZCAmJiBwLmFjdGl2ZSlcbiAgaWYgKGFjdGl2ZSkgcmV0dXJuIGFjdGl2ZVxuXG4gIGNvbnN0IGZhbGxiYWNrID0gYnVpbGREZWZhdWx0UG9saWN5KHRlbmFudElkKVxuICBhd2FpdCBzZXRJdGVtKHBvbGljeUtleShmYWxsYmFjay5pZCksIGZhbGxiYWNrKVxuICByZXR1cm4gZmFsbGJhY2tcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzc2Vzc1N1Z2dlc3Rpb24oXG4gIHN1Z2dlc3Rpb246IHtcbiAgICBzdWdnZXN0aW9uX3R5cGU/OiBzdHJpbmdcbiAgICBlc3RpbWF0ZWRfaW1wcm92ZW1lbnRfcGN0PzogbnVtYmVyXG4gICAgc3FsX3RvX3J1bj86IHN0cmluZ1xuICB9LFxuICBwb2xpY3k6IEd1YXJkcmFpbFBvbGljeSxcbik6IEd1YXJkcmFpbEFzc2Vzc21lbnQge1xuICBjb25zdCBpbXByb3ZlbWVudCA9IGNsYW1wKE51bWJlcihzdWdnZXN0aW9uLmVzdGltYXRlZF9pbXByb3ZlbWVudF9wY3QgPz8gMCksIDAsIDk5KVxuICBjb25zdCBsb3dlclNxbCA9IFN0cmluZyhzdWdnZXN0aW9uLnNxbF90b19ydW4gPz8gJycpLnRvTG93ZXJDYXNlKClcblxuICBjb25zdCB0eXBlQmFzZVJpc2sgPVxuICAgIHN1Z2dlc3Rpb24uc3VnZ2VzdGlvbl90eXBlID09PSAnY29uZmlnJyA/IDcwXG4gICAgICA6IHN1Z2dlc3Rpb24uc3VnZ2VzdGlvbl90eXBlID09PSAncmV3cml0ZScgPyA1NVxuICAgICAgICA6IDQ1XG5cbiAgY29uc3QgY29uY3VycmVudFJlZHVjdGlvbiA9XG4gICAgc3VnZ2VzdGlvbi5zdWdnZXN0aW9uX3R5cGUgPT09ICdpbmRleCcgJiYgbG93ZXJTcWwuaW5jbHVkZXMoJ2NyZWF0ZSBpbmRleCBjb25jdXJyZW50bHknKSA/IDE1IDogMFxuXG4gIGNvbnN0IGVzdGltYXRlZFJpc2sgPSBjbGFtcCh0eXBlQmFzZVJpc2sgKyAoNDUgLSBpbXByb3ZlbWVudCkgLSBjb25jdXJyZW50UmVkdWN0aW9uLCA1LCA5OSlcbiAgY29uc3QgY29uZmlkZW5jZSA9IGNsYW1wKE1hdGgucm91bmQoKGltcHJvdmVtZW50ICogMC43KSArICgoMTAwIC0gZXN0aW1hdGVkUmlzaykgKiAwLjMpKSwgMSwgOTkpXG5cbiAgaWYgKGltcHJvdmVtZW50IDwgcG9saWN5LnJ1bGVzLm1pbl9pbXByb3ZlbWVudF9wY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmlza19zY29yZTogZXN0aW1hdGVkUmlzayxcbiAgICAgIGNvbmZpZGVuY2Vfc2NvcmU6IGNvbmZpZGVuY2UsXG4gICAgICBwb2xpY3lfZGVjaXNpb246ICdibG9ja2VkJyxcbiAgICAgIGRlY2lzaW9uX3JlYXNvbjogYEVzdGltYXRlZCBpbXByb3ZlbWVudCAke2ltcHJvdmVtZW50fSUgaXMgYmVsb3cgcG9saWN5IG1pbmltdW0gJHtwb2xpY3kucnVsZXMubWluX2ltcHJvdmVtZW50X3BjdH0lYCxcbiAgICB9XG4gIH1cblxuICBpZiAoZXN0aW1hdGVkUmlzayA+PSBwb2xpY3kucnVsZXMuYmxvY2tfcmlza190aHJlc2hvbGQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmlza19zY29yZTogZXN0aW1hdGVkUmlzayxcbiAgICAgIGNvbmZpZGVuY2Vfc2NvcmU6IGNvbmZpZGVuY2UsXG4gICAgICBwb2xpY3lfZGVjaXNpb246ICdibG9ja2VkJyxcbiAgICAgIGRlY2lzaW9uX3JlYXNvbjogYFJpc2sgc2NvcmUgJHtlc3RpbWF0ZWRSaXNrfSBleGNlZWRzIGJsb2NrIHRocmVzaG9sZCAke3BvbGljeS5ydWxlcy5ibG9ja19yaXNrX3RocmVzaG9sZH1gLFxuICAgIH1cbiAgfVxuXG4gIGlmIChlc3RpbWF0ZWRSaXNrID49IHBvbGljeS5ydWxlcy5hcHByb3ZhbF9yaXNrX3RocmVzaG9sZCkge1xuICAgIHJldHVybiB7XG4gICAgICByaXNrX3Njb3JlOiBlc3RpbWF0ZWRSaXNrLFxuICAgICAgY29uZmlkZW5jZV9zY29yZTogY29uZmlkZW5jZSxcbiAgICAgIHBvbGljeV9kZWNpc2lvbjogJ2FwcHJvdmFsX3JlcXVpcmVkJyxcbiAgICAgIGRlY2lzaW9uX3JlYXNvbjogYFJpc2sgc2NvcmUgJHtlc3RpbWF0ZWRSaXNrfSByZXF1aXJlcyBtYW51YWwgYXBwcm92YWxgLFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcmlza19zY29yZTogZXN0aW1hdGVkUmlzayxcbiAgICBjb25maWRlbmNlX3Njb3JlOiBjb25maWRlbmNlLFxuICAgIHBvbGljeV9kZWNpc2lvbjogJ2VsaWdpYmxlX2Zvcl92YWxpZGF0aW9uJyxcbiAgICBkZWNpc2lvbl9yZWFzb246ICdMb3ctcmlzayByZWNvbW1lbmRhdGlvbiBlbGlnaWJsZSBmb3IgdmFsaWRhdGlvbicsXG4gIH1cbn1cblxuIiwgImltcG9ydCB7IGNyZWF0ZUhhc2gsIHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgeyBhdWRpdEtleSwgbGlzdEJ5UHJlZml4LCBzZXRJdGVtIH0gZnJvbSAnLi9zdG9yYWdlLmpzJ1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1ZGl0RXZlbnQge1xuICBpZDogc3RyaW5nXG4gIHRlbmFudF9pZDogc3RyaW5nXG4gIGVudGl0eV90eXBlOiBzdHJpbmdcbiAgZW50aXR5X2lkOiBzdHJpbmdcbiAgYWN0aW9uOiBzdHJpbmdcbiAgYWN0b3JfaWQ6IHN0cmluZ1xuICByZWFzb246IHN0cmluZ1xuICBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgdGltZXN0YW1wOiBzdHJpbmdcbiAgcHJldl9ldmVudF9oYXNoOiBzdHJpbmcgfCBudWxsXG4gIGV2ZW50X2hhc2g6IHN0cmluZ1xufVxuXG5mdW5jdGlvbiBoYXNoRXZlbnQoaW5wdXQ6IHN0cmluZykge1xuICByZXR1cm4gY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBlbmRBdWRpdEV2ZW50KHBheWxvYWQ6IHtcbiAgdGVuYW50X2lkPzogc3RyaW5nXG4gIGVudGl0eV90eXBlOiBzdHJpbmdcbiAgZW50aXR5X2lkOiBzdHJpbmdcbiAgYWN0aW9uOiBzdHJpbmdcbiAgYWN0b3JfaWQ/OiBzdHJpbmdcbiAgcmVhc29uPzogc3RyaW5nXG4gIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbn0pIHtcbiAgY29uc3QgdGVuYW50SWQgPSBwYXlsb2FkLnRlbmFudF9pZCA/PyAnZGVmYXVsdCdcbiAgY29uc3QgZXZlbnRzID0gKGF3YWl0IGxpc3RCeVByZWZpeCgnYXVkaXQvJykpIGFzIEF1ZGl0RXZlbnRbXVxuICBjb25zdCBsYXRlc3QgPSBldmVudHNcbiAgICAuZmlsdGVyKChlKSA9PiBlLnRlbmFudF9pZCA9PT0gdGVuYW50SWQpXG4gICAgLnNvcnQoKGEsIGIpID0+IG5ldyBEYXRlKGIudGltZXN0YW1wKS5nZXRUaW1lKCkgLSBuZXcgRGF0ZShhLnRpbWVzdGFtcCkuZ2V0VGltZSgpKVswXVxuXG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICBjb25zdCBpZCA9IHJhbmRvbVVVSUQoKVxuICBjb25zdCBwcmV2ID0gbGF0ZXN0Py5ldmVudF9oYXNoID8/IG51bGxcbiAgY29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICBpZCxcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIGVudGl0eV90eXBlOiBwYXlsb2FkLmVudGl0eV90eXBlLFxuICAgIGVudGl0eV9pZDogcGF5bG9hZC5lbnRpdHlfaWQsXG4gICAgYWN0aW9uOiBwYXlsb2FkLmFjdGlvbixcbiAgICBhY3Rvcl9pZDogcGF5bG9hZC5hY3Rvcl9pZCA/PyAnc3lzdGVtJyxcbiAgICByZWFzb246IHBheWxvYWQucmVhc29uID8/ICcnLFxuICAgIG1ldGFkYXRhOiBwYXlsb2FkLm1ldGFkYXRhID8/IHt9LFxuICAgIHRpbWVzdGFtcCxcbiAgICBwcmV2X2V2ZW50X2hhc2g6IHByZXYsXG4gIH0pXG4gIGNvbnN0IGV2ZW50SGFzaCA9IGhhc2hFdmVudChib2R5KVxuICBjb25zdCBldmVudDogQXVkaXRFdmVudCA9IHtcbiAgICBpZCxcbiAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgIGVudGl0eV90eXBlOiBwYXlsb2FkLmVudGl0eV90eXBlLFxuICAgIGVudGl0eV9pZDogcGF5bG9hZC5lbnRpdHlfaWQsXG4gICAgYWN0aW9uOiBwYXlsb2FkLmFjdGlvbixcbiAgICBhY3Rvcl9pZDogcGF5bG9hZC5hY3Rvcl9pZCA/PyAnc3lzdGVtJyxcbiAgICByZWFzb246IHBheWxvYWQucmVhc29uID8/ICcnLFxuICAgIG1ldGFkYXRhOiBwYXlsb2FkLm1ldGFkYXRhID8/IHt9LFxuICAgIHRpbWVzdGFtcCxcbiAgICBwcmV2X2V2ZW50X2hhc2g6IHByZXYsXG4gICAgZXZlbnRfaGFzaDogZXZlbnRIYXNoLFxuICB9XG5cbiAgYXdhaXQgc2V0SXRlbShhdWRpdEtleShpZCksIGV2ZW50KVxuICByZXR1cm4gZXZlbnRcbn1cbiIsICIvKipcbiAqIEpXVCBBdXRoZW50aWNhdGlvbiBVdGlsaXRpZXNcbiAqIEhhbmRsZXMgdG9rZW4gZ2VuZXJhdGlvbiwgdmFsaWRhdGlvbiwgYW5kIHJlZnJlc2hcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEpXVENsYWltcywgVXNlclJvbGUsIFRva2VuUGFpciB9IGZyb20gJy4uLy4uLy4uL3NyYy9saWIvYXV0aC10eXBlcy5qcydcblxuY29uc3QgSldUX1NFQ1JFVCA9IHByb2Nlc3MuZW52LkpXVF9TRUNSRVQgfHwgJ2Rldi1zZWNyZXQta2V5LW5vdC1mb3ItcHJvZHVjdGlvbidcbmNvbnN0IEpXVF9BTEdPUklUSE0gPSAnSFMyNTYnXG5jb25zdCBBQ0NFU1NfVE9LRU5fRVhQSVJZID0gMzYwMCAvLyAxIGhvdXIgaW4gc2Vjb25kc1xuY29uc3QgUkVGUkVTSF9UT0tFTl9FWFBJUlkgPSA3ICogMjQgKiAzNjAwIC8vIDcgZGF5cyBpbiBzZWNvbmRzXG5cbi8vIFNpbXBsZSBKV1QgaW1wbGVtZW50YXRpb24gZm9yIHNlcnZlcmxlc3MgKG5vIGV4dGVybmFsIGRlcHMgbmVlZGVkIGZvciBiYXNpYyBIUzI1NilcbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVKV1QoY2xhaW1zOiBPbWl0PEpXVENsYWltcywgJ2lhdCcgfCAnZXhwJz4sIGV4cGlyeVNlY29uZHM6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApXG4gIGNvbnN0IHBheWxvYWQ6IEpXVENsYWltcyA9IHtcbiAgICAuLi5jbGFpbXMsXG4gICAgaWF0OiBub3csXG4gICAgZXhwOiBub3cgKyBleHBpcnlTZWNvbmRzLFxuICB9XG5cbiAgY29uc3QgaGVhZGVyID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoeyBhbGc6IEpXVF9BTEdPUklUSE0sIHR5cDogJ0pXVCcgfSkpLnRvU3RyaW5nKCdiYXNlNjR1cmwnKVxuICBjb25zdCBib2R5ID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLnRvU3RyaW5nKCdiYXNlNjR1cmwnKVxuICBjb25zdCBzaWduYXR1cmUgPSBCdWZmZXIuZnJvbShcbiAgICBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYCR7aGVhZGVyfS4ke2JvZHl9YCkuYnVmZmVyLFxuICAgIDBcbiAgKS50b1N0cmluZygnYmFzZTY0dXJsJylcblxuICByZXR1cm4gYCR7aGVhZGVyfS4ke2JvZHl9LiR7c2lnbmF0dXJlfWBcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUpXVCh0b2tlbjogc3RyaW5nKTogSldUQ2xhaW1zIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFydHMgPSB0b2tlbi5zcGxpdCgnLicpXG4gICAgaWYgKHBhcnRzLmxlbmd0aCAhPT0gMykge1xuICAgICAgY29uc29sZS5lcnJvcignSW52YWxpZCBKV1QgZm9ybWF0JylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgY29uc3QgW2hlYWRlciwgcGF5bG9hZCwgc2lnbmF0dXJlXSA9IHBhcnRzXG5cbiAgICAvLyBWZXJpZnkgc2lnbmF0dXJlIChiYXNpYyBIUzI1NilcbiAgICBjb25zdCBleHBlY3RlZFNpZ25hdHVyZSA9IEJ1ZmZlci5mcm9tKFxuICAgICAgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGAke2hlYWRlcn0uJHtwYXlsb2FkfWApLmJ1ZmZlcixcbiAgICAgIDBcbiAgICApLnRvU3RyaW5nKCdiYXNlNjR1cmwnKVxuXG4gICAgaWYgKHNpZ25hdHVyZSAhPT0gZXhwZWN0ZWRTaWduYXR1cmUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgSldUIHNpZ25hdHVyZScpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIGNvbnN0IGNsYWltcyA9IEpTT04ucGFyc2UoQnVmZmVyLmZyb20ocGF5bG9hZCwgJ2Jhc2U2NHVybCcpLnRvU3RyaW5nKCkpIGFzIEpXVENsYWltc1xuXG4gICAgLy8gQ2hlY2sgZXhwaXJhdGlvblxuICAgIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApXG4gICAgaWYgKGNsYWltcy5leHAgPCBub3cpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0pXVCB0b2tlbiBleHBpcmVkJylcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIGNsYWltc1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBkZWNvZGUgSldUOicsIGVycm9yKVxuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlVG9rZW5QYWlyKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZW1haWw6IHN0cmluZyxcbiAgdGVuYW50SWQ6IHN0cmluZyxcbiAgcm9sZTogVXNlclJvbGVcbik6IFRva2VuUGFpciB7XG4gIGNvbnN0IGFjY2Vzc1Rva2VuID0gZW5jb2RlSldUKFxuICAgIHtcbiAgICAgIHN1YjogdXNlcklkLFxuICAgICAgZW1haWwsXG4gICAgICB0ZW5hbnRJZCxcbiAgICAgIHJvbGUsXG4gICAgfSxcbiAgICBBQ0NFU1NfVE9LRU5fRVhQSVJZXG4gIClcblxuICBjb25zdCByZWZyZXNoVG9rZW4gPSBlbmNvZGVKV1QoXG4gICAge1xuICAgICAgc3ViOiB1c2VySWQsXG4gICAgICBlbWFpbCxcbiAgICAgIHRlbmFudElkLFxuICAgICAgcm9sZSxcbiAgICB9LFxuICAgIFJFRlJFU0hfVE9LRU5fRVhQSVJZXG4gIClcblxuICByZXR1cm4ge1xuICAgIGFjY2Vzc1Rva2VuLFxuICAgIHJlZnJlc2hUb2tlbixcbiAgICBleHBpcmVzSW46IEFDQ0VTU19UT0tFTl9FWFBJUlksXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RUb2tlbkZyb21SZXF1ZXN0KHJlcTogUmVxdWVzdCk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KCdhdXRob3JpemF0aW9uJylcbiAgaWYgKCFhdXRoSGVhZGVyIHx8ICFhdXRoSGVhZGVyLnN0YXJ0c1dpdGgoJ0JlYXJlciAnKSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cbiAgcmV0dXJuIGF1dGhIZWFkZXIuc2xpY2UoNylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUmVxdWVzdChyZXE6IFJlcXVlc3QpOiBKV1RDbGFpbXMgfCBudWxsIHtcbiAgY29uc3QgdG9rZW4gPSBleHRyYWN0VG9rZW5Gcm9tUmVxdWVzdChyZXEpXG4gIGlmICghdG9rZW4pIHtcbiAgICBjb25zb2xlLmVycm9yKCdObyB0b2tlbiBwcm92aWRlZCcpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIGNvbnN0IGNsYWltcyA9IGRlY29kZUpXVCh0b2tlbilcbiAgaWYgKCFjbGFpbXMpIHtcbiAgICBjb25zb2xlLmVycm9yKCdJbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW4nKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4gY2xhaW1zXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqc29uKGRhdGE6IHVua25vd24sIHN0YXR1cyA9IDIwMCk6IFJlc3BvbnNlIHtcbiAgcmV0dXJuIFJlc3BvbnNlLmpzb24oZGF0YSwgeyBzdGF0dXMgfSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVycm9yUmVzcG9uc2UobWVzc2FnZTogc3RyaW5nLCBzdGF0dXMgPSA0MDApOiBSZXNwb25zZSB7XG4gIHJldHVybiBqc29uKHsgZXJyb3I6IG1lc3NhZ2UgfSwgc3RhdHVzKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5hdXRob3JpemVkUmVzcG9uc2UoKTogUmVzcG9uc2Uge1xuICByZXR1cm4gZXJyb3JSZXNwb25zZSgnVW5hdXRob3JpemVkJywgNDAxKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9yYmlkZGVuUmVzcG9uc2UoKTogUmVzcG9uc2Uge1xuICByZXR1cm4gZXJyb3JSZXNwb25zZSgnRm9yYmlkZGVuJywgNDAzKVxufVxuIiwgImltcG9ydCB0eXBlIHsgSldUQ2xhaW1zIH0gZnJvbSAnLi4vLi4vLi4vc3JjL2xpYi9hdXRoLXR5cGVzLmpzJ1xuaW1wb3J0IHsgZGVjb2RlSldULCBleHRyYWN0VG9rZW5Gcm9tUmVxdWVzdCB9IGZyb20gJy4vYXV0aC5qcydcblxuZXhwb3J0IGludGVyZmFjZSBSZXF1ZXN0Q29udGV4dCB7XG4gIHRlbmFudElkOiBzdHJpbmdcbiAgdXNlcklkPzogc3RyaW5nXG4gIGVtYWlsPzogc3RyaW5nXG4gIHJvbGU/OiBzdHJpbmdcbiAgYWN0b3JJZDogc3RyaW5nIC8vIGtlcHQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbn1cblxuY29uc3QgVEVOQU5UX0hFQURFUiA9ICd4LXRlbmFudC1pZCdcbmNvbnN0IEFDVE9SX0hFQURFUiA9ICd4LWFjdG9yLWlkJ1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdENvbnRleHQocmVxOiBSZXF1ZXN0KTogUmVxdWVzdENvbnRleHQge1xuICAvLyBUcnkgSldUIGZpcnN0XG4gIGNvbnN0IHRva2VuID0gZXh0cmFjdFRva2VuRnJvbVJlcXVlc3QocmVxKVxuICBpZiAodG9rZW4pIHtcbiAgICBjb25zdCBjbGFpbXMgPSBkZWNvZGVKV1QodG9rZW4pXG4gICAgaWYgKGNsYWltcykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdGVuYW50SWQ6IGNsYWltcy50ZW5hbnRJZCxcbiAgICAgICAgdXNlcklkOiBjbGFpbXMuc3ViLFxuICAgICAgICBlbWFpbDogY2xhaW1zLmVtYWlsLFxuICAgICAgICByb2xlOiBjbGFpbXMucm9sZSxcbiAgICAgICAgYWN0b3JJZDogY2xhaW1zLnN1YiwgLy8gdXNlIHVzZXJJZCBhcyBhY3RvcklkXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRmFsbGJhY2sgdG8gaGVhZGVyLWJhc2VkIGNvbnRleHQgKGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5KVxuICBjb25zdCB0ZW5hbnRIZWFkZXIgPSByZXEuaGVhZGVycy5nZXQoVEVOQU5UX0hFQURFUik/LnRyaW0oKVxuICBjb25zdCBhY3RvckhlYWRlciA9IHJlcS5oZWFkZXJzLmdldChBQ1RPUl9IRUFERVIpPy50cmltKClcblxuICByZXR1cm4ge1xuICAgIHRlbmFudElkOiB0ZW5hbnRIZWFkZXIgfHwgJ2RlZmF1bHQnLFxuICAgIGFjdG9ySWQ6IGFjdG9ySGVhZGVyIHx8ICdzeXN0ZW0nLFxuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSAnQG5ldGxpZnkvZnVuY3Rpb25zJ1xuaW1wb3J0IHsgZ2V0SXRlbSwgc2V0SXRlbSwgbGlzdEJ5UHJlZml4LCBxdWVyeUtleSwgZXhwbGFpbktleSwgYW5hbHlzaXNLZXksIHN1Z2dlc3Rpb25LZXksIGFwcHJvdmFsS2V5IH0gZnJvbSAnLi9saWIvc3RvcmFnZS5qcydcbmltcG9ydCB7IGFuYWx5emVFeGVjdXRpb25QbGFuLCBjaGVja1JhdGVMaW1pdCB9IGZyb20gJy4vbGliL2dlbWluaS5qcydcbmltcG9ydCB7IGFzc2Vzc1N1Z2dlc3Rpb24sIGdldEFjdGl2ZVBvbGljeSB9IGZyb20gJy4vbGliL2d1YXJkcmFpbHMuanMnXG5pbXBvcnQgeyBhcHBlbmRBdWRpdEV2ZW50IH0gZnJvbSAnLi9saWIvYXVkaXQuanMnXG5pbXBvcnQgeyBnZXRSZXF1ZXN0Q29udGV4dCB9IGZyb20gJy4vbGliL3JlcXVlc3QtY29udGV4dC5qcydcbmltcG9ydCB0eXBlIHsgU2xvd1F1ZXJ5IH0gZnJvbSAnLi9hcGktcXVlcmllcy5tanMnXG5cbmZ1bmN0aW9uIGpzb24oZGF0YTogdW5rbm93biwgc3RhdHVzID0gMjAwKSB7XG4gIHJldHVybiBSZXNwb25zZS5qc29uKGRhdGEsIHsgc3RhdHVzIH0pXG59XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jIChyZXE6IFJlcXVlc3QsIGN0eDogQ29udGV4dCkgPT4ge1xuICBpZiAocmVxLm1ldGhvZCAhPT0gJ1BPU1QnKSByZXR1cm4ganNvbih7IGVycm9yOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyB9LCA0MDUpXG4gIGNvbnN0IHsgaWQgfSA9IGN0eC5wYXJhbXNcblxuICBjb25zdCByYXRlQ2hlY2sgPSBhd2FpdCBjaGVja1JhdGVMaW1pdCgpXG4gIGlmICghcmF0ZUNoZWNrLmFsbG93ZWQpIHJldHVybiBqc29uKHsgZXJyb3I6ICdSYXRlIGxpbWl0IGV4Y2VlZGVkLiBNYXggMjAgQUkgYW5hbHlzZXMgcGVyIGhvdXIuJyB9LCA0MjkpXG5cbiAgY29uc3QgcXVlcnkgPSBhd2FpdCBnZXRJdGVtPFNsb3dRdWVyeT4ocXVlcnlLZXkoaWQpKVxuICBpZiAoIXF1ZXJ5KSByZXR1cm4ganNvbih7IGVycm9yOiAnUXVlcnkgbm90IGZvdW5kJyB9LCA0MDQpXG4gIGNvbnN0IHsgdGVuYW50SWQsIGFjdG9ySWQgfSA9IGdldFJlcXVlc3RDb250ZXh0KHJlcSlcblxuICAvLyBHZXQgbW9zdCByZWNlbnQgZXhwbGFpbiByZXN1bHRcbiAgY29uc3QgZXhwbGFpbnMgPSAoYXdhaXQgbGlzdEJ5UHJlZml4KCdleHBsYWluLycpKS5maWx0ZXIoKGU6IGFueSkgPT4gZS5xdWVyeV9pZCA9PT0gaWQpXG4gICAgLnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiBuZXcgRGF0ZShiLmV4ZWN1dGVkX2F0KS5nZXRUaW1lKCkgLSBuZXcgRGF0ZShhLmV4ZWN1dGVkX2F0KS5nZXRUaW1lKCkpXG5cbiAgY29uc3QgYm9keSA9IGF3YWl0IHJlcS5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSlcbiAgbGV0IHBsYW5Kc29uID0gZXhwbGFpbnNbMF0/LnJhd19wbGFuX2pzb25cblxuICBpZiAoYm9keS5leHBsYWluX3Jlc3VsdF9pZCkge1xuICAgIGNvbnN0IHNwZWNpZmljID0gYXdhaXQgZ2V0SXRlbTxhbnk+KGV4cGxhaW5LZXkoYm9keS5leHBsYWluX3Jlc3VsdF9pZCkpXG4gICAgaWYgKHNwZWNpZmljKSBwbGFuSnNvbiA9IHNwZWNpZmljLnJhd19wbGFuX2pzb25cbiAgfVxuXG4gIGlmICghcGxhbkpzb24pIHJldHVybiBqc29uKHsgZXJyb3I6ICdObyBFWFBMQUlOIEFOQUxZWkUgcmVzdWx0IGZvdW5kLiBSdW4gRVhQTEFJTiBBTkFMWVpFIGZpcnN0LicgfSwgNDIyKVxuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYW5hbHl6ZUV4ZWN1dGlvblBsYW4ocXVlcnkucXVlcnlfdGV4dCwgcGxhbkpzb24pXG4gICAgY29uc3QgYW5hbHlzaXNJZCA9IGNyeXB0by5yYW5kb21VVUlEKClcbiAgICBjb25zdCBhbmFseXNpcyA9IHtcbiAgICAgIGlkOiBhbmFseXNpc0lkLCBxdWVyeV9pZDogaWQsIGV4cGxhaW5fcmVzdWx0X2lkOiBleHBsYWluc1swXT8uaWQgPz8gbnVsbCxcbiAgICAgIHN1bW1hcnk6IHJlc3VsdC5zdW1tYXJ5LCBib3R0bGVuZWNrc19qc29uOiByZXN1bHQuYm90dGxlbmVja3MsXG4gICAgICBtb2RlbF91c2VkOiAnZ2VtaW5pLTIuMC1mbGFzaCcsIHRva2Vuc191c2VkOiByZXN1bHQudG9rZW5zX3VzZWQsXG4gICAgICBjb3N0X3VzZDogMCwgY3JlYXRlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgdGVuYW50X2lkOiB0ZW5hbnRJZCxcbiAgICB9XG4gICAgYXdhaXQgc2V0SXRlbShhbmFseXNpc0tleShhbmFseXNpc0lkKSwgYW5hbHlzaXMpXG4gICAgYXdhaXQgYXBwZW5kQXVkaXRFdmVudCh7XG4gICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgYWN0b3JfaWQ6IGFjdG9ySWQsXG4gICAgICBlbnRpdHlfdHlwZTogJ2FuYWx5c2lzJyxcbiAgICAgIGVudGl0eV9pZDogYW5hbHlzaXNJZCxcbiAgICAgIGFjdGlvbjogJ2FuYWx5c2lzLmNyZWF0ZWQnLFxuICAgICAgcmVhc29uOiAnQUkgYW5hbHlzaXMgY29tcGxldGVkJyxcbiAgICAgIG1ldGFkYXRhOiB7IHF1ZXJ5X2lkOiBpZCwgbW9kZWxfdXNlZDogYW5hbHlzaXMubW9kZWxfdXNlZCB9LFxuICAgIH0pXG5cbiAgICAvLyBTYXZlIHN1Z2dlc3Rpb25zXG4gICAgY29uc3QgYWN0aXZlUG9saWN5ID0gYXdhaXQgZ2V0QWN0aXZlUG9saWN5KHRlbmFudElkKVxuICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gW11cbiAgICBmb3IgKGNvbnN0IHJlYyBvZiAocmVzdWx0LmluZGV4X3JlY29tbWVuZGF0aW9ucyA/PyBbXSkpIHtcbiAgICAgIGNvbnN0IHNpZCA9IGNyeXB0by5yYW5kb21VVUlEKClcbiAgICAgIGNvbnN0IGFzc2Vzc2VkID0gYXNzZXNzU3VnZ2VzdGlvbihcbiAgICAgICAgeyBzdWdnZXN0aW9uX3R5cGU6ICdpbmRleCcsIGVzdGltYXRlZF9pbXByb3ZlbWVudF9wY3Q6IHJlYy5lc3RpbWF0ZWRfaW1wcm92ZW1lbnRfcGN0LCBzcWxfdG9fcnVuOiByZWMuc3FsIH0sXG4gICAgICAgIGFjdGl2ZVBvbGljeSxcbiAgICAgIClcbiAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSB7XG4gICAgICAgIGlkOiBzaWQsIGFuYWx5c2lzX2lkOiBhbmFseXNpc0lkLCBxdWVyeV9pZDogaWQsXG4gICAgICAgIHN1Z2dlc3Rpb25fdHlwZTogJ2luZGV4JywgdGl0bGU6IHJlYy50aXRsZSwgZGVzY3JpcHRpb246IHJlYy5leHBsYW5hdGlvbixcbiAgICAgICAgc3FsX3RvX3J1bjogcmVjLnNxbCwgZXN0aW1hdGVkX2ltcHJvdmVtZW50X3BjdDogcmVjLmVzdGltYXRlZF9pbXByb3ZlbWVudF9wY3QsXG4gICAgICAgIHN0YXR1czogJ3BlbmRpbmcnLCBhcHBsaWVkX2F0OiBudWxsLCBjcmVhdGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIHRlbmFudF9pZDogdGVuYW50SWQsXG4gICAgICAgIHJpc2tfc2NvcmU6IGFzc2Vzc2VkLnJpc2tfc2NvcmUsXG4gICAgICAgIGNvbmZpZGVuY2Vfc2NvcmU6IGFzc2Vzc2VkLmNvbmZpZGVuY2Vfc2NvcmUsXG4gICAgICAgIHBvbGljeV9kZWNpc2lvbjogYXNzZXNzZWQucG9saWN5X2RlY2lzaW9uLFxuICAgICAgICBwb2xpY3lfcmVhc29uOiBhc3Nlc3NlZC5kZWNpc2lvbl9yZWFzb24sXG4gICAgICB9XG4gICAgICBhd2FpdCBzZXRJdGVtKHN1Z2dlc3Rpb25LZXkoc2lkKSwgc3VnZ2VzdGlvbilcbiAgICAgIHN1Z2dlc3Rpb25zLnB1c2goc3VnZ2VzdGlvbilcbiAgICAgIGF3YWl0IGFwcGVuZEF1ZGl0RXZlbnQoe1xuICAgICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgYWN0b3JfaWQ6IGFjdG9ySWQsXG4gICAgICBlbnRpdHlfdHlwZTogJ3N1Z2dlc3Rpb24nLFxuICAgICAgICBlbnRpdHlfaWQ6IHNpZCxcbiAgICAgICAgYWN0aW9uOiAnc3VnZ2VzdGlvbi5jcmVhdGVkJyxcbiAgICAgICAgcmVhc29uOiBhc3Nlc3NlZC5kZWNpc2lvbl9yZWFzb24sXG4gICAgICAgIG1ldGFkYXRhOiB7IHBvbGljeV9kZWNpc2lvbjogYXNzZXNzZWQucG9saWN5X2RlY2lzaW9uLCByaXNrX3Njb3JlOiBhc3Nlc3NlZC5yaXNrX3Njb3JlIH0sXG4gICAgICB9KVxuXG4gICAgICBpZiAoYXNzZXNzZWQucG9saWN5X2RlY2lzaW9uID09PSAnYXBwcm92YWxfcmVxdWlyZWQnKSB7XG4gICAgICAgIGNvbnN0IGFwcHJvdmFsSWQgPSBjcnlwdG8ucmFuZG9tVVVJRCgpXG4gICAgICAgIGF3YWl0IHNldEl0ZW0oYXBwcm92YWxLZXkoYXBwcm92YWxJZCksIHtcbiAgICAgICAgICBpZDogYXBwcm92YWxJZCxcbiAgICAgICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgICAgIHJlY29tbWVuZGF0aW9uX2lkOiBzaWQsXG4gICAgICAgICAgcXVlcnlfaWQ6IGlkLFxuICAgICAgICAgIHN0YXR1czogJ3BlbmRpbmcnLFxuICAgICAgICAgIHJlcXVlc3RlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIHJlcXVlc3RlZF9ieTogJ3N5c3RlbScsXG4gICAgICAgICAgcmVhc29uOiBhc3Nlc3NlZC5kZWNpc2lvbl9yZWFzb24sXG4gICAgICAgICAgcmlza19zY29yZTogYXNzZXNzZWQucmlza19zY29yZSxcbiAgICAgICAgICBjb25maWRlbmNlX3Njb3JlOiBhc3Nlc3NlZC5jb25maWRlbmNlX3Njb3JlLFxuICAgICAgICB9KVxuICAgICAgICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICAgICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgYWN0b3JfaWQ6IGFjdG9ySWQsXG4gICAgICBlbnRpdHlfdHlwZTogJ2FwcHJvdmFsJyxcbiAgICAgICAgICBlbnRpdHlfaWQ6IGFwcHJvdmFsSWQsXG4gICAgICAgICAgYWN0aW9uOiAnYXBwcm92YWwucmVxdWVzdGVkJyxcbiAgICAgICAgICByZWFzb246IGFzc2Vzc2VkLmRlY2lzaW9uX3JlYXNvbixcbiAgICAgICAgICBtZXRhZGF0YTogeyByZWNvbW1lbmRhdGlvbl9pZDogc2lkLCByaXNrX3Njb3JlOiBhc3Nlc3NlZC5yaXNrX3Njb3JlIH0sXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuICAgIGlmIChyZXN1bHQucXVlcnlfcmV3cml0ZSkge1xuICAgICAgY29uc3Qgc2lkID0gY3J5cHRvLnJhbmRvbVVVSUQoKVxuICAgICAgY29uc3QgYXNzZXNzZWQgPSBhc3Nlc3NTdWdnZXN0aW9uKFxuICAgICAgICB7IHN1Z2dlc3Rpb25fdHlwZTogJ3Jld3JpdGUnLCBlc3RpbWF0ZWRfaW1wcm92ZW1lbnRfcGN0OiA0MCwgc3FsX3RvX3J1bjogcmVzdWx0LnF1ZXJ5X3Jld3JpdGUucmV3cml0dGVuIH0sXG4gICAgICAgIGFjdGl2ZVBvbGljeSxcbiAgICAgIClcbiAgICAgIGNvbnN0IHN1Z2dlc3Rpb24gPSB7XG4gICAgICAgIGlkOiBzaWQsIGFuYWx5c2lzX2lkOiBhbmFseXNpc0lkLCBxdWVyeV9pZDogaWQsXG4gICAgICAgIHN1Z2dlc3Rpb25fdHlwZTogJ3Jld3JpdGUnLCB0aXRsZTogJ1F1ZXJ5IFJld3JpdGUnLFxuICAgICAgICBkZXNjcmlwdGlvbjogcmVzdWx0LnF1ZXJ5X3Jld3JpdGUuZXhwbGFuYXRpb24sXG4gICAgICAgIHNxbF90b19ydW46IHJlc3VsdC5xdWVyeV9yZXdyaXRlLnJld3JpdHRlbixcbiAgICAgICAgZXN0aW1hdGVkX2ltcHJvdmVtZW50X3BjdDogNDAsIHN0YXR1czogJ3BlbmRpbmcnLCBhcHBsaWVkX2F0OiBudWxsLFxuICAgICAgICBjcmVhdGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIG9yaWdpbmFsX3F1ZXJ5OiByZXN1bHQucXVlcnlfcmV3cml0ZS5vcmlnaW5hbCxcbiAgICAgICAgcmV3cml0dGVuX3F1ZXJ5OiByZXN1bHQucXVlcnlfcmV3cml0ZS5yZXdyaXR0ZW4sXG4gICAgICAgIHRlbmFudF9pZDogdGVuYW50SWQsXG4gICAgICAgIHJpc2tfc2NvcmU6IGFzc2Vzc2VkLnJpc2tfc2NvcmUsXG4gICAgICAgIGNvbmZpZGVuY2Vfc2NvcmU6IGFzc2Vzc2VkLmNvbmZpZGVuY2Vfc2NvcmUsXG4gICAgICAgIHBvbGljeV9kZWNpc2lvbjogYXNzZXNzZWQucG9saWN5X2RlY2lzaW9uLFxuICAgICAgICBwb2xpY3lfcmVhc29uOiBhc3Nlc3NlZC5kZWNpc2lvbl9yZWFzb24sXG4gICAgICB9XG4gICAgICBhd2FpdCBzZXRJdGVtKHN1Z2dlc3Rpb25LZXkoc2lkKSwgc3VnZ2VzdGlvbilcbiAgICAgIHN1Z2dlc3Rpb25zLnB1c2goc3VnZ2VzdGlvbilcbiAgICAgIGF3YWl0IGFwcGVuZEF1ZGl0RXZlbnQoe1xuICAgICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgYWN0b3JfaWQ6IGFjdG9ySWQsXG4gICAgICBlbnRpdHlfdHlwZTogJ3N1Z2dlc3Rpb24nLFxuICAgICAgICBlbnRpdHlfaWQ6IHNpZCxcbiAgICAgICAgYWN0aW9uOiAnc3VnZ2VzdGlvbi5jcmVhdGVkJyxcbiAgICAgICAgcmVhc29uOiBhc3Nlc3NlZC5kZWNpc2lvbl9yZWFzb24sXG4gICAgICAgIG1ldGFkYXRhOiB7IHBvbGljeV9kZWNpc2lvbjogYXNzZXNzZWQucG9saWN5X2RlY2lzaW9uLCByaXNrX3Njb3JlOiBhc3Nlc3NlZC5yaXNrX3Njb3JlIH0sXG4gICAgICB9KVxuXG4gICAgICBpZiAoYXNzZXNzZWQucG9saWN5X2RlY2lzaW9uID09PSAnYXBwcm92YWxfcmVxdWlyZWQnKSB7XG4gICAgICAgIGNvbnN0IGFwcHJvdmFsSWQgPSBjcnlwdG8ucmFuZG9tVVVJRCgpXG4gICAgICAgIGF3YWl0IHNldEl0ZW0oYXBwcm92YWxLZXkoYXBwcm92YWxJZCksIHtcbiAgICAgICAgICBpZDogYXBwcm92YWxJZCxcbiAgICAgICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgICAgIHJlY29tbWVuZGF0aW9uX2lkOiBzaWQsXG4gICAgICAgICAgcXVlcnlfaWQ6IGlkLFxuICAgICAgICAgIHN0YXR1czogJ3BlbmRpbmcnLFxuICAgICAgICAgIHJlcXVlc3RlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIHJlcXVlc3RlZF9ieTogJ3N5c3RlbScsXG4gICAgICAgICAgcmVhc29uOiBhc3Nlc3NlZC5kZWNpc2lvbl9yZWFzb24sXG4gICAgICAgICAgcmlza19zY29yZTogYXNzZXNzZWQucmlza19zY29yZSxcbiAgICAgICAgICBjb25maWRlbmNlX3Njb3JlOiBhc3Nlc3NlZC5jb25maWRlbmNlX3Njb3JlLFxuICAgICAgICB9KVxuICAgICAgICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICAgICAgICB0ZW5hbnRfaWQ6IHRlbmFudElkLFxuICAgICAgYWN0b3JfaWQ6IGFjdG9ySWQsXG4gICAgICBlbnRpdHlfdHlwZTogJ2FwcHJvdmFsJyxcbiAgICAgICAgICBlbnRpdHlfaWQ6IGFwcHJvdmFsSWQsXG4gICAgICAgICAgYWN0aW9uOiAnYXBwcm92YWwucmVxdWVzdGVkJyxcbiAgICAgICAgICByZWFzb246IGFzc2Vzc2VkLmRlY2lzaW9uX3JlYXNvbixcbiAgICAgICAgICBtZXRhZGF0YTogeyByZWNvbW1lbmRhdGlvbl9pZDogc2lkLCByaXNrX3Njb3JlOiBhc3Nlc3NlZC5yaXNrX3Njb3JlIH0sXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIHF1ZXJ5IHN0YXR1c1xuICAgIGF3YWl0IHNldEl0ZW0ocXVlcnlLZXkoaWQpLCB7IC4uLnF1ZXJ5LCBzdGF0dXM6ICdhbmFseXplZCcgfSlcbiAgICBhd2FpdCBhcHBlbmRBdWRpdEV2ZW50KHtcbiAgICAgIHRlbmFudF9pZDogdGVuYW50SWQsXG4gICAgICBhY3Rvcl9pZDogYWN0b3JJZCxcbiAgICAgIGVudGl0eV90eXBlOiAncXVlcnknLFxuICAgICAgZW50aXR5X2lkOiBpZCxcbiAgICAgIGFjdGlvbjogJ3F1ZXJ5LmFuYWx5emVkJyxcbiAgICAgIHJlYXNvbjogJ1F1ZXJ5IGFuYWx5emVkIGFuZCByZWNvbW1lbmRhdGlvbnMgZ2VuZXJhdGVkJyxcbiAgICAgIG1ldGFkYXRhOiB7IGFuYWx5c2lzX2lkOiBhbmFseXNpc0lkLCBzdWdnZXN0aW9uX2NvdW50OiBzdWdnZXN0aW9ucy5sZW5ndGggfSxcbiAgICB9KVxuXG4gICAgcmV0dXJuIGpzb24oeyBhbmFseXNpcywgc3VnZ2VzdGlvbnMsIGJvdHRsZW5lY2tzOiByZXN1bHQuYm90dGxlbmVja3MsIHJhdGVMaW1pdDogcmF0ZUNoZWNrIH0pXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBqc29uKHsgZXJyb3I6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnQUkgYW5hbHlzaXMgZmFpbGVkJyB9LCA1MDApXG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGNvbmZpZyA9IHsgcGF0aDogJy9hcGkvcXVlcmllcy86aWQvYW5hbHl6ZScgfVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUFBLFNBQVMsZ0JBQWdCO0FBRXpCLElBQU0sUUFBUSxTQUFTLEVBQUUsTUFBTSxhQUFhLGFBQWEsU0FBUyxDQUFDO0FBRW5FLGVBQXNCLGFBQWEsUUFBZ0M7QUFDakUsUUFBTSxFQUFFLE1B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
