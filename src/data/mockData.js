const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatShort(date) {
  return `${MONTHS_ES[date.getMonth()]} ${date.getDate()}`
}

function formatISO(date) {
  return date.toISOString().slice(0, 10)
}

// Genera los últimos 30 días de datos de ventas
function generateSalesData() {
  const data = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const base = 3200 + Math.random() * 2000
    const sales = Math.round(base + Math.sin(i / 3) * 600)
    const orders = Math.round(sales / (28 + Math.random() * 12))
    data.push({
      date: formatShort(date),
      fullDate: formatISO(date),
      ventas: sales,
      pedidos: orders,
      beneficio: Math.round(sales * (0.22 + Math.random() * 0.08)),
    })
  }
  return data
}

export const salesChartData = generateSalesData()

export const kpiMetrics = {
  ventas: {
    value: 127430,
    change: 12.4,
    prefix: '€',
  },
  beneficio: {
    value: 31842,
    change: 8.7,
    prefix: '€',
  },
  pedidos: {
    value: 4218,
    change: -2.1,
    prefix: '',
  },
  roas: {
    value: 4.28,
    change: 5.3,
    prefix: '',
    suffix: 'x',
  },
}

export const recentOrders = [
  { id: '#ORD-7821', customer: 'María García', product: 'Pack Skincare Premium', amount: 89.99, status: 'Entregado', date: 'Hoy, 14:32', channel: 'Meta Ads' },
  { id: '#ORD-7820', customer: 'Carlos López', product: 'Serum Vitamina C', amount: 42.50, status: 'En tránsito', date: 'Hoy, 12:18', channel: 'TikTok Ads' },
  { id: '#ORD-7819', customer: 'Ana Martínez', product: 'Kit Anti-Edad', amount: 134.00, status: 'Procesando', date: 'Hoy, 10:55', channel: 'Orgánico' },
  { id: '#ORD-7818', customer: 'Pedro Sánchez', product: 'Crema Hidratante SPF50', amount: 29.99, status: 'Entregado', date: 'Ayer, 18:44', channel: 'Meta Ads' },
  { id: '#ORD-7817', customer: 'Laura Fernández', product: 'Pack Hidratación x3', amount: 67.80, status: 'Entregado', date: 'Ayer, 16:20', channel: 'Email' },
  { id: '#ORD-7816', customer: 'Miguel Torres', product: 'Mascarilla Purificante', amount: 24.95, status: 'Cancelado', date: 'Ayer, 11:05', channel: 'TikTok Ads' },
  { id: '#ORD-7815', customer: 'Sofía Ruiz', product: 'Set Limpieza Facial', amount: 58.00, status: 'En tránsito', date: '09 May, 20:30', channel: 'Meta Ads' },
  { id: '#ORD-7814', customer: 'Javier Moreno', product: 'Aceite Facial Noche', amount: 45.99, status: 'Entregado', date: '09 May, 17:15', channel: 'Orgánico' },
]

export const topProducts = [
  { name: 'Pack Skincare Premium', sales: 1240, revenue: 111516, trend: 18.2 },
  { name: 'Serum Vitamina C', sales: 980, revenue: 41650, trend: 7.4 },
  { name: 'Kit Anti-Edad', sales: 620, revenue: 83080, trend: -3.1 },
  { name: 'Crema Hidratante SPF50', sales: 1850, revenue: 55462, trend: 22.6 },
  { name: 'Set Limpieza Facial', sales: 430, revenue: 24940, trend: 11.0 },
]

export const adChannels = [
  { channel: 'Meta Ads', spend: 8420, revenue: 36058, roas: 4.28, cpa: 18.40 },
  { channel: 'TikTok Ads', spend: 3200, revenue: 11200, roas: 3.50, cpa: 22.10 },
  { channel: 'Google Ads', spend: 5100, revenue: 23460, roas: 4.60, cpa: 15.80 },
  { channel: 'Email', spend: 280, revenue: 6720, roas: 24.0, cpa: 2.10 },
]
