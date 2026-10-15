-- ============================================================================
-- Vaypar — Supabase Initial Schema Migration
-- Covers all business modules: Core, Restaurant, Gym, Tailor, Salon, Pharmacy
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Core Business Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  logo_uri TEXT DEFAULT '',
  business_category TEXT DEFAULT 'general',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, -- matches Supabase auth UID or local staff UID
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee', -- owner, manager, employee, waiter, kitchen, cook, cashier, receptionist
  name TEXT DEFAULT 'User',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  salary NUMERIC DEFAULT 0,
  joining_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active', -- active, inactive
  push_token TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  created_by TEXT DEFAULT '',
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  category TEXT DEFAULT '',
  low_stock_threshold INTEGER DEFAULT 5,
  image_uri TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  created_by TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  price NUMERIC DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  total NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  created_by TEXT DEFAULT '',
  title TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  category TEXT DEFAULT '',
  date TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  credit_limit NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  total_debit NUMERIC DEFAULT 0,
  total_credit NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  last_transaction_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES credit_accounts(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- debit, credit
  amount NUMERIC DEFAULT 0,
  description TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installment_accounts (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  created_by TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  total_amount NUMERIC DEFAULT 0,
  down_payment NUMERIC DEFAULT 0,
  remaining_amount NUMERIC DEFAULT 0,
  months_tenure INTEGER DEFAULT 12,
  interest_rate NUMERIC DEFAULT 0,
  monthly_emi NUMERIC DEFAULT 0,
  next_due_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active', -- active, completed, defaulted
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installment_payments (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES installment_accounts(id) ON DELETE CASCADE,
  amount_paid NUMERIC DEFAULT 0,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  month TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  deduction NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'unpaid', -- paid, unpaid
  payment_date TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  user_id TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  action TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT DEFAULT '',
  title TEXT DEFAULT '',
  message TEXT DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  target_role TEXT DEFAULT '', -- optional: restrict to specific role
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Restaurant Module ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'available', -- available, occupied, reserved
  current_order_id TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_menu_categories (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_menu_items (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES restaurant_menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  description TEXT DEFAULT '',
  image_uri TEXT DEFAULT '',
  available BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS restaurant_orders (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  table_id TEXT REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_number TEXT DEFAULT '',
  status TEXT DEFAULT 'pending', -- pending, preparing, ready, served, cancelled
  waiter_id TEXT DEFAULT '',
  waiter_name TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  menu_item_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  total NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' -- pending, preparing, ready
);

-- ─── Gym Module ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gym_plans (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_months INTEGER DEFAULT 1,
  price NUMERIC DEFAULT 0,
  features TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS gym_members (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  plan_id TEXT REFERENCES gym_plans(id) ON DELETE SET NULL,
  plan_name TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  fee_paid NUMERIC DEFAULT 0,
  fee_due NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, expired, cancelled
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS gym_attendance (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES gym_members(id) ON DELETE CASCADE,
  check_in TIMESTAMPTZ DEFAULT NOW(),
  check_out TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tailor Module ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tailor_orders (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  garment_type TEXT DEFAULT '',
  measurements TEXT DEFAULT '{}', -- JSON string of measurements
  fabric_details TEXT DEFAULT '',
  price NUMERIC DEFAULT 0,
  advance_paid NUMERIC DEFAULT 0,
  delivery_date TEXT DEFAULT '',
  trial_date TEXT DEFAULT '',
  status TEXT DEFAULT 'pending', -- pending, cutting, stitching, trial, ready, delivered, cancelled
  notes TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Salon Module ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salon_services (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT '', -- Hair, Makeup, Spa, Bridal, Nails, etc.
  price NUMERIC DEFAULT 0,
  duration_minutes INTEGER DEFAULT 30,
  description TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS salon_appointments (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  service_id TEXT REFERENCES salon_services(id) ON DELETE SET NULL,
  service_name TEXT DEFAULT '',
  staff_id TEXT DEFAULT '',
  staff_name TEXT DEFAULT '',
  appointment_date TEXT NOT NULL, -- YYYY-MM-DD
  appointment_time TEXT NOT NULL, -- HH:MM
  duration_minutes INTEGER DEFAULT 30,
  price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled, no_show
  notes TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_business ON profiles(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_business ON credit_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_installments_business ON installment_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_business ON activity_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_business ON restaurant_tables(business_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_business ON restaurant_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_gym_members_business ON gym_members(business_id);
CREATE INDEX IF NOT EXISTS idx_tailor_orders_business ON tailor_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_salon_appointments_business ON salon_appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_salon_services_business ON salon_services(business_id);

-- Last updated indexes for sync
CREATE INDEX IF NOT EXISTS idx_products_last_updated ON products(last_updated);
CREATE INDEX IF NOT EXISTS idx_invoices_last_updated ON invoices(last_updated);
CREATE INDEX IF NOT EXISTS idx_expenses_last_updated ON expenses(last_updated);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_last_updated ON restaurant_orders(last_updated);

-- ─── Row Level Security (RLS) ────────────────────────────────────────────────

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access rows belonging to their business
-- We use a helper function that looks up the authenticated user's business_id from profiles

CREATE OR REPLACE FUNCTION auth_business_id()
RETURNS TEXT AS $$
  SELECT business_id FROM profiles WHERE id = auth.uid()::TEXT LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Macro for creating business-scoped RLS policies
-- Applied to all business-scoped tables

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'products', 'invoices', 'expenses', 'customers',
    'credit_accounts', 'credit_transactions', 'installment_accounts',
    'salary_payments', 'activity_logs', 'notifications',
    'restaurant_tables', 'restaurant_menu_categories', 'restaurant_menu_items',
    'restaurant_orders', 'gym_plans', 'gym_members', 'gym_attendance',
    'tailor_orders', 'salon_services', 'salon_appointments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "business_scope_%s" ON %I;', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "business_scope_%s" ON %I
        FOR ALL USING (business_id = auth_business_id())
        WITH CHECK (business_id = auth_business_id());
    ', tbl, tbl);
  END LOOP;
END $$;

-- Profiles: user can read all profiles in their business, write only own
DROP POLICY IF EXISTS "profiles_read_business" ON profiles;
CREATE POLICY "profiles_read_business" ON profiles
  FOR SELECT USING (business_id = auth_business_id() OR id = auth.uid()::TEXT);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::TEXT);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::TEXT OR business_id = auth_business_id())
  WITH CHECK (id = auth.uid()::TEXT OR business_id = auth_business_id());

-- Businesses: authenticated users can register a business, members can read their business, owner can update
DROP POLICY IF EXISTS "businesses_insert_authenticated" ON businesses;
CREATE POLICY "businesses_insert_authenticated" ON businesses
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "businesses_read" ON businesses;
CREATE POLICY "businesses_read" ON businesses
  FOR SELECT USING (id = auth_business_id() OR id IN (SELECT business_id FROM profiles WHERE id = auth.uid()::TEXT));

DROP POLICY IF EXISTS "businesses_update" ON businesses;
CREATE POLICY "businesses_update" ON businesses
  FOR UPDATE TO authenticated
  USING (id = auth_business_id() OR id IN (SELECT business_id FROM profiles WHERE id = auth.uid()::TEXT AND role = 'owner'))
  WITH CHECK (id = auth_business_id() OR id IN (SELECT business_id FROM profiles WHERE id = auth.uid()::TEXT AND role = 'owner'));

-- Invoice items: access through parent invoice
DROP POLICY IF EXISTS "invoice_items_policy" ON invoice_items;
CREATE POLICY "invoice_items_policy" ON invoice_items
  FOR ALL USING (
    invoice_id IN (SELECT id FROM invoices WHERE business_id = auth_business_id())
  );

-- Installment payments: access through parent account
DROP POLICY IF EXISTS "installment_payments_policy" ON installment_payments;
CREATE POLICY "installment_payments_policy" ON installment_payments
  FOR ALL USING (
    account_id IN (SELECT id FROM installment_accounts WHERE business_id = auth_business_id())
  );

-- Restaurant order items: access through parent order
DROP POLICY IF EXISTS "restaurant_order_items_policy" ON restaurant_order_items;
CREATE POLICY "restaurant_order_items_policy" ON restaurant_order_items
  FOR ALL USING (
    order_id IN (SELECT id FROM restaurant_orders WHERE business_id = auth_business_id())
  );

-- Gym attendance: access through parent member
DROP POLICY IF EXISTS "gym_attendance_policy" ON gym_attendance;
CREATE POLICY "gym_attendance_policy" ON gym_attendance
  FOR ALL USING (business_id = auth_business_id());

-- ─── Realtime Publication ────────────────────────────────────────────────────

-- Safely add key tables to realtime publication without duplicating
DO $$
DECLARE
  tbl TEXT;
  realtime_tables TEXT[] := ARRAY[
    'profiles', 'notifications', 'restaurant_orders', 'restaurant_order_items',
    'products', 'invoices', 'salon_appointments', 'gym_members'
  ];
BEGIN
  FOREACH tbl IN ARRAY realtime_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', tbl);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;
