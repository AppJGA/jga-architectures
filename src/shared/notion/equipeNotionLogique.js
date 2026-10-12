// ─── Échéances partagées avec Notion : l'équipe des cartes ───────────────────
//
// Les vues par personne du Planning hebdomadaire ne montrent que les cartes
// reliées à leur fiche « 👤 Equipe JGA ». Une carte créée par l'app y reçoit
// donc l'équipe de l'affaire telle qu'elle est dans l'app : responsable et
// collaborateurs, ni associés (demande de l'agence), ni extérieurs, ni
// personnes inactives dans Notion. Le rapprochement se fait par le prénom,
// seule donnée commune aux deux côtés. Une carte écrite à la main, ou dont la
// colonne est déjà remplie, n'est jamais touchée : l'agence garde la main.
// Testé sans navigateur (tests/equipe-notion.test.js).

/** « Marie-Jo », « marie jo », « Zoé » / « zoe » : la même personne. */
export function clePrenom(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
}

// Dans Notion, une fiche porte un prénom (« Alix ») ou un nom complet
// (« Paul Martin ») ; un seul candidat est accepté, sinon on ne devine pas
function ficheDe(profil, membres) {
  const cles = [clePrenom(profil.prenom), clePrenom(`${profil.prenom ?? ''}${profil.nom ?? ''}`)].filter(Boolean)
  const candidats = membres.filter((m) => cles.includes(clePrenom(m.nom)))
  return candidats.length === 1 ? candidats[0] : null
}

/**
 * Fiches Notion de l'équipe de chaque affaire.
 * @param profils { [id]: profil }
 * @returns Map affaireId → [id de fiche Notion] (affaires sans équipe absentes)
 */
export function equipesNotion(collaborateurs, profils, membres) {
  const utilisables = (membres ?? []).filter((m) => m.actif && m.role !== 'Associé')
  const equipes = new Map()
  for (const c of collaborateurs ?? []) {
    if (c.role !== 'proprietaire' && c.role !== 'collaborateur') continue
    const p = profils?.[c.user_id]
    if (!p || p.type_compte !== 'agence' || p.est_associe) continue
    const fiche = ficheDe(p, utilisables)
    if (!fiche) continue
    if (!equipes.has(c.affaire_id)) equipes.set(c.affaire_id, [])
    const liste = equipes.get(c.affaire_id)
    if (!liste.includes(fiche.id)) liste.push(fiche.id)
  }
  return equipes
}

// Le format de `titreCarte` : « 2699 ABC – Rendu PRO 16/10/26 » (tiret long)
const FORMAT_APP = /^\d{4}( \S+)? – .+ \d{2}\/\d{2}(\/\d{2,4})?$/

/** Carte créée par l'app (les cartes de l'agence n'ont pas ce format). */
export const estCarteApp = (titre) => FORMAT_APP.test(String(titre ?? '').trim())

/** Cartes de l'app liées à une affaire de l'app, dont la colonne équipe est vide. */
export function operationsEquipe({ cartes, registre, equipes }) {
  const affaireDePage = new Map()
  for (const l of registre ?? []) if (l.page_id && l.affaire_id) affaireDePage.set(l.page_id, l.affaire_id)
  const ops = []
  for (const c of cartes ?? []) {
    if ((c.equipe ?? []).length || !estCarteApp(c.titre)) continue
    const equipe = equipes.get(affaireDePage.get(c.id))
    if (equipe?.length) ops.push({ action: 'equipe', pageId: c.id, equipe, ligneIds: [] })
  }
  return ops
}

/** Complète un plan de `planSynchro` : équipe des cartes créées, cartes à compléter. */
export function ajouterEquipe(plan, { cartes, registre, equipes }) {
  const affaireDeLigne = new Map(plan.registre.ecrire.map(({ ligne }) => [ligne.id, ligne.affaire_id]))
  for (const c of plan.cartes) {
    if (c.action !== 'creer') continue
    const equipe = equipes.get(affaireDeLigne.get(c.ligneId))
    if (equipe?.length) c.equipe = equipe
  }
  const parties = new Set(plan.cartes.filter((c) => c.action === 'corbeille').map((c) => c.pageId))
  plan.cartes.push(...operationsEquipe({ cartes, registre, equipes }).filter((o) => !parties.has(o.pageId)))
  return plan
}
