// ─── Tableaux par niveau et synthèse du rapport d'état des lieux (pur) ──────
//
// L'agence lit son état des lieux en tableaux (synthèse montrée le
// 2026-11-19) : un tableau par niveau, une ligne par pièce, colonnes Pièce ·
// Sol · Mur · Plafond · Bloc porte · Équipements · Points particuliers, chaque
// matériau avec son statut (Conserver, Rafraîchir, Déposer, À préciser). En
// tête du rapport, des chiffres clés et des points d'attention calculés ici,
// sans aucun appel payant.
//
// Ce que dit une ligne se décide ici, une fois pour le PDF
// (`rapportEdlLogique.js`) et le Word : fiche exportée, statuts et porte par
// `ficheExportEdl.js` (la règle du DXF : une fiche proposée écartée ne dit
// rien), quantités par `quantiteElement`, « Ph n » par `numeroterPhotos`.
// Testé (tests/etat-des-lieux-export-tableaux.test.js).

import { typeEdl } from '../calquesEdl.js'
import { STATUT_A_PRECISER } from '../statutsEdl.js'
import { ficheExportee, porteExport, statutExport } from './ficheExportEdl.js'
import { numeroterPhotos } from './numerotationEdl.js'
import { quantiteElement } from './symbolesEdl.js'
import {
  etagesDuRapport, groupesElements, hspPiece, ligneElement, pointsSansElement, relevesHorsPieces, surfacePiece, texteLatin,
} from './rapportEdlLogique.js'

const rempli = (v) => texteLatin(v).replace(/\s+/g, ' ').trim()

/** « 01 Séjour » : numéro et nom de la pièce, pour les textes courts. */
export const libellePiece = (piece) => rempli([piece?.numero, piece?.nom].filter(Boolean).join(' ')) || 'Pièce sans nom'

export const LIBELLE_HORS_PIECES = 'Hors pièces'

// ─── Pluriels des libellés de type (« 3 prises de courant ») ─────────────────

// Libellés que la règle générale accorderait mal (« plafond » n'est pas un adjectif)
const PLURIELS = {
  dalle: 'luminaires plafond carrés (dalles)',
  reglette: 'luminaires linéaires (réglettes)',
}

const LIENS = new Set(['de', 'du', 'des', 'en', 'à', 'a', 'au', 'sous', 'sur', 'pour', 'avec'])

function plurielMot(mot) {
  if (/[sxz]$/i.test(mot)) return mot
  if (/(?:eau|au|eu)$/i.test(mot)) return `${mot}x`
  if (/al$/i.test(mot)) return `${mot.slice(0, -2)}aux`
  return `${mot}s`
}

const sigle = (mot) => /^[A-Z0-9]{2,}$/.test(mot)

/**
 * « Prise de courant » → « prises de courant » : on accorde les mots jusqu'au
 * premier mot de liaison ou parenthèse ; un sigle (WC, RJ45) reste tel quel.
 */
