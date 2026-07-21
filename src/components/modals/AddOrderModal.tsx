import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import type { InventoryItem } from '@/types'

const COMMISSARY_ID = 6

interface Props {
  toBranchId: number
  toBranchName: string
  onClose: () => void
  onSaved: () => void
}

export function AddOrderModal({ toBranchId, toBranchName, onClose, onSaved }: Props) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('inventory').select('*').order('name').then(({ data }) => {
      setInventoryItems(data ?? [])
      setLoadingItems(false)
    })
  }, [])

  const unitPrice = selectedItem?.price ?? 0
  const total = unitPrice * (Number(quantity) || 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedItem) return
    setSaving(true)
    const qty = quantity ? Number(quantity) : 1
    const { error } = await supabase.from('branch_orders').insert({
      from_branch_id: COMMISSARY_ID,
      to_branch_id: toBranchId,
      item: selectedItem.name,
      quantity: qty,
      unit_price: unitPrice || null,
      amount: unitPrice ? unitPrice * qty : null,
      date,
      notes: notes || null,
      status: 'pending',
    })
    if (error) toast.error('Failed: ' + error.message)
    else { toast.success('Order submitted — pending admin approval'); onSaved() }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Order from Commissary</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Requesting for {toBranchName}</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Select Item</Label>
            {loadingItems ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading inventory…
              </div>
            ) : inventoryItems.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">No inventory items available.</p>
            ) : (
              <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                {inventoryItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${selectedItem?.id === item.id ? 'bg-amber-50 border-l-2 border-l-amber-500' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <span className="font-medium">{item.name}</span>
                        {item.category && <span className="ml-1.5 text-xs text-slate-400">({item.category})</span>}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 ml-2">{item.quantity} {item.unit} available</span>
                  </button>
                ))}
              </div>
            )}
            {selectedItem && (
              <div className="text-xs text-amber-700 font-medium space-y-0.5">
                <p>Selected: {selectedItem.name}</p>
                {unitPrice > 0 && <p className="text-slate-500">Unit price: ₱{unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="1" />
            {unitPrice > 0 && Number(quantity) > 0 && (
              <p className="text-sm font-semibold text-slate-700">Total: ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving || !selectedItem} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Place Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
