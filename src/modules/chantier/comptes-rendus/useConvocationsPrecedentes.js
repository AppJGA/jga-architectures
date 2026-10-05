// ─── Qui était convoqué au CR précédent ──────────────────────────────────────
//
// Lu à l'ouverture du CR, et gardé sur l'appareil : sur le chantier, sans
// réseau, le pointage des présences doit encore savoir qui était attendu.

import { useState, useEffect } from 'react'
import { supabase } from '../../../core/supabase/client'
import { convocationsDe } from './convocationLogique'

const cleLocale = (crId) => `jga-convocations-${crId}`

function lireLocal(crId) {
  try {
    const garde = JSON.parse(localStorage.getItem(cleLocale(crId)))
    return garde ? new Map(garde) : null
  } catch { return null }
}

export function useConvocationsPrecedentes(cr) {
  const [convocations, setConvocations] = useState(() => new Map())
  const crId = cr?.id
  const affaireId = cr?.affaire_id
  const numero = cr?.numero

  useEffect(() => {
    if (!crId || !affaireId || numero == null) return undefined
    let annule = false
    ;(async () => {
      try {
        const { data: precedent, error } = await supabase
          .from('comptes_rendus').select('id, numero')
          .eq('affaire_id', affaireId).lt('numero', numero)
          .order('numero', { ascending: false }).limit(1).maybeSingle()
        if (error) throw error
        let resultat = new Map()
        if (precedent) {
          const { data: presences, error: erreur } = await supabase
            .from('cr_presences').select('interlocuteur_id, lot_entreprise_id, convoque, heure_convocation')
            .eq('cr_id', precedent.id).eq('convoque', true)
          if (erreur) throw erreur
          resultat = convocationsDe(presences ?? [], precedent.numero)
        }
        try { localStorage.setItem(cleLocale(crId), JSON.stringify([...resultat])) } catch { /* stockage indisponible */ }
        if (!annule) setConvocations(resultat)
      } catch {
        const garde = lireLocal(crId)
        if (garde && !annule) setConvocations(garde)
      }
    })()
    return () => { annule = true }
  }, [crId, affaireId, numero])

  return convocations
}
