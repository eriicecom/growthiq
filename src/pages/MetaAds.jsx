import { Facebook } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function MetaAds() {
  return (
    <EmptyPage
      icon={Facebook}
      title="Meta Ads"
      description="Conecta tu cuenta publicitaria de Facebook e Instagram para ver tus campañas, conjuntos de anuncios, ROAS, CPA y más en tiempo real."
      color="blue"
      features={[
        'Rendimiento de campañas y ad sets',
        'ROAS, CPC, CTR y CPM',
        'Atribución de conversiones',
        'Comparativa con períodos anteriores',
        'Alertas de presupuesto y rendimiento',
      ]}
    />
  )
}
