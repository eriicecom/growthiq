import { Music2 } from 'lucide-react'
import EmptyPage from '@/components/ui/EmptyPage'

export default function TikTokAds() {
  return (
    <EmptyPage
      icon={Music2}
      title="TikTok Ads"
      description="Conecta TikTok Ads Manager para analizar el rendimiento de tus campañas, creatividades y audiencias en la plataforma de mayor crecimiento."
      color="pink"
      features={[
        'Rendimiento por campaña y creativo',
        'Métricas de video: VTR, CPV',
        'Audiencias y segmentación',
        'Top creatividades por conversión',
      ]}
    />
  )
}
