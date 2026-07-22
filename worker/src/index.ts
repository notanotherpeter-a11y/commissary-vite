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
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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

// GET /api/admin/list-users
app.get('/api/admin/list-users', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const { data, error } = await adminDb(c.env).auth.admin.listUsers()
  if (error) return c.json({ error: error.message }, 500)

  const users = (data?.users ?? []).map((u: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => ({
    id: u.id,
    email: u.email ?? '',
    role: u.user_metadata?.role ?? null,
    branch: u.user_metadata?.branch ?? null,
  }))

  return c.json({ users })
})

// POST /api/admin/update-password
app.post('/api/admin/update-password', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { userId, password } = body
  if (!userId) return c.json({ error: 'userId is required' }, 400)
  if (!password || password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

  const { error } = await adminDb(c.env).auth.admin.updateUserById(userId, { password })
  if (error) return c.json({ error: error.message }, 500)

  return c.json({ success: true })
})

// POST /api/admin/update-role
app.post('/api/admin/update-role', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { userId, role } = body
  const validRoles = ['admin', 'investor', 'branch']
  if (!userId) return c.json({ error: 'userId is required' }, 400)
  if (!role || !validRoles.includes(role)) return c.json({ error: 'Invalid role' }, 400)

  const { error } = await adminDb(c.env).auth.admin.updateUserById(userId, { user_metadata: { role } })
  if (error) return c.json({ error: error.message }, 500)

  return c.json({ success: true })
})

// POST /api/admin/create-user
app.post('/api/admin/create-user', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { email, password, role, branch } = body
  if (!email) return c.json({ error: 'email is required' }, 400)
  if (!password || password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)
  if (!role) return c.json({ error: 'role is required' }, 400)

  const userMeta: Record<string, unknown> = { role }
  if (role === 'branch' && branch) userMeta.branch = branch

  const { data, error } = await adminDb(c.env).auth.admin.createUser({
    email,
    password,
    user_metadata: userMeta,
    email_confirm: true,
  })
  if (error) return c.json({ error: error.message }, 500)

  const u = data.user
  return c.json({
    user: {
      id: u.id,
      email: u.email ?? email,
      role,
      branch: branch ?? null,
    },
  })
})

// DELETE /api/admin/delete-user
app.delete('/api/admin/delete-user', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { userId } = body
  if (!userId) return c.json({ error: 'userId is required' }, 400)
  if (userId === auth.user.id) return c.json({ error: 'Cannot delete your own account' }, 400)

  const { error } = await adminDb(c.env).auth.admin.deleteUser(userId)
  if (error) return c.json({ error: error.message }, 500)

  return c.json({ success: true })
})

// DELETE /api/admin/clear-month-data
// Body: { year: number, month: number, tables: string[] }
// Clears transactional data for the given month across selected tables
app.delete('/api/admin/clear-month-data', async (c) => {
  const auth = await verifyAdmin(c.req.header('Authorization'), c.env)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { year, month, tables } = body as { year: number; month: number; tables: string[] }

  if (!year || !month || !tables || !tables.length) {
    return c.json({ error: 'year, month and tables are required' }, 400)
  }

  const ALLOWED_TABLES = ['sales', 'expenses', 'branch_orders', 'salary_payments', 'receivables', 'inventory_logs']
  const invalid = tables.filter((t: string) => !ALLOWED_TABLES.includes(t))
  if (invalid.length) return c.json({ error: `Invalid tables: ${invalid.join(', ')}` }, 400)

  const db = adminDb(c.env)
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const start = `${year}-${pad(month)}-01`
  const end   = `${year}-${pad(month)}-${lastDay}`

  const results: Record<string, number> = {}

  for (const table of tables) {
    const dateCol = table === 'inventory_logs' ? 'created_at' : 'date'
    const { count, error } = await db
      .from(table)
      .delete({ count: 'exact' })
      .gte(dateCol, table === 'inventory_logs' ? `${start}T00:00:00` : start)
      .lte(dateCol, table === 'inventory_logs' ? `${end}T23:59:59` : end)
    if (error) return c.json({ error: `Failed on ${table}: ${error.message}` }, 500)
    results[table] = count ?? 0
  }

  const total = Object.values(results).reduce((s, n) => s + n, 0)
  return c.json({ success: true, deleted: results, total })
})

export default app
