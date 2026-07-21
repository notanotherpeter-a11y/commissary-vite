import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { Branch, InventoryItem } from '@/types'
import { toast } from 'sonner'

const COMMISSARY_ID = 6

interface Props {
  item: InventoryItem
  userBranch: Branch
  onClose: () => void
  onSaved: () => void
}

export function OrderItemModal({ item, userBranch, onClose, onSaved }: Props) {
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!quantity || Number(quantity) <= 0) return
    setSaving(true)
    const { error } = await supabase.from('branch_orders').insert({
      from_branch_id: COMMISSARY_ID,
      to_branch_id: userBranch.id,
      item: item.name,
      quantity: Number(quantity),
      date: new Date().toISOString().split('T')[0],
      notes: notes || null,
      status: 'pending',
    })
    if (error) toast.error('Failed: ' + error.message)
    else { toast.success('Order submitted — pending admin approval'); onSaved() }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Order Item</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">
            Requesting from <span className="font-medium">Commissary</span> → <span className="font-medium">{userBranch.name}</span>
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Input value={item.name} disabled className="bg-slate-50 font-medium" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={item.unit} disabled className="bg-slate-50" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">
              Available: <span className="font-semibold text-slate-700">{item.quantity} {item.unit}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-slate-400">(optional)</span></Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any instructions…" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
