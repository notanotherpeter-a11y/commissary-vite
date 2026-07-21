import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, MONTHS, getCurrentMonthYear, formatDate } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { Branch } from '@/types'

interface SaleRow { amount: number; branch_id: number; date: string; notes: string | null }
interface ExpenseRow { amount: number; branch_id: number; date: string; category: string }
interface SalaryRow { amount: number; date: string }
interface ReceivableRow { amount: number; date: string; description: string }

export function DashboardPage() {
  const now = getCurrentMonthYear()
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [branches, setBranches] = useState<Branch[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [salaryPayments, setSalaryPayments] = useState<SalaryRow[]>([])
  const [receivables, setReceivables] = useState<ReceivableRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('branches').select('id,slug,name').order('id').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const [s, e, sp, r] = await Promise.all([
      supabase.from('sales').select('amount,branch_id,date,notes').gte('date', start).lte('date', end),
      supabase.from('expenses').select('amount,branch_id,date,category').gte('date', start).lte('date', end),
      supabase.from('salary_payments').select('amount,date').gte('date', start).lte('date', end),
      supabase.from('receivables').select('amount,date,description').gte('date', start).lte('date', end),
    ])

    setSales(s.data ?? [])
    setExpenses(e.data ?? [])
    setSalaryPayments(sp.data ?? [])
    setReceivables(r.data ?? [])
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_payments' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receivables' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const grossSales = sales.reduce((s, r) => s + Number(r.amount), 0)
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0)
  const netSales = grossSales - totalExpenses
  const runningSalary = salaryPayments.reduce((s, r) => s + Number(r.amount), 0)
  const netLessSalary = netSales - runningSalary
  const totalReceivables = receivables
    .filter(r => !r.description.toLowerCase().includes('additional fund'))
    .reduce((s, r) => s + Number(r.amount), 0)
  const grandTotal = grossSales + totalReceivables

  const chartData = branches
    .map(b => ({
      name: b.name,
      sales: sales.filter(s => s.branch_id === b.id).reduce((acc, s) => acc + Number(s.amount), 0),
    }))
    .filter(b => b.sales > 0)

  const recentSales = [...sales]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview for ${MONTHS[month - 1]} ${year}`}
        action={
          <div className="flex gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? 0))}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <span className="truncate">{MONTHS[month - 1]}</span>
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? 0))}>
              <SelectTrigger className="w-24 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Gross Sales" value={formatCurrency(grossSales)} variant="green" />
        <KpiCard label="Total Expenses" value={formatCurrency(totalExpenses)} variant="red" />
        <KpiCard label="Net Sales" value={formatCurrency(netSales)} variant={netSales >= 0 ? 'green' : 'red'} />
        <KpiCard label="Running Salary" value={formatCurrency(runningSalary)} variant="amber" />
        <KpiCard label="Net less Salary" value={formatCurrency(netLessSalary)} variant={netLessSalary >= 0 ? 'green' : 'red'} />
        <KpiCard label="Grand Total" value={formatCurrency(grandTotal)} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm text-slate-500">Loading…</div>
            ) : chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-slate-500">No sales data for this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <p className="text-sm text-slate-500">No sales this period.</p>
            ) : (
              <div className="space-y-3">
                {recentSales.map((s, i) => (
                  <div key={i} className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-500">{formatDate(s.date)}</p>
                      {s.notes && <p className="text-xs text-slate-400 truncate max-w-28">{s.notes}</p>}
                    </div>
                    <span className="text-sm font-semibold text-green-700">{formatCurrency(Number(s.amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
