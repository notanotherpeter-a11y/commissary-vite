import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_BASE } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { KpiCard } from '@/components/kpi-card'
import { formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Clock, AlertTriangle, ShoppingBag } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { BranchOrder, Branch } from '@/types'
import { toast } from 'sonner'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
type TabView = 'orders' | 'costs'

export function BranchOrdersPage() {
  const now = getCurrentMonthYear()
  const [tab, setTab] = useState<TabView>('orders')
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [branches, setBranches] = useState<Branch[]>([])
  const [orders, setOrders] = useState<(BranchOrder & { from_branch?: { name: string }; to_branch?: { name: string } })[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [costBranchFilter, setCostBranchFilter] = useState<string>('all')
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const fetchOrders = useCallback(async () => {
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    let query = supabase
      .from('branch_orders')
      .select('*, from_branch:from_branch_id(id,slug,name), to_branch:to_branch_id(id,slug,name)')
      .gte('date', start)
      .lte('date', end)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (branchFilter !== 'all') query = query.eq('to_branch_id', branchFilter)

    const { data } = await query
    setOrders(data ?? [])
  }, [month, year, statusFilter, branchFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  useEffect(() => {
    const ch = supabase.channel('branch-orders-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_orders' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchOrders])

  async function handleAction(order: BranchOrder, action: 'approve' | 'reject') {
    setProcessing(order.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/api/orders/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orderId: order.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? `Failed to ${action} order`)
      } else {
        toast.success(json.message)
        fetchOrders()
        fetchAllPeriodOrders()
      }
    } catch {
      toast.error('Network error — please try again')
    }
    setProcessing(null)
  }

  const pending = orders.filter(o => o.status === 'pending').length
  const approved = orders.filter(o => o.status === 'approved').length
  const rejected = orders.filter(o => o.status === 'rejected').length

  const statusConfig = {
    pending:  { label: 'Pending',  icon: Clock,       cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Approved', icon: CheckCircle, cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', icon: XCircle,     cls: 'bg-red-100 text-red-700' },
  }

  const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
  ]

  const [allPeriodOrders, setAllPeriodOrders] = useState<(BranchOrder & { to_branch?: { id: number; name: string } })[]>([])

  const fetchAllPeriodOrders = useCallback(async () => {
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    const { data } = await supabase
      .from('branch_orders')
      .select('*, to_branch:to_branch_id(id,slug,name)')
      .gte('date', start)
      .lte('date', end)
      .eq('status', 'approved')
      .order('date', { ascending: false })
    setAllPeriodOrders(data ?? [])
  }, [month, year])

  useEffect(() => { fetchAllPeriodOrders() }, [fetchAllPeriodOrders])

  const branchCostMap: Record<string, { branch: { id: number; name: string }; total: number; count: number; orders: typeof allPeriodOrders }> = {}
  for (const o of allPeriodOrders) {
    if (!o.to_branch) continue
    const key = String(o.to_branch.id)
    if (!branchCostMap[key]) branchCostMap[key] = { branch: o.to_branch, total: 0, count: 0, orders: [] }
    branchCostMap[key].total += Number(o.amount ?? 0)
    branchCostMap[key].count += 1
    branchCostMap[key].orders.push(o)
  }

  const branchCosts = Object.values(branchCostMap).sort((a, b) => b.total - a.total)
  const filteredCosts = costBranchFilter === 'all'
    ? branchCosts
    : branchCosts.filter(bc => String(bc.branch.id) === costBranchFilter)

  const grandTotal = branchCosts.reduce((s, bc) => s + bc.total, 0)

  return (
    <div>
      <PageHeader
        title="Branch Orders"
        description="Review and approve commissary orders from branches"
      />

      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {([
          { label: 'Orders', value: 'orders' as TabView },
          { label: 'Branch Costs', value: 'costs' as TabView },
        ]).map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
            {t.value === 'orders' && pending > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px]">
                {pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={v => setBranchFilter(v ?? 'all')}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.filter(b => b.id !== 6).map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <KpiCard label="Pending" value={String(pending)} variant={pending > 0 ? 'red' : 'green'} />
            <KpiCard label="Approved" value={String(approved)} variant="green" />
            <KpiCard label="Rejected" value={String(rejected)} variant="red" />
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  statusFilter === f.value
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-amber-400'
                )}
              >
                {f.label}
                {f.value === 'pending' && pending > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px]">
                    {pending}
                  </span>
                )}
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
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                      No orders found for this period.
                    </TableCell>
                  </TableRow>
                ) : orders.map(o => {
                  const st = statusConfig[o.status as keyof typeof statusConfig ?? 'pending'] ?? statusConfig.pending
                  const Icon = st.icon
                  const isProcessing = processing === o.id
                  return (
                    <TableRow key={o.id} className={o.status === 'pending' ? 'bg-amber-50/40' : ''}>
                      <TableCell className="text-sm">{formatDate(o.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{o.to_branch?.name ?? '—'}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{o.item}</TableCell>
                      <TableCell className="text-sm">{o.quantity ?? '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {o.unit_price ? `₱${Number(o.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {o.amount ? `₱${Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[140px] truncate">{o.notes ?? '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                          <Icon className="w-3 h-3" />{st.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {o.status === 'pending' ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Approve & deduct inventory"
                              disabled={isProcessing}
                              onClick={() => handleAction(o, 'approve')}
                            >
                              {isProcessing ? (
                                <span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Reject"
                              disabled={isProcessing}
                              onClick={() => handleAction(o, 'reject')}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {pending > 0 && (
            <div className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Approving an order will automatically deduct the quantity from commissary inventory.
            </div>
          )}
        </>
      )}

      {tab === 'costs' && (
        <>
          <div className="flex gap-2 mb-5 flex-wrap">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={costBranchFilter} onValueChange={v => setCostBranchFilter(v ?? 'all')}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.filter(b => b.id !== 6).map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <KpiCard
              label={`Total Cost — ${MONTHS[month - 1]} ${year}`}
              value={`₱${grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
              accent
            />
            <KpiCard
              label="Branches with Orders"
              value={String(branchCosts.length)}
              variant="green"
            />
          </div>

          {filteredCosts.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No approved orders found for this period.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCosts.map(bc => (
                <div key={bc.branch.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800">{bc.branch.name}</p>
                        <p className="text-xs text-slate-500">{bc.count} approved order{bc.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Total Cost</p>
                      <p className="text-lg font-bold text-amber-600">
                        {'₱'}{bc.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="divide-y">
                    {bc.orders.map(o => (
                      <div key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-20 shrink-0">{formatDate(o.date)}</span>
                          <span className="font-medium text-slate-700">{o.item}</span>
                          <span className="text-xs text-slate-500">x {o.quantity}</span>
                          {o.unit_price && (
                            <span className="text-xs text-slate-400">@ {'₱'}{Number(o.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          )}
                        </div>
                        <span className="font-semibold text-slate-800 shrink-0">
                          {o.amount ? `₱${Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end px-4 py-2 bg-amber-50 border-t">
                    <p className="text-sm font-bold text-amber-700">
                      Subtotal: {'₱'}{bc.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
