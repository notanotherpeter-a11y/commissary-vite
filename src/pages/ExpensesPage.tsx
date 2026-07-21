import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AddExpenseModal } from '@/components/modals/AddExpenseModal'
import type { Branch, Expense } from '@/types'
import { EXPENSE_CATEGORIES } from '@/types'
import { toast } from 'sonner'

const CATEGORY_COLORS: Record<string, string> = {
  Restock: 'bg-blue-100 text-blue-800',
  'FB Ads': 'bg-purple-100 text-purple-800',
  Salary: 'bg-green-100 text-green-800',
  Utilities: 'bg-orange-100 text-orange-800',
  Transport: 'bg-cyan-100 text-cyan-800',
  Other: 'bg-slate-100 text-slate-700',
}

export function ExpensesPage() {
  const { role, branch: userBranchSlug } = useAuth()
  const userMeta = { role: role ?? 'branch', branch: userBranchSlug }
  const now = getCurrentMonthYear()
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [branches, setBranches] = useState<Branch[]>([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  const userBranch = userMeta.role === 'branch' ? branches.find(b => b.slug === userMeta.branch) : null

  const fetchData = useCallback(async () => {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    let query = supabase.from('expenses').select('*, branches(id,slug,name)').gte('date', start).lte('date', end).order('date', { ascending: false })
    if (userBranch) query = query.eq('branch_id', userBranch.id)
    else if (branchFilter !== 'all') {
      const b = branches.find(x => x.slug === branchFilter)
      if (b) query = query.eq('branch_id', b.id)
    }
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter)
    const { data } = await query
    setExpenses(data ?? [])
    setLoading(false)
  }, [month, year, branchFilter, categoryFilter, userBranch, branches])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const ch = supabase.channel('expenses-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchData).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Expense deleted'); fetchData() }
  }

  const total = expenses.reduce((s, r) => s + Number(r.amount), 0)
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const isReadOnly = userMeta.role === 'investor'

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track business expenses by category"
        action={!isReadOnly && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
            <Plus className="w-4 h-4 mr-1" /> Add Expense
          </Button>
        )}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? 0))}>
          <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? 0))}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        {userMeta.role !== 'branch' && (
          <Select value={branchFilter} onValueChange={(v) => setBranchFilter(v ?? '')}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.slug} value={b.slug}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? '')}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg inline-block">
        <span className="text-xs text-red-600 font-medium uppercase tracking-wide">Total Expenses</span>
        <p className="text-2xl font-bold text-red-700">{formatCurrency(total)}</p>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {!isReadOnly && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading…</TableCell></TableRow>
            ) : expenses.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No expenses for this period.</TableCell></TableRow>
            ) : expenses.map(exp => (
              <TableRow key={exp.id}>
                <TableCell className="text-sm">{formatDate(exp.date)}</TableCell>
                <TableCell><Badge variant="secondary">{(exp as Expense & { branches?: { name: string } }).branches?.name}</Badge></TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[exp.category] || 'bg-slate-100 text-slate-700'}`}>{exp.category}</span>
                </TableCell>
                <TableCell className="text-sm text-slate-500">{exp.description ?? '---'}</TableCell>
                <TableCell className="text-right font-semibold text-red-700">{formatCurrency(Number(exp.amount))}</TableCell>
                {!isReadOnly && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(exp)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteExpense(exp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(showAdd || editing) && (
        <AddExpenseModal
          initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchData() }}
        />
      )}
    </div>
  )
}
