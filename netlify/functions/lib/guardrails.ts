import { listByPrefix, setItem, policyKey } from './storage.js'

export type PolicyDecision = 'blocked' | 'approval_required' | 'eligible_for_validation'

export interface GuardrailPolicy {
  id: string
  tenant_id: string
  name: string
  active: boolean
  rules: {
    min_improvement_pct: number
    approval_risk_threshold: number
    block_risk_threshold: number
  }
  created_at: string
  updated_at: string
}

export interface GuardrailAssessment {
  risk_score: number
  confidence_score: number
  policy_decision: PolicyDecision
  decision_reason: string
}

export const DEFAULT_POLICY_RULES = {
  min_improvement_pct: 10,
  approval_risk_threshold: 60,
  block_risk_threshold: 85,
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildDefaultPolicy(tenantId = 'default'): GuardrailPolicy {
  const now = new Date().toISOString()
  return {
    id: 'default-policy',
    tenant_id: tenantId,
    name: 'Default Guardrail Policy',
    active: true,
    rules: DEFAULT_POLICY_RULES,
    created_at: now,
    updated_at: now,
  }
}

export async function getActivePolicy(tenantId = 'default'): Promise<GuardrailPolicy> {
  const policies = (await listByPrefix('policy/')) as GuardrailPolicy[]
  const active = policies.find((p) => p.tenant_id === tenantId && p.active)
  if (active) return active

  const fallback = buildDefaultPolicy(tenantId)
  await setItem(policyKey(fallback.id), fallback)
  return fallback
}

export function assessSuggestion(
  suggestion: {
    suggestion_type?: string
    estimated_improvement_pct?: number
    sql_to_run?: string
  },
  policy: GuardrailPolicy,
): GuardrailAssessment {
  const improvement = clamp(Number(suggestion.estimated_improvement_pct ?? 0), 0, 99)
  const lowerSql = String(suggestion.sql_to_run ?? '').toLowerCase()

  const typeBaseRisk =
    suggestion.suggestion_type === 'config' ? 70
      : suggestion.suggestion_type === 'rewrite' ? 55
        : 45

  const concurrentReduction =
    suggestion.suggestion_type === 'index' && lowerSql.includes('create index concurrently') ? 15 : 0

  const estimatedRisk = clamp(typeBaseRisk + (45 - improvement) - concurrentReduction, 5, 99)
  const confidence = clamp(Math.round((improvement * 0.7) + ((100 - estimatedRisk) * 0.3)), 1, 99)

  if (improvement < policy.rules.min_improvement_pct) {
    return {
      risk_score: estimatedRisk,
      confidence_score: confidence,
      policy_decision: 'blocked',
      decision_reason: `Estimated improvement ${improvement}% is below policy minimum ${policy.rules.min_improvement_pct}%`,
    }
  }

  if (estimatedRisk >= policy.rules.block_risk_threshold) {
    return {
      risk_score: estimatedRisk,
      confidence_score: confidence,
      policy_decision: 'blocked',
      decision_reason: `Risk score ${estimatedRisk} exceeds block threshold ${policy.rules.block_risk_threshold}`,
    }
  }

  if (estimatedRisk >= policy.rules.approval_risk_threshold) {
    return {
      risk_score: estimatedRisk,
      confidence_score: confidence,
      policy_decision: 'approval_required',
      decision_reason: `Risk score ${estimatedRisk} requires manual approval`,
    }
  }

  return {
    risk_score: estimatedRisk,
    confidence_score: confidence,
    policy_decision: 'eligible_for_validation',
    decision_reason: 'Low-risk recommendation eligible for validation',
  }
}

