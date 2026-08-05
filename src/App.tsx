import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'

// Pages (lazy-loaded placeholders — to be built out)
import { DashboardPage } from '@/pages/DashboardPage'
import { SalesPage } from '@/pages/SalesPage'
import { BranchSalesPage } from '@/pages/BranchSalesPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { SalaryPage } from '@/pages/SalaryPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { ReceivablesPage } from '@/pages/ReceivablesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { BranchOrdersPage } from '@/pages/BranchOrdersPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BranchPage } from '@/pages/BranchPage'
import { NetCostPage } from '@/pages/NetCostPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Redirects to the right landing page based on role
function RoleRedirect() {
  const { role, user } = useAuth()
  if (role === 'branch') {
    const branchSlug = user?.user_metadata?.branch
    return <Navigate to={branchSlug ? `/branches/${branchSlug}` : '/notifications'} replace />
  }
  return <Navigate to="/dashboard" replace />
}

// Blocks branch users from admin/investor-only pages
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  if (role === 'branch') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={session ? <RoleRedirect /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<RoleRedirect />} />
        <Route path="dashboard"     element={<AdminRoute><DashboardPage /></AdminRoute>} />
        <Route path="sales"         element={<AdminRoute><SalesPage /></AdminRoute>} />
        <Route path="branch-sales"  element={<AdminRoute><BranchSalesPage /></AdminRoute>} />
        <Route path="expenses"      element={<AdminRoute><ExpensesPage /></AdminRoute>} />
        <Route path="salary"        element={<AdminRoute><SalaryPage /></AdminRoute>} />
        <Route path="inventory"     element={<AdminRoute><InventoryPage /></AdminRoute>} />
        <Route path="receivables"   element={<AdminRoute><ReceivablesPage /></AdminRoute>} />
        <Route path="reports"       element={<AdminRoute><ReportsPage /></AdminRoute>} />
        <Route path="branch-orders" element={<AdminRoute><BranchOrdersPage /></AdminRoute>} />
        <Route path="net-cost"      element={<AdminRoute><NetCostPage /></AdminRoute>} />
        <Route path="settings"      element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
        <Route path="branches/:slug" element={<BranchPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
