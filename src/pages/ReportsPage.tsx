import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Printer } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import type { Branch } from '@/types'

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#6b7280']

export function ReportsPage() {
  const now = getCurrentMonthYear()
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [branches, setBranches] = useState<Branch[]>([])
  const [sales, setSales] = useState<{ branch_id: number; amount: number; date: string }[]>([])
  const [expenses, setExpenses] = useState<{ category: string; amount: number }[]>([])
  const [orders, setOrders] = useState<{ from_branch_id: number | null; to_branch_id: number | null; item: string; amount: number | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    const [s, e, o] = await Promise.all([
      supabase.from('sales').select('branch_id,amount,date').gte('date', start).lte('date', end),
      supabase.from('expenses').select('category,amount').gte('date', start).lte('date', end),
      supabase.from('branch_orders').select('from_branch_id,to_branch_id,item,amount').gte('date', start).lte('date', end),
    ])
    setSales(s.data ?? [])
    setExpenses(e.data ?? [])
    setOrders(o.data ?? [])
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const salesByBranch = branches.map(b => ({
    name: b.name,
    sales: sales.filter(s => s.branch_id === b.id).reduce((a, s) => a + Number(s.amount), 0),
  })).filter(x => x.sales > 0)

  const expenseByCategory: Record<string, number> = {}
  expenses.forEach(e => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount) })
  const expensePieData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }))

  const salesByDay: Record<string, number> = {}
  sales.forEach(s => { salesByDay[s.date] = (salesByDay[s.date] || 0) + Number(s.amount) })
  const topDays = Object.entries(salesByDay).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([date, amount]) => ({
    day: new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    amount,
  }))

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Business performance insights"
        action={
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> Print / Export PDF
          </Button>
        }
      />

      <div className="flex gap-2 mb-6">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? 0))}>
          <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? 0))}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading reports…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Sales by Branch</CardTitle></CardHeader>
              <CardContent>
                {salesByBranch.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={salesByBranch} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [formatCurrency(Number(v ?? 0))]} />
                      <Bar dataKey="sales" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Expenses by Category</CardTitle></CardHeader>
              <CardContent>
                {expensePieData.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={expensePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {expensePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [formatCurrency(Number(v ?? 0))]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top Sales Days</CardTitle></CardHeader>
            <CardContent>
              {topDays.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topDays} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v ?? 0))]} />
                    <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          {orders.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Branch Orders / Transfers</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {orders.map((o, i) => {
                    const from = branches.find(b => b.id === o.from_branch_id)
                    const to = branches.find(b => b.id === o.to_branch_id)
                    return (
                      <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium">{o.item}</p>
                          <p className="text-xs text-slate-500">{from?.name ?? 'N/A'} to {to?.name ?? 'N/A'}</p>
                        </div>
                        <span className="text-sm font-semibold">{o.amount ? formatCurrency(o.amount) : '---'}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
