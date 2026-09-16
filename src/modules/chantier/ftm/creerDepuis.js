import { supabase } from '../../../core/supabase/client'
import { ftmDepuisElement } from './lienFtm'

/**
 * Crée une fiche de travaux modificatifs depuis une remarque ou une réserve.
 * Le numéro est calculé au dernier moment : deux créations simultanées ne se
 * marchent pas dessus (la contrainte d'unicité fait réessayer).
 * @returns la fiche créée
 */
export async function creerFtmDepuis({ affaireId, type, element, contexte, lotId }) {
  const champs = ftmDepuisElement({ type, element, contexte, lotId })
  for (let essai = 0; essai < 3; essai++) {
    const { data: dernier, error: errNum } = await supabase.from('ftm')
      .select('numero').eq('affaire_id', affaireId).order('numero', { ascending: false }).limit(1).maybeSingle()
    if (errNum) throw errNum
    const { data, error } = await supabase.from('ftm')
      .insert({ affaire_id: affaireId, numero: (dernier?.numero ?? 0) + 1, date_emission: new Date().toISOString().slice(0, 10), ...champs })
      .select().single()
    if (!error) return data
    // Migration 048 pas encore passée : la fiche est créée sans son origine
    if (error.code === 'PGRST204' || error.code === '42703') {
      const { data: simple, error: errSimple } = await supabase.from('ftm')
        .insert({ affaire_id: affaireId, numero: (dernier?.numero ?? 0) + 1, date_emission: new Date().toISOString().slice(0, 10), intitule: champs.intitule, description: champs.description, lot_id: champs.lot_id, origine: champs.origine, decision: champs.decision })
        .select().single()
      if (errSimple) throw errSimple
      return simple
    }
    if (error.code !== '23505') throw error
  }
  throw new Error('Impossible d’attribuer un numéro à la fiche, réessayez.')
}
