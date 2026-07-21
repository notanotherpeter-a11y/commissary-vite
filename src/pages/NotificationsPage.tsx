import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Bell, ShoppingBag, AlertTriangle, CheckCircle,
  XCircle, Clock, Package, ArrowRight
} from 'lucide-react'
import type { BranchOrder, InventoryItem } from '@/types'

interface NotifItem {
  id: string
  type: 'pending_order' | 'low_stock' | 'order_approved' | 'order_rejected' | 'order_pending'
  title: string
  description: string
  date: string
  href?: string
}

export function NotificationsPage() {
  const { role, branch: userBranchSlug } = useAuth()
  const isAdmin = role === 'admin'
  const [notifs, setNotifs] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [branchId, setBranchId] = useState<number | null>(null)

  useEffect(() => {
    if (role === 'branch' && userBranchSlug) {
      supabase
        .from('branches')
        .select('id')
        .eq('slug', userBranchSlug)
        .single()
        .then(({ data }) => {
          setBranchId(data?.id ?? null)
        })
    }
  }, [role, userBranchSlug])

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    const items: NotifItem[] = []

    if (isAdmin) {
      const { data: pendingOrders } = await supabase
        .from('branch_orders')
        .select('*, to_branch:to_branch_id(id,slug,name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      for (const o of (pendingOrders ?? []) as (BranchOrder & { to_branch?: { name: string; slug: string } })[]) {
        items.push({
          id: `pending-${o.id}`,
          type: 'pending_order',
          title: `New order from ${o.to_branch?.name ?? 'Branch'}`,
          description: `${o.quantity ?? 1}x ${o.item}${o.notes ? ` — "${o.notes}"` : ''}`,
          date: o.created_at,
          href: '/branch-orders',
        })
      }

      const { data: allItems } = await supabase
        .from('inventory')
        .select('*')
        .order('name')

      for (const item of (allItems ?? []) as InventoryItem[]) {
        if (Number(item.quantity) < Number(item.min_quantity)) {
          items.push({
            id: `lowstock-${item.id}`,
            type: 'low_stock',
            title: `Low stock: ${item.name}`,
            description: `Only ${item.quantity} ${item.unit} left (min: ${item.min_quantity})`,
            date: item.updated_at,
            href: '/inventory',
          })
        }
      }

      const since = new Date()
      since.setDate(since.getDate() - 14)
      const { data: recentOrders } = await supabase
        .from('branch_orders')
        .select('*, to_branch:to_branch_id(id,slug,name)')
        .in('status', ['approved', 'rejected'])
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(20)

      for (const o of (recentOrders ?? []) as (BranchOrder & { to_branch?: { name: string } })[]) {
        items.push({
          id: `recent-${o.id}`,
          type: o.status === 'approved' ? 'order_approved' : 'order_rejected',
          title: `Order ${o.status}: ${o.item}`,
          description: `${o.to_branch?.name ?? 'Branch'} — ${o.quantity ?? 1} unit(s)`,
          date: o.created_at,
          href: '/branch-orders',
        })
      }
    } else {
      if (branchId) {
        const since = new Date()
        since.setDate(since.getDate() - 30)
        const { data: myOrders } = await supabase
          .from('branch_orders')
          .select('*')
          .eq('to_branch_id', branchId)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })

        for (const o of (myOrders ?? []) as BranchOrder[]) {
          items.push({
            id: `myorder-${o.id}`,
            type: o.status === 'approved'
              ? 'order_approved'
              : o.status === 'rejected'
                ? 'order_rejected'
                : 'order_pending',
            title: o.status === 'approved'
              ? `Order approved: ${o.item}`
              : o.status === 'rejected'
                ? `Order rejected: ${o.item}`
                : `Order pending: ${o.item}`,
            description: `${o.quantity ?? 1} unit(s)${o.notes ? ` — "${o.notes}"` : ''}`,
            date: o.created_at,
          })
        }
      }
    }

    items.sort((a, b) => {
      const priority = (t: string) =>
        t === 'pending_order' ? 0 : t === 'low_stock' ? 1 : 2
      if (priority(a.type) !== priority(b.type)) return priority(a.type) - priority(b.type)
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    setNotifs(items)
    setLoading(false)
  }, [isAdmin, branchId])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  useEffect(() => {
    const ch = supabase.channel('notifs-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_orders' }, fetchNotifs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchNotifs)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchNotifs])

  const pendingCount = notifs.filter(n => n.type === 'pending_order').length
  const lowStockCount = notifs.filter(n => n.type === 'low_stock').length

  const iconMap = {
    pending_order:  { icon: ShoppingBag,   cls: 'bg-amber-100 text-amber-600' },
    low_stock:      { icon: AlertTriangle,  cls: 'bg-red-100 text-red-600' },
    order_approved: { icon: CheckCircle,    cls: 'bg-green-100 text-green-600' },
    order_rejected: { icon: XCircle,        cls: 'bg-red-100 text-red-500' },
    order_pending:  { icon: Clock,          cls: 'bg-amber-100 text-amber-600' },
  }

  const labelMap = {
    pending_order:  { label: 'Action Required', cls: 'bg-amber-100 text-amber-700' },
    low_stock:      { label: 'Low Stock',        cls: 'bg-red-100 text-red-700' },
    order_approved: { label: 'Approved',          cls: 'bg-green-100 text-green-700' },
    order_rejected: { label: 'Rejected',          cls: 'bg-red-100 text-red-700' },
    order_pending:  { label: 'Pending',           cls: 'bg-amber-100 text-amber-700' },
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={isAdmin ? 'Pending orders, low stock alerts, and recent activity' : 'Your order status updates'}
      />

      {!loading && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            <Bell className="w-3 h-3" /> {notifs.length} total
          </span>
          {pendingCount > 0 && (
            <Link to="/branch-orders">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 cursor-pointer hover:bg-amber-200 transition-colors">
                <ShoppingBag className="w-3 h-3" /> {pendingCount} order{pendingCount > 1 ? 's' : ''} need approval
              </span>
            </Link>
          )}
          {lowStockCount > 0 && (
            <Link to="/inventory">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 cursor-pointer hover:bg-red-200 transition-colors">
                <Package className="w-3 h-3" /> {lowStockCount} item{lowStockCount > 1 ? 's' : ''} low stock
              </span>
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <p className="font-medium text-slate-700">All clear!</p>
          <p className="text-sm text-slate-500 mt-1">No pending actions or alerts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const { icon: Icon, cls } = iconMap[n.type]
            const { label, cls: labelCls } = labelMap[n.type]
            const content = (
              <div className={`flex items-start gap-3 p-4 rounded-lg border bg-white hover:bg-slate-50 transition-colors ${n.type === 'pending_order' ? 'border-amber-200' : n.type === 'low_stock' ? 'border-red-200' : 'border-slate-200'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${cls}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 leading-tight">{n.title}</p>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${labelCls}`}>{label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{n.description}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatDate(n.date.split('T')[0])}{' '}
                    {new Date(n.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {n.href && <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />}
              </div>
            )
            return n.href ? (
              <Link key={n.id} to={n.href}>{content}</Link>
            ) : (
              <div key={n.id}>{content}</div>
            )
          })}
        </div>
      )}

      {!loading && notifs.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={fetchNotifs} className="text-xs text-slate-500">
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}
