import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AddSaleModal } from '@/components/modals/AddSaleModal'
import type { Sale } from '@/types'
import { toast } from 'sonner'

export function SalesPage() {
  const { role } = useAuth()
  const now = getCurrentMonthYear()
  const [period, setPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [sales, setSales] = useState<Sale[]>([])
  const [expenses, setExpenses] = useState<{ amount: number }[]>([])
  const [receivables, setReceivables] = useState<{ amount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Sale | null>(null)

  const userMeta = { role: role ?? 'branch', branch: null }

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
    const [s, e, r] = await Promise.all([
      supabase.from('sales').select('*, branches(id,slug,name)').gte('date', start).lte('date', end).eq('branch_id', 6).order('date', { ascending: false }),
      supabase.from('expenses').select('amount').gte('date', start).lte('date', end),
      supabase.from('receivables').select('amount').gte('date', start).lte('date', end),
    ])
    setSales(s.data ?? [])
    setExpenses(e.data ?? [])
    setReceivables(r.data ?? [])
    setLoading(false)
  }, [getDateRange])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase.channel('sales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const grossSales = sales.reduce((s, r) => s + Number(r.amount), 0)
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0)
  const netSales = grossSales - totalExpenses
  const totalReceivables = receivables.reduce((s, r) => s + Number(r.amount), 0)
  const grandTotal = grossSales + totalReceivables

  async function deleteSale(id: string) {
    if (!confirm('Delete this sale record?')) return
    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Sale deleted'); fetchData() }
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const isAdmin = userMeta.role === 'admin'

  return (
    <div>
      <PageHeader
        title="Commissary Sale"
        description="Sales recorded at the commissary"
        action={isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
            <Plus className="w-4 h-4 mr-1" /> Add Sale
          </Button>
        )}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {(['monthly', 'quarterly', 'yearly'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${period === p ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Gross Sales" value={formatCurrency(grossSales)} variant="green" />
        <KpiCard label="Expenses" value={formatCurrency(totalExpenses)} variant="red" />
        <KpiCard label="Net Sales" value={formatCurrency(netSales)} variant={netSales >= 0 ? 'green' : 'red'} />
        <KpiCard label="Receivables" value={formatCurrency(totalReceivables)} />
        <KpiCard label="Grand Total" value={formatCurrency(grandTotal)} accent />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
              {isAdmin && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
            ) : sales.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No sales records for this period.</TableCell></TableRow>
            ) : sales.map(sale => (
              <TableRow key={sale.id}>
                <TableCell className="text-sm">{formatDate(sale.date)}</TableCell>
                <TableCell><Badge variant="secondary">{(sale as Sale & { branches?: { name: string } }).branches?.name ?? `Branch ${sale.branch_id}`}</Badge></TableCell>
                <TableCell className="text-right font-semibold text-green-700">{formatCurrency(Number(sale.amount))}</TableCell>
                <TableCell className="text-sm text-slate-500">{sale.notes ?? '—'}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(sale)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteSale(sale.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(showAdd || editing) && (
        <AddSaleModal
          defaultBranchId={6}
          initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchData() }}
        />
      )}
    </div>
  )
}
