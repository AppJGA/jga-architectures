// ─── Pièces écrites : lire un CCTP et y chercher (logique pure) ──────────────
//
// Les CCTP viennent de bureaux d'études différents, aux mises en page
// différentes. Ce qu'ils ont en commun, et sur quoi tout repose : des articles
// à numérotation décimale (4, 4.1, 4.1.2), un sommaire en tête, des en-têtes
// et pieds de page répétés, le lot écrit en gros sur la couverture. Aucune
// IA : des règles, réglées sur des CCTP réels gardés hors du dépôt (public).
// Pur (tests/pieces-ecrites.test.js, textes inventés).

import { cleNom } from '../../chantier/planning/importPlanning'

// ─── Normalisation ───────────────────────────────────────────────────────────

// Une lettre à la fois, pour garder la correspondance des positions (extrait)
const normaliserCar = (c) => c.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export const normaliser = (texte) => String(texte ?? '').split('').map(normaliserCar).join('')

const propre = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()

// ─── 1. Lignes d'une page ────────────────────────────────────────────────────

/**
 * Fragments pdf.js (`str`, `transform`, `width`) → lignes. Les fragments
 * d'une même ordonnée (à 2 points près) forment une ligne, remis dans l'ordre
 * de gauche à droite : certains PDF dessinent le numéro d'un article après
 * son titre (« INSTALLATIONS DE CHANTIER5.1 »). Un écart visible entre deux
 * fragments devient une espace.
 * @returns [{ texte, taille }]
 */
export function lignesDePage(items = []) {
  const groupes = []
  let groupe = null
  let y = null
  for (const it of items) {
    const yy = it.transform?.[5] ?? 0
    if (groupe && Math.abs(yy - y) > 2) { groupes.push(groupe); groupe = null }
    if (!groupe) groupe = []
    groupe.push(it)
    y = yy
  }
  if (groupe) groupes.push(groupe)

  return groupes.map((fragments) => {
    const tries = [...fragments].sort((u, v) => (u.transform?.[4] ?? 0) - (v.transform?.[4] ?? 0))
    let texte = ''
    let taille = 0
    let finPrecedent = null
    for (const it of tries) {
      const str = String(it.str ?? '')
      const t = Math.round(Math.hypot(it.transform?.[2] ?? 0, it.transform?.[3] ?? 0))
      if (str.trim()) taille = Math.max(taille, t)
      const x = it.transform?.[4] ?? 0
      if (finPrecedent != null && it.width != null && x - finPrecedent > t * 0.15 && texte && !/\s$/.test(texte) && !/^\s/.test(str)) texte += ' '
      texte += str
      if (it.width != null) finPrecedent = x + it.width
    }
    return { texte: propre(texte), taille }
  }).filter((l) => l.texte)
}

// ─── 2. Bruit : en-têtes, pieds de page, sommaire ────────────────────────────

const LIGNE_SOMMAIRE = /(\.{3,}|_{3,}|…{2,}|(\s\.){3,})\s*\d+\s*$/
const MARGE = 4 // lignes du haut et du bas d'une page où vivent en-têtes et pieds
const SEUIL_REPETITION = 0.4

const empreinte = (texte) => normaliser(texte).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/**
 * Retire les en-têtes et pieds de page (même ligne, chiffres mis à part, en
 * haut ou en bas de plus de 40 % des pages) et les lignes de sommaire. Une
 * ligne répétée au milieu des pages (« Localisation : ») reste : c'est du texte.
 */
export function retirerBruit(pages = []) {
  const compte = new Map()
  for (const p of pages) {
    const bords = [...p.lignes.slice(0, MARGE), ...p.lignes.slice(-MARGE)]
    for (const e of new Set(bords.map((l) => empreinte(l.texte)))) compte.set(e, (compte.get(e) ?? 0) + 1)
  }
  const repetees = pages.length >= 3
    ? new Set([...compte].filter(([, n]) => n > pages.length * SEUIL_REPETITION).map(([e]) => e))
    : new Set()
  return pages.map((p) => ({
    ...p,
    lignes: p.lignes.filter((l, i) => {
      if (LIGNE_SOMMAIRE.test(l.texte)) return false
      const auBord = i < MARGE || i >= p.lignes.length - MARGE
      return !(auBord && repetees.has(empreinte(l.texte)))
    }),
  }))
}

// ─── 3. Articles ─────────────────────────────────────────────────────────────

const TITRE = /^(\d{1,2}(?:\.\d{1,3}){0,4})\.?\s+(\S.{0,150})$/
const ECART_MAX = 6

