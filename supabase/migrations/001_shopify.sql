-- Ejecutar en el SQL Editor de Supabase Dashboard
-- o con: supabase db push

-- Conexiones de tiendas Shopify
CREATE TABLE IF NOT EXISTS shopify_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain   text NOT NULL UNIQUE,
  access_token  text NOT NULL,
  is_active     boolean DEFAULT false,
  sync_total    integer DEFAULT 0,
  last_synced_at timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Pedidos sincronizados desde Shopify
CREATE TABLE IF NOT EXISTS shopify_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_id          text NOT NULL UNIQUE,
  order_number        text,
  customer_name       text,
  customer_email      text,
  amount              numeric(10,2),
  currency            text DEFAULT 'EUR',
  financial_status    text,
  fulfillment_status  text,
  line_items          jsonb DEFAULT '[]',
  source_name         text,
  shopify_created_at  timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Índices para consultas del dashboard
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at
  ON shopify_orders (shopify_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_financial_status
  ON shopify_orders (financial_status);

-- RLS
ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;

-- Política permisiva (no hay auth aún — reforzar cuando se añada autenticación)
CREATE POLICY "allow_all_connections" ON shopify_connections
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_orders" ON shopify_orders
  FOR ALL USING (true) WITH CHECK (true);

-- Activar Realtime para recibir pedidos en tiempo real en el dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE shopify_orders;
