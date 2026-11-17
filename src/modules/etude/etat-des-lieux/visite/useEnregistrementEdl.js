// ─── Enregistrement de la visite d'un état des lieux ─────────────────────────
//
// Le moteur commun des visites (`useEnregistreur`), ses morceaux marqués
// `edlVisiteId`. Lot 2 : rien n'est transcrit, les morceaux attendent sur
// l'appareil (base `jga-audio`) l'analyse du lot 3 ; on les compte. Une page
// fermée en plein enregistrement : les tranches restées seules se recollent
// à la réouverture de la visite.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEnregistreur } from '../../../chantier/comptes-rendus/enregistrement/useEnregistreur'
import { morceauxEnAttente, enregistrementsInterrompus, recupererMorceaux } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { enregistrementsARecuperer } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'

export function useEnregistrementEdl({ visiteId, affaireId, surEtat }) {
  const [enAttente, setEnAttente] = useState(0)

  const recompter = useCallback(async () => {
    if (!visiteId) return
    const liste = await morceauxEnAttente({ edlVisiteId: visiteId }).catch(() => [])
    setEnAttente(liste.length)
  }, [visiteId])

  const champs = useMemo(() => ({ affaireId }), [affaireId])
  const moteur = useEnregistreur({ champs, surEtat, surMorceau: () => { recompter() } })
  const { enregistrementCourant } = moteur

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
  const demarrer = useCallback((id) => demarrerMoteur({ edlVisiteId: id }), [demarrerMoteur])

  return { ...moteur, demarrer, enAttente }
}
