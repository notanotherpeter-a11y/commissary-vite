import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

// CORS middleware
app.use(
  '/api/*',
  cors({
    origin: ['https://www.kamayanresto.com', 'http://localhost:5173'],
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

// Helper: extract Bearer token and verify user is admin
async function verifyAdmin(
  authHeader: string | undefined,
  env: Env
): Promise<{ user: { id: string; user_metadata: Record<string, unknown> } } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)

  // Use anon key + token to verify identity
  const anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error } = await anonClient.auth.getUser(token)
  if (error || !user) return null
  if (user.user_metadata?.role !== 'admin') return null
  return { user: { id: user.id, user_metadata: user.user_metadata as Record<string, unknown> } }
}

// Helper: service-role admin DB client
function adminDb(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// POST /api/orders/approve
app.post('/api/orders/approve', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { orderId } = body
  if (!orderId) return c.json({ error: 'Missing orderId' }, 400)

  const db = adminDb(c.env)

  // Fetch the order
  const { data: order, error: orderFetchErr } = await db
    .from('branch_orders')
    .select('*, to_branch:to_branch_id(id, name)')
    .eq('id', orderId)
    .single()

  if (orderFetchErr || !order) {
    return c.json({ error: 'Order not found' }, 404)
  }

  if (order.status !== 'pending') {
    return c.json({ error: `Order is already ${order.status}` }, 409)
  }

  // Find matching inventory item (exact name match, trimmed)
  const itemName = (order.item ?? '').trim()
  const { data: invItems } = await db
    .from('inventory')
    .select('id, name, unit, quantity')
    .eq('name', itemName)

  const invItem = invItems?.[0]
  if (!invItem) {
    return c.json(
      { error: `No inventory item found matching "${itemName}". Update inventory first.` },
      422
    )
  }

  // Check stock
  const ordered = order.quantity ?? 1
  if (invItem.quantity < ordered) {
    return c.json(
      { error: `Insufficient stock: only ${invItem.quantity} available, ${ordered} requested.` },
      422
    )
  }

  const newQty = invItem.quantity - ordered
  const toBranchName = (order.to_branch as { name?: string } | null)?.name ?? 'Branch'

  // Deduct inventory
  const { error: invErr } = await db
    .from('inventory')
    .update({ quantity: newQty, updated_at: new Date().toISOString() })
    .eq('id', invItem.id)

  if (invErr) {
    return c.json({ error: 'Failed to update inventory: ' + invErr.message }, 500)
  }

  // Write inventory log
  await db.from('inventory_logs').insert({
    inventory_id: invItem.id,
    item_name: invItem.name,
    action: 'updated',
    old_quantity: invItem.quantity,
    new_quantity: newQty,
    note: `Branch order deduction — ${toBranchName} (${ordered} ${invItem.unit})`,
    changed_by: (auth.user.user_metadata?.username as string) ?? 'admin',
  })

  // Approve the order
  const { error: approveErr } = await db
    .from('branch_orders')
    .update({ status: 'approved' })
    .eq('id', orderId)

  if (approveErr) {
    return c.json({ error: 'Order approval failed: ' + approveErr.message }, 500)
  }

  return c.json({
    success: true,
    message: `Approved — ${ordered} ${invItem.unit} of "${invItem.name}" deducted from inventory`,
    newInventoryQty: newQty,
  })
})

// POST /api/orders/reject
app.post('/api/orders/reject', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { orderId } = body
  if (!orderId) return c.json({ error: 'Missing orderId' }, 400)

  const db = adminDb(c.env)

  // Verify order exists and is pending
  const { data: order, error: fetchErr } = await db
    .from('branch_orders')
    .select('id, status, item')
    .eq('id', orderId)
    .single()

  if (fetchErr || !order) {
    return c.json({ error: 'Order not found' }, 404)
  }

  if (order.status !== 'pending') {
    return c.json({ error: `Order is already ${order.status}` }, 409)
  }

  const { error } = await db
    .from('branch_orders')
    .update({ status: 'rejected' })
    .eq('id', orderId)

  if (error) {
    return c.json({ error: 'Failed to reject: ' + error.message }, 500)
  }

  return c.json({ success: true, message: 'Order rejected' })
})

// POST /api/inventory/adjust
app.post('/api/inventory/adjust', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { inventoryId, mode, amount, price } = body
  // mode: 'add' | 'subtract'
  // price: only required for 'add'

  if (!inventoryId || !mode || !amount || amount <= 0) {
    return c.json({ error: 'Invalid input' }, 400)
  }

  if (mode === 'add' && (!price || price <= 0)) {
    return c.json({ error: 'Price is required when adding stock' }, 400)
  }

  const db = adminDb(c.env)

  // Fetch current inventory item
  const { data: item, error: fetchErr } = await db
    .from('inventory')
    .select('id, name, unit, quantity, price')
    .eq('id', inventoryId)
    .single()

  if (fetchErr || !item) {
    return c.json({ error: 'Inventory item not found' }, 404)
  }

  const newQty = mode === 'add'
    ? Number(item.quantity) + Number(amount)
    : Number(item.quantity) - Number(amount)

  if (newQty < 0) {
    return c.json(
      { error: `Cannot subtract ${amount} — only ${item.quantity} in stock` },
      422
    )
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    quantity: newQty,
    updated_at: new Date().toISOString(),
  }
  if (mode === 'add') updatePayload.price = price

  const { error: updateErr } = await db
    .from('inventory')
    .update(updatePayload)
    .eq('id', inventoryId)

  if (updateErr) {
    return c.json({ error: 'Failed to update inventory: ' + updateErr.message }, 500)
  }

  // Write log
  await db.from('inventory_logs').insert({
    inventory_id: item.id,
    item_name: item.name,
    action: 'updated',
    old_quantity: Number(item.quantity),
    new_quantity: newQty,
    note: mode === 'add'
      ? `Stock added — ₱${Number(price).toLocaleString('en-PH', { minimumFractionDigits: 2 })} / ${item.unit}`
      : 'Stock subtracted',
    changed_by: (auth.user.user_metadata?.username as string) ?? 'admin',
    ...(mode === 'add' ? { unit_price: price } : {}),
  })

  return c.json({
    success: true,
    newQty,
    message: `${mode === 'add' ? '+' : '-'}${amount} ${item.unit} — ${item.name}`,
  })
})

export default app
