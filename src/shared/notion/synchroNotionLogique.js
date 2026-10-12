// ─── Échéances partagées avec Notion : la comparaison ────────────────────────
//
// On ne guette pas chaque geste : on compare Notion, le registre et les
// plannings, et on en déduit ce qu'il faut faire de chaque côté. Ainsi aucun
// chemin de modification n'est oublié (glissement, Décaler, ⌘Z…) et un envoi
// raté est rattrapé au passage suivant. `date_synchro` est la date sur
// laquelle les deux côtés étaient d'accord : celui qui s'en écarte a bougé.
// Règles : docs/superpowers/specs/2026-10-12-echeances-notion-design.md, §3.
// Rien n'est écrit ici (tests/echeances-notion.test.js).

import { periodeAffaire } from '../../affaire/phaseAffaire.js'
import {
  lireCarte, numeroAffaire, codeCarte, titreCarte, remplacerDate, remplacerLibelle,
  champsJalon, memePosition, dateDuJalon, nomAffaireNotion,
} from './echeancesNotionLogique.js'
import { COULEUR_NOTION } from './codesAffaire.js'

export { COULEUR_NOTION }

const cle = (origine, id) => `${origine}:${id}`

// Une date retrouvée dans la carte : même date d'abord, puis même rang (une
// date changée dans Notion garde sa place ; une date ajoutée au milieu ne
// décale pas les autres)
function apparier(dates, lignes) {
  const restantes = [...lignes]
  const paires = []
  const sansDate = []
  for (const d of dates) {
    const i = restantes.findIndex((l) => l.date_synchro === d.date)
    if (i >= 0) paires.push([d, restantes.splice(i, 1)[0]])
    else sansDate.push(d)
  }
  const nouvelles = []
  for (const d of sansDate) {
    const i = restantes.findIndex((l) => l.rang === d.rang)
    if (i >= 0) paires.push([d, restantes.splice(i, 1)[0]])
    else nouvelles.push(d)
  }
  return { paires, nouvelles, disparues: restantes }
}

const CHAMPS_COMPARES = ['page_id', 'rang', 'numero', 'reference', 'affaire_id', 'origine', 'jalon_id', 'libelle', 'libelle_app', 'date_synchro', 'texte_carte', 'nb_dates']

