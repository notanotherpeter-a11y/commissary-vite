import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Search, LayoutGrid, List, AlertTriangle, History, ShoppingCart, ClipboardList } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Branch, InventoryItem } from '@/types'
import { AddInventoryModal } from '@/components/modals/AddInventoryModal'
import { InventoryHistoryModal } from '@/components/modals/InventoryHistoryModal'
import { OrderItemModal } from '@/components/modals/OrderItemModal'
import { ItemListModal } from '@/components/modals/ItemListModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type TabView = 'stock' | 'cost' | 'branch_items'

interface CostEntry {
  id: string
  item_name: string
  category: string | null
  unit: string | null
  quantity: number
  stock_price: number
  price: number
  notes: string | null
  date: string | null
  created_at: string
}

export function InventoryPage() {
  const { role, branch: userBranchSlug } = useAuth()
  const userMeta = { role: role ?? 'branch', branch: userBranchSlug }
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [costEntries, setCostEntries] = useState<CostEntry[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'table' | 'card'>('table')
  const [loading, setLoading] = useState(true)
  const [costLoading, setCostLoading] = useState(true)
  const [tab, setTab] = useState<TabView>('stock')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<(InventoryItem & { branches?: { name: string } }) | null>(null)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [orderingItem, setOrderingItem] = useState<InventoryItem | null>(null)
  const [showItemList, setShowItemList] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  const isAdmin = userMeta.role === 'admin'
  const isBranch = userMeta.role === 'branch'
  const userBranch = isBranch ? branches.find(b => b.slug === userMeta.branch) ?? null : null

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  const fetchCostEntries = useCallback(async () => {
    setCostLoading(true)
    const { data } = await supabase.from('inventory_cost_entries').select('*').order('date', { ascending: false })
    setCostEntries((data ?? []) as CostEntry[])
    setCostLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])
  useEffect(() => { fetchCostEntries() }, [fetchCostEntries])

  useEffect(() => {
    const ch = supabase.channel('inventory-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchItems).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchItems])

  async function deleteItem(item: InventoryItem) {
    // Cancel any previous pending delete
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)

    setPendingDeleteId(item.id)

    toast(`"${item.name}" deleted`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
          deleteTimerRef.current = null
          setPendingDeleteId(null)
        },
      },
    })

    deleteTimerRef.current = setTimeout(async () => {
      await supabase.from('inventory_logs').insert({ inventory_id: item.id, item_name: item.name, action: 'deleted', old_quantity: Number(item.quantity), changed_by: 'admin', snapshot: { ...item } })
      const { error } = await supabase.from('inventory').delete().eq('id', item.id)
      if (error) { toast.error('Failed to delete'); setPendingDeleteId(null) }
      else { setPendingDeleteId(null); fetchItems() }
      deleteTimerRef.current = null
    }, 5000)
  }


  const allFiltered = items.filter(i => i.id !== pendingDeleteId && (i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())))
  // Branches only see items that have a unit price set
  const filtered = isBranch ? allFiltered.filter(i => Number(i.price) > 0) : allFiltered
  const lowStock = filtered.filter(i => isAdmin && Number(i.quantity) < Number(i.min_quantity))

  // Cost tab computed values — from permanent cost entries ledger
  const itemsWithPrice = costEntries.filter(i => Number(i.price) > 0)
  const totalStockValue = costEntries.reduce((sum, i) => sum + Number(i.price ?? 0) * Number(i.quantity ?? 0), 0)
  const totalStockCost = costEntries.reduce((sum, i) => sum + Number(i.stock_price ?? 0) * Number(i.quantity ?? 0), 0)
  const totalProfit = totalStockValue - totalStockCost
  const dailyCost = totalStockCost / 30
  const costSorted = [...costEntries].sort((a, b) => (Number(b.price ?? 0) * Number(b.quantity ?? 0)) - (Number(a.price ?? 0) * Number(a.quantity ?? 0)))

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={isAdmin ? 'Commissary stock — all branches can view and order' : 'Commissary stock — tap Order to request items'}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAllHistory(true)}>
              <History className="w-4 h-4 mr-1" /> History
            </Button>
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowItemList(true)}>
                  <ClipboardList className="w-4 h-4 mr-1" /> Item List
                </Button>
                <Button size="sm" onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {([
          { label: 'Stock List', value: 'stock' as TabView },
          { label: 'Items Cost', value: 'cost' as TabView },
          ...(isAdmin ? [{ label: 'Branch Item List', value: 'branch_items' as TabView }] : []),
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
          </button>
        ))}
      </div>

      {tab === 'stock' && (
      <>
      {isAdmin && lowStock.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">{lowStock.length} item{lowStock.length > 1 ? 's' : ''} below minimum stock level</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <div className="flex border rounded-md overflow-hidden">
          <button onClick={() => setView('table')} className={cn('px-2.5 py-1.5', view === 'table' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}><List className="w-4 h-4" /></button>
          <button onClick={() => setView('card')} className={cn('px-2.5 py-1.5', view === 'card' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}><LayoutGrid className="w-4 h-4" /></button>
        </div>
      </div>

      {view === 'table' ? (
        <div className="bg-white rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                {isAdmin && <TableHead className="text-right">Stock Price</TableHead>}
                <TableHead className="text-right">Unit Price</TableHead>
                {isAdmin && <TableHead className="text-right">Profit</TableHead>}
                <TableHead>Notes</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={isAdmin ? 10 : 7} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 10 : 8} className="text-center py-8 text-slate-500">No items found.</TableCell></TableRow>
              ) : filtered.map(item => {
                const isLow = isAdmin && Number(item.quantity) < Number(item.min_quantity)
                const unitPrice = Number(item.price ?? 0)
                const stockPrice = Number(item.stock_price ?? 0)
                const profit = unitPrice - stockPrice
                return (
                  <TableRow key={item.id} className={isLow ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {item.name}
                      {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" />}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{item.unit}</TableCell>
                    <TableCell className={cn('text-right font-semibold', isLow ? 'text-red-600' : 'text-slate-900')}>{item.quantity}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right text-slate-500">
                        {stockPrice > 0 ? `₱${stockPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '---'}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-medium text-slate-700">
                      {unitPrice > 0 ? `₱${unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '---'}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className={cn('text-right font-semibold', profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-500' : 'text-slate-400')}>
                        {unitPrice > 0 && stockPrice > 0 ? `₱${profit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '---'}
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-slate-500 max-w-[120px] truncate">{item.notes ?? '---'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.updated_at ? formatDate(item.updated_at.split('T')[0]) : '---'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {isBranch && userBranch && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Order this item" onClick={() => setOrderingItem(item)}><ShoppingCart className="w-3.5 h-3.5" /></Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" title="View history" onClick={() => setHistoryItem(item as InventoryItem & { branches?: { name: string } })}><History className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => {
            const isLow = isAdmin && Number(item.quantity) < Number(item.min_quantity)
            return (
              <div key={item.id} className={cn('bg-white rounded-lg border p-4', isLow && 'border-red-300 bg-red-50')}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.category} · {item.unit}</p>
                  </div>
                  {isLow && <AlertTriangle className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex justify-between items-center">
                  <span className={cn('text-2xl font-bold', isLow ? 'text-red-600' : 'text-slate-900')}>{item.quantity}</span>
                  {isAdmin && <span className="text-xs text-slate-500">Min: {item.min_quantity}</span>}
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  {isBranch && userBranch && (
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs h-7" onClick={() => setOrderingItem(item)}>
                      <ShoppingCart className="w-3 h-3 mr-1" /> Order
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => setHistoryItem(item as InventoryItem & { branches?: { name: string } })}><History className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(item)}><Pencil className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteItem(item)}><Trash2 className="w-3 h-3" /></Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </>
      )}

      {tab === 'cost' && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Total Stock Value</p>
              <p className="text-xl font-bold text-amber-600">₱{totalStockValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">selling price × qty</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Total Stock Cost</p>
              <p className="text-xl font-bold text-blue-600">₱{totalStockCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">purchase price × qty</p>
            </div>
            <div className={`bg-white rounded-lg border p-4`}>
              <p className="text-xs text-slate-500 mb-1">Total Profit</p>
              <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>₱{totalProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">value − cost</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Daily Cost</p>
              <p className="text-xl font-bold text-slate-700">₱{dailyCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">stock cost ÷ 30 days</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Total Entries</p>
              <p className="text-xl font-bold text-slate-800">{costEntries.length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Priced Items</p>
              <p className="text-xl font-bold text-slate-800">{itemsWithPrice.length}</p>
            </div>
          </div>

          {costLoading ? (
            <div className="bg-white rounded-lg border p-8 text-center text-slate-500">Loading…</div>
          ) : costSorted.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-slate-500">No cost entries yet. Add inventory items to populate this log.</div>
          ) : (() => {
            // Group entries by date
            const grouped: Record<string, CostEntry[]> = {}
            costSorted.forEach(entry => {
              const key = entry.date ?? 'No Date'
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(entry)
            })
            const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
            const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            return (
              <div className="space-y-4">
                {sortedDates.map(dateKey => {
                  const dayEntries = grouped[dateKey]
                  const dayCost = dayEntries.reduce((s, e) => s + Number(e.stock_price ?? 0) * Number(e.quantity ?? 0), 0)
                  const dayValue = dayEntries.reduce((s, e) => s + Number(e.price ?? 0) * Number(e.quantity ?? 0), 0)
                  const dayProfit = dayValue - dayCost
                  return (
                    <div key={dateKey} className="bg-white rounded-lg border overflow-hidden">
                      {/* Date header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
                        <span className="text-sm font-semibold text-slate-700">{dateKey !== 'No Date' ? formatDate(dateKey) : 'No Date'}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-blue-600 font-medium">Cost: {fmt(dayCost)}</span>
                          <span className="text-amber-600 font-medium">Value: {fmt(dayValue)}</span>
                          <span className={`font-semibold ${dayProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>Profit: {fmt(dayProfit)}</span>
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/50">
                            <TableHead>Item</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Stock Price</TableHead>
                            <TableHead className="text-right">Total Cost</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total Value</TableHead>
                            <TableHead className="text-right">Total Profit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dayEntries.map(entry => {
                            const unitPrice = Number(entry.price ?? 0)
                            const stockPrice = Number(entry.stock_price ?? 0)
                            const qty = Number(entry.quantity ?? 0)
                            const totalValue = unitPrice * qty
                            const totalCost = stockPrice * qty
                            const profit = totalValue - totalCost
                            return (
                              <TableRow key={entry.id}>
                                <TableCell className="font-medium">{entry.item_name}</TableCell>
                                <TableCell><Badge variant="secondary">{entry.category ?? '—'}</Badge></TableCell>
                                <TableCell className="text-sm text-slate-500">{entry.unit ?? '—'}</TableCell>
                                <TableCell className={`text-right font-semibold ${Number(entry.quantity) < 0 ? 'text-red-500' : 'text-slate-900'}`}>{entry.quantity}</TableCell>
                                <TableCell className="text-right text-blue-600">
                                  {stockPrice !== 0 ? fmt(stockPrice) : '—'}
                                </TableCell>
                                <TableCell className={`text-right font-semibold ${totalCost < 0 ? 'text-red-500' : 'text-blue-700'}`}>
                                  {totalCost !== 0 ? fmt(totalCost) : '—'}
                                </TableCell>
                                <TableCell className="text-right text-slate-700">
                                  {unitPrice !== 0 ? fmt(unitPrice) : '—'}
                                </TableCell>
                                <TableCell className={`text-right font-semibold ${totalValue < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                                  {totalValue !== 0 ? fmt(totalValue) : '—'}
                                </TableCell>
                                <TableCell className={`text-right font-semibold ${profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                  {(unitPrice !== 0 && stockPrice !== 0) ? fmt(profit) : '—'}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })}
                {/* Overall Grand Total */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex justify-end gap-6 text-sm">
                  <span className="text-blue-700 font-bold">Total Cost: {fmt(totalStockCost)}</span>
                  <span className="text-amber-700 font-bold">Total Value: {fmt(totalStockValue)}</span>
                  <span className={`font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>Total Profit: {fmt(totalProfit)}</span>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {tab === 'branch_items' && isAdmin && (
        <>
          {/* summary */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Items with Unit Price</p>
              <p className="text-xl font-bold text-amber-600">{items.filter(i => Number(i.price) > 0).length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Hidden from Branches</p>
              <p className="text-xl font-bold text-slate-800">{items.filter(i => Number(i.price) === 0).length}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
                ) : items.filter(i => Number(i.price) > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No items with a unit price yet.</TableCell></TableRow>
                ) : items.filter(i => Number(i.price) > 0).sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{item.unit}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">{item.quantity}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-700">
                      ₱{Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {(showAdd || editing) && (
        <AddInventoryModal branches={branches} initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchItems(); fetchCostEntries() }}
        />
      )}
      {historyItem && <InventoryHistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
      {showAllHistory && <InventoryHistoryModal onClose={() => setShowAllHistory(false)} />}
      {orderingItem && userBranch && (
        <OrderItemModal item={orderingItem} userBranch={userBranch} onClose={() => setOrderingItem(null)} onSaved={() => setOrderingItem(null)} />
      )}
      {showItemList && <ItemListModal onClose={() => { setShowItemList(false); fetchItems() }} onCostChanged={fetchCostEntries} />}
    </div>
  )
}
