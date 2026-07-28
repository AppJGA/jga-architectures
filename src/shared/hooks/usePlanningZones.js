import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'
import { trierZones, ordresAmbigus } from './ordreZones'

export function usePlanningZones(affaireId) {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!affaireId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('planning_zones')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('ordre')

    const triees = trierZones(data ?? [])

    if (ordresAmbigus(triees)) {
      // Réparation ponctuelle : on renumérote 0..n-1 et on persiste, une seule
      // fois — au chargement suivant les ordres sont distincts et l'écriture
      // ne se reproduit pas.
      const corrigees = triees.map((z, i) => ({ ...z, ordre: i }))
      setZones(corrigees)
      setLoading(false)
      await Promise.all(corrigees.map((z) =>
        supabase.from('planning_zones').update({ ordre: z.ordre }).eq('id', z.id)
      ))
      return
    }

    setZones(triees)
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const createZone = async (nom, couleur) => {
    // Rang suivant le plus élevé, et non `zones.length` : après une suppression
    // au milieu de la liste, la longueur retombe sur un `ordre` déjà pris — la
    // nouvelle zone se serait glissée au hasard parmi les existantes.
    const ordre = zones.reduce((max, z) => Math.max(max, (z.ordre ?? 0) + 1), 0)
    const { data, error } = await supabase
      .from('planning_zones')
      .insert([{ affaire_id: affaireId, nom, couleur, ordre }])
      .select()
      .single()
    if (!error) setZones((prev) => [...prev, data])
    return { data, error }
  }

  const updateZone = async (id, changes) => {
    const { error } = await supabase
      .from('planning_zones')
      .update(changes)
      .eq('id', id)
    if (!error) setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...changes } : z)))
    return { error }
  }

  const deleteZone = async (id) => {
    const { error } = await supabase
      .from('planning_zones')
      .delete()
      .eq('id', id)
    if (!error) setZones((prev) => prev.filter((z) => z.id !== id))
    return { error }
  }

  // Réordonnancement complet : affichage immédiat, puis persistance. En cas
  // d'échec l'ordre précédent est restauré — sans quoi l'écran montrerait un
  // classement que la base n'a pas.
  const reorderZones = async (zonesOrdonnees) => {
    const precedent = zones
    const numerotees = zonesOrdonnees.map((z, i) => ({ ...z, ordre: i }))
    setZones(numerotees)

    const resultats = await Promise.all(numerotees.map((z) =>
      supabase.from('planning_zones').update({ ordre: z.ordre }).eq('id', z.id)
    ))
    const error = resultats.find((r) => r?.error)?.error ?? null
    if (error) setZones(precedent)
    return { error }
  }

  return { zones, loading, createZone, updateZone, deleteZone, reorderZones, refetch: fetch }
}
