import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { Branch, Receivable } from '@/types'
import { toast } from 'sonner'

interface Props {
  branches: Branch[]
  initial?: Receivable | null
  onClose: () => void
  onSaved: () => void
}

export function AddReceivableModal({ branches, initial, onClose, onSaved }: Props) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [branchId, setBranchId] = useState(String(initial?.branch_id ?? ''))
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description || !amount) return
    setSaving(true)
    const payload = {
      description,
      amount: Number(amount),
      branch_id: branchId ? Number(branchId) : null,
      date,
    }
    let error
    if (initial) {
      ({ error } = await supabase.from('receivables').update(payload).eq('id', initial.id))
    } else {
      ({ error } = await supabase.from('receivables').insert(payload))
    }
    if (error) toast.error('Failed: ' + error.message)
    else { toast.success(initial ? 'Updated' : 'Added'); onSaved() }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{initial ? 'Edit Receivable' : 'Add Receivable'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} required placeholder="Description…" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₱)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Branch (optional)</Label>
            <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select branch (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (initial ? 'Update' : 'Add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