const composantes = (numero) => numero.split('.').map(Number)

// Titre sans points de conduite ; un titre écrit deux fois l'un sur l'autre
// (certains PDF le font pour l'épaissir) n'est gardé qu'une fois
function titrePropre(titre) {
  const t = titre.replace(/\s*(\.{2,}|_{2,}).*$/, '').trim()
  const double = /^(.{4,}?)\s*\1$/.exec(t)
  return double ? double[1].trim() : t
}

/**
 * Le numéro `c` peut-il suivre `p` ? En avançant, avec des trous tolérés : un
 * BET saute parfois un numéro, ou ouvre un chapitre par son premier
 * sous-article sans titre de chapitre (2.4 → 3.1).
 */
export function suitLogiquement(p, c) {
  const memeDebut = (n) => p.slice(0, n).every((v, i) => v === c[i])
  // Descendant : 4 → 4.1, 4.1 → 4.1.2 (4.1.1 absent), 4 → 4.1.1, 2 → 2.0
  if (c.length > p.length && memeDebut(p.length)
    && c[p.length] <= ECART_MAX && c.slice(p.length + 1).every((v) => v <= 1)) return true
  // Nouvelle branche au niveau k : 4.1.2 → 4.1.3, → 4.2, → 5, → 5.1 ; ce qui
  // suit le niveau k ne peut que commencer (0 ou 1)
  for (let k = 0; k < Math.min(p.length, c.length); k++) {
    if (memeDebut(k) && c[k] > p[k] && c[k] - p[k] <= ECART_MAX && c.slice(k + 1).every((v) => v <= 1)) return true
  }
  return false
}

/**
 * Articles d'un CCTP. Toute ligne « 4.1.2 Titre » est candidate ; on retient
 * la plus longue suite de candidats dont les numéros se suivent logiquement,
 * un titre suivi de texte comptant davantage. Ainsi le sommaire (titres sans
 * texte) perd face au corps du document, et une ligne de quantité (« 1 porte
 * au rez-de-chaussée ») ne casse pas la suite. Moins de 3 articles : un
 * article par page, pour rester cherchable.
 * @param pages [{ numero, lignes: [{ texte }] }], bruit déjà retiré
 * @returns [{ numero, niveau, titre, texte, page, ordre }]
 */
export function decouperArticles(pages = []) {
  const lignes = pages.flatMap((p) => p.lignes.map((l) => ({ texte: l.texte, page: p.numero })))

  // La couverture (page 1 d'un document de plusieurs pages) porte adresses
  // et dates (« 1 Place de la mairie ») : pas d'article là
  const premierePage = pages.length > 2 ? pages[0]?.numero : null
  const candidats = []
  lignes.forEach((l, i) => {
    if (l.page === premierePage) return
    const m = TITRE.exec(l.texte)
    if (!m || /[.;,:]$/.test(m[2]) && m[2].length > 60) return
    candidats.push({ i, numero: m[1], comp: composantes(m[1]), titre: titrePropre(m[2]) })
  })
  // Poids : un titre suivi d'au moins une ligne de texte vaut plus qu'un titre seul
  candidats.forEach((c, k) => {
    const suivant = candidats[k + 1]?.i ?? lignes.length
    c.poids = suivant - c.i > 1 ? 3 : 1
  })

  // Plus longue suite logique (programmation dynamique)
  const meilleur = candidats.map((c) => c.poids)
  const precedent = candidats.map(() => -1)
  for (let b = 0; b < candidats.length; b++) {
    for (let a = 0; a < b; a++) {
      if (meilleur[a] + candidats[b].poids > meilleur[b] && suitLogiquement(candidats[a].comp, candidats[b].comp)) {
        meilleur[b] = meilleur[a] + candidats[b].poids
        precedent[b] = a
      }
    }
  }
  let fin = -1
  meilleur.forEach((v, k) => { if (fin < 0 || v > meilleur[fin]) fin = k })
  const retenus = []
  for (let k = fin; k >= 0; k = precedent[k]) retenus.unshift(candidats[k])

  if (retenus.length < 3) {
    return pages
      .map((p, k) => ({ numero: null, niveau: 1, titre: `Page ${p.numero}`, texte: p.lignes.map((l) => l.texte).join('\n'), page: p.numero, ordre: k + 1 }))
      .filter((a) => a.texte)
  }

  return retenus.map((c, k) => {
    const fin_ = retenus[k + 1]?.i ?? lignes.length
    return {
      numero: c.numero,
      niveau: c.comp.length,
      titre: c.titre,
      texte: lignes.slice(c.i + 1, fin_).map((l) => l.texte).join('\n'),
      page: lignes[c.i].page,
      ordre: k + 1,
    }
  })
}

