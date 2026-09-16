// ─── Écriture de la ligne financière d'une fiche ────────────────────────────
//
// La forme de la ligne se décide dans `ligneFinanciereLogique.js` ; ici, les
// écritures et le lien entre les deux tables.

import { supabase } from '../../../core/supabase/client'
import { ligneDeFtm } from './ligneFinanciereLogique'

export { ligneDeFtm, referenceFtm } from './ligneFinanciereLogique'

/**
 * Crée ou met à jour la ligne financière d'une fiche, et referme le lien des
 * deux côtés. Rendue séparée de l'écriture de la fiche : une fiche enregistrée
 * dont la ligne échoue laisserait le budget faux sans que personne le sache.
 * @returns l'identifiant de la ligne
 */
export async function assurerLigneFinanciere(ftm, affaireId) {
  const payload = ligneDeFtm(ftm, affaireId)

  if (ftm.ligne_financiere_id) {
    const { error } = await supabase.from('lignes_financieres').update(payload).eq('id', ftm.ligne_financiere_id)
    if (error) throw error
    return ftm.ligne_financiere_id
  }

  const { data, error } = await supabase.from('lignes_financieres')
    .insert({ ...payload, ftm_id: ftm.id }).select('id').single()
  if (error) throw error

  const { error: errLien } = await supabase.from('ftm').update({ ligne_financiere_id: data.id }).eq('id', ftm.id)
  if (errLien) throw errLien
  return data.id
}

/**
 * Rattrape les fiches sans ligne financière — celles d'avant ce rattachement,
 * ou celles dont l'écriture s'était arrêtée à mi-chemin.
 * @returns le nombre de lignes créées
 */
export async function rattraperLignesManquantes(ftms, affaireId) {
  const orphelines = (ftms ?? []).filter(f => !f.ligne_financiere_id)
  let creees = 0
  for (const fiche of orphelines) {
    try {
      await assurerLigneFinanciere(fiche, affaireId)
      creees++
    } catch (err) {
      console.warn('Ligne financière de la FTM', fiche.numero, ':', err.message ?? err)
    }
  }
  return creees
}
