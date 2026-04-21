import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({})

export interface AIAnalysisResult {
  summary: string
  bottlenecks: Array<{ type: 'critical' | 'warning' | 'info'; title: string; description: string }>
  index_recommendations: Array<{ title: string; sql: string; estimated_improvement_pct: number; explanation: string }>
  query_rewrite: { original: string; rewritten: string; explanation: string } | null
}

export async function analyzeExecutionPlan(queryText: string, planJson: any): Promise<AIAnalysisResult & { tokens_used: number }> {
  const planStr = JSON.stringify(planJson, null, 2).substring(0, 8000)
  const queryStr = queryText.substring(0, 2000)

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
- If the query is already optimal, say so in the summary and return empty arrays`

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  })

  const text = response.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI response was not valid JSON')

  const parsed = JSON.parse(jsonMatch[0]) as AIAnalysisResult
  return { ...parsed, tokens_used: text.length }
}

// Rate limiting via Netlify Blobs
import { getStore } from '@netlify/blobs'

export async function checkRateLimit(userId: string = 'default'): Promise<{ allowed: boolean; remaining: number }> {
  const store = getStore({ name: 'querysage-ratelimits', consistency: 'strong' })
  const hour = new Date().toISOString().slice(0, 13)
  const key = `ai-limit/${userId}/${hour}`
  const current = (await store.get(key, { type: 'json' }) as number | null) ?? 0
  const limit = 20
  if (current >= limit) return { allowed: false, remaining: 0 }
  await store.setJSON(key, current + 1)
  return { allowed: true, remaining: limit - current - 1 }
}
