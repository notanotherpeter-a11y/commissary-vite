import { useState, useEffect, useCallback } from 'react'
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

type TabView = 'stock' | 'cost'

export function InventoryPage() {
  const { role, branch: userBranchSlug } = useAuth()
  const userMeta = { role: role ?? 'branch', branch: userBranchSlug }
  const [branches, setBranches] = useState<Branch[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'table' | 'card'>('table')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabView>('stock')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<(InventoryItem & { branches?: { name: string } }) | null>(null)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [orderingItem, setOrderingItem] = useState<InventoryItem | null>(null)
  const [showItemList, setShowItemList] = useState(false)

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

  useEffect(() => { fetchItems() }, [fetchItems])

  useEffect(() => {
    const ch = supabase.channel('inventory-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchItems).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchItems])

  async function deleteItem(item: InventoryItem) {
    if (!confirm('Delete this inventory item?')) return
    await supabase.from('inventory_logs').insert({ inventory_id: item.id, item_name: item.name, action: 'deleted', old_quantity: Number(item.quantity), changed_by: 'admin' })
    const { error } = await supabase.from('inventory').delete().eq('id', item.id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Item deleted'); fetchItems() }
  }

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
  const lowStock = filtered.filter(i => Number(i.quantity) < Number(i.min_quantity))

  // Cost tab computed values
  const itemsWithPrice = items.filter(i => Number(i.price) > 0)
  const totalStockValue = items.reduce((sum, i) => sum + Number(i.price ?? 0) * Number(i.quantity ?? 0), 0)
  const costSorted = [...items].sort((a, b) => (Number(b.price ?? 0) * Number(b.quantity ?? 0)) - (Number(a.price ?? 0) * Number(a.quantity ?? 0)))

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
          { label: 'Stock', value: 'stock' as TabView },
          { label: 'Items Cost', value: 'cost' as TabView },
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
                {isAdmin && <TableHead className="text-right">Min Qty</TableHead>}
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No items found.</TableCell></TableRow>
              ) : filtered.map(item => {
                const isLow = isAdmin && Number(item.quantity) < Number(item.min_quantity)
                return (
                  <TableRow key={item.id} className={isLow ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {item.name}
                      {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" />}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{item.unit}</TableCell>
                    <TableCell className={cn('text-right font-semibold', isLow ? 'text-red-600' : 'text-slate-900')}>{item.quantity}</TableCell>
                    {isAdmin && <TableCell className="text-right text-slate-500">{item.min_quantity}</TableCell>}
                    <TableCell className="text-right font-medium text-slate-700">
                      {item.price ? `₱${Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '---'}
                    </TableCell>
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
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Total Stock Value</p>
              <p className="text-xl font-bold text-amber-600">₱{totalStockValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Total Items</p>
              <p className="text-xl font-bold text-slate-800">{items.length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-xs text-slate-500 mb-1">Priced Items</p>
              <p className="text-xl font-bold text-slate-800">{itemsWithPrice.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
                ) : costSorted.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No items.</TableCell></TableRow>
                ) : costSorted.map(item => {
                  const unitPrice = Number(item.price ?? 0)
                  const qty = Number(item.quantity ?? 0)
                  const totalValue = unitPrice * qty
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell><Badge variant="secondary">{item.category}</Badge></TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-sm text-slate-500">{item.unit}</TableCell>
                      <TableCell className="text-right text-slate-700">
                        {unitPrice > 0 ? `₱${unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {totalValue > 0 ? `₱${totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {/* Grand total row */}
                <TableRow className="bg-amber-50 border-t-2 border-amber-200">
                  <TableCell colSpan={5} className="font-bold text-slate-800">Grand Total</TableCell>
                  <TableCell className="text-right font-bold text-amber-700 text-base">
                    ₱{totalStockValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {(showAdd || editing) && (
        <AddInventoryModal branches={branches} initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchItems() }}
        />
      )}
      {historyItem && <InventoryHistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
      {showAllHistory && <InventoryHistoryModal onClose={() => setShowAllHistory(false)} />}
      {orderingItem && userBranch && (
        <OrderItemModal item={orderingItem} userBranch={userBranch} onClose={() => setOrderingItem(null)} onSaved={() => setOrderingItem(null)} />
      )}
      {showItemList && <ItemListModal onClose={() => { setShowItemList(false); fetchItems() }} />}
    </div>
  )
}