export function planSynchro({
  cartes = [], lectureComplete = false, registre = [], jalons = [], affaires = [], references = [],
  numero = null, aujourdhui, nouvelId,
}) {
  const plan = { jalons: [], cartes: [], registre: { ecrire: [], supprimer: [] } }
  const dansPortee = (n) => !numero || n === numero

  const affaireParId = new Map(affaires.map((a) => [a.id, a]))
  const affaireParNumero = new Map()
  for (const a of affaires) {
    const n = numeroAffaire(a.code_affaire)
    if (n && !affaireParNumero.has(n)) affaireParNumero.set(n, a)
  }
  const jalonParCle = new Map(jalons.map((j) => [cle(j.origine, j.id), j]))
  const lignes = registre.filter((l) => dansPortee(l.numero))
  const parPage = new Map()
  for (const l of lignes) {
    if (!l.page_id) continue
    if (!parPage.has(l.page_id)) parPage.set(l.page_id, [])
    parPage.get(l.page_id).push(l)
  }
  const referenceDe = (n, titre) => nomAffaireNotion(n, references) ?? codeCarte(String(titre ?? '').replace(/^[\s!?]+/, ''))

  const ecrire = (ligne, avant = null) => {
    if (avant && CHAMPS_COMPARES.every((c) => (avant[c] ?? null) === (ligne[c] ?? null))) return
    plan.registre.ecrire.push({ ligne, nouvelle: !avant })
  }
  // Une date retirée de Notion : l'échéance à venir disparaît, une passée
  // reste (un ménage dans Notion n'efface pas l'historique des plannings)
  const retirer = (l) => {
    plan.registre.supprimer.push(l.id)
    const j = l.jalon_id != null ? jalonParCle.get(cle(l.origine, l.jalon_id)) : null
    if (j && l.date_synchro && l.date_synchro >= aujourdhui) plan.jalons.push({ action: 'supprimer', origine: j.origine, id: j.id })
  }

  const notionLibres = []
  const pagesVues = new Set()
  const jalonsLies = new Set()

  for (const carte of cartes) {
    const lue = lireCarte(carte.titre, carte.creeLe)
    if (!lue.numero || !dansPortee(lue.numero)) continue
    pagesVues.add(carte.id)
    const existantes = parPage.get(carte.id) ?? []
    const aDaterAvant = existantes.find((l) => !l.date_synchro)
    const actives = existantes.filter((l) => l.date_synchro)
    const affaire = affaireParNumero.get(lue.numero) ?? null
    const commun = {
      page_id: carte.id, numero: lue.numero, reference: referenceDe(lue.numero, carte.titre),
      texte_carte: carte.titre, notion_modifie_le: carte.modifieLe ?? null,
    }

    if (lue.aDater) {
      actives.forEach(retirer)
      ecrire({
        ...(aDaterAvant ?? { id: nouvelId() }), ...commun, rang: 0, affaire_id: affaire?.id ?? null,
        origine: null, jalon_id: null, libelle: null, libelle_app: null, date_synchro: null, nb_dates: 0,
      }, aDaterAvant ?? null)
      continue
    }
    if (aDaterAvant) plan.registre.supprimer.push(aDaterAvant.id)

    const { paires, nouvelles, disparues } = apparier(lue.dates, actives)
    disparues.forEach(retirer)
    const plusieurs = lue.dates.length > 1

    for (const [d, l] of paires) {
      const ligneCarte = { ...l, ...commun, rang: d.rang, nb_dates: lue.dates.length }
      const j = l.jalon_id != null ? jalonParCle.get(cle(l.origine, l.jalon_id)) : null
      if (j) jalonsLies.add(cle(j.origine, j.id))

      if (!j) {
        const chargee = l.affaire_id ? affaireParId.has(l.affaire_id) : false
        // Affaire de la ligne hors des données lues (synchro d'un autre
        // planning, plafond de lignes) : l'échéance n'est pas « supprimée »,
        // elle est seulement absente — on ne touche à rien
        if (l.jalon_id != null && l.affaire_id && !chargee) continue
        // Supprimée dans l'app : la carte part à la corbeille — sauf une
        // carte à plusieurs dates, où Notion fait foi. Une ligne sans affaire
        // (affaire supprimée de l'app) ne prouve rien : jamais de corbeille.
        if (l.jalon_id != null && chargee && !plusieurs) {
          plan.cartes.push({ action: 'corbeille', pageId: carte.id })
          plan.registre.supprimer.push(l.id)
          continue
        }
        if (affaire) {
          // Affaire arrivée dans l'app après la carte : si son planning a déjà
          // l'échéance au même endroit, on les relie au lieu de les doubler
          const existant = jalons.find((x) => x.affaire_id === affaire.id && !jalonsLies.has(cle(x.origine, x.id))
            && memePosition(x, d.date) && !lignes.some((o) => o.id !== l.id && o.jalon_id === x.id && o.origine === x.origine))
          if (existant) {
            jalonsLies.add(cle(existant.origine, existant.id))
            ecrire({ ...ligneCarte, affaire_id: affaire.id, origine: existant.origine, jalon_id: existant.id, libelle: d.libelle, libelle_app: existant.label, date_synchro: d.date }, l)
            continue
          }
          const origine = periodeAffaire(affaire.phase)
          plan.jalons.push({ action: 'creer', ligneId: l.id, origine, affaire_id: affaire.id, label: d.libelle, ...champsJalon(origine, d.date) })
          ecrire({ ...ligneCarte, affaire_id: affaire.id, origine, jalon_id: null, libelle: d.libelle, libelle_app: d.libelle, date_synchro: d.date }, l)
          continue
        }
        ecrire({ ...ligneCarte, affaire_id: null, origine: null, jalon_id: null, libelle: d.libelle, libelle_app: null, date_synchro: d.date }, l)
        continue
      }

      const notionBouge = d.date !== l.date_synchro
      const appBouge = !memePosition(j, l.date_synchro)
      const libelleNotionBouge = d.libelle !== l.libelle
      const libelleAppBouge = j.label !== l.libelle_app
      const notionChange = notionBouge || libelleNotionBouge
      const appChange = appBouge || libelleAppBouge
      // Date.parse : Notion écrit « …00.000Z », Supabase « …00+00:00 »
      const notionPlusRecent = !j.modifie_le || (Date.parse(carte.modifieLe) || 0) >= (Date.parse(j.modifie_le) || 0)
      const notionGagne = plusieurs || !appChange || (notionChange && notionPlusRecent)

      if (notionGagne) {
        if (!memePosition(j, d.date)) plan.jalons.push({ action: 'deplacer', origine: j.origine, id: j.id, ...champsJalon(j.origine, d.date), decrocher: !!j.ancre })
        // Le libellé de Notion ne remplace celui de l'app que s'il a changé
        const label = libelleNotionBouge ? d.libelle : j.label
        if (label !== j.label) plan.jalons.push({ action: 'renommer', origine: j.origine, id: j.id, label })
        ecrire({ ...ligneCarte, libelle: d.libelle, libelle_app: label, date_synchro: d.date }, l)
        continue
      }

      const nouvelleDate = dateDuJalon(j, l.date_synchro)
      let titre = carte.titre
      if (nouvelleDate !== d.date) {
        titre = remplacerDate(titre, d, nouvelleDate)
        // Sans année, la date se relirait au plus près de la création de la
        // carte : une date lointaine reviendrait un an à côté. On l'écrit
        // alors avec son année.
        if (lireCarte(titre, carte.creeLe).dates[d.rang]?.date !== nouvelleDate) {
          titre = remplacerDate(carte.titre, { ...d, avecAnnee: true, anneeCourte: true }, nouvelleDate)
        }
      }
      if (libelleAppBouge) {
        titre = remplacerLibelle(titre, d.libelle, j.label)
          ?? titreCarte({ code: affaire?.code_affaire ?? l.reference ?? lue.numero, libelle: j.label, date: nouvelleDate })
      }
      if (titre !== carte.titre) plan.cartes.push({ action: 'modifier', pageId: carte.id, titre, semaine: nouvelleDate })
      // Le libellé gardé est celui que Notion relira dans ce titre, sinon le
      // passage suivant y verrait un renommage venu de Notion
      const relue = lireCarte(titre, carte.creeLe)
      const libelle = (relue.dates[d.rang] ?? relue.dates[0])?.libelle ?? d.libelle
      ecrire({ ...ligneCarte, texte_carte: titre, libelle, libelle_app: j.label, date_synchro: nouvelleDate }, l)
    }

    for (const d of nouvelles) notionLibres.push({ carte, lue, d, commun, affaire })
  }

  // Cartes disparues (corbeille, archivées, sorties de la colonne) : seulement
  // si toute la colonne a été lue, sinon une lecture coupée effacerait tout
  if (lectureComplete) {
    for (const [pageId, ls] of parPage) {
      if (pagesVues.has(pageId)) continue
      for (const l of ls) (l.date_synchro ? retirer(l) : plan.registre.supprimer.push(l.id))
    }
  }

  // Échéances de l'app sans carte : d'abord une date de carte libre de même
  // affaire et même jour (même semaine à l'étude), sinon une carte à créer
  const enAttente = new Map(lignes.filter((l) => !l.page_id && l.jalon_id != null).map((l) => [cle(l.origine, l.jalon_id), l]))
  for (const j of jalons) {
    const k = cle(j.origine, j.id)
    if (jalonsLies.has(k)) continue
    const lieeAilleurs = lignes.some((l) => l.page_id && l.jalon_id === j.id && l.origine === j.origine)
    if (lieeAilleurs) continue
    const affaire = affaireParId.get(j.affaire_id)
    const n = numeroAffaire(affaire?.code_affaire)
    if (!n || !dansPortee(n)) continue
    const attente = enAttente.get(k) ?? null
    const i = notionLibres.findIndex((x) => x.lue.numero === n && memePosition(j, x.d.date))
    if (i >= 0) {
      const { lue, d, commun } = notionLibres.splice(i, 1)[0]
      ecrire({
        ...(attente ?? { id: nouvelId() }), ...commun, rang: d.rang, nb_dates: lue.dates.length, affaire_id: affaire.id,
        origine: j.origine, jalon_id: j.id, libelle: d.libelle, libelle_app: j.label, date_synchro: d.date,
      }, attente)
      continue
    }
    const date = dateDuJalon(j, null)
    if (date < aujourdhui) {
      if (attente) plan.registre.supprimer.push(attente.id)
      continue
    }
    const titre = titreCarte({ code: affaire.code_affaire, libelle: j.label, date })
    const relue = lireCarte(titre, aujourdhui).dates[0]
    const nouvelle = {
      ...(attente ?? { id: nouvelId() }), page_id: null, rang: 0, numero: n, reference: null, affaire_id: affaire.id,
      origine: j.origine, jalon_id: j.id, libelle: relue?.libelle ?? j.label, libelle_app: j.label, date_synchro: date,
      texte_carte: titre, nb_dates: 1, notion_modifie_le: null,
    }
    ecrire(nouvelle, attente)
    plan.cartes.push({ action: 'creer', ligneId: nouvelle.id, titre, semaine: date })
  }

  // Ligne en attente de carte dont l'échéance a été supprimée dans l'app
  // (affaire lue, sinon on ne sait rien)
  for (const [k, l] of enAttente) {
    if (!jalonParCle.has(k) && l.affaire_id && affaireParId.has(l.affaire_id)) plan.registre.supprimer.push(l.id)
  }

  // Dates de cartes restées libres : une échéance du planning si l'affaire
  // est dans l'app, sinon une ligne seule (affaire absente de l'app)
  for (const { lue, d, commun, affaire } of notionLibres) {
    const id = nouvelId()
    const ligneCarte = { id, ...commun, rang: d.rang, nb_dates: lue.dates.length, libelle: d.libelle, date_synchro: d.date }
    if (affaire) {
      const origine = periodeAffaire(affaire.phase)
      plan.jalons.push({ action: 'creer', ligneId: id, origine, affaire_id: affaire.id, label: d.libelle, ...champsJalon(origine, d.date) })
      ecrire({ ...ligneCarte, affaire_id: affaire.id, origine, jalon_id: null, libelle_app: d.libelle })
    } else {
      ecrire({ ...ligneCarte, affaire_id: null, origine: null, jalon_id: null, libelle_app: null })
    }
  }

  return plan
}
