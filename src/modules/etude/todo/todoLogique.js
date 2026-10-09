// ─── To-do list d'une affaire : logique pure ────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-10-09-todo-list-design.md.
// La liste type de l'agence (`todo_modele`) n'est pas recopiée dans chaque
// affaire : une affaire ne garde que ce qu'elle a touché (`todo_elements`),
// et l'écran se calcule ici en posant cet état sur la liste type. Ainsi un
// article ajouté ou renommé dans la liste type atteint toutes les affaires.
// Testé sans navigateur (tests/todo.test.js).

// Les cases où se rangent les articles. Les articles eux-mêmes ne sont que
// dans la base : les codes ci-dessous sont ceux de la migration 066.
export const PHASES_MISSION = [
  { code: 'engagement', libelle: 'Engagement', court: 'Engagement' },
  { code: 'esq', libelle: 'ESQ — Esquisse', court: 'ESQ' },
  { code: 'aps', libelle: 'APS — Avant-projet sommaire', court: 'APS' },
  { code: 'apd', libelle: 'APD et PC — Avant-projet définitif, permis de construire', court: 'APD' },
  { code: 'pro', libelle: 'PRO — Projet', court: 'PRO' },
  { code: 'dce', libelle: 'DCE — Dossier de consultation des entreprises', court: 'DCE' },
  { code: 'act', libelle: 'ACT — Passation des marchés', court: 'ACT' },
  { code: 'prepa', libelle: 'Préparation de chantier', court: 'Prépa.' },
  { code: 'det', libelle: 'DET — Direction de l’exécution des travaux', court: 'DET' },
  { code: 'aor', libelle: 'AOR et clôture', court: 'AOR' },
]

export const RUBRIQUES_PLANS = [
  { code: 'masse', libelle: 'Plan masse' },
  { code: 'sous_sol', libelle: 'Sous-sol et vide sanitaire' },
  { code: 'rdc', libelle: 'Rez-de-chaussée' },
  { code: 'etages', libelle: 'Étages' },
  { code: 'terrasse', libelle: 'Toiture terrasse' },
  { code: 'charpente', libelle: 'Charpente et couverture' },
  { code: 'coupes', libelle: 'Coupes' },
  { code: 'facades', libelle: 'Façades' },
  { code: 'details', libelle: 'Détails' },
  { code: 'reglementaire', libelle: 'Contrôles réglementaires' },
]

export function groupesDe(liste) {
  return liste === 'plans' ? RUBRIQUES_PLANS : PHASES_MISSION
}

const touche = (e) => !!e && (!!e.fait_le || !!e.sans_objet || !!(e.note && e.note.trim()))

/**
 * Les articles d'une liste tels que l'affaire les voit : liste type + état
 * de l'affaire, puis articles propres à l'affaire. Un article retiré de la
 * liste type reste là où il a servi (coché, annoté, sans objet), marqué
 * `retire` ; ailleurs il disparaît.
 */
export function articlesAffiches(modele, elements, liste) {
  const etats = new Map()
  for (const e of elements ?? []) if (e.type === 'modele' && e.modele_id) etats.set(e.modele_id, e)

  const types = (modele ?? [])
    .filter((m) => m.liste === liste)
    .filter((m) => !m.supprime_le || touche(etats.get(m.id)))
    .map((m) => {
      const e = etats.get(m.id)
      return {
        cle: `m:${m.id}`, source: 'modele', modeleId: m.id, elementId: e?.id ?? null,
        liste: m.liste, groupe: m.groupe, texte: m.texte, ordre: m.ordre ?? 0,
        fait_le: e?.fait_le ?? null, fait_par: e?.fait_par ?? null,
        sans_objet: !!e?.sans_objet, note: e?.note ?? null, retire: !!m.supprime_le,
      }
    })

  const propres = (elements ?? [])
    .filter((e) => e.type === 'article' && e.liste === liste)
    .map((e) => ({
      cle: `e:${e.id}`, source: 'article', modeleId: null, elementId: e.id,
      liste: e.liste, groupe: e.groupe, texte: e.texte, ordre: e.ordre ?? 0,
      fait_le: e.fait_le ?? null, fait_par: e.fait_par ?? null,
      sans_objet: !!e.sans_objet, note: e.note ?? null, retire: false,
    }))

  return [...types, ...propres]
}

export const estGrise = (a) => a.sans_objet || a.retire

