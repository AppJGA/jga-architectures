import { WifiOff } from 'lucide-react'
import { derniereSynchro } from '../supabase/client'
import { useEnLigne, libelleSynchro } from './enLigne'

// ─── Bandeau « Hors ligne » ──────────────────────────────────────────────────
//
// Sans réseau, l'app montre ce qu'elle a gardé de chaque page consultée
// (service worker, vite.config.js). Le bandeau le dit, avec la date de la
// dernière réponse reçue du réseau : on sait de quand datent les chiffres.

export function BandeauHorsLigne() {
  const enLigne = useEnLigne()
  if (enLigne) return null
  const depuis = libelleSynchro(derniereSynchro())
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', background: '#1B3A5C', color: 'white', fontSize: 12, lineHeight: 1.4 }}>
      <WifiOff size={15} style={{ flexShrink: 0 }} />
      <span>
        <strong>Hors ligne</strong> — vous consultez les données gardées sur cet appareil
        {depuis ? `, à jour ${depuis}` : ''}. Les visites emportées restent modifiables.
      </span>
    </div>
  )
}
