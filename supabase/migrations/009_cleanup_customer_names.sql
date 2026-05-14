-- Clean up fallback text stored in customer_name by old sync code.
-- After running this, trigger shopify-resync-customers to populate with real data.
UPDATE shopify_orders SET customer_name  = NULL WHERE customer_name  = 'Cliente desconocido';
UPDATE shopify_orders SET customer_email = NULL WHERE customer_email = '';
