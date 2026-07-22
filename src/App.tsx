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

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="branch-sales" element={<BranchSalesPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="salary" element={<SalaryPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="receivables" element={<ReceivablesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="branch-orders" element={<BranchOrdersPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="net-cost" element={<NetCostPage />} />
        <Route path="branches/:slug" element={<BranchPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