export function compteur(articles) {
  const actifs = articles.filter((a) => !estGrise(a))
  return { faits: actifs.filter((a) => a.fait_le).length, total: actifs.length }
}

/** Un bloc par phase (ou rubrique), même vide : actifs dans l'ordre, grisés à la fin. */
export function parGroupe(articles, liste) {
  return groupesDe(liste).map((g) => {
    const siens = articles.filter((a) => a.groupe === g.code)
    const tri = (a, b) => a.ordre - b.ordre
    const ranges = [...siens.filter((a) => !estGrise(a)).sort(tri), ...siens.filter(estGrise).sort(tri)]
    return { ...g, articles: ranges, compteur: compteur(siens) }
  })
}

// Phase fine de l'affaire → phases de la mission qu'elle recouvre
const PERIODES = {
  esq: ['engagement', 'esq'],
  avp: ['aps', 'apd'],
  pro: ['pro'],
  dce: ['dce', 'act'],
  chantier: ['prepa', 'det'],
  livree: ['aor'],
}

const resteAFaire = (g) => g.compteur.faits < g.compteur.total

/**
 * La phase à ouvrir : la première de la période de l'affaire où il reste
 * quelque chose à faire, sinon la dernière de cette période. Une phase
 * d'affaire inconnue ouvre la première phase où il reste à faire.
 */
export function phaseParDefaut(phaseAffaire, groupes) {
  const periode = PERIODES[phaseAffaire]
  if (periode) {
    const aFaire = periode.find((code) => { const g = groupes.find((x) => x.code === code); return g && resteAFaire(g) })
    return aFaire ?? periode[periode.length - 1]
  }
  return groupes.find(resteAFaire)?.code ?? PHASES_MISSION[0].code
}

export const enRetard = (tache, aujourdhui) => !tache.fait_le && !!tache.echeance && tache.echeance < aujourdhui

/** À faire : par échéance (les retards viennent d'eux-mêmes en tête), sans échéance à la fin. Faites : les plus récentes d'abord. */
export function tachesTriees(taches) {
  const aFaire = taches.filter((t) => !t.fait_le).sort((a, b) => {
    if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance)
    if (a.echeance || b.echeance) return a.echeance ? -1 : 1
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })
  const faites = taches.filter((t) => t.fait_le).sort((a, b) => b.fait_le.localeCompare(a.fait_le))
  return { aFaire, faites }
}

const ONGLETS = ['mission', 'quotidien', 'plans']

export function lienPartage(origine, affaireId, { onglet, phase, tache } = {}) {
  const params = new URLSearchParams()
  if (onglet) params.set('onglet', onglet)
  if (phase) params.set('phase', phase)
  if (tache) params.set('tache', tache)
  const suite = params.toString()
  return `${origine}/affaires/${affaireId}/todo${suite ? `?${suite}` : ''}`
}

export function lireLien(search) {
  const p = new URLSearchParams(search)
  const onglet = p.get('onglet')
  return { onglet: ONGLETS.includes(onglet) ? onglet : null, phase: p.get('phase') || null, tache: p.get('tache') || null }
}

export function nomPersonne(id, profils) {
  const p = profils?.[id]
  if (!p) return 'un collaborateur'
  return p.prenom?.trim() || p.nom?.trim() || 'un collaborateur'
}

export function libelleFait(element, profils) {
  if (!element?.fait_le) return null
  const date = new Date(element.fait_le).toLocaleDateString('fr-FR')
  return `Fait par ${nomPersonne(element.fait_par, profils)} le ${date}`
}

export function ordreSuivant(articles, groupe) {
  const ordres = articles.filter((a) => a.groupe === groupe).map((a) => a.ordre ?? 0)
  return ordres.length ? Math.max(...ordres) + 1 : 1
}

/** Ce que la tuile du tableau de bord affiche. */
export function resumeTuile(modele, elements, phaseAffaire, aujourdhui) {
  const groupes = parGroupe(articlesAffiches(modele, elements, 'mission'), 'mission')
  const phase = phaseParDefaut(phaseAffaire, groupes)
  const g = groupes.find((x) => x.code === phase)
  const taches = (elements ?? []).filter((e) => e.type === 'tache' && !e.fait_le)
  return {
    phase, court: g.court, faits: g.compteur.faits, total: g.compteur.total,
    tachesAFaire: taches.length, tachesEnRetard: taches.filter((t) => enRetard(t, aujourdhui)).length,
  }
}
