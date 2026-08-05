import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { API_BASE } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/page-header'
import { KpiCard } from '@/components/kpi-card'
import { formatCurrency, formatDate, MONTHS, getCurrentMonthYear } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, CheckCircle, XCircle, FileDown, Printer, Trash2, CalendarDays } from 'lucide-react'
import type { Branch, BranchOrder } from '@/types'
import { AddOrderModal } from '@/components/modals/AddOrderModal'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function BranchPage() {
  const { slug } = useParams<{ slug: string }>()
  const { role, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const now = getCurrentMonthYear()
  const [branch, setBranch] = useState<Branch | null>(null)
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)
  const [orders, setOrders] = useState<BranchOrder[]>([])
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0])
  const [view, setView] = useState<'daily' | 'monthly'>('daily')

  const isAdmin = role === 'admin'

  useEffect(() => {
    if (!slug) return
    supabase.from('branches').select('*').eq('slug', slug).single().then(({ data }) => {
      setBranch(data as Branch ?? null)
    })
  }, [slug])

  // Branch users can only view their own branch
  useEffect(() => {
    if (authLoading || role !== 'branch') return
    const ownSlug = user?.user_metadata?.branch
    if (ownSlug && slug !== ownSlug) {
      navigate(`/branches/${ownSlug}`, { replace: true })
    }
  }, [authLoading, role, user, slug, navigate])

  async function approveOrder(orderId: string, action: 'approve' | 'reject') {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${API_BASE}/api/orders/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ orderId }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast.error(result.error ?? 'Failed to process order')
    } else {
      toast.success(action === 'approve' ? 'Order approved' : 'Order rejected')
      fetchData()
    }
  }

  const fetchData = useCallback(async () => {
    if (!branch || authLoading) return
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data: o } = await supabase.from('branch_orders')
      .select('*, from_branch:from_branch_id(id,slug,name), to_branch:to_branch_id(id,slug,name)')
      .or(`from_branch_id.eq.${branch.id},to_branch_id.eq.${branch.id}`)
      .gte('date', start).lte('date', end)
      .order('date', { ascending: false })

    setOrders(o ?? [])
  }, [branch, month, year, authLoading])

  useEffect(() => { fetchData() }, [fetchData])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const [exporting, setExporting] = useState(false)

  async function handleExportPDF() {
    if (!branch) return
    setExporting(true)
    try {
      const monthLabel = `${MONTHS[month - 1]} ${year}`
      const amber: [number, number, number] = [245, 158, 11]

      const doc = new jsPDF()
      const pw = doc.internal.pageSize.getWidth()

      // Header
      doc.setFillColor(245, 158, 11)
      doc.rect(0, 0, pw, 36, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(branch.name, pw / 2, 13, { align: 'center' })
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Branch Report — ${monthLabel}`, pw / 2, 22, { align: 'center' })
      doc.setFontSize(8)
      doc.text(`Generated: ${new Date().toLocaleString('en-PH')}`, pw / 2, 30, { align: 'center' })
      doc.setTextColor(0, 0, 0)

      let curY = 42

      const renderTable = (head: string[][], body: string[][], footRow?: string[]) => {
        autoTable(doc, {
          startY: curY,
          head,
          body: body.length > 0 ? body : [Array(head[0].length).fill('—')],
          ...(footRow ? { foot: [footRow], footStyles: { fillColor: [248, 250, 252], textColor: [30, 30, 30], fontStyle: 'bold' } } : {}),
          theme: 'striped',
          headStyles: { fillColor: amber, textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        })
        curY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
      }

      // KPI summary box
      const grossTotal = orders.reduce((s, o) => s + Number(o.amount ?? 0), 0)
      doc.setFillColor(255, 251, 235)
      doc.setDrawColor(245, 158, 11)
      doc.roundedRect(14, curY, pw - 28, 14, 2, 2, 'FD')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`Total Orders: ${orders.length}   |   Gross: ${formatCurrency(grossTotal)}`, 20, curY + 9)
      doc.setFont('helvetica', 'normal')
      curY += 20

      // Group orders by date (sorted descending)
      const grouped: Record<string, typeof orders> = {}
      ;[...orders].sort((a, b) => a.date.localeCompare(b.date)).forEach(o => {
        if (!grouped[o.date]) grouped[o.date] = []
        grouped[o.date].push(o)
      })
      const sortedDates = Object.keys(grouped).sort((a, b) => a.localeCompare(b))

      for (const date of sortedDates) {
        const dayOrders = grouped[date]
        const dayTotal = dayOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0)

        // Day header bar
        if (curY > 240) { doc.addPage(); curY = 16 }
        doc.setFillColor(71, 85, 105)
        doc.rect(14, curY, pw - 28, 8, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(formatDate(date), 18, curY + 5.5)
        doc.text(`Daily Total: ${formatCurrency(dayTotal)}`, pw - 16, curY + 5.5, { align: 'right' })
        doc.setTextColor(0, 0, 0)
        curY += 10

        renderTable(
          [['Item', 'Qty', 'Unit Price', 'Amount', 'Status']],
          dayOrders.map(o => {
            const oo = o as BranchOrder & { from_branch?: { name: string }; to_branch?: { name: string } }
            return [
              oo.item,
              String(oo.quantity ?? '—'),
              oo.unit_price ? formatCurrency(Number(oo.unit_price)) : '—',
              oo.amount ? formatCurrency(Number(oo.amount)) : '—',
              oo.status ?? '—',
            ]
          }),
          ['', '', 'Subtotal', formatCurrency(dayTotal), ''],
        )
      }

      doc.save(`${branch.name.replace(/\s+/g, '_')}_Report_${monthLabel.replace(' ', '_')}.pdf`)
      toast.success(`Report exported: ${branch.name} — ${monthLabel}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  async function handleDayPDF(date: string, dayOrders: typeof orders) {
    if (!branch) return
    const amber: [number, number, number] = [245, 158, 11]
    const slate: [number, number, number] = [71, 85, 105]

    // Use A5 portrait for a compact receipt feel
    const doc = new jsPDF({ format: 'a5', orientation: 'portrait' })
    const pw = doc.internal.pageSize.getWidth()   // ~148mm
    const ph = doc.internal.pageSize.getHeight()  // ~210mm

    const dayTotal = dayOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0)
    const pendingCount = dayOrders.filter(o => o.status === 'pending').length

    // ── Amber header ──────────────────────────────────────────────
    doc.setFillColor(...amber)
    doc.rect(0, 0, pw, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('KAMAYAN COMMISSARY', pw / 2, 9, { align: 'center' })
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text('BRANCH ORDER RECEIPT', pw / 2, 15.5, { align: 'center' })
    doc.setFontSize(6.5)
    doc.text(`Printed: ${new Date().toLocaleString('en-PH')}`, pw / 2, 22, { align: 'center' })
    doc.setTextColor(0, 0, 0)

    // ── Branch + Date info block ──────────────────────────────────
    let curY = 33
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(branch.name.toUpperCase(), pw / 2, curY, { align: 'center' })
    curY += 5.5
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...slate)
    doc.text(formatDate(date), pw / 2, curY, { align: 'center' })
    doc.setTextColor(0, 0, 0)
    curY += 5

    // Dashed divider
    doc.setDrawColor(200, 200, 200)
    doc.setLineDashPattern([1.5, 1.5], 0)
    doc.line(10, curY, pw - 10, curY)
    doc.setLineDashPattern([], 0)
    curY += 5

    // ── Items table ───────────────────────────────────────────────
    autoTable(doc, {
      startY: curY,
      head: [['Item', 'Qty', 'Unit Price', 'Amount']],
      body: dayOrders.map(o => [
        o.item,
        String(o.quantity ?? '—'),
        o.unit_price ? `₱${Number(o.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—',
        o.amount ? `₱${Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—',
      ]),
      theme: 'plain',
      headStyles: {
        fillColor: amber,
        textColor: 255,
        fontSize: 7,
        fontStyle: 'bold',
        halign: 'center',
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'right', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 28 },
      },
      margin: { left: 10, right: 10 },
      alternateRowStyles: { fillColor: [253, 251, 246] },
    })

    curY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3

    // Dashed divider
    doc.setDrawColor(200, 200, 200)
    doc.setLineDashPattern([1.5, 1.5], 0)
    doc.line(10, curY, pw - 10, curY)
    doc.setLineDashPattern([], 0)
    curY += 5

    // ── Totals block ──────────────────────────────────────────────
    const totalsLeft = pw / 2 + 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Items ordered:`, totalsLeft, curY)
    doc.text(`${dayOrders.length}`, pw - 10, curY, { align: 'right' })
    curY += 5
    if (pendingCount > 0) {
      doc.setTextColor(...amber)
      doc.text(`Pending approval:`, totalsLeft, curY)
      doc.text(`${pendingCount}`, pw - 10, curY, { align: 'right' })
      doc.setTextColor(0, 0, 0)
      curY += 5
    }

    // Grand total highlight
    doc.setFillColor(245, 158, 11)
    doc.roundedRect(10, curY, pw - 20, 10, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTAL', 16, curY + 6.5)
    doc.text(`₱${dayTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, pw - 14, curY + 6.5, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    curY += 16

    // ── Signature block ───────────────────────────────────────────
    if (curY < ph - 35) {
      doc.setDrawColor(200, 200, 200)
      doc.setLineDashPattern([1.5, 1.5], 0)
      doc.line(10, curY, pw - 10, curY)
      doc.setLineDashPattern([], 0)
      curY += 8

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...slate)

      // Two signature columns
      const col1x = 14
      const col2x = pw / 2 + 6
      const sigLineY = curY + 10

      doc.line(col1x, sigLineY, pw / 2 - 6, sigLineY)
      doc.line(col2x, sigLineY, pw - 14, sigLineY)

      doc.text('Prepared by', col1x, sigLineY + 4.5)
      doc.text('Received by', col2x, sigLineY + 4.5)

      doc.setTextColor(0, 0, 0)
      curY = sigLineY + 10
    }

    // ── Footer ────────────────────────────────────────────────────
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(160, 160, 160)
    doc.text('Thank you! — Kamayan Commissary', pw / 2, ph - 8, { align: 'center' })

    const filename = `Receipt_${branch.name.replace(/\s+/g, '_')}_${date}.pdf`
    doc.save(filename)
    toast.success(`Receipt exported: ${formatDate(date)}`)
  }

  async function deleteOrder(orderId: string) {
    if (!confirm('Delete this order?')) return
    const { error } = await supabase.from('branch_orders').delete().eq('id', orderId)
    if (error) { toast.error('Failed to delete order'); return }
    toast.success('Order deleted')
    fetchData()
  }

  if (!branch) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        Loading branch...
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={branch.name}
        description="Branch performance and records"
        action={
          <Button
            variant="outline"
            size="sm"
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
            disabled={exporting}
            onClick={handleExportPDF}
          >
            {exporting
              ? <><span className="w-4 h-4 mr-1 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />Exporting…</>
              : <><FileDown className="w-4 h-4 mr-1" />Export PDF</>}
          </Button>
        }
      />

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('daily')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${view === 'daily' ? 'bg-amber-500 text-black' : 'bg-white border text-slate-500 hover:bg-slate-50'}`}
        >
          <CalendarDays className="w-3.5 h-3.5" /> Daily
        </button>
        <button
          onClick={() => setView('monthly')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${view === 'monthly' ? 'bg-amber-500 text-black' : 'bg-white border text-slate-500 hover:bg-slate-50'}`}
        >
          Monthly
        </button>
      </div>

      {view === 'daily' && (() => {
        // Days that have orders in the loaded month
        const daysWithOrders = Array.from(new Set(orders.map(o => o.date))).sort((a, b) => b.localeCompare(a))
        // If current dailyDate isn't in this month's data, fall back to most recent day
        const effectiveDate = daysWithOrders.includes(dailyDate) ? dailyDate : (daysWithOrders[0] ?? dailyDate)
        const dayOrders = orders.filter(o => o.date === effectiveDate)
        const dayTotal = dayOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0)
        return (
          <div className="space-y-4 mb-6">
            {/* Month/Year + Day selectors */}
            <div className="flex gap-2 flex-wrap">
              <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v ?? 0)); setDailyDate('') }}>
                <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => { setYear(Number(v ?? 0)); setDailyDate('') }}>
                <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={effectiveDate} onValueChange={v => setDailyDate(v)}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <span className="truncate">{effectiveDate ? formatDate(effectiveDate) : 'Select day…'}</span>
                </SelectTrigger>
                <SelectContent>
                  {daysWithOrders.length === 0
                    ? <SelectItem value="_none" disabled>No orders this month</SelectItem>
                    : daysWithOrders.map(d => (
                        <SelectItem key={d} value={d}>{formatDate(d)}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Daily tracker card */}
            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
              {/* Card header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-500">
                <CalendarDays className="w-4 h-4 text-black" />
                <span className="text-sm font-bold text-black">Daily Order Tracker</span>
                <span className="ml-auto text-xs font-medium text-black/70">{effectiveDate ? formatDate(effectiveDate) : '—'}</span>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-3 divide-x border-b">
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-slate-400">Orders</p>
                  <p className="text-lg font-bold text-slate-800">{dayOrders.length}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-slate-400">Approved</p>
                  <p className="text-lg font-bold text-green-600">{dayOrders.filter(o => o.status === 'approved').length}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-slate-400">Daily Total</p>
                  <p className="text-lg font-bold text-amber-600">₱{dayTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Order rows */}
              {dayOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No orders on {formatDate(effectiveDate)}</div>
              ) : (
                <div className="divide-y">
                  {dayOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-700">{o.item}</span>
                        <span className="text-xs text-slate-400">x {o.quantity}</span>
                        {o.unit_price && (
                          <span className="text-xs text-slate-400">@ ₱{Number(o.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          o.status === 'approved' ? 'bg-green-100 text-green-700' :
                          o.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{o.status}</span>
                        {isAdmin && o.status === 'pending' && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" title="Approve" onClick={() => approveOrder(o.id, 'approve')}><CheckCircle className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" title="Reject" onClick={() => approveOrder(o.id, 'reject')}><XCircle className="w-4 h-4" /></Button>
                          </div>
                        )}
                        {o.status === 'pending' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" title="Delete order" onClick={() => deleteOrder(o.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        )}
                        <span className="font-semibold text-slate-800 shrink-0">
                          {o.amount ? `₱${Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer with Print */}
              {dayOrders.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t">
                  <span className="text-xs text-slate-500">{dayOrders.length} item{dayOrders.length !== 1 ? 's' : ''}</span>
                  <Button variant="outline" size="sm" className="h-7 px-3 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                    onClick={() => handleDayPDF(effectiveDate, dayOrders)}>
                    <Printer className="w-3.5 h-3.5 mr-1" /> Print Receipt
                  </Button>
                </div>
              )}
            </div>

            {/* Order from Commissary button */}
            {(role === 'branch' || role === 'admin') && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowAddOrder(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
                  <Plus className="w-4 h-4 mr-1" /> Order from Commissary
                </Button>
              </div>
            )}
          </div>
        )
      })()}

      {view === 'monthly' && (
        <>
          <div className="flex gap-2 mb-4">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v ?? 0))}>
              <SelectTrigger className="w-36 h-8 text-sm"><span className="truncate">{MONTHS[month - 1]}</span></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? 0))}>
              <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <KpiCard label="Total Orders" value={String(orders.length)} variant="green" />
            <KpiCard label="Gross Orders" value={formatCurrency(orders.reduce((s, o) => s + Number(o.amount ?? 0), 0))} variant="green" />
          </div>

          {(role === 'branch' || role === 'admin') && (
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setShowAddOrder(true)} className="bg-amber-500 hover:bg-amber-600 text-black">
                <Plus className="w-4 h-4 mr-1" /> Order from Commissary
              </Button>
            </div>
          )}

          {/* Group orders by date */}
          {(() => {
            const grouped: Record<string, typeof orders> = {}
            orders.forEach(o => {
              const key = o.date
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(o)
            })
            const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

            if (sortedDates.length === 0) {
              return <div className="text-center py-10 text-slate-500 text-sm">No orders this period.</div>
            }

            return (
              <div className="space-y-4">
                {sortedDates.map(date => {
                  const dayOrders = grouped[date]
                  const dayTotal = dayOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0)
                  return (
                    <div key={date} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
                        <span className="text-sm font-semibold text-slate-700">{formatDate(date)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-amber-600">
                            Daily Total: ₱{dayTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                            onClick={() => handleDayPDF(date, dayOrders)}
                          >
                            <Printer className="w-3.5 h-3.5 mr-1" /> Print
                          </Button>
                        </div>
                      </div>
                  <div className="divide-y">
                    {dayOrders.map(o => (
                      <div key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-700">{o.item}</span>
                          <span className="text-xs text-slate-400">x {o.quantity}</span>
                          {o.unit_price && (
                            <span className="text-xs text-slate-400">@ ₱{Number(o.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            o.status === 'approved' ? 'bg-green-100 text-green-700' :
                            o.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {o.status}
                          </span>
                          {isAdmin && o.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" title="Approve" onClick={() => approveOrder(o.id, 'approve')}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" title="Reject" onClick={() => approveOrder(o.id, 'reject')}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                          {o.status === 'pending' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" title="Delete order" onClick={() => deleteOrder(o.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <span className="font-semibold text-slate-800 shrink-0">
                            {o.amount ? `₱${Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
        </>
      )}

      {showAddOrder && (
        <AddOrderModal
          toBranchId={branch.id}
          toBranchName={branch.name}
          onClose={() => setShowAddOrder(false)}
          onSaved={() => { setShowAddOrder(false); fetchData() }}
        />
      )}
    </div>
  )
}
