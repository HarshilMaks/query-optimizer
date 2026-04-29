# Phase 3 Plan: Validation Engine & Evidence

**Start Date**: April 29, 2026
**Objective**: Implement "safe validation paths" and "before/after metrics"
**Estimated Duration**: 3-4 weeks
**Blocking Requirements**: None (Phase 2 complete)

---

## 🎯 Phase 3 Goals

1. **Safe Query Execution**: Isolated test context for validation runs
2. **Measurable Evidence**: Before/after metrics proving improvements
3. **Confidence Scoring**: Statistical significance of recommendations
4. **Approval Integration**: Show metrics before decision gates
5. **User Confidence**: Let users see proof before applying changes

---

## 📋 Scope

### In Scope (MVP)
- Safe query execution with timing capture
- Before/after metrics collection (latency, rows, execution plan)
- Confidence scoring (improvement %), risk scoring
- Validation result storage and retrieval
- UI to display validation results in approval flow
- Integration with existing approval workflow

### Out of Scope (Post-MVP)
- Production environment benchmarks
- Historical trend analysis
- A/B testing framework
- Load testing capabilities
- Auto-scaling recommendations

---

## 🏗️ Architecture

### Validation Flow

```
Suggestion Created
       ↓
Policy Assessment (Phase 2)
       ↓
[NEW] Validation Engine
       ├─ Safe query execution (test DB)
       ├─ Before metrics (original query)
       ├─ Apply change
       ├─ After metrics (optimized query)
       ├─ Compare & score
       └─ Store validation result
       ↓
Show Metrics → Approval Request (Phase 2)
       ↓
Approval/Reject
       ↓
Apply to Production (if approved)
```

### Data Model

#### Validation Record
```typescript
interface Validation {
  id: string                      // validation_xxx
  tenantId: string               // multi-tenant
  suggestionId: string           // what is being validated
  connectionId: string           // which database
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  
  // Before metrics
  beforeMetrics?: {
    executionTime: number        // ms
    rowsScanned: number
    rowsReturned: number
    executionPlan: string        // EXPLAIN output
    capturedAt: string           // ISO timestamp
  }
  
  // After metrics
  afterMetrics?: {
    executionTime: number
    rowsScanned: number
    rowsReturned: number
    executionPlan: string
    capturedAt: string
  }
  
  // Comparison & scoring
  comparison?: {
    improvementPercent: number   // (before - after) / before * 100
    improvementType: 'time' | 'rows' | 'plan'
    confidence: 'low' | 'medium' | 'high'  // Statistical significance
    confidenceScore: number      // 0-100
    samples: number              // How many runs?
    statisticallySignificant: boolean
  }
  
  error?: string                 // If failed
  createdAt: string
  completedAt?: string
  actorId: string               // Who triggered validation
}
```

### API Endpoints

#### New Endpoints
```
POST /api/validation/run
  Query: { suggestionId, connectionId }
  Returns: { validationId, status }
  Purpose: Trigger validation

GET /api/validation/:id
  Returns: { validation record with metrics }
  Purpose: Get validation results

GET /api/validations?suggestionId=xxx
  Returns: [ validation records ]
  Purpose: List validations for a suggestion
```

---

## 🔧 Implementation Components

### 1. Validation Engine Library

**File**: `netlify/functions/lib/validation.ts`

**Functions**:
- `runValidation(suggestionId, connectionId)`: Execute full validation pipeline
- `captureMetrics(query, label)`: Run query and capture timing/plan
- `calculateImprovement(before, after)`: Compute improvement %
- `scoreConfidence(samples, improvement)`: Statistical significance
- `getTestConnection(connectionId)`: Get safe test connection

**Key Logic**:
```typescript
// Pseudo-code for validation flow
async function runValidation(suggestionId, connectionId) {
  // 1. Get original query
  const suggestion = await getSuggestion(suggestionId)
  const originalQuery = suggestion.query
  
  // 2. Capture before metrics
  const beforeMetrics = await captureMetrics(originalQuery, 'before')
  
  // 3. Apply suggested change
  const optimizedQuery = suggestion.sql_to_run
  
  // 4. Capture after metrics
  const afterMetrics = await captureMetrics(optimizedQuery, 'after')
  
  // 5. Compare
  const improvement = calculateImprovement(beforeMetrics, afterMetrics)
  
  // 6. Score confidence
  const confidence = scoreConfidence(iterations, improvement)
  
  // 7. Store result
  return await appendValidationEvent(validationRecord)
}
```

### 2. Validation API Endpoints

**File**: `netlify/functions/api-validation.mts`
- `POST /api/validation/run` - Start validation
- `GET /api/validation/:id` - Get result

**File**: `netlify/functions/api-validations.mts`
- `GET /api/validations` - List validations for suggestion

### 3. Storage Enhancement

**File**: `netlify/functions/lib/storage.ts` (enhance)
- `validationKey()` - Generate storage key
- `appendValidationEvent()` - Store validation result

### 4. UI Components

**File**: `src/components/ValidationResult.tsx` (new)
- Display before/after metrics
- Show improvement %
- Confidence score badge
- Statistical significance indicator

**File**: `src/routes/query.$id.tsx` (enhance)
- Add "Run Validation" button
- Show validation status (pending/running/done)
- Display validation results in approval decision

### 5. Integration with Approval Flow

**File**: `src/routes/approvals.tsx` (enhance)
- Show validation metrics in approval review
- Display confidence & improvement %
- Help reviewers make informed decisions

---

## 📊 Validation Data Schema

### Storage Keys
```
validation:{tenantId}:{validationId}
validation-index:{tenantId}:{suggestionId}    # Index for lookups
```

