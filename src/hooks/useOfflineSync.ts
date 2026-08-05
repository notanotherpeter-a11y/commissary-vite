import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { getQueue, processQueue } from '@/lib/offline-queue'

export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(() => getQueue().length)

  const refresh = useCallback(() => {
    setPendingCount(getQueue().length)
  }, [])

  const sync = useCallback(async () => {
    const queue = getQueue()
    if (queue.length === 0) return
    const toastId = toast.loading(`Syncing ${queue.length} pending item${queue.length > 1 ? 's' : ''}…`)
    const { synced, failed } = await processQueue()
    setPendingCount(getQueue().length)
    if (failed === 0) {
      toast.success(`${synced} item${synced > 1 ? 's' : ''} synced successfully`, { id: toastId })
    } else {
      toast.warning(`${synced} synced, ${failed} failed — will retry when online`, { id: toastId })
    }
  }, [])

  useEffect(() => {
    const onOnline = () => sync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [sync])

  return { pendingCount, refresh }
}
