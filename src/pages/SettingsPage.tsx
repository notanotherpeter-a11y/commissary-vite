import { useState, useEffect } from 'react'
import { API_BASE } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Loader2, Eye, EyeOff, Trash2, AlertTriangle, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { MONTHS, formatCurrency } from '@/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface AuthUser {
  id: string
  email: string
  role: string
  branch: string | null
}

const USER_META: Record<string, { username: string; label: string; emoji: string }> = {
  'admin@kamayan.app':        { username: 'admin',       label: 'Admin / Owner',        emoji: '👑' },
  'investor@kamayan.app':     { username: 'investor',    label: 'Investor (View Only)',  emoji: '💼' },
  'cainta@kamayan.app':       { username: 'cainta',      label: 'Branch — Cainta',       emoji: '🏪' },
  'marikina@kamayan.app':     { username: 'marikina',    label: 'Branch — Marikina',     emoji: '🏪' },
  'antipolo@kamayan.app':     { username: 'antipolo',    label: 'Branch — Antipolo',     emoji: '🏪' },
  'taytay@kamayan.app':       { username: 'taytay',      label: 'Branch — Taytay',       emoji: '🏪' },
  'quezon_city@kamayan.app':  { username: 'quezon_city', label: 'Branch — Quezon City',  emoji: '🏪' },
}

function getUserMeta(email: string, role: string, branch: string | null) {
  if (USER_META[email]) return USER_META[email]
  if (role === 'branch' && branch) {
    const username = branch
    const label = `Branch — ${branch.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`
    return { username, label, emoji: '🏪' }
  }
  const username = email.split('@')[0]
  return { username, label: role, emoji: '👤' }
}

const DOMAINS = ['@kamayan.app', '@commissary.app']
const ROLES = [
  { value: 'admin',    label: 'Admin / Owner' },
  { value: 'investor', label: 'Investor (View Only)' },
  { value: 'branch',   label: 'Branch' },
]