export function plurielLibelle(libelle, code = null) {
  if (code && PLURIELS[code]) return PLURIELS[code]
  let arret = false
  return String(libelle ?? '').split(' ').map((mot, i) => {
    if (arret || !mot) return mot
    const bas = mot.toLowerCase()
    if (LIENS.has(bas) || /^[dl][’']/.test(bas) || mot.startsWith('(')) { arret = true; return mot }
    const accorde = sigle(mot) ? mot : plurielMot(mot)
    return i === 0 && !sigle(mot) ? accorde.charAt(0).toLowerCase() + accorde.slice(1) : accorde
  }).join(' ')
}

// Comparaison sans casse ni accents (« Prise de courant » ≡ « prise de courant »)
const cle = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// ─── Contenu d'une ligne : équipements et points particuliers ────────────────

const photosTexte = (liste) => (liste.length ? liste.map((ph) => `Ph ${ph.numero}`).join(', ') : '')

const assembler = (morceaux) => morceaux.filter(Boolean).join(' · ')

/**
 * Équipements et points particuliers d'une pièce (ou des relevés hors
 * pièces) : désordres à part, le reste regroupé par type avec son nombre.
 *
 * @param elements éléments exportés de la pièce (`elementsAExporter`)
 * @param sansElement points sans élément de la pièce (`pointsSansElement`)
 * @param photos photos numérotées de la pièce (celles de ses points)
 * @param remarques remarques de la fiche exportée ('' si rien)
 */
function contenuReleves({ elements = [], sansElement = [], photos = [], remarques = '', ficheAValider = false }) {
  const utilisees = new Set()
  const photosDuPoint = (pointId) => {
    if (!pointId) return []
    const siennes = photos.filter((ph) => ph.point_id === pointId)
    siennes.forEach((ph) => utilisees.add(ph.id))
    return siennes
  }

  const equipements = []
  const desordres = []
  for (const groupe of groupesElements(elements)) {
    if (groupe.calque === 'desordres') {
      for (const e of groupe.elements) {
        const l = ligneElement(e)
        desordres.push({
          texte: assembler([l.libelle, l.cotes, photosTexte(photosDuPoint(e.pointId))]),
          aValider: l.aValider, sorte: 'desordre', libelle: l.libelle,
        })
      }
      continue
    }
    // Un type, et à part ses propositions ; un élément sans type se range par son libellé
    const paquets = new Map()
    for (const e of groupe.elements) {
      const k = `${e.aValider ? 'v' : 'r'}|${e.type ? `t:${e.type}` : `l:${cle(ligneElement(e).libelle)}`}`
      if (!paquets.has(k)) paquets.set(k, [])
      paquets.get(k).push(e)
    }
    for (const paquet of paquets.values()) {
      const [premier] = paquet
      const type = typeEdl(premier.type)
      const n = paquet.reduce((s, e) => s + quantiteElement(e), 0)
      let titre
      if (type) {
        const base = texteLatin(type.libelle)
        // Ce que le libellé dit de plus que le type (« Sèche-serviettes ») ;
        // « Prise » n'apprend rien sur « Prise de courant »
        const precis = [...new Set(paquet.map((e) => ligneElement(e).libelle).filter((t) => !cle(base).startsWith(cle(t))))]
        if (n === 1 && precis.length === 1) titre = precis[0]
        else {
          titre = n > 1 ? `${n} ${texteLatin(plurielLibelle(type.libelle, type.code))}` : base
          if (precis.length) titre += ` (${precis.join(', ')})`
        }
      } else {
        titre = ligneElement(premier).libelle + (n > 1 ? ` ×${n}` : '')
      }
      const cotes = [...new Set(paquet.map((e) => ligneElement(e).cotes).filter(Boolean))].join(' ; ')
      const ph = photosTexte(paquet.flatMap((e) => photosDuPoint(e.pointId)))
      equipements.push({ texte: assembler([titre, cotes, ph]), aValider: !!premier.aValider, sorte: 'equipement' })
    }
  }

  const particuliers = [...desordres]
  if (remarques) particuliers.push({ texte: remarques, aValider: ficheAValider, sorte: 'remarque' })
  for (const p of sansElement) {
    const etat = p.elementAValider ? 'élément à valider' : 'point sans élément'
    particuliers.push({ texte: assembler([`P${p.numero} (${etat})`, photosTexte(photosDuPoint(p.id))]), aValider: false, sorte: 'point' })
  }
  // Une photo n'est jamais perdue : sans élément ni point listé, elle est citée seule
  const restes = photos.filter((ph) => !utilisees.has(ph.id))
  if (restes.length) particuliers.push({ texte: `Photos : ${photosTexte(restes)}`, aValider: false, sorte: 'photos' })
  return { equipements, particuliers }
}

// ─── Lignes du tableau d'un niveau ───────────────────────────────────────────

const parNumero = (a, b) => (a.numero ?? 0) - (b.numero ?? 0)

function itemRubrique(piece, fiche, rubrique, options, prefixe = '') {
  const texte = rempli(fiche?.[rubrique])
  if (!texte) return null
  return { texte: prefixe ? `${prefixe} : ${texte}` : texte, statut: statutExport(piece, rubrique, options), rubrique }
}

/**
 * Une ligne par pièce visitée d'un niveau, dans l'ordre reçu.
 *
 * @param pieces pièces visitées du niveau (`etagesDuRapport`)
 * @param elementsExport éléments exportés (`elementsAExporter`), tous niveaux
 * @param photos photos numérotées comme le DXF (`numeroterPhotos`)
 * @param points lignes `edl_points` : relient une photo à sa pièce
 * @param sansElement points sans élément (`pointsSansElement`) ; calculés
 *   ici sans les lignes `edl_elements` s'ils manquent
 * @returns [{ piece: { id, designation, numero, libelle, surface, hsp },
 *   ficheAValider, sol: [{ texte, statut, rubrique }], mur: […], plafond: […],
 *   porte: { huisserie, vantail, quincaillerie, texte, statut } | null,
 *   equipements: [{ texte, aValider, sorte }], particuliers: [{ texte, aValider, sorte }] }]
 *   — une rubrique vide vaut [] (« Non décrit »)
 */
export function lignesTableau({ pieces = [], elementsExport = [], photos = [], points = [], sansElement = null, inclurePropositions = false }) {
  const options = { inclurePropositions }
  const seuls = sansElement ?? pointsSansElement({ points, elementsExport })
  const pointsParId = new Map(points.map((p) => [p.id, p]))
  return pieces.map((piece) => {
    const fiche = ficheExportee(piece, options)
    const ficheAValider = !!(piece.fiche_a_valider && fiche)
    const porte = porteExport(piece, options)
    const { equipements, particuliers } = contenuReleves({
      elements: elementsExport.filter((e) => e.pieceId === piece.id),
      sansElement: seuls.filter((p) => p.piece_id === piece.id).sort(parNumero),
      photos: photos.filter((ph) => pointsParId.get(ph.point_id)?.piece_id === piece.id).sort(parNumero),
      remarques: rempli(fiche?.remarques),
      ficheAValider,
    })
    return {
      piece: {
        id: piece.id,
        designation: rempli(piece.nom) || 'Pièce sans nom',
        numero: rempli(piece.numero) || null,
        libelle: libellePiece(piece),
        surface: surfacePiece(piece)?.texte ?? null,
        hsp: hspPiece(piece, options),
      },
      ficheAValider,
      sol: [itemRubrique(piece, fiche, 'sol', options), itemRubrique(piece, fiche, 'plinthes', options, 'Plinthes')].filter(Boolean),
      mur: [itemRubrique(piece, fiche, 'murs', options)].filter(Boolean),
      plafond: [itemRubrique(piece, fiche, 'plafond', options)].filter(Boolean),
      porte: porte ? {
        huisserie: rempli(porte.huisserie), vantail: rempli(porte.vantail), quincaillerie: rempli(porte.quincaillerie),
        texte: rempli(porte.texte), statut: porte.statut,
      } : null,
      equipements,
      particuliers,
    }
  })
}

/**
 * Ligne « Hors pièces » d'un niveau (façade, cour, palier non découpé) :
 * seulement des équipements et des points particuliers ; null si rien.
 * @param hors sortie de `relevesHorsPieces` (photos numérotées)
 */
export function ligneHorsPieces(hors) {
  const { equipements, particuliers } = contenuReleves({
    elements: hors?.elements ?? [],
    sansElement: [...(hors?.sansElement ?? [])].sort(parNumero),
    photos: [...(hors?.photos ?? [])].sort(parNumero),
  })
  if (!equipements.length && !particuliers.length) return null
  return {
    piece: { id: null, designation: LIBELLE_HORS_PIECES, numero: null, libelle: LIBELLE_HORS_PIECES, surface: null, hsp: null },
    hors: true, ficheAValider: false, sol: [], mur: [], plafond: [], porte: null, equipements, particuliers,
  }
}

/**
 * Les tableaux du rapport, niveau par niveau : mêmes paramètres que
 * `suiteRapportEdl`. Les photos sont numérotées comme le DXF (numéros reçus,
 * sinon calculés par la même règle).
 * @returns { etages: [{ niveau, nom, pieces, visitees, nonVisitees, lignes }], photos }
 */
export function tableauxDuRapport({
  niveaux = [], pieces = [], elementsExport = [], photos = [], points = [], elements = null,
  visitees = null, inclurePropositions = false,
}) {
  const etages = etagesDuRapport({ niveaux, pieces, elementsExport, points, visitees, inclurePropositions })
  const sansElement = pointsSansElement({ points, elements, elementsExport })
  const numerotees = photos.every((ph) => ph.numero != null) ? photos : numeroterPhotos(photos, points, { niveaux, pieces })
  return {
    photos: numerotees,
    etages: etages.map((etage) => {
      const lignes = lignesTableau({ pieces: etage.visitees, elementsExport, photos: numerotees, points, sansElement, inclurePropositions })
      const hors = ligneHorsPieces(relevesHorsPieces({ niveauId: etage.niveau.id, pieces, elementsExport, points, photos: numerotees, sansElement }))
      return { ...etage, nom: rempli(etage.niveau.nom) || 'Étage', lignes: hors ? [...lignes, hors] : lignes }
    }),
  }
}

// ─── Comptes et synthèse ─────────────────────────────────────────────────────

const rubriquesDe = (ligne) => [...ligne.sol, ...ligne.mur, ...ligne.plafond, ...(ligne.porte ? [{ ...ligne.porte, rubrique: 'porte' }] : [])]

/**
 * Comptes d'un ensemble de lignes : locaux (pièces, sans la ligne « Hors
 * pièces »), rubriques renseignées et par statut, désordres.
 */
export function comptesLignes(lignes = []) {
  const c = { locaux: 0, renseignees: 0, conserver: 0, rafraichir: 0, deposer: 0, aPreciser: 0, desordres: 0 }
  for (const l of lignes) {
    if (!l.hors) c.locaux++
    for (const r of rubriquesDe(l)) {
      c.renseignees++
      if (r.statut === 'conserver') c.conserver++
      else if (r.statut === 'rafraichir') c.rafraichir++
      else if (r.statut === 'deposer') c.deposer++
      else c.aPreciser++
    }
    c.desordres += l.particuliers.filter((p) => p.sorte === 'desordre').length
  }
  return c
}

const s = (n) => (n > 1 ? 's' : '')

/** « 21 locaux · 0 à déposer · 17 à rafraîchir · 4 à conserver · 3 à préciser · 2 désordres » */
export function texteComptes(lignes) {
  const c = comptesLignes(lignes)
  return [
    `${c.locaux} ${c.locaux > 1 ? 'locaux' : 'local'}`,
    `${c.deposer} à déposer`,
    `${c.rafraichir} à rafraîchir`,
    `${c.conserver} à conserver`,
    `${c.aPreciser} à préciser`,
    `${c.desordres} désordre${s(c.desordres)}`,
  ].join(' · ')
}

const LIBELLES_RUBRIQUES = { sol: 'sol', plinthes: 'plinthes', murs: 'murs', plafond: 'plafond', porte: 'bloc porte' }

// Coupe à un espace, jamais au milieu d'un mot
export function tronquer(texte, max) {
  const t = String(texte ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const coupe = t.slice(0, max - 1)
  const espace = coupe.lastIndexOf(' ')
  return `${(espace > max * 0.5 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:·.–—-]+$/, '')}…`
}

const MAX_TEXTE = 300
const MAX_ITEM = 70

/**
 * Texte d'un point d'attention : les éléments dans l'ordre, le nom du niveau
 * devant le premier de chaque niveau (s'il y en a plusieurs), autant qu'il en
 * tient, puis « et n autres ».
 * @param items [{ niveau, texte }]
 */
function texteAttention(items, plusieurs) {
  const morceaux = []
  let longueur = 0
  let niveau = null
  for (const it of items) {
    const devant = plusieurs && it.niveau !== niveau ? `${it.niveau} — ` : ''
    const morceau = devant + tronquer(it.texte, MAX_ITEM)
    if (morceaux.length && longueur + morceau.length + 3 > MAX_TEXTE) break
    morceaux.push(morceau)
    longueur += morceau.length + 3
    niveau = it.niveau
  }
  const reste = items.length - morceaux.length
  return morceaux.join(' ; ') + (reste > 0 ? ` ; et ${reste} autre${s(reste)}` : '')
}

/**
 * Chiffres clés et points d'attention de la page de garde.
 *
 * @param etages sortie de `tableauxDuRapport` (chaque étage porte `lignes`),
 *   ou d'`etagesDuRapport` avec
 * @param lignes les lignes de chaque étage (tableau parallèle, ou Map niveauId → lignes)
 * @returns { chiffres: [{ valeur, libelle, detail? }] (5 au plus),
 *   attention: [{ titre, texte }] (5 au plus, un par thème : Désordres, À déposer, À vérifier) }
 */
export function syntheseRapport({ etages = [], lignes = null }) {
  const lignesDe = (etage, i) => {
    if (lignes instanceof Map) return lignes.get(etage.niveau?.id) ?? []
    if (Array.isArray(lignes)) return lignes[i] ?? []
    return etage.lignes ?? []
  }
  const parEtage = etages.map((etage, i) => ({ nom: rempli(etage.nom ?? etage.niveau?.nom) || 'Étage', lignes: lignesDe(etage, i) }))
  const toutes = parEtage.flatMap((e) => e.lignes)
  const c = comptesLignes(toutes)
  const plusieurs = parEtage.length > 1

  const chiffres = [
    {
      valeur: String(c.locaux), libelle: `pièce${s(c.locaux)} relevée${s(c.locaux)}`,
      ...(plusieurs ? { detail: parEtage.map((e) => `${e.nom} ${comptesLignes(e.lignes).locaux}`).join(' · ') } : {}),
    },
    { valeur: String(c.deposer), libelle: 'à déposer', detail: `sur ${c.renseignees} élément${s(c.renseignees)} décrit${s(c.renseignees)}` },
    { valeur: String(c.rafraichir), libelle: 'à rafraîchir' },
    { valeur: String(c.aPreciser), libelle: 'à préciser' },
    { valeur: String(c.desordres), libelle: `désordre${s(c.desordres)} relevé${s(c.desordres)}` },
  ]

  const themes = { desordres: [], deposer: [], verifier: [] }
  for (const etage of parEtage) {
    const devant = (texte) => ({ niveau: etage.nom, texte })
    for (const l of etage.lignes) {
      for (const p of l.particuliers.filter((x) => x.sorte === 'desordre')) themes.desordres.push(devant(`${l.piece.libelle} : ${p.libelle ?? p.texte}`))
    }
    for (const l of etage.lignes) {
      for (const r of rubriquesDe(l).filter((x) => x.statut === 'deposer')) {
        // « Plinthes : bois » porte déjà son nom
        const texte = r.rubrique === 'plinthes' ? r.texte.replace(/^Plinthes : /, '') : r.texte
        themes.deposer.push(devant(`${l.piece.libelle} : ${LIBELLES_RUBRIQUES[r.rubrique]} (${texte})`))
      }
    }
    for (const l of etage.lignes) {
      const aVoir = rubriquesDe(l).filter((x) => x.statut === STATUT_A_PRECISER).map((x) => LIBELLES_RUBRIQUES[x.rubrique])
      if (aVoir.length) themes.verifier.push(devant(`${l.piece.libelle} : ${aVoir.join(', ')}`))
    }
  }
  const attention = [
    ['Désordres', themes.desordres],
    ['À déposer', themes.deposer],
    ['À vérifier', themes.verifier],
  ].filter(([, items]) => items.length).map(([titre, items]) => ({ titre, texte: texteAttention(items, plusieurs) })).slice(0, 5)

  return { chiffres: chiffres.slice(0, 5), attention }
}
