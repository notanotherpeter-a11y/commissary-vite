import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Branch, Sale } from '@/types'

export function BranchSalesPage() {
  const { role: _role, branch: _userBranchSlug } = useAuth()
  const now = getCurrentMonthYear()
  const [period, setPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [branches, setBranches] = useState<Branch[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBranchId, setSelectedBranchId] = useState<number | 'all'>('all')

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  const getDateRange = useCallback(() => {
    if (period === 'monthly') {
      const lastDay = new Date(year, month, 0).getDate()
      return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: `${year}-${String(month).padStart(2, '0')}-${lastDay}` }
    }
    if (period === 'yearly') return { start: `${year}-01-01`, end: `${year}-12-31` }
    const q = Math.ceil(month / 3)
    const qStart = (q - 1) * 3 + 1
    const qEnd = q * 3
    const lastDay = new Date(year, qEnd, 0).getDate()
    return { start: `${year}-${String(qStart).padStart(2, '0')}-01`, end: `${year}-${String(qEnd).padStart(2, '0')}-${lastDay}` }
  }, [period, month, year])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { start, end } = getDateRange()
    let query = supabase.from('sales').select('*, branches(id,slug,name)').gte('date', start).lte('date', end).neq('branch_id', 6).order('date', { ascending: false })
    if (selectedBranchId !== 'all') query = query.eq('branch_id', selectedBranchId)
    const { data } = await query
    setSales(data ?? [])
    setLoading(false)
  }, [getDateRange, selectedBranchId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase.channel('branch-sales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const totalSales = sales.reduce((s, r) => s + Number(r.amount), 0)
  const branchTotals = branches.filter(b => b.id !== 6).map(b => ({
    ...b,
    total: sales.filter(s => s.branch_id === b.id).reduce((acc, s) => acc + Number(s.amount), 0),
  })).filter(b => b.total > 0)

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div>
      <PageHeader title="Branch Sales" description="Sales reported by all branches" />

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setSelectedBranchId('all')} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${selectedBranchId === 'all' ? 'bg-amber-500 text-black' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>All Branches</button>
        {branches.filter(b => b.id !== 6).map(b => (
          <button key={b.id} onClick={() => setSelectedBranchId(b.id)} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${selectedBranchId === b.id ? 'bg-amber-500 text-black' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>{b.name}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['monthly', 'quarterly', 'yearly'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${period === p ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        {period !== 'yearly' && (
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Branch Sales" value={formatCurrency(totalSales)} variant="green" />
        <KpiCard label="Transactions" value={String(sales.length)} />
        <KpiCard label="Avg per Sale" value={formatCurrency(sales.length ? totalSales / sales.length : 0)} />
        <KpiCard label="Branches Reporting" value={String(new Set(sales.map(s => s.branch_id)).size)} accent />
      </div>

      {selectedBranchId === 'all' && branchTotals.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {branchTotals.map(b => (
            <button key={b.id} onClick={() => setSelectedBranchId(b.id)} className="bg-white rounded-lg border p-3 text-left hover:border-amber-400 transition-colors group">
              <p className="text-xs text-slate-500 mb-1">{b.name}</p>
              <p className="font-semibold text-sm text-green-700 group-hover:text-amber-600">{formatCurrency(b.total)}</p>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Date</TableHead>
              {selectedBranchId === 'all' && <TableHead>Branch</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
            ) : sales.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No sales reported for this period.</TableCell></TableRow>
            ) : sales.map(sale => (
              <TableRow key={sale.id}>
                <TableCell className="text-sm">{formatDate(sale.date)}</TableCell>
                {selectedBranchId === 'all' && (
                  <TableCell><Badge variant="secondary">{(sale as Sale & { branches?: { name: string } }).branches?.name ?? `Branch ${sale.branch_id}`}</Badge></TableCell>
                )}
                <TableCell className="text-right font-semibold text-green-700">{formatCurrency(Number(sale.amount))}</TableCell>
                <TableCell className="text-sm text-slate-500">{sale.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
