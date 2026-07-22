import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import {
  LayoutDashboard, TrendingUp, Store, ShoppingBag,
  Receipt, Users, Package, Wallet, BarChart3,
  Settings, Bell, Building2, LogOut, Menu, ChevronDown, ChevronRight, Calculator
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',     icon: LayoutDashboard, roles: ['admin', 'investor'] },
  { label: 'Commissary Sale', path: '/sales',          icon: TrendingUp,      roles: ['admin', 'investor'] },
  { label: 'Branch Sale',     path: '/branch-sales',   icon: Store,           roles: ['admin', 'investor'] },
  { label: 'Branch Orders',   path: '/branch-orders',  icon: ShoppingBag,     roles: ['admin'] },
  { label: 'Expenses',        path: '/expenses',       icon: Receipt,         roles: ['admin', 'investor'] },
  { label: 'Salary',          path: '/salary',         icon: Users,           roles: ['admin', 'investor'] },
  { label: 'Inventory',       path: '/inventory',      icon: Package,         roles: ['admin', 'investor'] },
  { label: 'Receivables',     path: '/receivables',    icon: Wallet,          roles: ['admin', 'investor'] },
  { label: 'Reports',         path: '/reports',        icon: BarChart3,       roles: ['admin', 'investor'] },
  { label: 'Notifications',   path: '/notifications',  icon: Bell,            roles: ['admin', 'investor', 'branch'] },
  { label: 'Net Cost',        path: '/net-cost',       icon: Calculator,      roles: ['admin', 'investor'] },
  { label: 'Settings',        path: '/settings',       icon: Settings,        roles: ['admin'] },
]

interface Branch {
  slug: string
  name: string
}

export function AppShell() {
  const { role, user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [branchesOpen, setBranchesOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])

  const visibleNav = NAV_ITEMS.filter(item => role && item.roles.includes(role))
  const isAdminOrInvestor = role === 'admin' || role === 'investor'

  useEffect(() => {
    if (!isAdminOrInvestor) return
    supabase
      .from('branches')
      .select('slug, name')
      .neq('id', 6)
      .order('name')
      .then(({ data }) => {
        if (data) setBranches(data as Branch[])
      })
  }, [isAdminOrInvestor])

  // Auto-open branches section when on a branch page
  useEffect(() => {
    if (location.pathname.startsWith('/branches/')) {
      setBranchesOpen(true)
    }
  }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full w-64 bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100">
        <img src="/kamayan-logo.png" alt="Kamayan Logo" className="w-12 h-12 object-contain rounded-lg flex-shrink-0" />
        <div>
          <p className="font-semibold text-sm text-slate-800">Kamayan</p>
          <p className="text-xs text-slate-500">Commissary Management</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {/* Branch user: My Branch link */}
        {role === 'branch' && (
          <NavLink
            to={`/branches/${user?.user_metadata?.branch}`}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-amber-50 text-amber-600' : 'text-slate-600 hover:bg-slate-50'
            )}
            onClick={() => setMobileOpen(false)}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            My Branch
          </NavLink>
        )}

        {visibleNav.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-amber-50 text-amber-600' : 'text-slate-600 hover:bg-slate-50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          )
        })}

        {/* Branches collapsible (admin / investor) */}
        {isAdminOrInvestor && (
          <div>
            <button
              onClick={() => setBranchesOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Branches</span>
              {branchesOpen
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {branchesOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5">
                {branches.map(branch => {
                  const path = `/branches/${branch.slug}`
                  const isActive = location.pathname === path
                  return (
                    <NavLink
                      key={branch.slug}
                      to={path}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'block px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        isActive
                          ? 'bg-amber-50 text-amber-600'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      {branch.name}
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2 mb-2 px-2">
          <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-xs font-bold text-amber-700">{user?.email?.[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{user?.user_metadata?.username ?? user?.email?.split('@')[0]}</p>
            <p className="text-[10px] text-slate-400 capitalize">{role}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full z-10">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)} className="p-1 text-slate-600">
            <Menu className="w-5 h-5" />
          </button>
          <img src="/kamayan-logo.png" alt="Kamayan" className="w-8 h-8 object-contain" />
          <span className="text-sm font-semibold text-slate-800">Kamayan</span>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
