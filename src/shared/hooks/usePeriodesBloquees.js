import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

// Parsing local (évite le décalage de fuseau horaire de `new Date("YYYY-MM-DD")`,
// qui est interprété en UTC par le navigateur).
function parseDate(d) {
  if (d instanceof Date) return new Date(d)
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function sortByDateDebut(periodes) {
  return [...periodes].sort((a, b) => parseDate(a.date_debut) - parseDate(b.date_debut))
}

export function usePeriodesBloquees(affaireId) {
  const [periodes, setPeriodes] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!affaireId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('periodes_bloquees')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('date_debut')
    setPeriodes(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetch() }, [fetch])

  const addPeriode = async (data) => {
    const { data: p, error } = await supabase
      .from('periodes_bloquees')
      .insert([{ affaire_id: affaireId, ...data }])
      .select()
      .single()
    if (!error) setPeriodes((prev) => sortByDateDebut([...prev, p]))
    return { data: p, error }
  }

  const updatePeriode = async (id, changes) => {
    const { error } = await supabase
      .from('periodes_bloquees')
      .update(changes)
      .eq('id', id)
    if (!error) {
      setPeriodes((prev) => sortByDateDebut(
        prev.map((p) => (p.id === id ? { ...p, ...changes } : p))
      ))
    }
    return { error }
  }

  const deletePeriode = async (id) => {
    const { error } = await supabase
      .from('periodes_bloquees')
      .delete()
      .eq('id', id)
    if (!error) setPeriodes((prev) => prev.filter((p) => p.id !== id))
    return { error }
  }

  // Une date (Date ou string ISO) tombe-t-elle dans une période bloquée ?
  const isDateBloquee = (date) => {
    const d = parseDate(date)
    return periodes.some((p) => {
      const debut = parseDate(p.date_debut)
      const fin = parseDate(p.date_fin)
      return d >= debut && d <= fin
    })
  }

  // Prochain jour ouvré (hors week-end et périodes bloquées) à partir d'une date
  const getNextWorkingDay = (date) => {
    const d = parseDate(date)
    let safetyCount = 0
    while (d.getDay() === 0 || d.getDay() === 6 || isDateBloquee(d)) {
      d.setDate(d.getDate() + 1)
      if (++safetyCount > 365) break
    }
    return d
  }

  // Ajoute des jours ouvrés à une date de départ, en sautant week-ends
  // ET périodes bloquées (comme addWorkingDays, mais tenant compte des congés)
  const addWorkingDaysWithBlocked = (startDate, workingDays) => {
    const current = getNextWorkingDay(startDate)
    let remaining = workingDays
    while (remaining > 0) {
      current.setDate(current.getDate() + 1)
      if (current.getDay() !== 0 && current.getDay() !== 6 && !isDateBloquee(current)) {
        remaining--
      }
    }
    return current
  }

  return {
    periodes,
    loading,
    addPeriode,
    updatePeriode,
    deletePeriode,
    isDateBloquee,
    getNextWorkingDay,
    addWorkingDaysWithBlocked,
    refetch: fetch,
  }
}
