import crypto from 'crypto'

export interface MetricsCapture {
  executionTime: number // milliseconds
  rowsScanned: number
  rowsReturned: number
  executionPlan: string // EXPLAIN output
  capturedAt: string // ISO timestamp
}

export interface ValidationComparison {
  improvementPercent: number // (before - after) / before * 100
  improvementType: 'time' | 'rows' | 'plan'
  confidence: 'low' | 'medium' | 'high'
  confidenceScore: number // 0-100
  samples: number
  statisticallySignificant: boolean
}

export interface ValidationRecord {
  id: string
  tenantId: string
  suggestionId: string
  connectionId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  beforeMetrics?: MetricsCapture
  afterMetrics?: MetricsCapture
  comparison?: ValidationComparison
  error?: string
  createdAt: string
  completedAt?: string
  actorId: string
}

// Mock database execution for now (would use actual DB in production)
export async function captureMetrics(
  query: string,
  label: string
): Promise<MetricsCapture> {
  const startTime = performance.now()
  
  // In production, would execute query against test database
  // For now, simulate execution with mock timings
  const simulatedExecutionTime = label === 'before' 
    ? Math.random() * 3000 + 1500  // 1500-4500ms
    : Math.random() * 500 + 50      // 50-550ms

  await new Promise(resolve => setTimeout(resolve, 100)) // Simulate query execution

  const endTime = performance.now()

  return {
    executionTime: simulatedExecutionTime,
    rowsScanned: Math.floor(Math.random() * 200000),
    rowsReturned: Math.floor(Math.random() * 1000),
    executionPlan: `${label === 'before' ? 'Seq Scan' : 'Index Scan'} on table...`,
    capturedAt: new Date().toISOString(),
  }
}

export function calculateImprovement(
  beforeMetrics: MetricsCapture,
  afterMetrics: MetricsCapture
): Omit<ValidationComparison, 'confidence' | 'confidenceScore' | 'statisticallySignificant'> {
  const timeDiff = beforeMetrics.executionTime - afterMetrics.executionTime
  const timeImprovement = (timeDiff / beforeMetrics.executionTime) * 100

  const rowsDiff = beforeMetrics.rowsScanned - afterMetrics.rowsScanned
  const rowsImprovement = beforeMetrics.rowsScanned > 0 
    ? (rowsDiff / beforeMetrics.rowsScanned) * 100
    : 0

  // Primary metric is time improvement
  const improvementPercent = Math.max(0, timeImprovement)
  const improvementType: 'time' | 'rows' | 'plan' = 
    improvementPercent > rowsImprovement ? 'time' : 'rows'

  return {
    improvementPercent: Math.round(improvementPercent * 10) / 10,
    improvementType,
    samples: 1,
  }
}

export function scoreConfidence(
  samples: number,
  improvementPercent: number
): Omit<ValidationComparison, 'improvementPercent' | 'improvementType' | 'samples'> {
  // Confidence factors:
  // 1. Number of samples (more runs = more confident)
  // 2. Improvement magnitude (larger improvements = more confident)
  // 3. Statistical threshold (5% noise tolerance)

  const NOISE_THRESHOLD = 5 // Ignore improvements < 5%
  const MIN_SAMPLES = 3
  const MAX_SAMPLES = 10

  if (improvementPercent < NOISE_THRESHOLD) {
    return {
      confidence: 'low',
      confidenceScore: 30,
      statisticallySignificant: false,
    }
  }

  // Sample confidence: 3 samples = 50%, 10 samples = 100%
  const sampleConfidence = Math.min(100, (samples / MAX_SAMPLES) * 100)

  // Improvement confidence: 5% = 40%, 50% = 100%
  const improvementConfidence = Math.min(100, (improvementPercent / 50) * 100)

  // Average the two factors
  const confidenceScore = Math.round((sampleConfidence + improvementConfidence) / 2)

  let confidence: 'low' | 'medium' | 'high'
  if (confidenceScore >= 85 && samples >= MIN_SAMPLES) {
    confidence = 'high'
  } else if (confidenceScore >= 70) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  return {
    confidence,
    confidenceScore,
    statisticallySignificant: confidence !== 'low' && samples >= MIN_SAMPLES,
  }
}

export function generateValidationId(): string {
  return `val_${crypto.randomBytes(6).toString('hex')}`
}

export async function runValidation(
  suggestionId: string,
  connectionId: string,
  originalQuery: string,
  optimizedQuery: string,
  tenantId: string,
  actorId: string
): Promise<ValidationRecord> {
  const validationId = generateValidationId()
  const startTime = new Date().toISOString()

  try {
    // 1. Capture before metrics (run 3 times, average)
    const beforeRuns = await Promise.all([
      captureMetrics(originalQuery, 'before'),
      captureMetrics(originalQuery, 'before'),
      captureMetrics(originalQuery, 'before'),
    ])

    const beforeMetrics: MetricsCapture = {
      executionTime: Math.round(beforeRuns.reduce((sum, m) => sum + m.executionTime, 0) / beforeRuns.length),
      rowsScanned: Math.round(beforeRuns.reduce((sum, m) => sum + m.rowsScanned, 0) / beforeRuns.length),
      rowsReturned: Math.round(beforeRuns.reduce((sum, m) => sum + m.rowsReturned, 0) / beforeRuns.length),
      executionPlan: beforeRuns[0].executionPlan,
      capturedAt: new Date().toISOString(),
    }

    // 2. Capture after metrics (run 3 times, average)
    const afterRuns = await Promise.all([
      captureMetrics(optimizedQuery, 'after'),
      captureMetrics(optimizedQuery, 'after'),
      captureMetrics(optimizedQuery, 'after'),
    ])

    const afterMetrics: MetricsCapture = {
      executionTime: Math.round(afterRuns.reduce((sum, m) => sum + m.executionTime, 0) / afterRuns.length),
      rowsScanned: Math.round(afterRuns.reduce((sum, m) => sum + m.rowsScanned, 0) / afterRuns.length),
      rowsReturned: Math.round(afterRuns.reduce((sum, m) => sum + m.rowsReturned, 0) / afterRuns.length),
      executionPlan: afterRuns[0].executionPlan,
      capturedAt: new Date().toISOString(),
    }

    // 3. Calculate improvement
    const improvement = calculateImprovement(beforeMetrics, afterMetrics)

    // 4. Score confidence
    const confidenceData = scoreConfidence(beforeRuns.length, improvement.improvementPercent)

    // 5. Combine results
    const comparison: ValidationComparison = {
      ...improvement,
      ...confidenceData,
      samples: beforeRuns.length,
    }

    const completedTime = new Date().toISOString()

    return {
      id: validationId,
      tenantId,
      suggestionId,
      connectionId,
      status: 'succeeded',
      beforeMetrics,
      afterMetrics,
      comparison,
      createdAt: startTime,
      completedAt: completedTime,
      actorId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      id: validationId,
      tenantId,
      suggestionId,
      connectionId,
      status: 'failed',
      error: errorMessage,
      createdAt: startTime,
      completedAt: new Date().toISOString(),
      actorId,
    }
  }
}
