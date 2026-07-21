import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { Sale } from '@/types'
import { toast } from 'sonner'

interface Props {
  defaultBranchId: number
  initial?: Sale | null
  onClose: () => void
  onSaved: () => void
}

export function AddSaleModal({ defaultBranchId, initial, onClose, onSaved }: Props) {
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount) return
    setSaving(true)

    const payload = {
      branch_id: initial?.branch_id ?? defaultBranchId,
      date,
      amount: Number(amount),
      notes: notes || null,
    }

    let error
    if (initial) {
      ({ error } = await supabase.from('sales').update(payload).eq('id', initial.id))
    } else {
      ({ error } = await supabase.from('sales').insert(payload))
    }

    if (error) {
      toast.error('Failed to save: ' + error.message)
    } else {
      toast.success(initial ? 'Sale updated' : 'Sale added')
      onSaved()
    }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Sale' : 'Add Sale'}</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Record a sale entry</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₱)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes ?? ''} onChange={e => setNotes(e.target.value)} placeholder="Notes…" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (initial ? 'Update' : 'Add Sale')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
