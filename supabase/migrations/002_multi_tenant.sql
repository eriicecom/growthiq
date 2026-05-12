-- Ejecutar en el SQL Editor de Supabase Dashboard ANTES de desplegar el código de auth.
-- Añade user_id a las tablas existentes y actualiza las constraints y políticas RLS
-- para que cada usuario solo acceda a sus propios datos.

-- ── shopify_connections ──────────────────────────────────────────────────────

ALTER TABLE shopify_connections
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Reemplaza el único constraint por shop_domain solo con uno compuesto (user_id, shop_domain)
-- para permitir que distintos usuarios conecten la misma tienda.
ALTER TABLE shopify_connections
  DROP CONSTRAINT IF EXISTS shopify_connections_shop_domain_key;

ALTER TABLE shopify_connections
  ADD CONSTRAINT shopify_connections_user_shop_unique UNIQUE (user_id, shop_domain);

CREATE INDEX IF NOT EXISTS idx_shopify_connections_user_id
  ON shopify_connections (user_id);

-- ── shopify_orders ────────────────────────────────────────────────────────────

ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Reemplaza el único constraint por shopify_id solo con uno compuesto (user_id, shopify_id).
ALTER TABLE shopify_orders
  DROP CONSTRAINT IF EXISTS shopify_orders_shopify_id_key;

ALTER TABLE shopify_orders
  ADD CONSTRAINT shopify_orders_user_shopify_unique UNIQUE (user_id, shopify_id);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_user_id
  ON shopify_orders (user_id);

-- ── RLS: reemplaza políticas permisivas por políticas de tenant ───────────────

DROP POLICY IF EXISTS "allow_all_connections" ON shopify_connections;
CREATE POLICY "users_own_connections" ON shopify_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "allow_all_orders" ON shopify_orders;
CREATE POLICY "users_own_orders" ON shopify_orders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
