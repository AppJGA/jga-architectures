// ─── Fenêtre d'export de l'état des lieux : calculs sans navigateur ──────────
//
// La fenêtre (ExportEdl.jsx) montre un aperçu de chaque fichier avant de
// fabriquer le ZIP. Ce qui se voit doit être ce qui part : l'aperçu et le ZIP
// passent par les mêmes fonctions d'ici (`preparerExport`, `dxfDuNiveau`),
// avec les mêmes réglages, et les sorties sont gardées par clé de réglages
// (`cleDxf`, `cleRapport`) pour que le ZIP reprenne ce qui a été montré.
// Pur, testé (tests/etat-des-lieux-export-fenetre.test.js).

import { zipSync } from 'fflate'
import { CALQUES } from '../calquesEdl.js'
import { lireDxf, lireTablesDxf } from '../dxfLecture.js'
import { piecesVisitees } from '../visite/visiteLogique.js'
import { CALQUE_A_VALIDER, elementsAExporter, genererDxfEdl, uniteDxf } from './exportDxfEdl.js'
import { numeroterPhotos } from './numerotationEdl.js'
import { COULEURS_CALQUES, COULEUR_PROPOSITION, nomFichierRapportEdl } from './rapportEdlLogique.js'

// ─── Réglages ───────────────────────────────────────────────────────────────

/** Tous les étages, propositions écartées, DXF avec le plan, rapport. */
export function reglagesParDefaut(niveaux = []) {
  return { niveaux: niveaux.map((n) => n.id), inclurePropositions: false, avecPlan: true, rapport: true }
}

// Les étages dans l'ordre du plan, quel que soit l'ordre des coches
const niveauxChoisis = (niveaux, reglages) => {
  const choisis = new Set(reglages?.niveaux ?? [])
  return (niveaux ?? []).filter((n) => choisis.has(n.id))
}

/** Clé d'un DXF : seuls l'étage, les propositions et le plan le changent. */
export const cleDxf = (niveauId, reglages, avecPlan) =>
  `dxf|${niveauId}|${reglages?.inclurePropositions ? 1 : 0}|${avecPlan ? 1 : 0}`

/** Clé du rapport : les étages retenus et les propositions (pas le plan des DXF). */
export const cleRapport = (reglages) =>
  `rapport|${reglages?.inclurePropositions ? 1 : 0}|${[...(reglages?.niveaux ?? [])].sort().join(',')}`

/** Rien à exporter : aucun étage, ou ni DXF possible ni rapport. */
export const exportPossible = (reglages) => (reglages?.niveaux?.length ?? 0) > 0

// ─── Ce qui part, étage par étage ───────────────────────────────────────────

/**
 * Tout ce que l'export fabrique, découpé par étage, à partir des lignes lues
 * (`lireDonneesExport`). Les photos sont numérotées une fois pour toute
 * l'affaire (« Ph 12 » du DXF = « Ph 12 » du rapport), même quand une partie
 * des étages seulement est exportée.
 *
 * @returns { etages: [{ niveau, pieces, points, photos, elementsExport, unite }],
 *            rapport: { niveaux, pieces, points, elements, elementsExport, photos, visitees } }
 */
