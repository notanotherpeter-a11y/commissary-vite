import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface InventoryItem {
  id: number
  name: string
  category: string
  unit: string
  quantity: number
  price: number
}

interface BranchOrder {
  item: string
  amount: number
  to_branch: { name: string } | null
}

export function NetCostPage() {
  const now = getCurrentMonthYear()
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [orders, setOrders] = useState<BranchOrder[]>([])
  const [loading, setLoading] = useState(true)
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const [inv, ord] = await Promise.all([
      supabase.from('inventory').select('id, name, category, unit, quantity, price').order('name'),
      supabase
        .from('branch_orders')
        .select('item, amount, to_branch:to_branch_id(name)')
        .eq('status', 'approved')
        .gte('date', start)
        .lte('date', end),
    ])

    setInventory(inv.data ?? [])
    setOrders((ord.data ?? []) as unknown as BranchOrder[])
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  // Totals
  const totalInventoryCost = inventory.reduce((s, i) => s + Number(i.price ?? 0) * Number(i.quantity ?? 0), 0)
  const totalOrdersCost = orders.reduce((s, o) => s + Number(o.amount ?? 0), 0)
  const netCost = totalInventoryCost - totalOrdersCost

  // Per-item breakdown: match approved orders back to inventory items
  const ordersByItem: Record<string, number> = {}
  for (const o of orders) {
    ordersByItem[o.item] = (ordersByItem[o.item] ?? 0) + Number(o.amount ?? 0)
  }

  const rows = inventory.map(item => {
    const inventoryValue = Number(item.price ?? 0) * Number(item.quantity ?? 0)
    const ordersValue = ordersByItem[item.name] ?? 0
    const net = inventoryValue - ordersValue
    return { ...item, inventoryValue, ordersValue, net }
  }).sort((a, b) => b.inventoryValue - a.inventoryValue)

  return (
    <div>
      <PageHeader
        title="Net Cost"
        description="Inventory value minus approved branch orders for the selected period"
      />

      <div className="flex gap-2 mb-6">
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-36 h-8 text-sm"><span>{MONTHS[month - 1]}</span></SelectTrigger>
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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 mb-1">Total Inventory Value</p>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(totalInventoryCost)}</p>
          <p className="text-xs text-slate-400 mt-1">Current stock × unit price</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-slate-500 mb-1">Branch Orders ({MONTHS[month - 1]} {year})</p>
          <p className="text-xl font-bold text-red-600">− {formatCurrency(totalOrdersCost)}</p>
          <p className="text-xs text-slate-400 mt-1">{orders.length} approved order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={`rounded-lg border p-4 ${netCost >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-slate-500 mb-1">Net Cost</p>
          <p className={`text-xl font-bold ${netCost >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{formatCurrency(netCost)}</p>
          <p className="text-xs text-slate-400 mt-1">Inventory value − orders</p>
        </div>
      </div>

      {/* Per-item table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Inventory Value</TableHead>
              <TableHead className="text-right">Orders ({MONTHS[month - 1]})</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
            ) : rows.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                <TableCell className="text-right text-sm">{item.quantity} {item.unit}</TableCell>
                <TableCell className="text-right text-sm text-slate-600">
                  {item.price ? formatCurrency(Number(item.price)) : '—'}
                </TableCell>
                <TableCell className="text-right font-medium text-slate-800">
                  {item.inventoryValue > 0 ? formatCurrency(item.inventoryValue) : '—'}
                </TableCell>
                <TableCell className="text-right text-red-600">
                  {item.ordersValue > 0 ? `− ${formatCurrency(item.ordersValue)}` : '—'}
                </TableCell>
                <TableCell className={`text-right font-semibold ${item.net < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {item.inventoryValue > 0 || item.ordersValue > 0 ? formatCurrency(item.net) : '—'}
                </TableCell>
              </TableRow>
            ))}
            {/* Grand total row */}
            <TableRow className="bg-amber-50 border-t-2 border-amber-200 font-bold">
              <TableCell colSpan={4} className="text-slate-800">Grand Total</TableCell>
              <TableCell className="text-right text-slate-800">{formatCurrency(totalInventoryCost)}</TableCell>
              <TableCell className="text-right text-red-600">− {formatCurrency(totalOrdersCost)}</TableCell>
              <TableCell className={`text-right text-base ${netCost < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {formatCurrency(netCost)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
