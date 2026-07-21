import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, ShoppingBag } from 'lucide-react'
import type { InventoryItem } from '@/types'
import { formatDate } from '@/lib/utils'

interface InventoryLog {
  id: string
  inventory_id: string
  item_name: string
  action: string
  old_quantity: number | null
  new_quantity: number | null
  note: string | null
  changed_by: string | null
  created_at: string
}

interface Props {
  item?: (InventoryItem & { branches?: { name: string } }) | null
  onClose: () => void
}

function isBranchDeduction(log: InventoryLog) {
  return log.note?.toLowerCase().startsWith('branch order deduction') ?? false
}

function getActionLabel(log: InventoryLog) {
  if (isBranchDeduction(log)) return 'deducted'
  return log.action
}

function getActionStyle(log: InventoryLog) {
  if (isBranchDeduction(log)) return 'bg-purple-100 text-purple-800'
  const map: Record<string, string> = {
    added:   'bg-green-100 text-green-800',
    updated: 'bg-blue-100 text-blue-800',
    deleted: 'bg-red-100 text-red-800',
  }
  return map[log.action] ?? 'bg-slate-100 text-slate-700'
}

export function InventoryHistoryModal({ item, onClose }: Props) {
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLogs() {
      let query = supabase
        .from('inventory_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (item) query = query.eq('inventory_id', item.id)
      const { data } = await query
      setLogs(data ?? [])
      setLoading(false)
    }
    fetchLogs()
  }, [item])

  const title = item ? `History — ${item.name}` : 'Inventory History Log'
  const subtitle = item ? `${item.branches?.name ?? ''} · ${item.category} · ${item.unit}` : 'All changes across inventory items'
  const deductionCount = logs.filter(isBranchDeduction).length

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </DialogHeader>

        {!loading && logs.length > 0 && (
          <div className="flex gap-3 text-xs text-slate-400 border-b pb-3">
            <span>{logs.length} total entries</span>
            {deductionCount > 0 && (
              <span className="flex items-center gap-1 text-purple-700">
                <ShoppingBag className="w-3 h-3" />
                {deductionCount} branch order deduction{deductionCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div className="max-h-[440px] overflow-y-auto pr-1 mt-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center py-12 text-sm text-slate-500">No history yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => {
                const isDeduction = isBranchDeduction(log)
                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${isDeduction ? 'bg-purple-50 border-purple-100' : 'bg-white'}`}
                  >
                    <span className={`mt-0.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getActionStyle(log)}`}>
                      {getActionLabel(log)}
                    </span>
                    <div className="flex-1 min-w-0">
                      {!item && (
                        <p className="text-sm font-semibold text-slate-900 truncate">{log.item_name}</p>
                      )}
                      {(log.old_quantity !== null || log.new_quantity !== null) && (
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          {log.action === 'updated' && log.old_quantity !== null ? (
                            <>
                              <span className="text-slate-400">{log.old_quantity}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                              <span className={isDeduction ? 'text-purple-700' : ''}>{log.new_quantity}</span>
                            </>
                          ) : (
                            <span>{log.new_quantity ?? log.old_quantity}</span>
                          )}
                          {item && <span className="text-xs font-normal text-slate-500">{item.unit}</span>}
                        </div>
                      )}
                      {log.note && (
                        <p className={`text-xs mt-0.5 truncate ${isDeduction ? 'text-purple-700 font-medium' : 'text-slate-500'}`}>
                          {isDeduction && <ShoppingBag className="w-3 h-3 inline mr-1" />}
                          {log.note}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">
                          {formatDate(log.created_at.split('T')[0])}{' '}
                          {new Date(log.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {log.changed_by && (
                          <Badge variant="secondary" className="text-xs py-0 h-4">{log.changed_by}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
