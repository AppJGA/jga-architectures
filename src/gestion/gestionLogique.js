// ─── Gestion d'agence : logique pure ────────────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-10-09-gestion-agence-design.md.
// Calendrier des rendus (jalons de tous les plannings) et suivi des tâches
// « À faire » de toutes les affaires. Les dates passent par l'heure UTC :
// un calcul à l'heure locale perdrait un jour au passage à l'heure d'été.
// Testé sans navigateur (tests/gestion.test.js).

import { tachesTriees, enRetard } from '../modules/etude/todo/todoLogique.js'

const JOUR = 86400000
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
const ms = (dateIso) => Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10))

export const ecartJours = (de, a) => Math.round((ms(a) - ms(de)) / JOUR)

/** Le vendredi d'une semaine ISO : un rendu prévu « en S42 » l'est au plus tard ce jour-là. */
export function vendrediSemaineIso(semaine, annee) {
  // La semaine 1 est celle qui contient le 4 janvier
  const quatre = Date.UTC(annee, 0, 4)
  const lundi1 = quatre - ((new Date(quatre).getUTCDay() + 6) % 7) * JOUR
  return iso(lundi1 + ((semaine - 1) * 7 + 4) * JOUR)
}

/**
 * Jalons des deux plannings, ramenés à une date, avec leur affaire.
 * Un jalon dont l'affaire n'est pas lue (droits, affaire supprimée) est écarté.
 */
export function rendus(jalonsChantier, jalonsEtude, affaires) {
  const parId = new Map((affaires ?? []).map((a) => [a.id, a]))
  const ev = []
  for (const j of jalonsChantier ?? []) {
    const affaire = parId.get(j.affaire_id)
    if (affaire && j.date) ev.push({ id: `chantier-${j.id}`, date: j.date, libelle: j.label, couleur: j.couleur, affaire, origine: 'chantier' })
  }
  for (const j of jalonsEtude ?? []) {
    const affaire = parId.get(j.affaire_id)
    if (affaire && j.semaine && j.annee) {
      ev.push({ id: `etude-${j.id}`, date: vendrediSemaineIso(j.semaine, j.annee), libelle: j.label, couleur: j.couleur, affaire, origine: 'etude', semaine: j.semaine })
    }
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date) || (a.affaire.code_affaire ?? '').localeCompare(b.affaire.code_affaire ?? ''))
}

/** Semaines complètes (lundi → dimanche) couvrant le mois ; `mois` de 1 à 12. */
export function grilleMois(annee, mois) {
  const premier = Date.UTC(annee, mois - 1, 1)
  const dernier = Date.UTC(annee, mois, 0)
  let jour = premier - ((new Date(premier).getUTCDay() + 6) % 7) * JOUR
  const semaines = []
  while (jour <= dernier) {
    const semaine = []
    for (let i = 0; i < 7; i++, jour += JOUR) semaine.push({ date: iso(jour), duMois: new Date(jour).getUTCMonth() === mois - 1 })
    semaines.push(semaine)
  }
  return semaines
}

export function parJour(evenements) {
  const m = new Map()
  for (const e of evenements) {
    if (!m.has(e.date)) m.set(e.date, [])
    m.get(e.date).push(e)
  }
  return m
}