### Sample Data
```json
{
  "id": "val_abc123",
  "tenantId": "default",
  "suggestionId": "sugg_xyz",
  "connectionId": "conn_pg1",
  "status": "succeeded",
  "beforeMetrics": {
    "executionTime": 2500,
    "rowsScanned": 100000,
    "rowsReturned": 50,
    "executionPlan": "Seq Scan...",
    "capturedAt": "2026-04-29T04:16:00Z"
  },
  "afterMetrics": {
    "executionTime": 150,
    "rowsScanned": 50,
    "rowsReturned": 50,
    "executionPlan": "Index Scan...",
    "capturedAt": "2026-04-29T04:17:00Z"
  },
  "comparison": {
    "improvementPercent": 94,
    "improvementType": "time",
    "confidence": "high",
    "confidenceScore": 92,
    "samples": 5,
    "statisticallySignificant": true
  },
  "createdAt": "2026-04-29T04:16:00Z",
  "completedAt": "2026-04-29T04:17:30Z",
  "actorId": "system"
}
```

---

## 🎨 UI Components to Build

### ValidationResult Component
```typescript
<ValidationResult validation={validationRecord} />
// Shows:
// - Before: 2,500ms | After: 150ms
// - Improvement: 94% ↓
// - Confidence: HIGH (92%)
// - Status: Succeeded
// - Samples: 5 runs
```

### In Approval Flow
```typescript
<ApprovalCard approval={approval}>
  <SuggestionDetails />
  {approval.validation && <ValidationResult />}  // NEW
  <ApproveRejectButtons />
</ApprovalCard>
```

---

## 🚀 Implementation Checklist

### Week 1: Architecture & Data Model
- [ ] Define validation data schema
- [ ] Create validation types/interfaces
- [ ] Design safety constraints
- [ ] Update storage layer

### Week 2: Validation Engine
- [ ] Build validation.ts library
- [ ] Implement metrics capture
- [ ] Implement confidence scoring
- [ ] Build validation API endpoints

### Week 3: UI & Integration
- [ ] Build ValidationResult component
- [ ] Enhance approvals.tsx
- [ ] Enhance query.$id.tsx
- [ ] Wire up "Run Validation" button

### Week 4: Testing & Polish
- [ ] Manual E2E testing
- [ ] Build verification
- [ ] Performance validation
- [ ] Documentation

---

## 🔒 Safety Constraints

### Query Execution Safety
- ✅ Use test/staging database ONLY (never production)
- ✅ Timeout on queries > 30 seconds
- ✅ Limit query results to 10,000 rows
- ✅ Read-only execution (SELECT only)
- ✅ No destructive operations allowed

### Metrics Capture
- ✅ Run each query multiple times (3-5 samples)
- ✅ Discard first run (warm-up)
- ✅ Average results (statistical validity)
- ✅ Capture execution plan (EXPLAIN output)

### Confidence Scoring
- ✅ High: 90-100% (very confident)
- ✅ Medium: 70-89% (reasonably confident)
- ✅ Low: <70% (not statistically significant)
- ✅ Flag when improvement < 5% (noise tolerance)

---

## 📋 Release Readiness Requirements

### From Release-Readiness Checklist (Phase 2 Doc)

✅ "Validation pipeline produces before/after metrics"
- Implement metrics collection

✅ "Confidence score is present for actionable recommendations"
- Implement confidence scoring

✅ "High-risk recommendations are blocked or approval-gated"
- Already done in Phase 2 (reuse)

✅ "No recommendation is marked 'safe' without evidence threshold"
- Use confidence score gating

---

## 🎯 Success Criteria

✅ **Code Complete**
- All validation components built
- All endpoints functional
- All UI components rendering

✅ **Build Passing**
- 0 TypeScript errors
- 0 build errors
- All tests passing (if applicable)

✅ **Functionality Working**
- Can trigger validation runs
- Can retrieve results
- Metrics display correctly
- Confidence scoring works

✅ **Integration Complete**
- Metrics show in approval flow
- Approval decision informed by validation
- UI gating respects confidence score

✅ **Documentation Complete**
- Validation architecture documented
- API contracts documented
- User-facing help text added

---

## 📊 Phase 3 Completion Target

When Phase 3 is done:
- ✅ Users can run validation on suggestions
- ✅ See before/after metrics proving improvements
- ✅ Know confidence level (statistical significance)
- ✅ Make informed approval decisions with evidence
- ✅ System prevents "trust me" AI-only recommendations

This completes the core product loop: **detect → validate → approve → apply**

---

## 🚀 Next Phases After Phase 3

**Phase 4**: Auth/AuthZ (2-3 weeks)
- Replace header-based context with real auth

**Phase 5**: Testing Framework (2-3 weeks)
- Comprehensive test coverage

**Phase 6**: Monitoring/Ops (1-2 weeks)
- Observability and runbooks

**Phase 7**: Advanced Features (2-4 weeks)
- Batch approvals, CLI, notifications

**Phase 8**: Production Launch (1-2 weeks)
- Deployment and rollout

---

## 📚 Key Files to Create/Modify

### New Files
- `netlify/functions/lib/validation.ts` - Validation engine
- `netlify/functions/api-validation.mts` - Validation endpoints
- `netlify/functions/api-validations.mts` - List endpoint
- `src/components/ValidationResult.tsx` - UI component

### Modified Files
- `netlify/functions/lib/storage.ts` - Add validation keys
- `src/routes/query.$id.tsx` - Add validation UI
- `src/routes/approvals.tsx` - Show validation metrics
- `src/lib/api.ts` - Add validation API methods
- `src/components/AppLayout.tsx` - Badge for validation status

---

**Ready to start Phase 3! 🚀**