export function preparerExport(donnees, reglages) {
  const niveaux = donnees?.niveaux ?? []
  const pieces = donnees?.pieces ?? []
  const points = donnees?.points ?? []
  const elements = donnees?.elements ?? []
  const inclurePropositions = !!reglages?.inclurePropositions

  const photos = numeroterPhotos(donnees?.photos ?? [], points, { niveaux, pieces })
  const elementsExport = elementsAExporter({ pieces, points, elements, inclurePropositions })
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  const piecesParId = new Map(pieces.map((p) => [p.id, p]))
  // Un élément suit l'étage de son point, à défaut celui de sa pièce
  const niveauDeLElement = (e) => pointsParId.get(e.pointId)?.niveau_id ?? piecesParId.get(e.pieceId)?.niveau_id ?? null

  const etages = niveauxChoisis(niveaux, reglages).map((niveau) => {
    const siennes = pieces.filter((p) => p.niveau_id === niveau.id)
    const sesPoints = points.filter((p) => p.niveau_id === niveau.id)
    const ids = new Set(sesPoints.map((p) => p.id))
    return {
      niveau,
      pieces: siennes,
      points: sesPoints,
      photos: photos.filter((ph) => ids.has(ph.point_id)),
      elementsExport: elementsExport.filter((e) => niveauDeLElement(e) === niveau.id),
      unite: uniteDxf(niveau.unites_par_metre),
    }
  })

  const retenus = new Set(etages.map((e) => e.niveau.id))
  const pointsRetenus = points.filter((p) => retenus.has(p.niveau_id))
  const idsPoints = new Set(pointsRetenus.map((p) => p.id))
  return {
    etages,
    rapport: {
      niveaux: etages.map((e) => e.niveau),
      pieces: pieces.filter((p) => retenus.has(p.niveau_id)),
      points: pointsRetenus,
      elements,
      elementsExport: etages.flatMap((e) => e.elementsExport),
      photos: photos.filter((ph) => idsPoints.has(ph.point_id)),
      visitees: piecesVisitees(donnees?.entrees),
    },
  }
}

/** Le DXF d'un étage (texte), avec ou sans le plan existant (vecteurs décodés). */
export function dxfDuNiveau(etage, { plan = null, inclurePropositions = false } = {}) {
  return genererDxfEdl({
    niveau: etage.niveau,
    pieces: etage.pieces,
    elementsExport: etage.elementsExport,
    photos: etage.photos,
    points: etage.points,
    unitesParMetre: etage.unite.unitesParMetre,
    plan,
    inclurePropositions,
  })
}

// ─── Noms des fichiers ──────────────────────────────────────────────────────

/** « 2026-11-18-2618-etat-des-lieux.zip », comme le rapport. */
export const nomFichierZip = (affaire, date = new Date()) => nomFichierRapportEdl(affaire, date).replace(/\.pdf$/, '.zip')

// Nom d'étage lisible dans un nom de fichier : sans accents ni espaces ;
// le « + » de « R+1 » reste (« R-1 » serait le sous-sol)
const morceauEtage = (nom) => String(nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9+-]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Noms des deux DXF de chaque étage : « 2026-11-18-2618-RDC-EDL.dxf » et
 * « …-RDC-EDL-avec-plan.dxf ». Deux étages de même nom (ou sans nom) sont
 * départagés par un numéro : un fichier du ZIP n'en écrase jamais un autre.
 * @returns Map niveauId → { edl, avecPlan }
 */
export function nomsFichiersDxf(affaire, niveaux = [], date = new Date()) {
  const base = nomFichierRapportEdl(affaire, date).replace(/-etat-des-lieux\.pdf$/, '')
  const vus = new Map()
  const noms = new Map()
  niveaux.forEach((n, i) => {
    const morceau = morceauEtage(n.nom) || `etage-${i + 1}`
    const cle = morceau.toLowerCase()
    const rang = (vus.get(cle) ?? 0) + 1
    vus.set(cle, rang)
    const radical = `${base}-${morceau}${rang > 1 ? `-${rang}` : ''}-EDL`
    noms.set(n.id, { edl: `${radical}.dxf`, avecPlan: `${radical}-avec-plan.dxf` })
  })
  return noms
}

/**
 * Le ZIP : `fichiers` = [{ nom, octets (Uint8Array) }]. Les DXF (texte) se
 * compressent bien : niveau 6, le défaut de fflate. Le PDF est déjà
 * compressé (images JPEG, flux dégonflés) : rangé tel quel (niveau 0),
 * sans passer des secondes à le recompresser pour rien sur un iPad.
 */
