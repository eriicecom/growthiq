-- Coste de producto por cantidad (tramos de volumen)
-- quantity: unidades en el pedido (1, 2, 3...)
-- cost: coste total para esa cantidad (no por unidad)

CREATE TABLE IF NOT EXISTS product_costs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) NOT NULL,
  shopify_product_id  text NOT NULL,
  quantity            integer NOT NULL CHECK (quantity > 0),
  cost                numeric(10,2) NOT NULL CHECK (cost >= 0),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (user_id, shopify_product_id, quantity)
);

ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_product_costs" ON product_costs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_product_costs_lookup
  ON product_costs (user_id, shopify_product_id, quantity);
