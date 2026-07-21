import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { KpiCard } from '@/components/kpi-card'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Branch, Sale, BranchOrder } from '@/types'
import { AddSaleModal } from '@/components/modals/AddSaleModal'
import { AddOrderModal } from '@/components/modals/AddOrderModal'
import { toast } from 'sonner'

export function BranchPage() {
  const { slug } = useParams<{ slug: string }>()
  const { role } = useAuth()
  const now = getCurrentMonthYear()
  const [branch, setBranch] = useState<Branch | null>(null)
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [sales, setSales] = useState<Sale[]>([])
  const [orders, setOrders] = useState<BranchOrder[]>([])
  const [showAddSale, setShowAddSale] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [editSale, setEditSale] = useState<Sale | null>(null)

  const isReadOnly = role !== 'branch' && role !== 'admin'
  const isAdmin = role === 'admin'

  useEffect(() => {
    if (!slug) return
    supabase.from('branches').select('*').eq('slug', slug).single().then(({ data }) => {
      setBranch(data as Branch ?? null)
    })
  }, [slug])

  async function approveOrder(orderId: string, action: 'approve' | 'reject') {
    const res = await fetch(`/api/orders/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast.error(result.error ?? 'Failed to process order')
    } else {
      toast.success(action === 'approve' ? 'Order approved' : 'Order rejected')
      fetchData()
    }
  }

  const fetchData = useCallback(async () => {
    if (!branch) return
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const [s, o] = await Promise.all([
      supabase.from('sales').select('*, branches(id,slug,name)').eq('branch_id', branch.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('branch_orders')
        .select('*, from_branch:from_branch_id(id,slug,name), to_branch:to_branch_id(id,slug,name)')
        .or(`from_branch_id.eq.${branch.id},to_branch_id.eq.${branch.id}`)
        .gte('date', start).lte('date', end)
        .order('date', { ascending: false }),
    ])

    setSales(s.data ?? [])
    setOrders(o.data ?? [])
  }, [branch, month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const grossSales = sales.reduce((s, r) => s + Number(r.amount), 0)
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  async function deleteSale(id: string) {
    if (!confirm('Delete?')) return
    await supabase.from('sales').delete().eq('id', id)
    toast.success('Deleted')
    fetchData()
  }

  if (!branch) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        Loading branch...
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={branch.name}
        description="Branch performance and records"
      />

      <div className="flex gap-2 mb-4">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? 0))}>
          <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? 0))}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <KpiCard label="Gross Sales" value={formatCurrency(grossSales)} variant="green" />
        <KpiCard label="Orders" value={String(orders.length)} variant="green" />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="mb-4">
          <TabsTrigger value="sales">Sales ({sales.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          {!isReadOnly && (
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setShowAddSale(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
                <Plus className="w-4 h-4 mr-1" /> Add Sale
              </Button>
            </div>
          )}
          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  {!isReadOnly && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No sales this period.</TableCell></TableRow>
                ) : sales.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{formatDate(s.date)}</TableCell>
                    <TableCell className="text-right font-semibold text-green-700">{formatCurrency(Number(s.amount))}</TableCell>
                    <TableCell className="text-sm text-slate-500">{s.notes ?? '—'}</TableCell>
                    {!isReadOnly && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditSale(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteSale(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          {(role === 'branch' || role === 'admin') && (
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setShowAddOrder(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
                <Plus className="w-4 h-4 mr-1" /> Order from Commissary
              </Button>
            </div>
          )}
          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-24">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-slate-500">No orders this period.</TableCell></TableRow>
                ) : orders.map(o => {
                  const typedO = o as BranchOrder & { from_branch?: { name: string }; to_branch?: { name: string } }
                  const statusConfig = {
                    pending:  { label: 'Pending',  icon: Clock,       cls: 'bg-amber-100 text-amber-700' },
                    approved: { label: 'Approved', icon: CheckCircle, cls: 'bg-green-100 text-green-700' },
                    rejected: { label: 'Rejected', icon: XCircle,     cls: 'bg-red-100 text-red-700' },
                  }
                  const st = statusConfig[o.status as keyof typeof statusConfig ?? 'pending'] ?? statusConfig.pending
                  const Icon = st.icon
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">{formatDate(o.date)}</TableCell>
                      <TableCell className="font-medium">{o.item}</TableCell>
                      <TableCell className="text-sm">{o.quantity ?? '—'}</TableCell>
                      <TableCell><Badge variant="secondary">{typedO.from_branch?.name ?? '—'}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{typedO.to_branch?.name ?? '—'}</Badge></TableCell>
                      <TableCell className="text-right">{o.amount ? formatCurrency(Number(o.amount)) : '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                          <Icon className="w-3 h-3" />{st.label}
                        </span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {o.status === 'pending' ? (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" title="Approve" onClick={() => approveOrder(o.id, 'approve')}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" title="Reject" onClick={() => approveOrder(o.id, 'reject')}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {(showAddSale || editSale) && (
        <AddSaleModal
          defaultBranchId={branch.id}
          initial={editSale}
          onClose={() => { setShowAddSale(false); setEditSale(null) }}
          onSaved={() => { setShowAddSale(false); setEditSale(null); fetchData() }}
        />
      )}
      {showAddOrder && (
        <AddOrderModal
          toBranchId={branch.id}
          toBranchName={branch.name}
          onClose={() => setShowAddOrder(false)}
          onSaved={() => { setShowAddOrder(false); fetchData() }}
        />
      )}
    </div>
  )
}