export function fabriquerZip(fichiers = []) {
  const contenu = {}
  for (const f of fichiers) contenu[f.nom] = /\.pdf$/i.test(f.nom) ? [f.octets, { level: 0 }] : [f.octets, { level: 6 }]
  return zipSync(contenu)
}

// ─── Données fraîches de l'analyse ──────────────────────────────────────────

const CHAMPS_ANALYSE = ['fiche', 'fiche_a_valider', 'hsp_lue', 'analyse_le']

/**
 * Les pièces de `chargerEtat` (qui peut venir de la mémoire du service
 * worker) recouvertes par les champs frais que `lireEtatAnalyse` relit
 * (lecture `synchro_id`, jamais servie par la mémoire) : une fiche validée
 * juste avant l'export part validée. Seuls les champs présents dans la
 * lecture fraîche remplacent (sans la 082, rien n'est relu).
 */
export function superposerAnalyse(pieces = [], fraiches = []) {
  const parId = new Map((fraiches ?? []).map((p) => [p.id, p]))
  return (pieces ?? []).map((p) => {
    const f = parId.get(p.id)
    if (!f) return p
    const champs = {}
    for (const c of CHAMPS_ANALYSE) if (c in f) champs[c] = f[c]
    return { ...p, ...champs }
  })
}

// ─── Mémoire bornée des sorties ─────────────────────────────────────────────
//
// Un rapport pèse 10 à 30 Mo en Blob, un DXF avec le plan plusieurs Mo de
// texte : garder tout ce qui a été essayé dans la séance fait tomber
// l'onglet sur iPad. On ne garde que ce que l'écran montre ou pourrait
// montrer tout de suite, et ce qu'un export en cours attend.

/**
 * Clés à garder : le rapport des réglages (affichés et différés), les deux
 * variantes du DXF de l'étage visible, le dessin à l'écran, et les clés
 * qu'un export attend (`retenues`).
 * @param reglages liste de réglages (l'écran, l'aperçu différé), null ignorés
 * @returns { rapport, dxf, dessins } : trois Set de clés
 */
export function clesAGarder({ reglages = [], etageVisible = null, dessinVisible = null, retenues = [] } = {}) {
  const rapport = new Set()
  const dxf = new Set()
  const dessins = new Set()
  for (const r of reglages) {
    if (!r) continue
    if (r.rapport) rapport.add(cleRapport(r))
    if (etageVisible && r.niveaux?.includes(etageVisible)) {
      for (const avec of [false, true]) dxf.add(cleDxf(etageVisible, r, avec))
    }
  }
  if (dessinVisible) dessins.add(dessinVisible)
  for (const k of retenues) (String(k).startsWith('rapport|') ? rapport : dxf).add(k)
  return { rapport, dxf, dessins }
}

/**
 * Clés à retirer d'un cache : celles qui ne sont pas à garder et dont la
 * fabrication est finie (`regle`). Une fabrication en cours n'est pas
 * coupée ici : périmée, elle s'arrête d'elle-même et se retire en échouant.
 * @param entrees Map clé → { regle } (ou valeur simple : comptée réglée)
 */
export function clesAEvincer(entrees, garder) {
  const sortie = []
  for (const [cle, e] of entrees ?? []) {
    const regle = e && typeof e === 'object' && 'regle' in e ? e.regle : true
    if (regle && !garder.has(cle)) sortie.push(cle)
  }
  return sortie
}

// ─── Avertissements ─────────────────────────────────────────────────────────

const pluriel = (n, singulier, plurielMot = `${singulier}s`) => (n > 1 ? plurielMot : singulier)

/**
 * Ce que la fenêtre signale en ambre avant l'export : propositions laissées
 * de côté, unité de plan que le DXF ne sait pas dire, réseau absent.
 */
