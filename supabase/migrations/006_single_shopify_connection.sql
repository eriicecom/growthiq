-- One Shopify connection per user.
-- Replaces the UNIQUE(user_id, shop_domain) constraint with UNIQUE(user_id)
-- so that re-connecting (same or different shop) always updates the existing
-- row rather than creating a duplicate.
--
-- Step 1: deduplicate — keep only the most-recently-updated row per user.
DELETE FROM shopify_connections
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM shopify_connections
  ORDER BY user_id, updated_at DESC NULLS LAST, created_at DESC
);

-- Step 2: swap constraints.
ALTER TABLE shopify_connections
  DROP CONSTRAINT IF EXISTS shopify_connections_user_shop_unique;

ALTER TABLE shopify_connections
  ADD CONSTRAINT shopify_connections_user_unique UNIQUE (user_id);
