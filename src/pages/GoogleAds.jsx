import { Search } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function GoogleAds() {
  return (
    <EmptyPage
      icon={Search}
      title="Google Ads"
      description="Conecta Google Ads para analizar el rendimiento de tus campañas de búsqueda, display y shopping con datos de conversión en tiempo real."
      color="amber"
      features={[
        'Seguimiento de conversiones',
        'Rendimiento por campaña y grupo de anuncios',
        'ROAS y CPA por palabra clave',
        'Comparativa con Meta Ads',
      ]}
    />
  )
}