export function avertissementsExport({ donnees, reglages, enLigne = true }) {
  const sortie = []
  if (!enLigne) sortie.push('L’export demande du réseau (photos, plans).')
  const retenus = new Set(reglages?.niveaux ?? [])
  const niveaux = (donnees?.niveaux ?? []).filter((n) => retenus.has(n.id))
  if (!reglages?.inclurePropositions) {
    const pointsParId = new Map((donnees?.points ?? []).map((p) => [p.id, p]))
    const piecesParId = new Map((donnees?.pieces ?? []).map((p) => [p.id, p]))
    const niveauDe = (e) => pointsParId.get(e.point_id)?.niveau_id ?? piecesParId.get(e.piece_id)?.niveau_id ?? null
    const n = (donnees?.elements ?? []).filter((e) => e.a_valider && retenus.has(niveauDe(e))).length
    if (n > 0) sortie.push(`${n} ${pluriel(n, 'élément')} à valider ne ${n > 1 ? 'seront' : 'sera'} pas ${pluriel(n, 'exporté')}.`)
    const fiches = (donnees?.pieces ?? []).filter((p) => p.fiche_a_valider && retenus.has(p.niveau_id)).length
    if (fiches > 0) sortie.push(`${fiches} ${pluriel(fiches, 'fiche')} de pièce à valider : finitions non exportées.`)
  }
  for (const n of niveaux) {
    // Sans unité connue, `uniteDxf` prend le mètre : le dire, un plan en cm
    // arriverait cent fois trop grand
    if (!(Number(n.unites_par_metre) > 0)) {
      sortie.push(`Unité du plan inconnue : DXF en mètres (étage ${n.nom || 'sans nom'}).`)
      continue
    }
    const u = uniteDxf(n.unites_par_metre)
    if (!u.exacte) {
      sortie.push(`Étage ${n.nom || 'sans nom'} : unité du plan inhabituelle (${String(u.unitesParMetre).replace(".", ",")} par mètre). Le DXF garde les coordonnées du plan et annonce « ${u.nom} », l’unité la plus proche.`)
    }
  }
  return sortie
}

// ─── Aperçu d'un DXF ────────────────────────────────────────────────────────

// Calques sans couleur dans le rapport : encre pour les pièces, tons propres
// pour les autres ; le plan existant en gris clair, sous les calques EDL-
const COULEURS_APERCU = {
  pieces: '#1F1B17',
  finitions: '#8A6A3B',
  cotes: '#0E7490',
  photos: '#7C3AED',
}
export const COULEUR_PLAN_APERCU = '#C9C4BE'
const PAR_NOM = new Map(CALQUES.map((c) => [c.nom, c.code]))

/** Couleur d'un calque dans l'aperçu, et s'il est un calque de l'état des lieux. */
export function couleurCalqueApercu(nom) {
  if (nom === CALQUE_A_VALIDER) return { couleur: COULEUR_PROPOSITION, edl: true }
  const code = PAR_NOM.get(nom)
  if (!code) return { couleur: COULEUR_PLAN_APERCU, edl: false }
  return { couleur: COULEURS_APERCU[code] ?? COULEURS_CALQUES[code] ?? '#5E5854', edl: true }
}

/**
 * Le DXF produit, relu par le lecteur de l'import, rangé par calque pour le
 * canevas : calques EDL- d'abord (ordre de `calquesEdl.js`, puis « à
 * valider »), puis ceux du plan dans l'ordre de la table.
 * @returns { calques: [{ nom, couleur, edl, traits, textes }], boite, unites }
 */
