// ─── Enregistrement de la visite d'un état des lieux ─────────────────────────
//
// Le moteur commun des visites (`useEnregistreur`), ses morceaux marqués
// `edlVisiteId`. Chaque morceau rangé part à la transcription horodatée
// (lot 3, `analyse/transcriptionEdl.js`) ; sans réseau, il attend sur
// l'appareil (base `jga-audio`) et l'on compte ceux qui attendent. Une page
// fermée en plein enregistrement : les tranches restées seules se recollent
// à la réouverture de la visite.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEnregistreur } from '../../../chantier/comptes-rendus/enregistrement/useEnregistreur'
import { morceauxEnAttente, enregistrementsInterrompus, recupererMorceaux } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { enregistrementsARecuperer } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'
import { transcrireEdlEnAttente, EVENEMENT_TRANSCRIPTION_EDL } from '../analyse/transcriptionEdl'

export function useEnregistrementEdl({ visiteId, affaireId, surEtat }) {
  const [enAttente, setEnAttente] = useState(0)

  const recompter = useCallback(async () => {
    if (!visiteId) return
    const liste = await morceauxEnAttente({ edlVisiteId: visiteId }).catch(() => [])
    setEnAttente(liste.length)
  }, [visiteId])

  const champs = useMemo(() => ({ affaireId }), [affaireId])
  // Chaque morceau part dès qu'il est rangé s'il y a du réseau ; sinon il
  // attend le moteur de synchro de l'app (envoyerToutEdl)
  const surMorceau = useCallback((morceau) => {
    recompter()
    const edlVisiteId = morceau?.edlVisiteId
    if (!edlVisiteId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    transcrireEdlEnAttente({ edlVisiteId }).catch((err) => console.warn('Transcription de la visite :', err))
  }, [recompter])
  const moteur = useEnregistreur({ champs, surEtat, surMorceau })
  const { enregistrementCourant } = moteur

  // Un morceau transcrit (ou effacé) ne compte plus parmi ceux qui attendent
  useEffect(() => {
    if (!visiteId) return undefined
    const surTranscription = () => { recompter() }
    window.addEventListener(EVENEMENT_TRANSCRIPTION_EDL, surTranscription)
    return () => window.removeEventListener(EVENEMENT_TRANSCRIPTION_EDL, surTranscription)
  }, [visiteId, recompter])

  // `visiteId` n'est connu qu'une fois l'enregistrement démarré : celui en
  // cours a déjà des tranches sans morceau, il est laissé de côté
  useEffect(() => {
    if (!visiteId) return undefined
    let annule = false
    ;(async () => {
      const interrompus = await enregistrementsInterrompus({ edlVisiteId: visiteId }).catch(() => [])
      for (const id of enregistrementsARecuperer(interrompus, enregistrementCourant())) {
        if (annule) return
        await recupererMorceaux(id).catch(() => {})
      }
      if (!annule) await recompter()
    })()
    return () => { annule = true }
  }, [visiteId, recompter, enregistrementCourant])

  // L'identifiant de la visite est connu au moment du geste « Démarrer » :
  // il part avec le premier morceau, avant même le rendu suivant
  const { demarrer: demarrerMoteur } = moteur
  // Sans identifiant de visite, l'audio ne se rattacherait à rien : refus
  const demarrer = useCallback(
    (id) => (id ? demarrerMoteur({ edlVisiteId: id }) : Promise.resolve(false)),
    [demarrerMoteur],
  )

  return { ...moteur, demarrer, enAttente: visiteId ? enAttente : 0 }
}
