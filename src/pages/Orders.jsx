import { ShoppingCart } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function Orders() {
  return (
    <EmptyPage
      icon={ShoppingCart}
      title="Gestión de Pedidos"
      description="Vista completa de todos tus pedidos con filtros avanzados, búsqueda, exportación y seguimiento de estado en tiempo real."
      color="brand"
      features={[
        'Tabla de pedidos con filtros avanzados',
        'Búsqueda por cliente, producto o ID',
        'Exportación a CSV/Excel',
        'Tracking de estado y logística',
      ]}
    />
  )
}
