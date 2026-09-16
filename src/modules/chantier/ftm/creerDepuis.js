import { supabase } from '../../../core/supabase/client'
import { ftmDepuisElement } from './lienFtm'
import { assurerLigneFinanciere } from './ligneFinanciere'

/**
 * Crée une fiche de travaux modificatifs depuis une remarque ou une réserve,
 * et sa ligne dans le suivi financier — une fiche qui n'y figure pas est de
 * l'argent engagé que personne ne voit.
 *
 * Le numéro est calculé au dernier moment : deux créations simultanées ne se
 * marchent pas dessus (la contrainte d'unicité fait réessayer).
 * @returns la fiche créée
 */
export async function creerFtmDepuis({ affaireId, type, element, contexte, lotId }) {
  const champs = ftmDepuisElement({ type, element, contexte, lotId })
  const base = {
    affaire_id: affaireId,
    date_emission: new Date().toISOString().slice(0, 10),
  }

  for (let essai = 0; essai < 3; essai++) {
    const { data: dernier, error: errNum } = await supabase.from('ftm')
      .select('numero').eq('affaire_id', affaireId).order('numero', { ascending: false }).limit(1).maybeSingle()
    if (errNum) throw errNum
    const numero = (dernier?.numero ?? 0) + 1

    let { data, error } = await supabase.from('ftm')
      .insert({ ...base, numero, ...champs }).select().single()

    // Migration 048 pas encore passée : la fiche est créée sans son origine
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      const sansOrigine = { ...champs }
      for (const colonne of ['source_type', 'source_suivi_id', 'source_reserve_id', 'source_libelle']) {
        delete sansOrigine[colonne]
      }
      ;({ data, error } = await supabase.from('ftm')
        .insert({ ...base, numero, ...sansOrigine }).select().single())
    }

    if (!error) {
      await assurerLigneFinanciere(data, affaireId)
      return data
    }
    if (error.code !== '23505') throw error
  }
  throw new Error('Impossible d’attribuer un numéro à la fiche, réessayez.')
}