// ─── 4. Lot et indice ────────────────────────────────────────────────────────

const LOT = /\blot\s*(?:n\s*[°o]\s*)?(\d{1,3})\b\s*[-:–—]?\s*(.*)$/i
const PAS_UN_NOM = /cctp|cahier|clauses|dce|indice|phase|date|page/i

const casePhrase = (t) => {
  const bas = propre(t).toLowerCase().replace(/[\s\-–—:]+$/, '')
  return bas.charAt(0).toUpperCase() + bas.slice(1)
}

/**
 * Le lot d'un CCTP : sur la couverture, la plus grande ligne « Lot 07 - … »,
 * « Lot n°170 : … », « Lot N°080 … » (le nom peut continuer à la ligne
 * suivante) ; à défaut, le nom du fichier.
 * @returns { numero, nom } ou null
 */
export function lireLot(pages = [], nomFichier = '') {
  const couverture = pages[0]?.lignes ?? []
  const parTaille = couverture.map((l, i) => ({ ...l, i })).sort((a, b) => b.taille - a.taille || a.i - b.i)
  for (const l of parTaille) {
    const m = LOT.exec(l.texte)
    if (!m) continue
    let nom = m[2]
    const suite = couverture[l.i + 1]
    const coupe = /[-–—:]\s*$/.test(nom) || !nom.trim()
    if (suite && Math.abs(suite.taille - l.taille) <= 1 && !PAS_UN_NOM.test(suite.texte) && !LOT.test(suite.texte)
      && (coupe || (suite.texte === suite.texte.toUpperCase() && suite.texte.length < 40))) {
      // Coupé sur un tiret : la suite est un autre morceau du nom ; sinon
      // c'est la même expression qui continue
      nom = coupe ? `${nom.replace(/[\s\-–—:]+$/, '')} - ${suite.texte}` : `${nom} ${suite.texte}`
    }
    return { numero: Number(m[1]), nom: casePhrase(nom.replace(/^[\s\-–—:]+/, '')) }
  }
  const f = /lot\s*(?:n\s*°\s*)?(\d{1,3})\s*[-_ :]*\s*(.*?)(?:_|\.pdf$|$)/i.exec(String(nomFichier).replace(/\.pdf$/i, '.pdf'))
  if (f) return { numero: Number(f[1]), nom: casePhrase(f[2].replace(/\.pdf$/i, '')) || null }
  return null
}

const INDICE = /(?:^|[^a-z])ind(?:ice)?[\s:.°]*(?:n\s*°[\s:.]*)?([0-9]{1,2}|[a-z])(?![a-z°])/i

/** L'indice du document (« Indice : 2 », « _IND3 »), sur la couverture ou le nom du fichier. */
export function lireIndice(pages = [], nomFichier = '') {
  for (const l of pages[0]?.lignes ?? []) {
    const m = INDICE.exec(l.texte)
    if (m) return m[1].toUpperCase()
  }
  const m = INDICE.exec(String(nomFichier).replace(/\.pdf$/i, ''))
  return m ? m[1].toUpperCase() : null
}

/** Tout ce qu'on tire d'un PDF. `pages` : [{ numero, lignes: [{ texte, taille }] }] */
export function lirePiece({ pages = [], nomFichier = '' }) {
  return {
    lot: lireLot(pages, nomFichier),
    indice: lireIndice(pages, nomFichier),
    articles: decouperArticles(retirerBruit(pages)),
    nbPages: pages.length,
  }
}

// ─── Lot proposé à l'import ──────────────────────────────────────────────────

/** Le premier numéro de lot libre à partir de `voulu` (unique par affaire). */
export function numeroLibre(voulu, lots = []) {
  const pris = new Set(lots.map((l) => Number(l.numero)))
  let n = Number(voulu) > 0 ? Number(voulu) : 1
  while (pris.has(n)) n++
  return n
}

/**
 * Rattacher au lot existant dont le nom correspond (sans majuscules, accents
 * ni ligatures, l'un pouvant contenir l'autre : « Métallerie » et « Métallerie
 * - serrurerie »), sinon créer le lot lu, sur un numéro libre.
 * @returns { mode: 'rattacher', lotId } | { mode: 'creer', numero, nom }
 */
