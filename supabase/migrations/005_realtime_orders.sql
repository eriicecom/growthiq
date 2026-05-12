-- Enable Supabase Realtime for shopify_orders
--
-- Without this, the postgres_changes subscription in useShopifyOrders.js
-- subscribes successfully but never fires INSERT/UPDATE events.
--
-- REPLICA IDENTITY FULL is required for:
--   • filtered subscriptions (filter: 'user_id=eq.<uid>')
--   • receiving OLD row data on UPDATE/DELETE events
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE shopify_orders REPLICA IDENTITY FULL;

-- Add shopify_orders to the realtime publication.
-- The DO block makes this idempotent: safe to run even if already added.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE shopify_orders;
EXCEPTION
  WHEN duplicate_object THEN
    -- Table was already in the publication — nothing to do.
    NULL;
END;
$$;
