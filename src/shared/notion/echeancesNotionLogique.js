// ─── Échéances partagées avec Notion : lecture des cartes ────────────────────
//
// Conception : docs/superpowers/specs/2026-10-12-echeances-notion-design.md.
// L'agence note ses rendus sur des cartes en texte libre (« 2699 ABC : Rendu
// PRO 16/10 ») dans la colonne « ECHEANCES RENDUS » du Planning hebdomadaire
// Notion, dont la structure ne doit pas changer. On y lit donc le numéro
// d'affaire et les dates dans le texte. Positions gardées sur le texte brut :
// une date se réécrit sans toucher au reste de la carte. Dates en UTC : un
// calcul à l'heure locale perdrait un jour au passage à l'heure d'été.
// Testé sans navigateur (tests/echeances-notion.test.js).

import { vendrediSemaineIso, semaineIso } from '../../gestion/gestionLogique.js'
import { numeroAffaire, codeCarte } from './codesAffaire.js'

export const COLONNE_ECHEANCES = 'ECHEANCES RENDUS'

const JOUR = 86400000
const msIso = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const isoMs = (m) => new Date(m).toISOString().slice(0, 10)

export { numeroAffaire, codeCarte }

const MOTIF_DATE = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g

/**
 * Dates écrites dans un texte. Sans année, celle qui place la date au plus
 * près de la création de la carte : « 05/01 » noté en décembre vise janvier.
 */
export function datesDuTexte(texte, creeLe) {
  const t = String(texte ?? '')
  const reference = msIso(String(creeLe ?? new Date().toISOString()).slice(0, 10))
  const anneeReference = new Date(reference).getUTCFullYear()
  const trouvees = []
  for (const m of t.matchAll(MOTIF_DATE)) {
    const jour = +m[1]
    const mois = +m[2]
    const annees = m[3] ? [m[3].length === 2 ? 2000 + +m[3] : +m[3]] : [anneeReference - 1, anneeReference, anneeReference + 1]
    const valides = annees
      .map((a) => Date.UTC(a, mois - 1, jour))
      .filter((ms) => mois >= 1 && mois <= 12 && new Date(ms).getUTCDate() === jour && new Date(ms).getUTCMonth() === mois - 1)
    if (valides.length === 0) continue
    valides.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference))
    trouvees.push({
      date: isoMs(valides[0]), texte: m[0], debut: m.index, fin: m.index + m[0].length,
      avecAnnee: !!m[3], anneeCourte: m[3]?.length === 2,
    })
  }
  return trouvees
}

const SEPARATEUR = /\s+[-–+]\s+/g
const BORDS = /^[\s\-–:+,]+|[\s\-–:+,]+$/g

// En tête de carte : marques d'urgence, numéro, puis le code en capitales
// (« ABC », « H&H », « GENdarmerie ») — l'affaire s'affiche déjà à part
function sansEntete(texte, numero) {
  let t = texte.replace(/^[\s!?]+/, '')
  if (!numero || !t.startsWith(numero)) return t
  t = t.slice(numero.length).replace(/^[\s\-–:]+/, '')
  return t.replace(/^[A-Z&]{2,}[\p{L}&]*(?=[\s\-–:]|$)/u, '').replace(/^[\s\-–:]+/, '')
}

function libelleAutour(titre, d, plusieurs, numero) {
  let debut = 0
  let fin = titre.length
  if (plusieurs) {
    for (const s of titre.matchAll(SEPARATEUR)) {
      if (s.index + s[0].length <= d.debut) debut = s.index + s[0].length
      else if (s.index >= d.fin) { fin = s.index; break }
    }
  }
  let morceau = titre.slice(debut, d.debut) + titre.slice(d.fin, fin)
  if (debut === 0) morceau = sansEntete(morceau, numero)
  return morceau.replace(/\s+/g, ' ').replace(BORDS, '').trim()
}

/** Une carte : son affaire, ses dates (chacune avec son libellé), ou « à dater ». */
export function lireCarte(titre, creeLe) {
  const texte = String(titre ?? '')
  const numero = numeroAffaire(texte)
  const trouvees = datesDuTexte(texte, creeLe)
  const plusieurs = trouvees.length > 1
  const dates = trouvees.map((d, rang) => ({ ...d, rang, libelle: libelleAutour(texte, d, plusieurs, numero) || 'Échéance' }))
  return { numero, dates, aDater: dates.length === 0 }
}

export const formatDateCarte = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** Libellé écrit dans une carte : « 1/2 » se lirait comme une seconde date. */
export function libellePourCarte(libelle) {
  return (String(libelle ?? '').trim() || 'Échéance').replace(/(?<=\d)\/(?=\d)/g, '-')
}

/** Carte créée par l'app, au format de l'agence : « 2699 ABC – Rendu PRO 16/10/26 ». */
export function titreCarte({ code, libelle, date }) {
  return `${codeCarte(code)} – ${libellePourCarte(libelle)} ${formatDateCarte(date)}`
}

function formatComme(d, iso) {
  const jm = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (!d.avecAnnee) return jm
  return `${jm}/${d.anneeCourte ? iso.slice(2, 4) : iso.slice(0, 4)}`
}

/** Remplace une date lue par `lireCarte`, dans le format où elle était écrite. */
export function remplacerDate(titre, d, nouvelleIso) {
  return titre.slice(0, d.debut) + formatComme(d, nouvelleIso) + titre.slice(d.fin)
}

/** Null si l'ancien libellé n'apparaît pas exactement une fois : on ne devine pas. */
export function remplacerLibelle(titre, ancien, nouveau) {
  if (!ancien || titre.split(ancien).length !== 2) return null
  return titre.replace(ancien, () => nouveau)
}

/** Date d'une échéance d'étude : sa semaine, le jour de la semaine de la référence (vendredi sinon). */
export function dateEtude(semaine, annee, dateReference = null) {
  const lundi = msIso(vendrediSemaineIso(semaine, annee)) - 4 * JOUR
  const rangJour = dateReference ? (new Date(msIso(dateReference)).getUTCDay() + 6) % 7 : 4
  return isoMs(lundi + rangJour * JOUR)
}

export function champsJalon(origine, dateIso) {
  if (origine !== 'etude') return { date: dateIso }
  const { semaine, annee } = semaineIso(dateIso)
  return { semaine, annee }
}

export function memePosition(jalon, dateIso) {
  if (jalon.origine !== 'etude') return jalon.date === dateIso
  const { semaine, annee } = semaineIso(dateIso)
  return jalon.semaine === semaine && jalon.annee === annee
}

export function dateDuJalon(jalon, dateReference = null) {
  return jalon.origine === 'etude' ? dateEtude(jalon.semaine, jalon.annee, dateReference) : jalon.date
}

export function nomAffaireNotion(numero, references) {
  return (references ?? []).find((r) => r.numero === numero)?.reference ?? null
}
