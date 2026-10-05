// ─── Verser un interlocuteur d'affaire au carnet d'adresses ──────────────────
//
// Comme la page Entreprises & Lots crée une entreprise au carnet : la fiche
// (table `entreprises`) puis la personne rattachée (table `interlocuteurs`).
// Une fiche ou une personne déjà présente n'est pas recréée.

import { supabase } from '../../../core/supabase/client'
import { ficheCarnet, memeNom, correspondanceCarnet, ecrituresCarnet } from './carnetLogique'

/** @returns { ficheCreee, personneCreee } ou null s'il n'y avait rien à verser */
export async function verserAuCarnet(form) {
  const fiche = ficheCarnet(form)
  if (!fiche) return null
  const raison = fiche.entreprise.raison_sociale
  // Recherche large (les jokers du nom neutralisés), comparaison fine ensuite
  const { data: proches, error } = await supabase
    .from('entreprises').select('id, raison_sociale')
    .ilike('raison_sociale', `%${raison.replace(/[%_\\]/g, ' ').trim()}%`).limit(20)
  if (error) throw error
  let entreprise = (proches ?? []).find((e) => memeNom(e.raison_sociale, raison))
  let ficheCreee = false
  if (!entreprise) {
    const { data, error: erreur } = await supabase.from('entreprises').insert(fiche.entreprise).select('id').single()
    if (erreur) throw erreur
    entreprise = data
    ficheCreee = true
  }

  let personneCreee = false
  if (fiche.interlocuteur) {
    const p = fiche.interlocuteur
    const { data: personnes, error: erreur } = await supabase
      .from('interlocuteurs').select('id, prenom, nom').eq('entreprise_id', entreprise.id)
    if (erreur) throw erreur
    const dejaLa = (personnes ?? []).some((x) => memeNom(`${x.prenom ?? ''} ${x.nom ?? ''}`, `${p.prenom ?? ''} ${p.nom ?? ''}`))
    if (!dejaLa) {
      const { error: e2 } = await supabase.from('interlocuteurs').insert({ ...p, entreprise_id: entreprise.id })
      if (e2) throw e2
      personneCreee = true
    }
  }
  return { ficheCreee, personneCreee }
}

/**
 * La fiche du carnet (et la personne) de cet interlocuteur d'affaire, s'il y
 * figure. Cherchée d'après ses valeurs enregistrées, avant modification.
 */
export async function chercherDansCarnet(form) {
  const nomFiche = (form?.organisation || [form?.prenom, form?.nom].filter(Boolean).join(' ') || '').trim()
  if (!nomFiche) return null
  const { data, error } = await supabase
    .from('entreprises')
    .select('id, raison_sociale, adresse, code_postal, ville, telephone, email, interlocuteurs(id, prenom, nom, fonction, telephone, email)')
    .ilike('raison_sociale', `%${nomFiche.replace(/[%_\\]/g, ' ').trim()}%`).limit(20)
  if (error) throw error
  return correspondanceCarnet(form, data ?? [])
}

/** Reporte les écarts choisis dans le carnet. */
export async function mettreAJourCarnet(ecarts) {
  for (const { table, id, champs } of ecrituresCarnet(ecarts)) {
    const { error } = await supabase.from(table).update(champs).eq('id', id)
    if (error) throw error
  }
}
