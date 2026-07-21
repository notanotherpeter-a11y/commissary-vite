import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, ArrowLeft } from 'lucide-react'
import type { Branch, Employee } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { AddEmployeeModal } from '@/components/modals/AddEmployeeModal'
import { PaymentCalendar } from '@/components/PaymentCalendar'

export function SalaryPage() {
  const { role, branch: userBranchSlug } = useAuth()
  const userMeta = { role: role ?? 'branch', branch: userBranchSlug }
  const [branches, setBranches] = useState<Branch[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      setBranches((data ?? []) as Branch[])
    })
  }, [])

  const userBranch = userMeta.role === 'branch' ? branches.find(b => b.slug === userMeta.branch) : null
  const isReadOnly = userMeta.role === 'investor'

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('employees').select('*, branches(id,slug,name)').order('name')
    if (userBranch) query = query.eq('branch_id', userBranch.id)
    const { data } = await query
    setEmployees(data ?? [])
    setLoading(false)
  }, [userBranch])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  useEffect(() => {
    const ch = supabase.channel('employees-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, fetchEmployees)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchEmployees])

  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))

  if (selected) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-semibold text-slate-900">{selected.name}</h1>
          <Badge variant="secondary">{(selected as Employee & { branches?: { name: string } }).branches?.name}</Badge>
        </div>
        <PaymentCalendar employee={selected} isReadOnly={isReadOnly} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Salary"
        description="Manage employee daily salary payments"
        action={!isReadOnly && userMeta.role === 'admin' && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
            <Plus className="w-4 h-4 mr-1" /> Add Employee
          </Button>
        )}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p>No employees found.</p>
          {!isReadOnly && userMeta.role === 'admin' && (
            <Button variant="link" onClick={() => setShowAdd(true)}>Add first employee</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(emp => (
            <button key={emp.id} onClick={() => setSelected(emp)} className="bg-white rounded-lg border p-4 text-left hover:border-amber-400 hover:shadow-sm transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold text-sm">
                  {emp.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-900 group-hover:text-amber-700 transition-colors">{emp.name}</p>
                  <p className="text-xs text-slate-500">
                    {(emp as Employee & { branches?: { name: string } }).branches?.name} · Base: {formatCurrency(Number(emp.base_salary))}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <AddEmployeeModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchEmployees() }} />
      )}
    </div>
  )
}
