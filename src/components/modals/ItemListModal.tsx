import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { API_BASE } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Minus, Trash2, Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import type { InventoryItem } from '@/types'
import { AddInventoryModal } from './AddInventoryModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

type AdjustMode = 'add' | 'subtract'

interface AdjustState {
  itemId: string
  mode: AdjustMode
  value: string
  price: string
}

export function ItemListModal({ onClose }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adjust, setAdjust] = useState<AdjustState | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)

  const fetchItems = useCallback(async () => {
    const { data } = await supabase.from('inventory').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleAdjust(item: InventoryItem) {
    if (!adjust || adjust.itemId !== item.id) return
    const amount = Number(adjust.value)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    const price = adjust.mode === 'add' ? Number(adjust.price) : undefined
    if (adjust.mode === 'add' && (!price || price <= 0)) { toast.error('Enter a valid price'); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/api/inventory/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ inventoryId: item.id, mode: adjust.mode, amount, ...(adjust.mode === 'add' ? { price } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) toast.error(json.error ?? 'Failed to adjust stock')
      else { toast.success(json.message); setAdjust(null); fetchItems() }
    } catch { toast.error('Network error — please try again') }
    setSaving(false)
  }

  async function deleteItem(item: InventoryItem) {
    if (!confirm(`Delete "${item.name}"?`)) return
    const { error } = await supabase.from('inventory').delete().eq('id', item.id)
    if (error) { toast.error('Failed to delete') } else {
      await supabase.from('inventory_logs').insert({ inventory_id: item.id, item_name: item.name, action: 'deleted', old_quantity: Number(item.quantity), changed_by: 'admin' })
      toast.success(`"${item.name}" deleted`)
      fetchItems()
    }
  }

  function startAdjust(itemId: string, mode: AdjustMode, currentPrice?: number) {
    setAdjust({ itemId, mode, value: '', price: mode === 'add' && currentPrice ? String(currentPrice) : '' })
  }

  return (
    <>
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Item List</DialogTitle>
            <p className="text-sm text-slate-500 mt-0.5">Commissary inventory — add, adjust, or remove items</p>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={() => { setEditingItem(null); setShowAdd(true) }} className="bg-amber-500 hover:bg-amber-600 text-black">
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <p className="text-center py-10 text-slate-500">No inventory items yet.</p>
            ) : (
              <div className="space-y-2 pb-4">
                {items.map(item => {
                  const isLow = Number(item.quantity) < Number(item.min_quantity)
                  const isAdjusting = adjust?.itemId === item.id
                  return (
                    <div key={item.id} className={cn('border rounded-lg p-3 bg-white', isLow && 'border-red-200 bg-red-50')}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{item.name}</span>
                            {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-xs py-0">{item.category}</Badge>
                            <span className="text-xs text-slate-500">{item.unit}</span>
                            {item.price > 0 && <span className="text-xs font-medium text-amber-700">₱{Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn('text-xl font-bold', isLow ? 'text-red-600' : 'text-slate-900')}>{item.quantity}</span>
                          <p className="text-xs text-slate-500">min: {item.min_quantity}</p>
                        </div>
                      </div>
                      {isAdjusting ? (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded shrink-0', adjust.mode === 'add' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                              {adjust.mode === 'add' ? '+ Add' : '− Subtract'}
                            </span>
                            <Input type="number" min="1" step="1" autoFocus placeholder={`Qty (${item.unit})`} value={adjust.value}
                              onChange={e => setAdjust(a => a ? { ...a, value: e.target.value } : null)}
                              onKeyDown={e => { if (e.key === 'Escape') setAdjust(null) }}
                              className="h-7 text-sm flex-1" />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" disabled={saving} onClick={() => handleAdjust(item)}>
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:bg-slate-50" onClick={() => setAdjust(null)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          {adjust.mode === 'add' && (
                            <div className="flex items-center gap-2 pl-1">
                              <span className="text-xs text-slate-500 shrink-0">Unit Price (₱)</span>
                              <Input type="number" min="0" step="0.01" placeholder="0.00" value={adjust.price}
                                onChange={e => setAdjust(a => a ? { ...a, price: e.target.value } : null)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAdjust(item); if (e.key === 'Escape') setAdjust(null) }}
                                className="h-7 text-sm flex-1" />
                              {adjust.price && adjust.value && (
                                <span className="text-xs font-semibold text-slate-700 shrink-0">
                                  = ₱{(Number(adjust.price) * Number(adjust.value)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-1.5 mt-2">
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => startAdjust(item.id, 'add', item.price)}>
                            <Plus className="w-3 h-3 mr-1" /> Add Stock
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => startAdjust(item.id, 'subtract')}>
                            <Minus className="w-3 h-3 mr-1" /> Subtract
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete item" onClick={() => deleteItem(item)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {(showAdd || editingItem) && (
        <AddInventoryModal
          initial={editingItem}
          onClose={() => { setShowAdd(false); setEditingItem(null) }}
          onSaved={() => { setShowAdd(false); setEditingItem(null); fetchItems() }}
        />
      )}
    </>
  )
}
