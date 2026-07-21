import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string
  subtext?: string
  accent?: boolean
  variant?: 'default' | 'green' | 'red' | 'amber'
}

export function KpiCard({ label, value, subtext, accent, variant = 'default' }: KpiCardProps) {
  return (
    <Card className={cn('border', accent && 'border-amber-400 bg-amber-50')}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
          {label}
        </p>
        <p
          className={cn(
            'text-2xl font-bold',
            variant === 'green' && 'text-green-700',
            variant === 'red' && 'text-red-600',
            variant === 'amber' && 'text-amber-700',
            variant === 'default' && 'text-slate-900'
          )}
        >
          {value}
        </p>
        {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  )
}
