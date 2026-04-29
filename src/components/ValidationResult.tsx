import { Badge } from '@/components/AppLayout'
import { TrendingDown, CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface ValidationResultProps {
  validation?: any
  loading?: boolean
  error?: string
}

export function ValidationResult({
  validation,
  loading = false,
  error,
}: ValidationResultProps) {
  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Clock size={16} className="animate-spin" />
          Running validation...
        </div>
      </div>
    )
  }

  if (error || !validation) {
    return (
      <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          {error || 'Validation not available'}
        </div>
      </div>
    )
  }

  if (validation.status === 'failed') {
    return (
      <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <AlertCircle size={16} />
          Validation Failed
        </div>
        <p className="text-sm text-red-300">{validation.error}</p>
      </div>
    )
  }

  if (validation.status === 'pending' || validation.status === 'running') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Clock size={16} className="animate-spin" />
          Validation in progress...
        </div>
      </div>
    )
  }

  const { beforeMetrics, afterMetrics, comparison } = validation

  if (!beforeMetrics || !afterMetrics || !comparison) {
    return null
  }

  const { improvementPercent, confidence, confidenceScore } = comparison

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-700/30 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-400" />
          <span className="font-medium text-emerald-400">Validation Results</span>
        </div>
        <Badge variant={confidence as any}>
          {confidence.toUpperCase()} ({confidenceScore}%)
        </Badge>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Execution Time */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Execution Time</div>
          <div className="flex items-end gap-2">
            <div>
              <div className="text-sm text-slate-400 line-through">
                {Math.round(beforeMetrics.executionTime)}ms
              </div>
              <div className="text-lg font-semibold text-emerald-400">
                {Math.round(afterMetrics.executionTime)}ms
              </div>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 text-sm">
              <TrendingDown size={14} />
              {improvementPercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Rows Scanned */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Rows Scanned</div>
          <div className="flex items-end gap-2">
            <div>
              <div className="text-sm text-slate-400 line-through">
                {(beforeMetrics.rowsScanned / 1000).toFixed(1)}K
              </div>
              <div className="text-lg font-semibold text-slate-300">
                {(afterMetrics.rowsScanned / 1000).toFixed(1)}K
              </div>
            </div>
            <div className="text-xs text-slate-500">
              ({Math.round(
                ((beforeMetrics.rowsScanned - afterMetrics.rowsScanned) /
                  beforeMetrics.rowsScanned) *
                  100
              )}% less)
            </div>
          </div>
        </div>
      </div>

      {/* Execution Plans */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-slate-500 mb-1">Before Plan</div>
          <div className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-400 font-mono">
            {beforeMetrics.executionPlan}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1">After Plan</div>
          <div className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-400 font-mono">
            {afterMetrics.executionPlan}
          </div>
        </div>
      </div>

      {/* Confidence Explanation */}
      <div className="bg-slate-950/50 border border-slate-800/50 rounded p-3 text-xs text-slate-400">
        <span className="font-medium text-slate-300">Confidence: {confidence}</span>
        {confidence === 'high' && (
          <p className="mt-1">
            Based on {comparison.samples} samples with {improvementPercent.toFixed(1)}% improvement.
            Result is statistically significant.
          </p>
        )}
        {confidence === 'medium' && (
          <p className="mt-1">
            Based on {comparison.samples} samples with {improvementPercent.toFixed(1)}% improvement.
            Consider additional validation for critical queries.
          </p>
        )}
        {confidence === 'low' && (
          <p className="mt-1">
            Improvement is below noise threshold or based on limited samples.
            Recommend re-validating or increasing sample size.
          </p>
        )}
      </div>
    </div>
  )
}
