// ─── Annuaire d'une affaire ──────────────────────────────────────────────────
//
// Les coordonnées à portée de main dès l'ouverture de l'affaire : ses
// interlocuteurs (maître d'ouvrage, BET, CSPS…) et les représentants des
// entreprises de chaque lot. Pur, pour être testé (tests/annuaire.test.js).

import { libelleRole, libelleLot } from '../modules/chantier/comptes-rendus/remarquesLogique'
import { decouperNumeros } from '../shared/telephones'

// Ordre des catégories, celui de la fenêtre des interlocuteurs
const ORDRE_CATEGORIES = ['moa', 'moe', 'be', 'ct', 'csps', 'administration', 'autre']

const nomComplet = (prenom, nom) => [prenom, nom].filter(Boolean).join(' ')

/** Lien d'appel : chiffres et « + » seulement, que le téléphone compose tel quel. */
export function lienTelephone(telephone) {
  const chiffres = String(telephone ?? '').replace(/[^\d+]/g, '')
  return chiffres ? `tel:${chiffres}` : null
}

/** Un champ peut porter deux numéros (« 06 … / 04 … ») : un lien chacun. */
export const telephones = decouperNumeros

/**
 * @param interlocuteurs lignes `affaire_interlocuteurs`
 * @param lots lots aplatis par `useLotsEntreprises` (entreprise et représentant)
 * @returns { interlocuteurs: [...], entreprises: [...] } — fiches prêtes à afficher
 */
export function annuaireAffaire({ interlocuteurs = [], lots = [] } = {}) {
  const rang = (c) => { const i = ORDRE_CATEGORIES.indexOf(c); return i < 0 ? ORDRE_CATEGORIES.length : i }
  return {
    interlocuteurs: [...interlocuteurs]
      .sort((a, b) => rang(a.categorie) - rang(b.categorie) || (a.ordre ?? 99) - (b.ordre ?? 99))
      .map((i) => ({
        cle: `interlo:${i.id}`,
        categorie: i.categorie,
        role: libelleRole(i),
        nom: nomComplet(i.prenom, i.nom) || i.organisation || '—',
        detail: [i.fonction, nomComplet(i.prenom, i.nom) ? i.organisation : null].filter(Boolean).join(' · '),
        telephone: i.telephone || null,
        telephonePortable: i.telephone_portable || null,
        email: i.email || null,
        // Champs séparés, pour l'export vers le téléphone et Outlook
        prenom: i.prenom || null,
        nomFamille: i.nom || null,
        organisation: i.organisation || null,
        fonction: i.fonction || null,
      })),
    // Seuls les lots attribués ont quelqu'un à joindre. Sans représentant
    // nommé, les coordonnées de l'entreprise elle-même.
    entreprises: lots
      .filter((l) => l.entreprise_id)
      .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
      .map((l) => ({
        cle: `lot:${l.id}`,
        role: libelleLot(l),
        nom: l.raison_sociale || '—',
        detail: [nomComplet(l.prenom, l.nom_contact), l.fonction].filter(Boolean).join(' · '),
        // Chaque numéro manquant du représentant est pris à l'entreprise : son
        // portable à côté du standard
        telephone: l.interlocuteur_tel || l.entreprise_tel || null,
        telephonePortable: l.interlocuteur_portable || l.entreprise_portable || null,
        email: l.interlocuteur_email || l.entreprise_email || null,
        prenom: l.prenom || null,
        nomFamille: l.nom_contact || null,
        organisation: l.raison_sociale || null,
        fonction: l.fonction || null,
      })),
  }
}
