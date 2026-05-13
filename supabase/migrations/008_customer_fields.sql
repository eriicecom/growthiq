-- Add customer_phone column (customer_name and customer_email already exist).
-- Safe to run multiple times.
ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT NOT NULL DEFAULT '';
