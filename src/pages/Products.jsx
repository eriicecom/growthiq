import { Package } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function Products() {
  return (
    <EmptyPage
      icon={Package}
      title="Catálogo de Productos"
      description="Analiza el rendimiento de cada producto: ventas, margen, stock, tasa de devolución y más métricas clave."
      color="violet"
      features={[
        'Ranking de productos por ingresos',
        'Análisis de márgenes por SKU',
        'Alertas de stock bajo',
        'Tendencias de demanda',
      ]}
    />
  )
}
