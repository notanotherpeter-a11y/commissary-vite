import { supabase } from './supabase'

export type QueuedWrite = {
  id: string
  table: 'expenses' | 'sales'
  payload: Record<string, unknown>
  queuedAt: string
}

const KEY = 'commissary_offline_queue'

export function getQueue(): QueuedWrite[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function enqueue(item: Omit<QueuedWrite, 'id' | 'queuedAt'>): QueuedWrite {
  const entry: QueuedWrite = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queuedAt: new Date().toISOString(),
  }
  const queue = getQueue()
  queue.push(entry)
  localStorage.setItem(KEY, JSON.stringify(queue))
  return entry
}

function removeFromQueue(id: string) {
  const queue = getQueue().filter(item => item.id !== id)
  localStorage.setItem(KEY, JSON.stringify(queue))
}

export async function processQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const item of queue) {
    const { error } = await supabase.from(item.table).insert(item.payload)
    if (error) {
      failed++
    } else {
      removeFromQueue(item.id)
      synced++
    }
  }

  return { synced, failed }
}
