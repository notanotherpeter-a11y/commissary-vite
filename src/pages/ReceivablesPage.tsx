import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { KpiCard } from '@/components/kpi-card'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Branch, Receivable, BranchOrder } from '@/types'
import { AddReceivableModal } from '@/components/modals/AddReceivableModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

const statusConfig = {
  pending:  { label: 'Pending',  icon: Clock,       cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', icon: CheckCircle, cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', icon: XCircle,     cls: 'bg-red-100 text-red-700' },
}

export function ReceivablesPage() {
  const { role } = useAuth()
  const userMeta = { role: role ?? 'branch', branch: null }
  const now = getCurrentMonthYear()
  const [branches, setBranches] = useState<Branch[]>([])
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [loadingRec, setLoadingRec] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Receivable | null>(null)
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [orders, setOrders] = useState<(BranchOrder & { from_branch?: { name: string }; to_branch?: { name: string } })[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const isAdmin = userMeta.role === 'admin'
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]))
  }, [])

  const fetchReceivables = useCallback(async () => {
    setLoadingRec(true)
    const { data } = await supabase.from('receivables').select('*, branches(id,slug,name)').order('date', { ascending: false })
    setReceivables(data ?? [])
    setLoadingRec(false)
  }, [])

  useEffect(() => { fetchReceivables() }, [fetchReceivables])

  useEffect(() => {
    const ch = supabase.channel('receivables-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'receivables' }, fetchReceivables).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchReceivables])

  const fetchOrders = useCallback(async () => {
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    let query = supabase.from('branch_orders').select('*, from_branch:from_branch_id(id,slug,name), to_branch:to_branch_id(id,slug,name)').gte('date', start).lte('date', end).order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (branchFilter !== 'all') query = query.eq('to_branch_id', branchFilter)
    const { data } = await query
    setOrders(data ?? [])
  }, [month, year, statusFilter, branchFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  useEffect(() => {
    const ch = supabase.channel('branch-orders-rec').on('postgres_changes', { event: '*', schema: 'public', table: 'branch_orders' }, fetchOrders).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchOrders])

  async function deleteReceivable(id: string) {
    if (!confirm('Delete this receivable?')) return
    const { error } = await supabase.from('receivables').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Deleted'); fetchReceivables() }
  }

  const total = receivables.reduce((s, r) => s + Number(r.amount), 0)
  const avg = receivables.length > 0 ? total / receivables.length : 0
  const highest = receivables.length > 0 ? Math.max(...receivables.map(r => Number(r.amount))) : 0
  const pending = orders.filter(o => o.status === 'pending').length
  const approved = orders.filter(o => o.status === 'approved').length
  const rejected = orders.filter(o => o.status === 'rejected').length

  return (
    <div>
      <PageHeader
        title="Receivables"
        description="Branch receivables and order confirmations"
        action={isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
            <Plus className="w-4 h-4 mr-1" /> Add Receivable
          </Button>
        )}
      />

      <Tabs defaultValue="receivables">
        <TabsList className="mb-4">
          <TabsTrigger value="receivables">Receivables ({receivables.length})</TabsTrigger>
          <TabsTrigger value="orders" className="relative">
            Branch Orders ({orders.length})
            {pending > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px]">{pending}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receivables">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Total" value={formatCurrency(total)} variant="green" />
            <KpiCard label="Average" value={formatCurrency(avg)} />
            <KpiCard label="Highest" value={formatCurrency(highest)} variant="amber" />
            <KpiCard label="Count" value={String(receivables.length)} />
          </div>
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg inline-block">
            <span className="text-xs text-amber-700 font-medium uppercase tracking-wide">Grand Total</span>
            <p className="text-2xl font-bold text-amber-800">{formatCurrency(total)}</p>
          </div>
          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isAdmin && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRec ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
                ) : receivables.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No receivables.</TableCell></TableRow>
                ) : receivables.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                    <TableCell className="font-medium">{r.description}</TableCell>
                    <TableCell>
                      {(r as Receivable & { branches?: { name: string } }).branches?.name
                        ? <Badge variant="secondary">{(r as Receivable & { branches?: { name: string } }).branches?.name}</Badge>
                        : <span className="text-slate-400 text-xs">---</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-700">{formatCurrency(Number(r.amount))}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteReceivable(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="flex gap-2 mb-4 flex-wrap">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={v => setBranchFilter(v ?? 'all')}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.filter(b => b.id !== 6).map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <KpiCard label="Pending" value={String(pending)} variant={pending > 0 ? 'red' : 'green'} />
            <KpiCard label="Approved" value={String(approved)} variant="green" />
            <KpiCard label="Rejected" value={String(rejected)} variant="red" />
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors', statusFilter === f.value ? 'bg-amber-500 text-black border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-400')}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Date</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-500">No orders found for this period.</TableCell></TableRow>
                ) : orders.map(o => {
                  const st = statusConfig[o.status ?? 'pending']
                  const Icon = st.icon
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">{formatDate(o.date)}</TableCell>
                      <TableCell><Badge variant="outline">{o.to_branch?.name ?? '---'}</Badge></TableCell>
                      <TableCell className="font-medium">{o.item}</TableCell>
                      <TableCell className="text-sm">{o.quantity ?? '---'}</TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[160px] truncate">{o.notes ?? '---'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                          <Icon className="w-3 h-3" />{st.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {(showAdd || editing) && (
        <AddReceivableModal
          branches={branches}
          initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchReceivables() }}
        />
      )}
    </div>
  )
}