/** Échéances d'aujourd'hui (compris) aux `jours` suivants (compris). */
export function prochaines(evenements, aujourdhui, jours = 30) {
  return evenements
    .filter((e) => { const d = ecartJours(aujourdhui, e.date); return d >= 0 && d <= jours })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Affaires où l'utilisateur peut écrire : la règle de `peut_modifier_affaire`
 * (migration 060) — propriétaire ou collaborateur, ou affaire sans
 * collaborateur. Un extérieur ne compte pas comme collaborateur.
 */
export function affairesModifiables(affaires, collaborateurs, utilisateurId) {
  const parAffaire = new Map()
  for (const c of collaborateurs ?? []) {
    if (!parAffaire.has(c.affaire_id)) parAffaire.set(c.affaire_id, [])
    parAffaire.get(c.affaire_id).push(c)
  }
  const ids = new Set()
  for (const a of affaires ?? []) {
    const liste = parAffaire.get(a.id) ?? []
    if (liste.length === 0 || liste.some((c) => c.user_id === utilisateurId && (c.role === 'proprietaire' || c.role === 'collaborateur'))) ids.add(a.id)
  }
  return ids
}

/** Affaires dont l'utilisateur est propriétaire ou collaborateur. */
export function mesAffaires(collaborateurs, utilisateurId) {
  return new Set((collaborateurs ?? [])
    .filter((c) => c.user_id === utilisateurId && (c.role === 'proprietaire' || c.role === 'collaborateur'))
    .map((c) => c.affaire_id))
}

/**
 * Tâches à faire de toutes les affaires, groupées par affaire.
 * @param filtres { affaires?: Set, personne?: id, enRetard?: bool }
 * @returns [{ affaire, taches, enRetard }] — groupes en retard d'abord, puis par code
 */
export function groupesTaches(taches, affaires, filtres = {}, aujourdhui) {
  const parId = new Map((affaires ?? []).map((a) => [a.id, a]))
  const retenues = (taches ?? []).filter((t) => t.type === 'tache' && !t.fait_le && parId.has(t.affaire_id)
    && (!filtres.affaires || filtres.affaires.has(t.affaire_id))
    && (!filtres.personne || t.responsable_id === filtres.personne)
    && (!filtres.enRetard || enRetard(t, aujourdhui)))
  const groupes = new Map()
  for (const t of retenues) {
    if (!groupes.has(t.affaire_id)) groupes.set(t.affaire_id, [])
    groupes.get(t.affaire_id).push(t)
  }
  return [...groupes.entries()]
    .map(([id, liste]) => ({ affaire: parId.get(id), taches: tachesTriees(liste).aFaire, enRetard: liste.filter((t) => enRetard(t, aujourdhui)).length }))
    .sort((a, b) => (b.enRetard > 0) - (a.enRetard > 0) || (a.affaire.code_affaire ?? '').localeCompare(b.affaire.code_affaire ?? ''))
}

/** Initiales d'un compte, comme sur la page d'une affaire : prénom puis nom. */
export function initiales(profil) {
  if (!profil) return ''
  const lettres = `${(profil.prenom ?? '').trim().charAt(0)}${(profil.nom ?? '').trim().charAt(0)}`.toUpperCase()
  return lettres || (profil.email ?? '').trim().charAt(0).toUpperCase()
}

/**
 * Équipe de chaque affaire, telle que le calendrier l'annonce : propriétaire
 * et collaborateurs de l'agence, sans les associés (ils lisent le calendrier)
 * ni les extérieurs. Un compte dont le profil n'est pas lu est passé.
 * @param profils { [id]: profil }
 * @returns Map affaireId → [{ id, initiales, nom, proprietaire }] — propriétaire d'abord
 */
export function equipeParAffaire(collaborateurs, profils) {
  const m = new Map()
  for (const c of collaborateurs ?? []) {
    const p = profils?.[c.user_id]
    if (!p || p.est_associe || (c.role !== 'proprietaire' && c.role !== 'collaborateur')) continue
    if (!m.has(c.affaire_id)) m.set(c.affaire_id, [])
    const liste = m.get(c.affaire_id)
    if (!liste.some((x) => x.id === c.user_id)) {
      liste.push({ id: c.user_id, initiales: initiales(p), nom: [p.prenom, p.nom].filter(Boolean).join(' ').trim() || p.email || '', proprietaire: c.role === 'proprietaire' })
    }
  }
  for (const liste of m.values()) liste.sort((a, b) => (b.proprietaire - a.proprietaire) || a.initiales.localeCompare(b.initiales))
  return m
}
