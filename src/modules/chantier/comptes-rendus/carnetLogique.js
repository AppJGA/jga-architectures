// ─── Un interlocuteur d'affaire versé au carnet d'adresses ───────────────────
//
// Le carnet range des fiches (table `entreprises`, raison sociale obligatoire)
// et, sous chacune, des personnes (table `interlocuteurs`). Un interlocuteur
// d'affaire, lui, porte tout à plat : personne, organisation, coordonnées.
// Ce qui se décide sans base vit ici (tests/carnet.test.js).

const propre = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
const cle = (t) => propre(t).toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * La fiche du carnet et la personne à y rattacher.
 * - Avec une organisation : la fiche porte son nom et son adresse, la
 *   personne ses téléphone et e-mail.
 * - Sans organisation (un particulier, un maire nommé seul) : la fiche porte
 *   le nom de la personne et toutes ses coordonnées, sans contact à part.
 * @returns { entreprise, interlocuteur | null } ou null s'il n'y a rien à verser
 */
export function ficheCarnet(form = {}) {
  const organisation = propre(form.organisation)
  const prenom = propre(form.prenom)
  const nom = propre(form.nom)
  const personne = [prenom, nom].filter(Boolean).join(' ')
  const raison = organisation || personne
  if (!raison) return null
  const telephone = propre(form.telephone) || null
  const email = propre(form.email) || null
  const adresse = propre(form.adresse) || null
  if (!organisation) {
    return { entreprise: { raison_sociale: raison, adresse, telephone, email }, interlocuteur: null }
  }
  return {
    entreprise: { raison_sociale: organisation, adresse, ...(personne ? {} : { telephone, email }) },
    interlocuteur: personne ? { prenom: prenom || null, nom: nom || null, fonction: propre(form.fonction) || null, telephone, email } : null,
  }
}

/** La même fiche est-elle déjà au carnet ? Sans tenir compte des majuscules ni des accents. */
export function memeNom(a, b) {
  return !!cle(a) && cle(a) === cle(b)
}
