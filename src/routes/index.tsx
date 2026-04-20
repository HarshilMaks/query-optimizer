import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Database, Zap, BarChart3, Shield, ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/')({ component: Landing })

function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg">QuerySage</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-slate-400 hover:text-white transition-colors">Dashboard</Link>
            <Link to="/connect" className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-900/40 border border-blue-700/50 rounded-full text-blue-400 text-sm font-medium mb-8">
            <Zap size={12} /> AI-Powered PostgreSQL Optimization
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-none">
            Stop Guessing.{' '}
            <span className="text-blue-500">Start Optimizing.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Connect your Postgres database and get AI-generated index recommendations in 60 seconds. Identify slow queries, analyze execution plans, and apply optimizations with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/connect"
              className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Connect Your Database <ArrowRight size={20} />
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-lg border border-slate-700"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Everything you need to optimize</h2>
          <p className="text-slate-400 text-center mb-14 max-w-xl mx-auto">
            From slow query detection to AI-powered recommendations — one tool for all your PostgreSQL performance needs.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Database, title: 'Slow Query Detection', desc: 'Automatically pulls the worst offenders from pg_stat_statements, ranked by mean execution time.', color: 'text-red-400', bg: 'bg-red-900/20' },
              { icon: BarChart3, title: 'AI Execution Plan Analysis', desc: 'Gemini AI reads your EXPLAIN ANALYZE output and identifies exactly why your query is slow.', color: 'text-blue-400', bg: 'bg-blue-900/20' },
              { icon: Zap, title: 'Index Recommendations', desc: 'Get exact CREATE INDEX statements with estimated improvement percentages you can copy and run.', color: 'text-amber-400', bg: 'bg-amber-900/20' },
              { icon: Shield, title: 'Safe by Design', desc: 'QuerySage never executes SQL on your database. All suggestions are copy-and-run. Your data stays yours.', color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
            ].map(f => (
              <div key={f.title} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
                <div className={`w-10 h-10 ${f.bg} rounded-lg flex items-center justify-center mb-4`}>
                  <f.icon size={20} className={f.color} />
                </div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 border-t border-slate-800 bg-slate-900/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
          <p className="text-slate-400 text-center mb-14">Three steps from slow queries to optimized performance.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Connect', desc: 'Add your PostgreSQL connection details. QuerySage connects securely with AES-256 encrypted credentials.' },
              { step: '02', title: 'Analyze', desc: 'QuerySage pulls slow queries from pg_stat_statements and runs EXPLAIN ANALYZE on each one automatically.' },
              { step: '03', title: 'Optimize', desc: 'Gemini AI generates specific index recommendations and query rewrites. Copy the SQL and apply it yourself.' },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                <div className="text-5xl font-black text-slate-800 mb-3">{s.step}</div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
                {i < 2 && <ChevronRight size={24} className="hidden md:block absolute top-10 -right-4 text-slate-700" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard preview mockup */}
      <section className="py-20 px-6 border-t border-slate-800">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Professional database monitoring</h2>
          <p className="text-slate-400 text-center mb-10">A clean, developer-friendly interface built for database performance work.</p>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 overflow-hidden">
            {/* Mock dashboard */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[['23', 'Slow Queries', 'text-red-400'], ['4.2s', 'Time Saved/Day', 'text-emerald-400'], ['7', 'Applied This Week', 'text-blue-400'], ['3', 'Connections', 'text-slate-300']].map(([v, l, c]) => (
                <div key={l} className="bg-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-500 mb-1">{l}</div>
                  <div className={`text-2xl font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 text-xs text-slate-400 font-medium">SLOW QUERIES</div>
              {[
                { q: 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', t: '1,847ms', s: 'Analyzed', c: 'text-red-400' },
                { q: 'SELECT u.*, p.* FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.email...', t: '423ms', s: 'Pending', c: 'text-amber-400' },
                { q: 'UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2', t: '187ms', s: 'Optimized', c: 'text-emerald-400' },
              ].map((row) => (
                <div key={row.q} className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-4">
                  <div className="flex-1 font-mono text-xs text-slate-300 truncate">{row.q}</div>
                  <div className={`text-sm font-semibold ${row.c} w-20 text-right`}>{row.t}</div>
                  <div className="w-20 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${row.s === 'Analyzed' ? 'bg-blue-900/50 text-blue-400' : row.s === 'Pending' ? 'bg-amber-900/50 text-amber-400' : 'bg-emerald-900/50 text-emerald-400'}`}>{row.s}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-slate-800 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to optimize your database?</h2>
        <p className="text-slate-400 mb-8">Connect your first database and get AI-powered recommendations in under 60 seconds.</p>
        <Link to="/connect" className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-lg">
          Connect Your Database <ArrowRight size={20} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6 text-center text-sm text-slate-600">
        <div className="flex items-center justify-center gap-6">
          <span>© 2026 QuerySage</span>
          <a href="https://github.com" className="hover:text-slate-400 transition-colors">GitHub</a>
          <span>Built with Gemini AI + Netlify</span>
        </div>
      </footer>
    </div>
  )
}
