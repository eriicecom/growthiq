import { Users } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function Customers() {
  return (
    <EmptyPage
      icon={Users}
      title="Base de Clientes"
      description="Segmenta y analiza tu base de clientes: LTV, frecuencia de compra, cohortes de retención, clientes VIP y en riesgo de churn."
      color="amber"
      features={[
        'LTV y ticket medio por segmento',
        'Análisis de cohortes',
        'Segmentación RFM',
        'Identificación de clientes VIP',
        'Alertas de churn potencial',
      ]}
    />
  )
}
