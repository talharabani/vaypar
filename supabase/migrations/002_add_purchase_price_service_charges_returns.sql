-- Migration 002: Add purchase_price, service_charges, and returns_exchanges table

-- 1. Products purchase price column
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC DEFAULT 0;

-- 2. Invoices service charges column
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_charges NUMERIC DEFAULT 0;

-- 3. Returns and Exchanges table
CREATE TABLE IF NOT EXISTS returns_exchanges (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id TEXT,
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  type TEXT NOT NULL, -- 'return' or 'exchange'
  original_product_id TEXT NOT NULL,
  original_product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  refund_amount NUMERIC DEFAULT 0,
  replacement_product_id TEXT,
  replacement_product_name TEXT,
  replacement_quantity INTEGER DEFAULT 0,
  difference_amount NUMERIC DEFAULT 0,
  condition TEXT DEFAULT 'resellable', -- 'resellable' or 'damaged'
  reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- 4. Enable RLS on returns_exchanges if RLS is enabled
ALTER TABLE returns_exchanges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their business returns"
  ON returns_exchanges
  FOR ALL
  USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  ));
