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

  const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  console.log('[validate] shopDomain recibido:', shopDomain)
  console.log('[validate] domain normalizado:', domain)
  console.log('[validate] token prefix:', accessToken.slice(0, 8) + '...')

  const url = `https://${domain}/admin/api/2025-07/shop.json`
  console.log('[validate] llamando a:', url)

  try {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    console.log('[validate] Shopify status:', res.status)

    if (res.status === 401 || res.status === 403) {
      const body = await res.text()
      console.log('[validate] Shopify error body:', body)
      return { statusCode: 400, body: JSON.stringify({ error: 'Token de acceso inválido o permisos insuficientes' }) }
    }

    if (!res.ok) {
      const body = await res.text()
      console.log('[validate] Shopify error body:', body)
      return { statusCode: 400, body: JSON.stringify({ error: `No se pudo conectar con la tienda (${res.status})` }) }
    }

    const { shop } = await res.json()
    console.log('[validate] OK — tienda:', shop.name, shop.domain)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valid: true,
        shop: { name: shop.name, email: shop.email, currency: shop.currency, domain: shop.domain },
      }),
    }
  } catch (err) {
    console.error('[validate] excepción:', err.message, err.stack)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No se pudo alcanzar la tienda. Verifica el dominio.' }),
    }
  }
}
