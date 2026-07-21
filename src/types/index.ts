export type UserRole = 'admin' | 'investor' | 'branch'
export type BranchSlug = 'cainta' | 'marikina' | 'antipolo' | 'taytay' | 'quezon_city'

export interface UserMetadata {
  role: UserRole
  branch: BranchSlug | null
}

export interface Branch {
  id: number
  slug: BranchSlug
  name: string
}

export interface Sale {
  id: string
  branch_id: number
  date: string
  amount: number
  notes: string | null
  created_at: string
  branches?: Branch
}

export interface Expense {
  id: string
  branch_id: number
  date: string
  category: string
  amount: number
  description: string | null
  created_at: string
  branches?: Branch
}

export interface Employee {
  id: string
  name: string
  branch_id: number
  base_salary: number
  created_at: string
  branches?: Branch
}

export interface SalaryPayment {
  id: string
  employee_id: string
  date: string
  amount: number
  note: string | null
  created_at: string
  employees?: Employee
}

export interface Receivable {
  id: string
  description: string
  amount: number
  branch_id: number | null
  date: string
  created_at: string
  branches?: Branch
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  quantity: number
  min_quantity: number
  price: number
  branch_id: number
  updated_at: string
  branches?: Branch
}

export type OrderStatus = 'pending' | 'approved' | 'rejected'

export interface BranchOrder {
  id: string
  from_branch_id: number | null
  to_branch_id: number | null
  item: string
  quantity: number | null
  unit_price: number | null
  amount: number | null
  date: string
  notes: string | null
  status: OrderStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
  from_branch?: Branch
  to_branch?: Branch
}

export interface AuditLog {
  id: string
  table_name: string
  action: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  user_id: string | null
  user_role: string | null
  performed_at: string
}

export const BRANCHES: { slug: BranchSlug; name: string }[] = [
  { slug: 'cainta', name: 'Cainta' },
  { slug: 'marikina', name: 'Marikina' },
  { slug: 'antipolo', name: 'Antipolo' },
  { slug: 'taytay', name: 'Taytay' },
  { slug: 'quezon_city', name: 'Quezon City' },
]

export const EXPENSE_CATEGORIES = ['Restock', 'Marketing', 'Salary', 'Utilities', 'Transport', 'Other']

export interface MenuItem {
  id: string
  name: string
  category: string
  price: number
  unit: string | null
  is_available: boolean
  branch_id: number | null
  sort_order: number
  created_at: string
}
