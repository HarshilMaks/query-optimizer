import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { AppLayout, Badge, Skeleton } from '@/components/AppLayout'
import { Play, Brain, Copy, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export const Route = createFileRoute('/query/$id')({ component: QueryDetailPage })

// Parse PostgreSQL EXPLAIN JSON into React Flow nodes/edges
function parsePlanToFlow(plan: any): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeId = 0

  function getNodeColor(node: any): string {
    const cost = node['Total Cost'] ?? 0
    const actualTime = node['Actual Total Time'] ?? 0
    if (actualTime > 500 || cost > 50000) return '#7f1d1d'
    if (actualTime > 100 || cost > 10000) return '#78350f'
    return '#064e3b'
  }

  function traverse(node: any, parentId: string | null, depth: number, x: number, y: number) {
    const id = `node-${nodeId++}`
    const label = `${node['Node Type'] ?? 'Unknown'}`
    const actualTime = node['Actual Total Time']
    const actualRows = node['Actual Rows']
    const totalCost = node['Total Cost']

    nodes.push({
      id,
      type: 'default',
      position: { x, y },
      data: {
        label: (
          <div className="text-left">
            <div className="font-semibold text-white text-xs">{label}</div>
            {node['Relation Name'] && <div className="text-slate-300 text-xs">on {node['Relation Name']}</div>}
            <div className="mt-1 space-y-0.5">
              {actualTime != null && <div className="text-xs text-amber-300">⏱ {actualTime.toFixed(2)}ms</div>}
              {actualRows != null && <div className="text-xs text-blue-300">↵ {actualRows.toLocaleString()} rows</div>}
              {totalCost != null && <div className="text-xs text-slate-400">cost: {totalCost.toFixed(1)}</div>}
            </div>
          </div>
        ),
      },
      style: {
        background: getNodeColor(node),
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '8px 12px',
        width: 200,
        fontSize: 11,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    })

    if (parentId) {
      edges.push({ id: `edge-${parentId}-${id}`, source: parentId, target: id, style: { stroke: '#475569' } })
    }

    const children = node['Plans'] ?? []
    const spacing = 240
    const startX = x - ((children.length - 1) * spacing) / 2
    children.forEach((child: any, i: number) => {
      traverse(child, id, depth + 1, startX + i * spacing, y + 140)
    })
  }

  const topNode = Array.isArray(plan) ? plan[0]?.Plan : plan?.Plan ?? plan
  if (topNode) traverse(topNode, null, 0, 400, 20)
  return { nodes, edges }
}

function QueryDetailPage() {
  const { id } = Route.useParams()
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [explaining, setExplaining] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [rawPlanOpen, setRawPlanOpen] = useState(false)
  const [applyModal, setApplyModal] = useState<any | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.queries.get(id)
      setDetail(data)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleExplain() {
    setExplaining(true)
    try {
      await api.queries.explain(id)
      await load()
    } finally {
      setExplaining(false)
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      await api.queries.analyze(id)
      await load()
    } catch (err: any) {
      setAnalyzeError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleApplySuggestion(suggestionId: string) {
    try {
      await api.suggestions.apply(suggestionId)
      const s = detail.suggestions.find((s: any) => s.id === suggestionId)
      setApplyModal({ title: 'Apply Suggestion Manually', message: 'Copy this SQL and run it on your database or read replica. QuerySage does not execute SQL on your database for safety.', sql: s?.sql_to_run ?? '' })
      await load()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const query = detail?.query
  const explains = detail?.explains ?? []
  const analyses = detail?.analyses ?? []
  const suggestions = detail?.suggestions ?? []
  const latestExplain = explains[explains.length - 1]
  const latestAnalysis = analyses[analyses.length - 1]

  const planFlow = latestExplain?.raw_plan_json ? parsePlanToFlow(latestExplain.raw_plan_json) : null

  const statsData = query ? [
    { name: 'Mean', value: query.mean_exec_time_ms, color: query.mean_exec_time_ms >= 1000 ? '#ef4444' : query.mean_exec_time_ms >= 200 ? '#f59e0b' : '#10b981' },
    { name: 'Min', value: query.min_exec_time, color: '#10b981' },
    { name: 'Max', value: query.max_exec_time, color: '#ef4444' },
    { name: 'StdDev', value: query.stddev_exec_time, color: '#64748b' },
  ] : []

  if (loading) return (
    <AppLayout>
      <div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
    </AppLayout>
  )

  if (!query) return (
    <AppLayout>
      <div className="p-6 text-center py-20">
        <XCircle size={40} className="text-red-500 mx-auto mb-3" />
        <p className="text-white font-medium">Query not found</p>
      </div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-slate-500 hover:text-white transition-colors text-sm">Dashboard</a>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400 text-sm font-mono">{id.slice(0, 8)}...</span>
          </div>
          <Badge variant={query.status}>{query.status}</Badge>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* LEFT: Query + Stats */}
          <div className="space-y-4">
            {/* SQL block */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">SQL Query</span>
                <button onClick={() => copyToClipboard(query.query_text, 'query')} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                  {copied === 'query' ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied === 'query' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">{query.query_text}</pre>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Mean Time', value: `${query.mean_exec_time_ms?.toFixed(1)}ms`, color: query.mean_exec_time_ms >= 1000 ? 'text-red-400' : query.mean_exec_time_ms >= 200 ? 'text-amber-400' : 'text-emerald-400' },
                { label: 'Total Calls', value: query.total_calls?.toLocaleString(), color: 'text-blue-400' },
                { label: 'Total Time', value: `${(query.total_exec_time_ms / 1000).toFixed(1)}s`, color: 'text-slate-300' },
                { label: 'Min Time', value: `${query.min_exec_time?.toFixed(1)}ms`, color: 'text-emerald-400' },
                { label: 'Max Time', value: `${query.max_exec_time?.toFixed(1)}ms`, color: 'text-red-400' },
                { label: 'Std Dev', value: `${query.stddev_exec_time?.toFixed(1)}ms`, color: 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">{s.label}</div>
                  <div className={`font-bold font-mono text-sm ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Timing chart */}
            {statsData.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs font-medium text-slate-400 mb-3">Timing Overview (ms)</div>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={statsData} barSize={40}>
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {statsData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* EXPLAIN button */}
            <button onClick={handleExplain} disabled={explaining} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              {explaining ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {latestExplain ? 'Re-run EXPLAIN ANALYZE' : 'Run EXPLAIN ANALYZE'}
            </button>

            {/* Raw plan */}
            {latestExplain && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl">
                <button onClick={() => setRawPlanOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-white transition-colors">
                  <span>Raw Execution Plan {latestExplain.actual_total_time ? `(${latestExplain.actual_total_time.toFixed(2)}ms total)` : ''}</span>
                  {rawPlanOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {rawPlanOpen && (
                  <pre className="px-4 pb-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-slate-800 pt-3">
                    {JSON.stringify(latestExplain.raw_plan_json, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: AI Analysis */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Brain size={14} className="text-blue-400" />
                  AI Analysis
                </div>
                <button onClick={handleAnalyze} disabled={analyzing || !latestExplain}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                  {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                  {latestAnalysis ? 'Re-analyze' : 'Analyze with AI'}
                </button>
              </div>

              <div className="p-4">
                {!latestExplain && !analyzing && (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    <AlertCircle size={24} className="mx-auto mb-2 text-slate-600" />
                    Run EXPLAIN ANALYZE first, then click "Analyze with AI"
                  </div>
                )}

                {analyzing && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}
                    <p className="text-center text-xs text-slate-500">Analyzing execution plan with Gemini AI...</p>
                  </div>
                )}

                {analyzeError && (
                  <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
                    <XCircle size={14} className="text-red-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-red-400 font-medium">AI analysis unavailable</p>
                      <p className="text-xs text-slate-400 mt-0.5">{analyzeError}</p>
                    </div>
                  </div>
                )}

                {latestAnalysis && !analyzing && (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                      <p className="text-sm text-slate-300 leading-relaxed">{latestAnalysis.summary}</p>
                    </div>

                    {/* Bottlenecks */}
                    {latestAnalysis.bottlenecks_json?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Issues Identified</div>
                        <div className="space-y-2">
                          {latestAnalysis.bottlenecks_json.map((b: any, i: number) => (
                            <div key={i} className={`p-3 rounded-lg border ${b.type === 'critical' ? 'bg-red-900/20 border-red-700/40' : b.type === 'warning' ? 'bg-amber-900/20 border-amber-700/40' : 'bg-blue-900/20 border-blue-700/40'}`}>
                              <div className={`text-xs font-semibold mb-1 ${b.type === 'critical' ? 'text-red-400' : b.type === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>{b.title}</div>
                              <p className="text-xs text-slate-300 leading-relaxed">{b.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Index Recommendations</h2>
            <div className="space-y-4">
              {suggestions.filter((s: any) => s.suggestion_type === 'index').map((s: any) => (
                <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{s.title}</span>
                      {s.estimated_improvement_pct && (
                        <span className="text-xs px-2 py-0.5 bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 rounded-full font-medium">
                          +{s.estimated_improvement_pct}% faster
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status}>{s.status}</Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-slate-400 mb-3">{s.description}</p>
                    <div className="relative">
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-emerald-300 overflow-x-auto">{s.sql_to_run}</pre>
                      <button onClick={() => copyToClipboard(s.sql_to_run, s.id)} className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs rounded transition-colors">
                        {copied === s.id ? <CheckCircle2 size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        {copied === s.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {s.status === 'pending' && (
                      <button onClick={() => handleApplySuggestion(s.id)} className="mt-3 flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">
                        <CheckCircle2 size={14} /> Mark as Applied
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Query rewrite suggestions */}
              {suggestions.filter((s: any) => s.suggestion_type === 'rewrite').map((s: any) => (
                <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <span className="font-medium text-sm">Query Rewrite Suggestion</span>
                    <Badge variant="rewrite">rewrite</Badge>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-slate-400 mb-3">{s.description}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500 mb-1 font-medium">ORIGINAL</div>
                        <pre className="bg-slate-950 border border-red-900/40 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">{query.query_text?.substring(0, 500)}</pre>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1 font-medium">REWRITTEN</div>
                        <pre className="bg-slate-950 border border-emerald-900/40 rounded-lg p-3 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap">{s.sql_to_run}</pre>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => copyToClipboard(s.sql_to_run, `rw-${s.id}`)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">
                        {copied === `rw-${s.id}` ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Copy size={11} />} Copy Rewritten
                      </button>
                      {s.status === 'pending' && (
                        <button onClick={() => handleApplySuggestion(s.id)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg transition-colors">
                          <CheckCircle2 size={11} /> Mark Applied
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Execution Plan Tree */}
        {planFlow && planFlow.nodes.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Execution Plan Visualization</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden" style={{ height: 420 }}>
              <ReactFlow
                nodes={planFlow.nodes}
                edges={planFlow.edges}
                fitView
                attributionPosition="bottom-right"
                colorMode="dark"
              >
                <Background color="#1e293b" gap={20} />
                <Controls />
                <MiniMap nodeColor="#1e293b" maskColor="rgba(0,0,0,0.4)" />
              </ReactFlow>
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-950 border border-red-800"></div> High cost ({'>'} 500ms or cost {'>'} 50k)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-950 border border-amber-800"></div> Medium cost</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-950 border border-emerald-800"></div> Low cost</div>
            </div>
          </div>
        )}

        {/* Apply modal */}
        {applyModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full">
              <h3 className="text-lg font-bold mb-2">{applyModal.title}</h3>
              <p className="text-slate-400 text-sm mb-4">{applyModal.message}</p>
              <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap mb-4">{applyModal.sql}</pre>
              <div className="flex gap-3">
                <button onClick={() => copyToClipboard(applyModal.sql, 'modal')} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                  {copied === 'modal' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copied === 'modal' ? 'Copied!' : 'Copy SQL'}
                </button>
                <button onClick={() => setApplyModal(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
