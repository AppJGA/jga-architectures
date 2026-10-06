import { useNavigate } from 'react-router-dom'
import { CloudUpload, AlertTriangle, RefreshCw } from 'lucide-react'
import { useEnLigne } from './enLigne'
import { useFileGlobale } from '../../modules/chantier/comptes-rendus/horsLigne/useFileGlobale'
import { temoinFile } from '../../modules/chantier/comptes-rendus/horsLigne/fileLogique'
import { cheminVisite, estTactile } from '../../modules/chantier/comptes-rendus/accesVisite'

// ─── Témoin des modifications pas encore envoyées ────────────────────────────
//
// Tant que des modifications faites sans réseau attendent sur l'appareil, le
// bandeau du haut le dit, sur toutes les pages : on ne quitte pas la tablette
// en croyant tout envoyé. Le toucher mène à la visite concernée.

export function TemoinEnvoi() {
  const naviguer = useNavigate()
  const enLigne = useEnLigne()
  const { lignes, envoiEnCours } = useFileGlobale()
  const temoin = temoinFile(lignes, { enLigne, envoiEnCours })
  if (!temoin) return null
  const couleur = { refus: '#B8412C', envoi: '#1B3A5C', attente: '#C2410C' }[temoin.etat]
  const Icone = { refus: AlertTriangle, envoi: RefreshCw, attente: CloudUpload }[temoin.etat]
  const cible = temoin.cible
  return (
    <button type="button" role="status" title={temoin.libelle}
      onClick={() => { if (cible?.affaireId) naviguer(cheminVisite(cible.affaireId, cible.crId, { tactile: estTactile() })) }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 10px', maxWidth: 280,
        border: `0.5px solid ${couleur}`, borderRadius: 3, background: 'white', color: couleur,
        fontSize: 12, fontWeight: 500, cursor: cible?.affaireId ? 'pointer' : 'default', whiteSpace: 'nowrap',
      }}>
      <Icone size={14} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{temoin.libelle}</span>
    </button>
  )
}
