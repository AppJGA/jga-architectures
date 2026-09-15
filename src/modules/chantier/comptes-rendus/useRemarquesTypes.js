import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../core/supabase/client'
import { photosIndisponibles } from './photosStockage'
import { normaliserTexte } from './visiteLogique'

/** Remarques types de l'agence (vide et indisponible avant la migration 042) */
export function useRemarquesTypes() {
  const [types, setTypes] = useState([])
  const [disponible, setDisponible] = useState(true)

  const lire = useCallback(async () => {
    const { data, error } = await supabase.from('remarques_types').select('*').order('utilisations', { ascending: false })
    if (error) {
      if (photosIndisponibles(error)) return { disponible: false, types: [] }
      throw error
    }
    return { disponible: true, types: data ?? [] }
  }, [])

  useEffect(() => {
    let abandon = false
    lire().then(r => { if (!abandon) { setTypes(r.types); setDisponible(r.disponible) } })
      .catch(err => console.warn('Remarques types :', err))
    return () => { abandon = true }
  }, [lire])

  const recharger = useCallback(async () => {
    const r = await lire()
    setTypes(r.types)
    setDisponible(r.disponible)
  }, [lire])

  // Un texte déjà présent (casse et espaces ignorés) n'est pas un échec
  const ajouter = useCallback(async (texte) => {
    const propre = normaliserTexte(texte)
    if (!propre) return
    const { error } = await supabase.from('remarques_types').insert({ texte: propre })
    if (error && error.code !== '23505') throw error
    await recharger()
  }, [recharger])

  const supprimer = useCallback(async (id) => {
    const { error } = await supabase.from('remarques_types').delete().eq('id', id)
    if (error) throw error
    await recharger()
  }, [recharger])

  // Compteur d'usage : sans importance si l'écriture échoue
  const utiliser = useCallback((id) => {
    supabase.rpc('remarque_type_utilisee', { p_id: id }).then(({ error }) => { if (error) console.warn('Remarques types :', error) })
  }, [])

  return { types, disponible, ajouter, supprimer, utiliser }
}
