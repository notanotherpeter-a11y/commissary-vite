import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { BranchOrder } from '@/types'

interface DailyOrderSummary {
  date: string
  orderCount: number
  totalAmount: number
  branches: string[]
}

export function SalesPage() {
  const { role } = useAuth()
  const now = getCurrentMonthYear()
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [loading, setLoading] = useState(true)
  const [branchOrders, setBranchOrders] = useState<(BranchOrder & { to_branch?: { name: string } })[]>([])

  const userMeta = { role: role ?? 'branch', branch: null }
  void userMeta

  const getDateRange = useCallback(() => {
    if (period === 'monthly') {
      const lastDay = new Date(year, month, 0).getDate()
      return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: `${year}-${String(month).padStart(2, '0')}-${lastDay}` }
    }
    return { start: `${year}-01-01`, end: `${year}-12-31` }
  }, [period, month, year])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { start, end } = getDateRange()
    const bo = await supabase
      .from('branch_orders')
      .select('*, to_branch:to_branch_id(id,slug,name)')
      .eq('status', 'approved')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
    setBranchOrders((bo.data ?? []) as (BranchOrder & { to_branch?: { name: string } })[])
    setLoading(false)
  }, [getDateRange])

  useEffect(() => { fetchData() }, [fetchData])

  const totalBranchOrdersAmount = branchOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0)
  const dailyOrderSummary: DailyOrderSummary[] = Object.values(
    branchOrders.reduce((acc, o) => {
      const d = o.date
      if (!acc[d]) acc[d] = { date: d, orderCount: 0, totalAmount: 0, branches: [] }
      acc[d].orderCount++
      acc[d].totalAmount += Number(o.amount ?? 0)
      const branchName = (o as BranchOrder & { to_branch?: { name: string } }).to_branch?.name
      if (branchName && !acc[d].branches.includes(branchName)) acc[d].branches.push(branchName)
      return acc
    }, {} as Record<string, DailyOrderSummary>)
  ).sort((a, b) => b.date.localeCompare(a.date))

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <PageHeader
        title="Commissary Sale"
        description="Branch orders fulfilled by the commissary"
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {(['monthly', 'yearly'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${period === p ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        {period === 'monthly' && (
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? 0))}>
            <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? 0))}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 mb-6">
        <KpiCard label="Total Sales" value={formatCurrency(totalBranchOrdersAmount)} variant="green" />
      </div>

      {/* Branch Orders Daily Summary */}
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Branch Orders — Daily Total (Approved)</h3>
      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Date</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
            ) : dailyOrderSummary.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No approved branch orders for this period.</TableCell></TableRow>
            ) : dailyOrderSummary.map(day => (
              <TableRow key={day.date}>
                <TableCell className="text-sm font-medium">{formatDate(day.date)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {day.branches.map(b => <Badge key={b} variant="secondary">{b}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className="text-right text-slate-600">{day.orderCount}</TableCell>
                <TableCell className="text-right font-semibold text-green-700">{formatCurrency(day.totalAmount)}</TableCell>
              </TableRow>
            ))}
            {dailyOrderSummary.length > 0 && (
              <TableRow className="bg-amber-50 border-t-2 border-amber-200">
                <TableCell colSpan={3} className="font-bold text-slate-800">Total</TableCell>
                <TableCell className="text-right font-bold text-amber-700">{formatCurrency(totalBranchOrdersAmount)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
