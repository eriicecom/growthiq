// Validates Shopify credentials by calling the shop endpoint
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let shopDomain, accessToken
  try {
    ;({ shopDomain, accessToken } = JSON.parse(event.body))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cuerpo de solicitud inválido' }) }
  }

  if (!shopDomain || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'shopDomain y accessToken son obligatorios' }) }
  }

  // Normalize domain
  const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')

  try {
    const res = await fetch(`https://${domain}/admin/api/2025-07/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    if (res.status === 401 || res.status === 403) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Token de acceso inválido o permisos insuficientes' }) }
    }

    if (!res.ok) {
      return { statusCode: 400, body: JSON.stringify({ error: `No se pudo conectar con la tienda (${res.status})` }) }
    }

    const { shop } = await res.json()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valid: true,
        shop: { name: shop.name, email: shop.email, currency: shop.currency, domain: shop.domain },
      }),
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No se pudo alcanzar la tienda. Verifica el dominio.' }),
    }
  }
}
