-- Meta Ads integration: token storage + daily spend cache

CREATE TABLE IF NOT EXISTS meta_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) NOT NULL,
  access_token   text NOT NULL,
  ad_account_id  text NOT NULL,
  account_name   text,
  currency       text DEFAULT 'USD',
  is_active      boolean DEFAULT true,
  last_synced_at timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_meta_connections" ON meta_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Daily spend data synced from Meta Marketing API
CREATE TABLE IF NOT EXISTS meta_ad_spend (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) NOT NULL,
  date        date NOT NULL,
  spend       numeric(12,2) DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks      integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE meta_ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_meta_ad_spend" ON meta_ad_spend
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_meta_ad_spend_lookup
  ON meta_ad_spend (user_id, date DESC);