export function proposerLot(lotLu, lots = []) {
  const nom = cleNom(lotLu?.nom)
  if (nom) {
    const meme = lots.find((l) => cleNom(l.nom) === nom)
      ?? lots.find((l) => { const n = cleNom(l.nom); return n.length >= 4 && (nom.includes(n) || n.includes(nom)) })
    if (meme) return { mode: 'rattacher', lotId: meme.id }
  }
  return { mode: 'creer', numero: numeroLibre(lotLu?.numero ?? 1, lots), nom: lotLu?.nom ?? '' }
}

/** « Lot 07 – Métallerie – serrurerie » */
export function titrePiece(numero, nom) {
  return [numero != null && numero !== '' ? `Lot ${String(numero).padStart(2, '0')}` : null, nom].filter(Boolean).join(' – ') || 'CCTP'
}

// ─── 5. Recherche ────────────────────────────────────────────────────────────

/** Les mots d'une recherche, sans accents ni majuscules (2 caractères au moins). */
export function motsRecherche(requete) {
  return [...new Set(normaliser(requete).split(/[^\p{L}\p{N}½¼¾]+/u).filter((m) => m.length >= 2))]
}

/**
 * Articles qui contiennent TOUS les mots (titre ou texte). Un mot dans le
 * titre compte plus ; à score égal, l'ordre du document.
 * @returns [{ article, score, extrait }]
 */
export function chercherArticles(articles = [], requete = '', { lotId = null } = {}) {
  const mots = motsRecherche(requete)
  if (mots.length === 0) return []
  const resultats = []
  for (const a of articles) {
    if (lotId && a.lot_id !== lotId) continue
    const titre = normaliser(a.titre)
    const texte = normaliser(a.texte)
    let score = 0
    let manque = false
    for (const m of mots) {
      if (titre.includes(m)) score += 3
      else if (texte.includes(m)) score += 1
      else { manque = true; break }
    }
    if (!manque) resultats.push({ article: a, score, extrait: extrait(a.texte, mots) })
  }
  return resultats.sort((x, y) => y.score - x.score || (x.article.ordre ?? 0) - (y.article.ordre ?? 0))
}

/**
 * Un passage du texte autour du premier mot trouvé, découpé en morceaux à
 * surligner ou non. Les positions sont celles du texte d'origine (accents
 * compris).
 * @returns [{ texte, surligne }]
 */
export function extrait(texte = '', mots = [], largeur = 160) {
  // Le texte entier garde ses retours à la ligne ; un passage tient sur une ligne
  const brut = String(texte ?? '')
  const source = largeur >= brut.length ? brut : brut.replace(/\s+/g, ' ')
  // Texte normalisé et, pour chaque caractère normalisé, sa position d'origine
  let norm = ''
  const origine = []
  for (let i = 0; i < source.length; i++) {
    const n = normaliserCar(source[i])
    norm += n
    for (let k = 0; k < n.length; k++) origine.push(i)
  }
  const positions = mots.map((m) => norm.indexOf(m)).filter((p) => p >= 0)
  const premier = positions.length ? origine[Math.min(...positions)] : 0
  let debut = largeur >= source.length ? 0 : Math.max(0, premier - Math.floor(largeur / 3))
  let fin = Math.min(source.length, debut + largeur)
  if (debut > 0) { const espace = source.indexOf(' ', debut); if (espace > -1 && espace < premier) debut = espace + 1 }
  if (fin < source.length) { const espace = source.lastIndexOf(' ', fin); if (espace > premier) fin = espace }

  // Zones surlignées, en positions d'origine
  const zones = []
  for (const m of mots) {
    let p = norm.indexOf(m)
    while (p >= 0) {
      zones.push([origine[p], origine[p + m.length - 1] + 1])
      p = norm.indexOf(m, p + m.length)
    }
  }
  zones.sort((a, b) => a[0] - b[0])

  const morceaux = []
  if (debut > 0) morceaux.push({ texte: '…', surligne: false })
  let curseur = debut
  for (const [a, b] of zones) {
    if (b <= curseur || a >= fin) continue
    const da = Math.max(a, curseur)
    if (da > curseur) morceaux.push({ texte: source.slice(curseur, da), surligne: false })
    morceaux.push({ texte: source.slice(da, Math.min(b, fin)), surligne: true })
    curseur = Math.min(b, fin)
  }
  if (curseur < fin) morceaux.push({ texte: source.slice(curseur, fin), surligne: false })
  if (fin < source.length) morceaux.push({ texte: '…', surligne: false })
  return morceaux
}
