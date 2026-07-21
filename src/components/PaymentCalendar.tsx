import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cn, formatCurrency, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { Employee, SalaryPayment } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { KpiCard } from '@/components/kpi-card'

interface Props {
  employee: Employee
  isReadOnly: boolean
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function PaymentCalendar({ employee, isReadOnly }: Props) {
  const now = getCurrentMonthYear()
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [payments, setPayments] = useState<SalaryPayment[]>([])
  const [selected, setSelected] = useState<{ date: string; payment: SalaryPayment | null } | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchPayments = useCallback(async () => {
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    const { data } = await supabase
      .from('salary_payments')
      .select('*')
      .eq('employee_id', employee.id)
      .gte('date', start)
      .lte('date', end)
    setPayments(data ?? [])
  }, [employee.id, month, year])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const paymentMap = new Map(payments.map(p => [p.date, p]))

  const firstDay = new Date(year, month - 1, 1).getDay()
  const lastDay = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function handleDayClick(day: number) {
    if (isReadOnly) return
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const existing = paymentMap.get(dateStr) ?? null
    setSelected({ date: dateStr, payment: existing })
    setAmount(String(existing?.amount ?? employee.base_salary ?? ''))
    setNote(existing?.note ?? '')
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function savePayment() {
    if (!selected || !amount) return
    setSaving(true)
    const payload = { employee_id: employee.id, date: selected.date, amount: Number(amount), note: note || null }
    let error
    if (selected.payment) {
      ({ error } = await supabase.from('salary_payments').update(payload).eq('id', selected.payment.id))
    } else {
      ({ error } = await supabase.from('salary_payments').insert(payload))
    }
    if (error) toast.error('Failed: ' + error.message)
    else { toast.success('Payment saved'); fetchPayments(); setSelected(null) }
    setSaving(false)
  }

  async function deletePayment() {
    if (!selected?.payment) return
    await supabase.from('salary_payments').delete().eq('id', selected.payment.id)
    toast.success('Payment removed')
    fetchPayments()
    setSelected(null)
  }

  const monthTotal = payments.reduce((s, p) => s + Number(p.amount), 0)
  const daysPaid = payments.length

  const [allTime, setAllTime] = useState(0)
  useEffect(() => {
    supabase.from('salary_payments').select('amount').eq('employee_id', employee.id).then(({ data }) => {
      setAllTime((data ?? []).reduce((s, p) => s + Number(p.amount), 0))
    })
  }, [employee.id, payments])

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Month Total" value={formatCurrency(monthTotal)} variant="green" />
        <KpiCard label="Days Paid" value={String(daysPaid)} />
        <KpiCard label="All-time Total" value={formatCurrency(allTime)} accent />
      </div>

      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="font-semibold text-slate-900">{MONTHS[month - 1]} {year}</h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const payment = paymentMap.get(dateStr)
            return (
              <button
                key={i}
                onClick={() => handleDayClick(day)}
                disabled={isReadOnly}
                className={cn(
                  'h-12 rounded-md flex flex-col items-center justify-center transition-all text-sm',
                  payment ? 'bg-green-100 border border-green-300 text-green-800 font-medium hover:bg-green-200' : 'hover:bg-slate-100 text-slate-700',
                  isReadOnly && 'cursor-default'
                )}
              >
                <span>{day}</span>
                {payment && (
                  <span className="text-[10px] leading-none mt-0.5 text-green-700">
                    ₱{Number(payment.amount).toLocaleString()}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selected && !isReadOnly && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Payment — {selected.date}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Amount (₱)</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Note…" />
              </div>
              <div className="flex gap-2 pt-2">
                {selected.payment && (
                  <Button variant="destructive" size="sm" onClick={deletePayment}>Remove</Button>
                )}
                <Button variant="outline" onClick={() => setSelected(null)} className="flex-1">Cancel</Button>
                <Button onClick={savePayment} disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
