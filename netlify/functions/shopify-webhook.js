import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function verifyHmac(body, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret || !hmacHeader) return !secret // skip if no secret configured
  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader))
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const hmac = event.headers['x-shopify-hmac-sha256']
  if (!verifyHmac(event.body, hmac)) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  let order
  try {
    order = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const firstName = order.customer?.first_name || ''
  const lastName = order.customer?.last_name || ''
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente desconocido'

  const orderData = {
    shopify_id: String(order.id),
    order_number: `#${order.order_number}`,
    customer_name: customerName,
    customer_email: order.customer?.email || '',
    amount: parseFloat(order.total_price) || 0,
    currency: order.currency || 'EUR',
    financial_status: order.financial_status || 'pending',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    line_items: (order.line_items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    source_name: order.source_name || 'web',
    shopify_created_at: order.created_at,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('shopify_orders')
    .upsert(orderData, { onConflict: 'shopify_id' })

  if (error) {
    console.error('Webhook: error saving order', error)
    return { statusCode: 500, body: 'Error saving order' }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
