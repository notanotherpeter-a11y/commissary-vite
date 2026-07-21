import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const COMMISSARY_ID = 6

interface Props {
  onClose: () => void
  onSaved: () => void
}

export function AddEmployeeModal({ onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [baseSalary, setBaseSalary] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name) return
    setSaving(true)
    const { error } = await supabase.from('employees').insert({
      name,
      branch_id: COMMISSARY_ID,
      base_salary: Number(baseSalary) || 0,
    })
    if (error) toast.error('Failed: ' + error.message)
    else { toast.success('Employee added'); onSaved() }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Commissary staff</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Name…" />
          </div>
          <div className="space-y-1.5">
            <Label>Base Daily Salary (₱)</Label>
            <Input type="number" min="0" step="0.01" value={baseSalary} onChange={e => setBaseSalary(e.target.value)} placeholder="0.00" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Employee'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
