import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Lightbulb, Mail, Settings, Plus, Zap } from 'lucide-react'

const navLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/suggestions', icon: Lightbulb, label: 'Suggestions' },
  { to: '/digest', icon: Mail, label: 'Digest' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState()
  const path = routerState.location.pathname

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-800">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-none">QuerySage</div>
              <div className="text-xs text-slate-500 leading-none mt-0.5">AI Query Optimizer</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map(({ to, icon: Icon, label }) => {
            const active = path === to || path.startsWith(to + '/')
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Add Connection CTA */}
        <div className="p-3 border-t border-slate-800">
          <Link
            to="/connect"
            className="flex items-center gap-2 w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
          >
            <Plus size={14} />
            Add Connection
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

// Badge component
export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'pending' | 'analyzed' | 'optimized' | 'index' | 'rewrite' | 'config' | 'applied' | 'dismissed' | 'critical' | 'warning' | 'info' | 'connected' | 'disconnected' | 'error' }) {
  const styles: Record<string, string> = {
    default: 'bg-slate-700 text-slate-300',
    pending: 'bg-amber-900/50 text-amber-400 border border-amber-700/50',
    analyzed: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
    optimized: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50',
    applied: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50',
    dismissed: 'bg-slate-700/50 text-slate-500 border border-slate-600/50',
    index: 'bg-purple-900/50 text-purple-400 border border-purple-700/50',
    rewrite: 'bg-cyan-900/50 text-cyan-400 border border-cyan-700/50',
    config: 'bg-orange-900/50 text-orange-400 border border-orange-700/50',
    critical: 'bg-red-900/50 text-red-400 border border-red-700/50',
    warning: 'bg-amber-900/50 text-amber-400 border border-amber-700/50',
    info: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
    connected: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50',
    disconnected: 'bg-slate-700/50 text-slate-400 border border-slate-600/50',
    error: 'bg-red-900/50 text-red-400 border border-red-700/50',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant] ?? styles.default}`}>
      {children}
    </span>
  )
}

// Stat card
export function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-3xl font-bold ${accent ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

// Loading skeleton
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} />
}
