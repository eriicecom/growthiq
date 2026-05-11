import { TrendingUp, Construction } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function Sales() {
  return (
    <EmptyPage
      icon={TrendingUp}
      title="Análisis de Ventas"
      description="Aquí verás gráficos detallados de ingresos, comparativas por período, embudo de ventas y análisis de tendencias."
      color="emerald"
    />
  )
}
