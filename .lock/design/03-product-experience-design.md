# Product Experience Design
# Postgres Performance Guardrail Platform

## 1. UX Goals

1. Show what matters first (risk-adjusted priority)
2. Make decisions explainable (evidence + policy rationale)
3. Prevent accidental unsafe actions (guardrails by default)
4. Preserve trust (clear audit trace for all decisions)

---

## 2. Information Architecture

Primary navigation:

1. **Overview**
2. **Recommendations**
3. **Validation**
4. **Approvals**
5. **Guardrails (Policies)**
6. **Runs**
7. **Audit**
8. **Settings**

---

## 3. Key Screens

## 3.1 Overview

Purpose:

1. Current risk posture
2. Top regressions
3. Recommendations needing action
4. Validation outcomes trend

Core widgets:

1. Risk heatmap
2. Queue summary by status
3. Time-to-decision trend
4. Validated impact summary

## 3.2 Recommendations List

Columns:

1. recommendation title
2. environment
3. risk score
4. confidence
5. expected impact
6. policy status
7. validation status
8. approval status

Primary actions:

1. view details
2. evaluate policy
3. request validation
4. request approval

## 3.3 Recommendation Detail

Sections:

1. issue context and evidence
2. recommendation rationale
3. policy/risk output
4. validation report
5. approval timeline
6. full audit trail

## 3.4 Validation Report

Must show:

1. baseline vs candidate metrics
2. sample size and confidence
3. verdict (`validated`, `inconclusive`, `failed`)
4. notes and caveats

## 3.5 Approval Board

Queue filters:

1. risk level
2. environment
3. age
4. ownership

Decision UI requirements:

1. mandatory reason on approve/reject
2. warning banners for high-risk actions
3. linked validation report

## 3.6 Guardrails (Policies)

Capabilities:

1. list active policies
2. create/edit policy versions
3. dry-run policy simulation
4. activation/deactivation with audit event

## 3.7 Audit

Capabilities:

1. timeline view by recommendation
2. actor/action/reason filters
3. export evidence package

---

## 4. UX Guardrail Patterns

1. **Fail-closed actions:** if policy/validation is missing, action is disabled
2. **High-risk confirmation:** explicit review step with impact summary
3. **Immutable logs visibility:** every decision links to audit event IDs
4. **No silent overrides:** override requires explicit role + reason + event

---

## 5. User Roles and UX Permissions

1. `viewer`
   - read-only access to recommendations, reports, and audit
2. `reviewer`
   - can approve/reject and comment
3. `admin`
   - policy management, role management, critical overrides

---

## 6. UX States and Empty States

1. No recommendations: guide to connect data source and trigger scan
2. No validations: prompt to run validation before approval
3. No approvals pending: show decision throughput metrics
4. Policy not configured: block actions and guide admin setup

---

## 7. Success UX Metrics

1. Time from detection to first action
2. Approval decision time
3. % recommendations with completed validation
4. % high-risk recommendations blocked before rollout
5. User trust signal: repeat use of validation and audit views

