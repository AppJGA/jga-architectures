import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'
import { normaliserGeneralites, aDuTexte } from '../../modules/chantier/comptes-rendus/generalitesLogique'

// Table absente : la migration 055 n'est pas encore passée. L'écran le dit au
// lieu d'afficher une erreur technique.
function tableAbsente(error) {
  return ['42P01', 'PGRST205', 'PGRST204', '42703'].includes(error?.code)
}

/**
 * Généralités d'une affaire (parties I à V des comptes rendus, migration 055).
 * Une ligne par affaire ; aucune ligne = pas encore saisies.
 */
export function useGeneralites(affaireId) {
  const [contenu, setContenu] = useState({ parties: [] })
  const [chargement, setChargement] = useState(true)
  const [disponible, setDisponible] = useState(true)
  const [majLe, setMajLe] = useState(null)

  // Réponse de la base appliquée à l'état (chargement initial et rechargement)
  const appliquer = useCallback(({ data, error }) => {
    if (error) {
      if (tableAbsente(error)) setDisponible(false)
      else console.error('Généralités :', error)
    } else {
      setDisponible(true)
      setContenu(normaliserGeneralites(data?.contenu))
      setMajLe(data?.updated_at ?? null)
    }
    setChargement(false)
  }, [])

  const lire = useCallback(() => supabase.from('affaire_generalites')
    .select('contenu, updated_at').eq('affaire_id', affaireId).maybeSingle(), [affaireId])

  const charger = useCallback(async () => {
    if (affaireId) appliquer(await lire())
  }, [affaireId, appliquer, lire])

  useEffect(() => {
    if (!affaireId) return undefined
    let abandon = false
    lire().then((reponse) => { if (!abandon) appliquer(reponse) })
    return () => { abandon = true }
  }, [affaireId, lire, appliquer])

  const enregistrer = useCallback(async (nouveau) => {
    const propre = normaliserGeneralites(nouveau)
    const { data, error } = await supabase.from('affaire_generalites')
      .upsert({ affaire_id: affaireId, contenu: propre }, { onConflict: 'affaire_id' })
      .select('updated_at').single()
    if (error) throw error
    setContenu(propre)
    setMajLe(data?.updated_at ?? null)
  }, [affaireId])

  // Affaires dont on peut importer les généralités : celles qui en ont écrit
  const sourcesImport = useCallback(async () => {
    const { data, error } = await supabase.from('affaire_generalites')
      .select('affaire_id, contenu, updated_at, affaires(nom, code_affaire)')
      .neq('affaire_id', affaireId)
    if (error) throw error
    return (data ?? [])
      .filter((l) => aDuTexte(l.contenu))
      .map((l) => ({ affaireId: l.affaire_id, nom: l.affaires?.nom ?? '—', code: l.affaires?.code_affaire ?? '', contenu: l.contenu, majLe: l.updated_at }))
      .sort((a, b) => String(b.majLe).localeCompare(String(a.majLe)))
  }, [affaireId])

  return { contenu, chargement, disponible, majLe, enregistrer, sourcesImport, recharger: charger }
}