export function dessinDxf(texte) {
  const lu = lireDxf(texte)
  const { calques: table } = lireTablesDxf(texte)
  const parCalque = new Map()
  const calque = (nom) => {
    if (!parCalque.has(nom)) parCalque.set(nom, { nom, ...couleurCalqueApercu(nom), traits: [], textes: [] })
    return parCalque.get(nom)
  }
  for (const c of table) if (c.nom && c.nom !== '0') calque(c.nom)
  for (const t of lu.traits) calque(t.calque).traits.push(t)
  for (const t of lu.textes) calque(t.calque).textes.push(t)

  const rangEdl = (nom) => {
    if (nom === CALQUE_A_VALIDER) return CALQUES.length
    const i = CALQUES.findIndex((c) => c.nom === nom)
    return i < 0 ? Infinity : i
  }
  const calques = [...parCalque.values()]
    .filter((c) => c.traits.length || c.textes.length)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.edl === b.c.edl ? 0 : a.c.edl ? -1 : 1) || (a.c.edl ? rangEdl(a.c.nom) - rangEdl(b.c.nom) : a.i - b.i))
    .map(({ c }) => c)
  return { calques, boite: boiteDessin(calques), unites: lu.unites }
}

/** Boîte de ce qui est dessiné (traits et points d'insertion des textes), ou null. */
export function boiteDessin(calques, masques = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const prendre = ([x, y]) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  for (const c of calques ?? []) {
    if (masques?.has(c.nom)) continue
    for (const t of c.traits) for (const p of t.pts) prendre(p)
    for (const t of c.textes) prendre(t.pos)
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 }
}

// ─── Vue du canevas : y vers le haut dans le dessin, vers le bas à l'écran ──

export const ECHELLE_MIN = 1e-6
export const ECHELLE_MAX = 1e6

/** Vue qui montre toute la boîte au centre du cadre, avec une marge en pixels. */
export function vueAjustee(boite, largeur, hauteur, marge = 24) {
  if (!boite || !(largeur > 0) || !(hauteur > 0)) return { echelle: 1, tx: largeur / 2 || 0, ty: hauteur / 2 || 0 }
  const l = Math.max(boite.x1 - boite.x0, 1e-9)
  const h = Math.max(boite.y1 - boite.y0, 1e-9)
  const utileL = Math.max(largeur - 2 * marge, 1)
  const utileH = Math.max(hauteur - 2 * marge, 1)
  // Un dessin réduit à un point ne doit pas donner une échelle infinie
  const echelle = Math.min(Math.max(Math.min(utileL / l, utileH / h), ECHELLE_MIN), ECHELLE_MAX)
  const cx = (boite.x0 + boite.x1) / 2
  const cy = (boite.y0 + boite.y1) / 2
  return { echelle, tx: largeur / 2 - cx * echelle, ty: hauteur / 2 + cy * echelle }
}

export const versEcran = (vue, [x, y]) => [vue.tx + x * vue.echelle, vue.ty - y * vue.echelle]
export const versDessin = (vue, [px, py]) => [(px - vue.tx) / vue.echelle, (vue.ty - py) / vue.echelle]

/** Zoom de `facteur` autour du point d'écran (px, py), qui reste en place. */
export function zoomer(vue, facteur, px, py) {
  const echelle = Math.min(Math.max(vue.echelle * facteur, ECHELLE_MIN), ECHELLE_MAX)
  const [x, y] = versDessin(vue, [px, py])
  return { echelle, tx: px - x * echelle, ty: py + y * echelle }
}

export const deplacer = (vue, dx, dy) => ({ ...vue, tx: vue.tx + dx, ty: vue.ty + dy })

// Alignements DXF (72 / 73) traduits pour le canevas. Le lecteur place un
// texte aligné sur son second point (11 / 21) : pour « aligné » (3) et
// « ajusté » (5), c'est le bout droit de la ligne de base, donc calé à
// droite ; pour « milieu » (4), le milieu du texte dans les deux sens.
const ALIGN_H = ['left', 'center', 'right', 'right', 'center', 'right']
const ALIGN_V = ['alphabetic', 'bottom', 'middle', 'top']
export const alignementCanevas = (texte) => ({
  textAlign: ALIGN_H[texte?.alignH ?? 0] ?? 'left',
  textBaseline: texte?.alignH === 4 ? 'middle' : ALIGN_V[texte?.alignV ?? 0] ?? 'alphabetic',
})
