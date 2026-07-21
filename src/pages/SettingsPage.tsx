import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

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
    fetch('/api/admin/list-users')
      .then(r => r.json())
      .then(d => {
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
      })
      .finally(() => setLoading(false))
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
    const res = await fetch('/api/admin/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  function handleAdd() {
    if (!newUsername.trim()) { toast.error('Username is required'); return }
    if (newRole === 'branch' && !newBranch.trim()) { toast.error('Branch name is required'); return }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (newPassword !== newConfirm) { toast.error('Passwords do not match'); return }

    const email = `${newUsername.trim()}${newDomain}`
    const newUser: AuthUser = {
      id: `temp-${Date.now()}`,
      email,
      role: newRole,
      branch: newRole === 'branch' ? newBranch.trim() : null,
    }
    setUsers(prev => sortUsers([...prev, newUser]))
    toast.success(`User ${email} added`)
    setAddOpen(false)
  }

  function openDelete(u: AuthUser) {
    setDeleting(u)
    setConfirmDelete('')
  }

  function handleDelete() {
    if (!deleting) return
    setUsers(prev => prev.filter(u => u.id !== deleting.id))
    toast.success(`User ${deleting.email} removed`)
    setDeleting(null)
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
