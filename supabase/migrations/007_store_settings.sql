-- Store settings per user (name, currency, timezone).
CREATE TABLE IF NOT EXISTS store_settings (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_name TEXT    NOT NULL DEFAULT '',
  currency   TEXT    NOT NULL DEFAULT 'USD',
  timezone   TEXT    NOT NULL DEFAULT 'Europe/Madrid',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_settings_user_unique UNIQUE (user_id)
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_settings_select" ON store_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "store_settings_insert" ON store_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "store_settings_update" ON store_settings
  FOR UPDATE USING (auth.uid() = user_id);
