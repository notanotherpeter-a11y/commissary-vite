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
    snapshot?: Record<string, unknown> | null
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
  const [minQty] = useState(String(initial?.min_quantity ?? '0'))
  const [price, setPrice] = useState(String(initial?.price ?? '0'))
  const [stockPrice, setStockPrice] = useState(String(initial?.stock_price ?? '0'))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  const category = categorySelect === '__custom__' ? customCategory : categorySelect

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !category || !unit) return
    setSaving(true)
    const dateVal = date || new Date().toISOString().split('T')[0]

    if (initial) {
      // ── EDIT MODE ──
      const { error } = await supabase.from('inventory').update({
        name, category, unit,
        quantity: Number(quantity),
        min_quantity: Number(minQty),
        price: Number(price),
        stock_price: Number(stockPrice),
        notes: notes.trim() || null,
        date: dateVal,
        branch_id: COMMISSARY_ID,
        updated_at: new Date().toISOString(),
      }).eq('id', initial.id)

      if (!error) {
        // Sync name / category / unit / prices to cost entries that share the old name+category
        const nameChanged = name !== initial.name
        const categoryChanged = category !== initial.category
        if (nameChanged || categoryChanged || unit !== initial.unit || Number(price) !== Number(initial.price) || Number(stockPrice) !== Number(initial.stock_price)) {
          await supabase.from('inventory_cost_entries')
            .update({ item_name: name, category, unit, price: Number(price), stock_price: Number(stockPrice) })
            .eq('item_name', initial.name)
            .eq('category', initial.category)
        }
        await writeLog({ inventory_id: initial.id, item_name: name, action: 'updated', old_quantity: Number(initial.quantity), new_quantity: Number(quantity), changed_by: 'admin', snapshot: { ...initial } as Record<string, unknown> })
        toast.success('Item updated')
        onSaved()
      } else {
        toast.error('Failed: ' + error.message)
      }

    } else {
      // ── ADD MODE ── check for existing item with same name (case-insensitive) + category
      const { data: existing } = await supabase
        .from('inventory')
        .select('id, quantity')
        .ilike('name', name.trim())
        .eq('category', category)
        .eq('branch_id', COMMISSARY_ID)
        .maybeSingle()

      if (existing) {
        // Merge: add qty to existing row
        const newQty = Number(existing.quantity) + Number(quantity)
        const { error } = await supabase.from('inventory').update({
          quantity: newQty,
          unit, price: Number(price), stock_price: Number(stockPrice),
          notes: notes.trim() || null,
          date: dateVal,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)

        if (!error) {
          await Promise.all([
            writeLog({ inventory_id: existing.id, item_name: name, action: 'updated', old_quantity: Number(existing.quantity), new_quantity: newQty, note: 'qty added', changed_by: 'admin', snapshot: { ...existing } as Record<string, unknown> }),
            supabase.from('inventory_cost_entries').insert({
              item_name: name, category, unit,
              quantity: Number(quantity),
              stock_price: Number(stockPrice),
              price: Number(price),
              notes: notes.trim() || null,
              date: dateVal,
            }),
          ])
          toast.success('Quantity added to existing item')
          onSaved()
        } else {
          toast.error('Failed: ' + error.message)
        }

      } else {
        // New item — full insert
        const { data: inserted, error: insertErr } = await supabase.from('inventory').insert({
          name, category, unit,
          quantity: Number(quantity),
          min_quantity: Number(minQty),
          price: Number(price),
          stock_price: Number(stockPrice),
          notes: notes.trim() || null,
          date: dateVal,
          branch_id: COMMISSARY_ID,
          updated_at: new Date().toISOString(),
        }).select('id').single()

        if (!insertErr && inserted) {
          await Promise.all([
            writeLog({ inventory_id: inserted.id, item_name: name, action: 'added', new_quantity: Number(quantity), changed_by: 'admin' }),
            supabase.from('inventory_cost_entries').insert({
              item_name: name, category, unit,
              quantity: Number(quantity),
              stock_price: Number(stockPrice),
              price: Number(price),
              notes: notes.trim() || null,
              date: dateVal,
            }),
          ])
          toast.success('Item added')
          onSaved()
        } else {
          toast.error('Failed: ' + (insertErr?.message ?? ''))
        }
      }
    }
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
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
            </div>
            <div className="space-y-1.5">
              <Label>Stock Price (₱) <span className="text-xs text-slate-400">cost</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                <Input type="number" min="0" step="0.01" value={stockPrice} onChange={e => setStockPrice(e.target.value)} className="pl-7" placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Unit Price (₱) <span className="text-xs text-slate-400">selling</span></Label>
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
