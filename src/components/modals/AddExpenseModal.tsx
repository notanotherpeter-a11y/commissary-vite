import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { Expense } from '@/types'
import { EXPENSE_CATEGORIES } from '@/types'
import { toast } from 'sonner'

const COMMISSARY_ID = 6

interface Props {
  initial?: Expense | null
  onClose: () => void
  onSaved: () => void
}

export function AddExpenseModal({ initial, onClose, onSaved }: Props) {
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split('T')[0])
  const [category, setCategory] = useState(initial?.category ?? '')
  const [customCategory, setCustomCategory] = useState(
    initial?.category && !EXPENSE_CATEGORIES.includes(initial.category) ? initial.category : ''
  )
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [saving, setSaving] = useState(false)

  const isCustom = category === 'Custom'
  const finalCategory = isCustom ? customCategory.trim() : category
  const selectValue = initial?.category && !EXPENSE_CATEGORIES.includes(initial.category) ? 'Custom' : category

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!finalCategory || !amount) return
    if (isCustom && !customCategory.trim()) { toast.error('Please enter a custom category name'); return }
    setSaving(true)
    const payload = {
      branch_id: COMMISSARY_ID,
      date,
      category: finalCategory,
      amount: Number(amount),
      description: description || null,
    }
    let error
    if (initial) {
      ({ error } = await supabase.from('expenses').update(payload).eq('id', initial.id))
    } else {
      ({ error } = await supabase.from('expenses').insert(payload))
    }
    if (error) toast.error('Failed to save: ' + error.message)
    else { toast.success(initial ? 'Expense updated' : 'Expense added'); onSaved() }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Commissary expense</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={selectValue} onValueChange={v => { setCategory(v ?? ''); if (v !== 'Custom') setCustomCategory('') }}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                <SelectItem value="Custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {isCustom && (
              <Input autoFocus value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Enter custom category…" required />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₱)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input value={description ?? ''} onChange={e => setDescription(e.target.value)} placeholder="Description…" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (initial ? 'Update' : 'Add Expense')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