export function SettingsPage() {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<AuthUser | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newDomain, setNewDomain] = useState('@kamayan.app')
  const [newRole, setNewRole] = useState('branch')
  const [newBranch, setNewBranch] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newConfirm, setNewConfirm] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)

  const [deleting, setDeleting] = useState<AuthUser | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')

  // Clear inventory cost entries
  const [invClearConfirmOpen, setInvClearConfirmOpen] = useState(false)
  const [invClearConfirmText, setInvClearConfirmText] = useState('')
  const [invClearing, setInvClearing] = useState(false)

  async function handleClearInventory() {
    if (invClearConfirmText !== 'DELETE') return
    setInvClearing(true)
    await supabase.from('inventory_cost_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setInvClearing(false)
    setInvClearConfirmOpen(false)
    setInvClearConfirmText('')
    toast.success('Items Cost Entries cleared')
  }

  // Clear month data
  const now = new Date()
  const [clearYear, setClearYear] = useState(now.getFullYear())
  const [clearMonth, setClearMonth] = useState(now.getMonth() + 1)
  const [clearTables, setClearTables] = useState<string[]>(['sales', 'expenses', 'branch_orders', 'salary_payments', 'receivables', 'inventory_logs'])
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const CLEARABLE_TABLES = [
    { key: 'sales',           label: 'Sales' },
    { key: 'expenses',        label: 'Expenses' },
    { key: 'branch_orders',   label: 'Branch Orders' },
    { key: 'salary_payments', label: 'Salary Payments' },
    { key: 'receivables',     label: 'Receivables' },
    { key: 'inventory_logs',  label: 'Inventory Logs' },
  ]
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  function toggleTable(key: string) {
    setClearTables(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key])
  }

  async function handleClearData() {
    if (clearConfirmText !== 'DELETE') return
    setClearing(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${API_BASE}/api/admin/clear-month-data`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ year: clearYear, month: clearMonth, tables: clearTables }),
    })
    const data = await res.json()
    setClearing(false)
    setClearConfirmOpen(false)
    setClearConfirmText('')
    if (!res.ok) {
      toast.error('Failed: ' + data.error)
    } else {
      toast.success(`Cleared ${data.total} records from ${MONTHS[clearMonth - 1]} ${clearYear}`)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      const lastDay = new Date(clearYear, clearMonth, 0).getDate()
      const start = `${clearYear}-${String(clearMonth).padStart(2, '0')}-01`
      const end   = `${clearYear}-${String(clearMonth).padStart(2, '0')}-${lastDay}`
      const monthLabel = `${MONTHS[clearMonth - 1]} ${clearYear}`

      const [s, e, bo, sp, r, il] = await Promise.all([
        supabase.from('sales').select('date, amount, notes, branches(name)').gte('date', start).lte('date', end).order('date'),
        supabase.from('expenses').select('date, category, amount, notes, branches(name)').gte('date', start).lte('date', end).order('date'),
        supabase.from('branch_orders').select('date, item, quantity, amount, status, from_branch:from_branch_id(name), to_branch:to_branch_id(name)').gte('date', start).lte('date', end).order('date'),
        supabase.from('salary_payments').select('date, amount, notes, employees(name)').gte('date', start).lte('date', end).order('date'),
        supabase.from('receivables').select('date, description, amount, branches(name)').gte('date', start).lte('date', end).order('date'),
        supabase.from('inventory_logs').select('created_at, item_name, action, quantity_change, changed_by').gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59').order('created_at'),
      ])

      const doc = new jsPDF()
      const pw = doc.internal.pageSize.getWidth()
      const amber: [number, number, number] = [245, 158, 11]
      const slate: [number, number, number] = [71, 85, 105]

      // --- Header ---
      doc.setFillColor(245, 158, 11)
      doc.rect(0, 0, pw, 36, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Kamayan sa Qyusi', pw / 2, 14, { align: 'center' })
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Monthly Transactional Report — ${monthLabel}`, pw / 2, 22, { align: 'center' })
      doc.setFontSize(8)
      doc.text(`Generated: ${new Date().toLocaleString('en-PH')}`, pw / 2, 30, { align: 'center' })
      doc.setTextColor(0, 0, 0)

      let curY = 42

      const section = (title: string, count: number) => {
        if (curY > 240) { doc.addPage(); curY = 16 }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...slate)
        doc.text(`${title}  (${count} record${count !== 1 ? 's' : ''})`, 14, curY)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        curY += 2
      }

      const tableOpts = (head: string[][], body: string[][], totRow?: string[]) => {
        autoTable(doc, {
          startY: curY,
          head,
          body: body.length > 0 ? body : [Array(head[0].length).fill('—')],
          ...(totRow ? { foot: [totRow], footStyles: { fillColor: [248, 250, 252], textColor: [30, 30, 30], fontStyle: 'bold' } } : {}),
          theme: 'striped',
          headStyles: { fillColor: amber, textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        })
        curY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
      }

      // --- Sales ---
      const sales = s.data ?? []
      section('Sales', sales.length)
      tableOpts(
        [['Date', 'Branch', 'Notes', 'Amount']],
        sales.map(r => { const rr = r as unknown as {date:string;amount:number;notes:string|null;branches:{name:string}|null}; return [rr.date, rr.branches?.name ?? '—', rr.notes ?? '—', formatCurrency(Number(rr.amount))] }),
        sales.length > 0 ? ['', '', 'Total', formatCurrency(sales.reduce((acc, r) => acc + Number(r.amount), 0))] : undefined,
      )

      // --- Expenses ---
      const expenses = e.data ?? []
      section('Expenses', expenses.length)
      tableOpts(
        [['Date', 'Branch', 'Category', 'Notes', 'Amount']],
        expenses.map(r => { const rr = r as unknown as {date:string;amount:number;notes:string|null;category:string;branches:{name:string}|null}; return [rr.date, rr.branches?.name ?? '—', rr.category ?? '—', rr.notes ?? '—', formatCurrency(Number(rr.amount))] }),
        expenses.length > 0 ? ['', '', '', 'Total', formatCurrency(expenses.reduce((acc, r) => acc + Number(r.amount), 0))] : undefined,
      )

      // --- Branch Orders ---
      const orders = bo.data ?? []
      section('Branch Orders', orders.length)
      tableOpts(
        [['Date', 'Item', 'Qty', 'From', 'To', 'Amount', 'Status']],
        orders.map(o => {
          const oo = o as unknown as {date:string;item:string;quantity:number|null;amount:number|null;status:string;from_branch:{name:string}|null;to_branch:{name:string}|null}
          return [oo.date, oo.item, String(oo.quantity ?? '—'), oo.from_branch?.name ?? '—', oo.to_branch?.name ?? '—', oo.amount ? formatCurrency(Number(oo.amount)) : '—', oo.status ?? '—']
        }),
      )

      // --- Salary Payments ---
      const salary = sp.data ?? []
      section('Salary Payments', salary.length)
      tableOpts(
        [['Date', 'Employee', 'Notes', 'Amount']],
        salary.map(r => {
          const rr = r as unknown as {date:string;amount:number;notes:string|null;employees:{name:string}|null}
          return [rr.date, rr.employees?.name ?? '—', rr.notes ?? '—', formatCurrency(Number(rr.amount))]
        }),
        salary.length > 0 ? ['', '', 'Total', formatCurrency(salary.reduce((acc, r) => acc + Number(r.amount), 0))] : undefined,
      )

      // --- Receivables ---
      const receivables = r.data ?? []
      section('Receivables', receivables.length)
      tableOpts(
        [['Date', 'Branch', 'Description', 'Amount']],
        receivables.map(r2 => {
          const rr = r2 as unknown as {date:string;amount:number;description:string;branches:{name:string}|null}
          return [rr.date, rr.branches?.name ?? '—', rr.description ?? '—', formatCurrency(Number(rr.amount))]
        }),
        receivables.length > 0 ? ['', '', 'Total', formatCurrency(receivables.reduce((acc, r2) => acc + Number(r2.amount), 0))] : undefined,
      )

      // --- Inventory Logs ---
      const logs = il.data ?? []
      section('Inventory Logs', logs.length)
      tableOpts(
        [['Date', 'Item', 'Action', 'Qty Change', 'By']],
        logs.map(l => {
          const ll = l as {created_at:string;item_name:string;action:string;quantity_change:number|null;changed_by:string|null}
          return [ll.created_at?.slice(0, 10), ll.item_name ?? '—', ll.action ?? '—', String(ll.quantity_change ?? '—'), ll.changed_by ?? '—']
        }),
      )

      doc.save(`Kamayan_Report_${monthLabel.replace(' ', '_')}.pdf`)
      toast.success(`Report exported: ${monthLabel}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  function sortUsers(list: AuthUser[]) {
    const knownUsernames = Object.keys(USER_META).map(e => e.split('@')[0])
    function sortKey(u: AuthUser): [number, number] {
      const prefix = (u.email ?? '').split('@')[0]
      const isKamayan = (u.email ?? '').includes('@kamayan') ? 0 : 1
      const ki = knownUsernames.indexOf(prefix)
      if (ki !== -1) return [ki, isKamayan]
      const b = u.branch ?? prefix
      const m = b.match(/branch_(\d+)/)
      if (m) return [100 + parseInt(m[1]), isKamayan]
      return [9999, isKamayan]
    }
    return [...list].sort((a, b) => {
      const [ap, as_] = sortKey(a)
      const [bp, bs] = sortKey(b)
      return ap !== bp ? ap - bp : as_ - bs
    })
  }

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const r = await fetch(`${API_BASE}/api/admin/list-users`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const d = await r.json()
        if (d.users) {
          const sorted = sortUsers(d.users)
          const seen = new Set<string>()
          const deduped = sorted.filter(u => {
            const prefix = (u.email ?? '').split('@')[0]
            if (seen.has(prefix)) return false
            seen.add(prefix)
            return true
          })
          setUsers(deduped)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function openEdit(u: AuthUser) {
    setEditing(u)
    setPassword('')
    setConfirm('')
    setShowPw(false)
  }

  async function handleSave() {
    if (!editing) return
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (password !== confirm) { toast.error('Passwords do not match'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`${API_BASE}/api/admin/update-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: editing.id, password }),
    })
    const data = await res.json()
    if (data.error) toast.error('Failed: ' + data.error)
    else { toast.success(`Password updated for ${getUserMeta(editing.email, editing.role, editing.branch).username}`); setEditing(null) }
    setSaving(false)
  }

  function openAdd() {
    setNewUsername('')
    setNewDomain('@kamayan.app')
    setNewRole('branch')
    setNewBranch('')
    setNewPassword('')
    setNewConfirm('')
    setShowNewPw(false)
    setAddOpen(true)
  }

  async function handleAdd() {
    if (!newUsername.trim()) { toast.error('Username is required'); return }
    if (newRole === 'branch' && !newBranch.trim()) { toast.error('Branch name is required'); return }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (newPassword !== newConfirm) { toast.error('Passwords do not match'); return }

    const email = `${newUsername.trim()}${newDomain}`
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${API_BASE}/api/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          password: newPassword,
          role: newRole,
          branch: newRole === 'branch' ? newBranch.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) { toast.error('Failed: ' + data.error); return }
      setUsers(prev => sortUsers([...prev, data.user as AuthUser]))
      toast.success(`User ${email} added`)
      setAddOpen(false)
    } catch {
      toast.error('Failed to create user')
    }
  }

  function openDelete(u: AuthUser) {
    setDeleting(u)
    setConfirmDelete('')
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${API_BASE}/api/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: deleting.id }),
      })
      const data = await res.json()
      if (data.error) { toast.error('Failed: ' + data.error); return }
      setUsers(prev => prev.filter(u => u.id !== deleting.id))
      toast.success(`User ${deleting.email} removed`)
      setDeleting(null)
    } catch {
      toast.error('Failed to delete user')
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage users and system configuration"
        action={
          <Button size="sm" onClick={openAdd} className="bg-amber-500 hover:bg-amber-600 text-black">
            Add User
          </Button>
        }
      />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">User Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading users...
              </div>
            ) : (
              <div className="space-y-1">
                {users.map(u => {
                  const meta = getUserMeta(u.email ?? '', u.role, u.branch)
                  return (
                    <div key={u.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                      <span className="text-2xl">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{meta.username}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{meta.label}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => openEdit(u)}
                        title="Change password"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => openDelete(u)}
                        title="Delete user"
                      >
                        <span className="text-xs">✕</span>
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

        {/* Data Management */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Data Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">Permanently deletes transactional records for the selected month. This cannot be undone. Inventory items, branches, and user accounts are not affected.</p>
            </div>

            <div className="flex gap-2">
              <Select value={String(clearMonth)} onValueChange={v => setClearMonth(Number(v))}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <span>{MONTHS[clearMonth - 1]}</span>
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(clearYear)} onValueChange={v => setClearYear(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Select data to clear:</p>
              <div className="grid grid-cols-2 gap-2">
                {CLEARABLE_TABLES.map(t => (
                  <label key={t.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearTables.includes(t.key)}
                      onChange={() => toggleTable(t.key)}
                      className="w-3.5 h-3.5 accent-red-500"
                    />
                    <span className="text-sm text-slate-700">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="border-amber-400 text-amber-700 hover:bg-amber-50"
                disabled={exporting}
                onClick={handleExportPDF}
              >
                {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                Export {MONTHS[clearMonth - 1]} {clearYear} PDF
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={clearTables.length === 0}
                onClick={() => { setClearConfirmText(''); setClearConfirmOpen(true) }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear {MONTHS[clearMonth - 1]} {clearYear} Data
              </Button>
            </div>

            {/* Inventory cost entries clearing */}
            <div className="border-t border-red-100 pt-4 mt-2">
              <p className="text-xs font-medium text-slate-600 mb-2">Clear Items Cost Entries:</p>
              <p className="text-xs text-slate-500 mb-3">Clears all records from the Items Cost log. Stock List and Branch Item List can only be deleted individually from the Inventory page.</p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setInvClearConfirmText(''); setInvClearConfirmOpen(true) }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear Items Cost Entries
              </Button>
            </div>
          </CardContent>
        </Card>

      {/* Inventory clear confirm dialog */}
      {invClearConfirmOpen && (
        <Dialog open onOpenChange={() => setInvClearConfirmOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-700">Clear Inventory Data</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                This will permanently delete all records from the selected inventory tables. This cannot be undone.
              </p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="bg-red-50 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700">
                <p>• Items Cost Entries (all cost log records)</p>
              </div>
              <div className="space-y-1.5">
                <Label>Type <span className="font-bold text-slate-800">DELETE</span> to confirm</Label>
                <Input
                  value={invClearConfirmText}
                  onChange={e => setInvClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setInvClearConfirmOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={invClearConfirmText !== 'DELETE' || invClearing}
                  onClick={handleClearInventory}
                >
                  {invClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Clear confirm dialog */}
      {clearConfirmOpen && (
        <Dialog open onOpenChange={() => setClearConfirmOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-700">Confirm Data Deletion</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                You are about to permanently delete <span className="font-semibold">{clearTables.length} table{clearTables.length !== 1 ? 's' : ''}</span> of data for <span className="font-semibold">{MONTHS[clearMonth - 1]} {clearYear}</span>.
              </p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="bg-red-50 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 space-y-0.5">
                {clearTables.map(t => (
                  <p key={t}>• {CLEARABLE_TABLES.find(ct => ct.key === t)?.label}</p>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Type <span className="font-bold text-slate-800">DELETE</span> to confirm</Label>
                <Input
                  value={clearConfirmText}
                  onChange={e => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={clearConfirmText !== 'DELETE' || clearing}
                  onClick={handleClearData}
                >
                  {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <p className="text-sm text-slate-500">
                {getUserMeta(editing.email, editing.role, editing.branch).username}
              </p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    autoFocus
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
                <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                  onClick={handleSave} disabled={saving || !password || !confirm}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {addOpen && (
        <Dialog open onOpenChange={() => setAddOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <p className="text-sm text-slate-500">Create a new account</p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <div className="flex gap-2">
                  <Input
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="e.g. branch_11"
                    className="flex-1"
                    autoFocus
                  />
                  <Select value={newDomain} onValueChange={setNewDomain}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOMAINS.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newUsername && (
                  <p className="text-xs text-slate-500">
                    Email: <span className="font-medium text-slate-700">{newUsername}{newDomain}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newRole === 'branch' && (
                <div className="space-y-1.5">
                  <Label>Branch ID</Label>
                  <Input
                    value={newBranch}
                    onChange={e => setNewBranch(e.target.value)}
                    placeholder="e.g. branch_11"
                  />
                  <p className="text-xs text-slate-500">Must match the branch slug in the database</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <Input
                  type={showNewPw ? 'text' : 'password'}
                  value={newConfirm}
                  onChange={e => setNewConfirm(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                  onClick={handleAdd}
                  disabled={!newUsername || !newPassword || !newConfirm}>
                  Create User
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {deleting && (
        <Dialog open onOpenChange={() => setDeleting(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <p className="text-sm text-slate-500">This action cannot be undone.</p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                You are about to delete <span className="font-semibold">{deleting.email}</span>.
              </div>
              <div className="space-y-1.5">
                <Label>Type <span className="font-semibold text-slate-700">{deleting.email.split('@')[0]}</span> to confirm</Label>
                <Input
                  value={confirmDelete}
                  onChange={e => setConfirmDelete(e.target.value)}
                  placeholder="Type username to confirm"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDeleting(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  disabled={confirmDelete !== deleting.email.split('@')[0]}
                >
                  Delete User
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
