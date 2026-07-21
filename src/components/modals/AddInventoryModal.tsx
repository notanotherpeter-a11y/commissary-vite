import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { InventoryItem } from '@/types'
import { toast } from 'sonner'

const COMMISSARY_ID = 6

async function writeLog(
  payload: {
    inventory_id: string
    item_name: string
    action: 'added' | 'updated' | 'deleted'
    old_quantity?: number | null
    new_quantity?: number | null
    note?: string | null
    changed_by?: string | null
  }
) {
  await supabase.from('inventory_logs').insert(payload)
}

interface Props {
  branches?: unknown[]
  initial?: InventoryItem | null
  onClose: () => void
  onSaved: () => void
}

const PRESET_CATEGORIES = [
  'Meat', 'Seafood', 'Produce', 'Dairy', 'Rice & Grains',
  'Condiments', 'Beverages', 'Packaging', 'Cleaning',
]

export function AddInventoryModal({ initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const initialCategory = initial?.category ?? ''
  const isPreset = PRESET_CATEGORIES.includes(initialCategory)
  const [categorySelect, setCategorySelect] = useState(isPreset ? initialCategory : (initialCategory ? '__custom__' : ''))
  const [customCategory, setCustomCategory] = useState(!isPreset ? initialCategory : '')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? '0'))
  const [minQty, setMinQty] = useState(String(initial?.min_quantity ?? '0'))
  const [price, setPrice] = useState(String(initial?.price ?? '0'))
  const [saving, setSaving] = useState(false)

  const category = categorySelect === '__custom__' ? customCategory : categorySelect

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !category || !unit) return
    setSaving(true)
    const payload = {
      name, category, unit,
      quantity: Number(quantity),
      min_quantity: Number(minQty),
      price: Number(price),
      branch_id: COMMISSARY_ID,
      updated_at: new Date().toISOString(),
    }
    let error
    if (initial) {
      ({ error } = await supabase.from('inventory').update(payload).eq('id', initial.id))
      if (!error) {
        await writeLog({ inventory_id: initial.id, item_name: name, action: 'updated', old_quantity: Number(initial.quantity), new_quantity: Number(quantity), changed_by: 'admin' })
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase.from('inventory').insert(payload).select('id').single()
      error = insertErr
      if (!error && inserted) {
        await writeLog({ inventory_id: inserted.id, item_name: name, action: 'added', new_quantity: Number(quantity), changed_by: 'admin' })
      }
    }
    if (error) toast.error('Failed: ' + error.message)
    else { toast.success(initial ? 'Item updated' : 'Item added'); onSaved() }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Item' : 'Add Inventory Item'}</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Commissary stock</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Item name" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categorySelect} onValueChange={(v) => { setCategorySelect(v ?? ''); if (v !== '__custom__') setCustomCategory('') }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {PRESET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="__custom__">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {categorySelect === '__custom__' && (
                <Input value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Enter custom category" className="mt-1.5" autoFocus />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} required placeholder="kg / pcs / L" />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Min Quantity</Label>
              <Input type="number" min="0" step="0.01" value={minQty} onChange={e => setMinQty(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Unit Price (₱)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                <Input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="pl-7" placeholder="0.00" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (initial ? 'Update' : 'Add Item')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
