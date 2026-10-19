// ─── DPGF : lire un tableau Excel ou PDF, le relier au CCTP (logique pure) ───
//
// Les DPGF vierges du DCE (conception :
// docs/superpowers/specs/2026-10-19-dpgf-design.md). Chaque bureau d'études a
// sa mise en page : colonnes à des places différentes, numéro d'article dans
// sa colonne ou en tête de la désignation, en-tête répété, sous-totaux. On ne
// garde que numéro, désignation, unité et quantité — jamais les prix. Aucune
// IA : des règles réglées sur des DPGF réels gardés hors du dépôt (public).
// Pur (tests/dpgf.test.js, tableaux inventés).

import { normaliser, suitLogiquement, lireLot, lireIndice, retirerBruit, decouperArticles } from './piecesLogique'

const propre = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
const cle = (t) => normaliser(propre(t))

const NUMERO = /^(\d{1,2}(?:\.\d{1,3}){0,5})\.?$/
const NUMERO_EN_TETE = /^(\d{1,2}(?:\.\d{1,3}){0,5})\.?\s+(\S.*)$/
const PUCE = /^[-–—•·]/

// En-têtes de colonnes
const EN_TETE = {
  designation: (t) => /^designation/.test(t),
  unite: (t) => /^(u|u\.|unite|unites)$/.test(t),
  quantite: (t) => /^(q|q\.|qt|qte|qte\.|qtes?|quantite|quantites)$/.test(t),
  prix: (t) => /^(p\.?\s?u\.?(\s?ht)?|prix.*)$/.test(t),
  total: (t) => /^(tot\.?|total.*|montant.*)$/.test(t),
  numero: (t) => /^(art\.?|article|code|n°|no|repere|rep\.?)$/.test(t),
}

// Lignes à écarter : sous-totaux et totaux, puis la signature qui suit le total
const TOTAL = /^(sous[\s-]?total|s\/total|total|totalt|montant\s+(total|h\.?\s?t)|t\.?v\.?a|tva|montant\s+t\.?t\.?c)|total\s+h\.?\s?t|total\s+t\.?t\.?c|total\s+general/
const FIN = /^(fait\s+a\b|(l['’])?entrepreneur\b|(l['’])?entreprise\b|cachet|vu\s+et\s+accepte|lu\s+et\s+approuve|signature)/
const SANS_QUANTITE = /^(pm|p\.m\.?|cp|c\.p\.?|pour\s+memoire|inclus|compris|sans\s+objet|so)\b/

/** « 1 650,50 », « 73.53 », 12 → nombre ; sinon null. */
export function lireNombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(/€$/, '')
  if (!/^-?\d+(?:[.,]\d+)?$/.test(t)) return null
  return Number(t.replace(',', '.'))
}

const estUnite = (t) => { const c = cle(t); return c.length > 0 && c.length <= 6 && /^[a-z][a-z0-9²³./]*$/.test(c) && !SANS_QUANTITE.test(c) }

// ─── Lignes de DPGF : règles communes à l'Excel et au PDF ────────────────────

/**
 * Ligne brute → ligne de DPGF, ou rien (à écarter). `numero` : celui de sa
 * colonne s'il y en a une ; sinon on le cherche en tête de la désignation,
 * à condition qu'il suive logiquement le précédent (« 2 portes … » n'est pas
 * un article).
 */
function construire(brute, precedent) {
  let designation = propre(brute.designation)
  let numero = NUMERO.test(propre(brute.numero)) ? propre(brute.numero).replace(/\.$/, '') : null
  if (!numero) {
    const m = NUMERO_EN_TETE.exec(designation)
    if (m && (!precedent || suitLogiquement(precedent.split('.').map(Number), m[1].split('.').map(Number)))) {
      numero = m[1]
      designation = m[2].trim()
    }
  } else if (propre(brute.numero) && !NUMERO.test(propre(brute.numero))) {
    designation = propre(`${brute.numero} ${designation}`)
  }
  const uniteBrute = propre(brute.unite)
  const lue = lireNombre(brute.quantite)
  // 30.240000000000002 (somme Excel) → 30.24
  const quantite = lue == null ? null : Math.round(lue * 10000) / 10000
  let quantiteTexte = null
  let unite = uniteBrute || null
  const texteQuantite = propre(brute.quantite)
  if (quantite == null && texteQuantite && lireNombre(texteQuantite) == null) quantiteTexte = texteQuantite
  if (unite && (SANS_QUANTITE.test(cle(unite)) || cle(unite).length > 6)) { quantiteTexte = quantiteTexte ?? unite; unite = null }
  return { numero, designation, unite, quantite, quantiteTexte }
}

const estTotal = (designation) => TOTAL.test(cle(designation))
const estFin = (designation) => FIN.test(cle(designation))

/** Lignes construites → lignes de DPGF numérotées, rattachées, ordonnées. */
function finaliser(lignes) {
  let article = null
  return lignes.map((l, k) => {
    if (l.numero) article = l.numero
    return {
      numero: l.numero,
      article,
      niveau: l.numero ? l.numero.split('.').length : null,
      designation: l.designation,
      unite: l.unite,
      quantite: l.quantite,
      quantiteTexte: l.quantiteTexte,
      titre: !!l.numero && l.quantite == null,
      page: l.page ?? null,
      ordre: k + 1,
    }
  })
}

// ─── 1. Excel ────────────────────────────────────────────────────────────────

/**
 * La ligne d'en-tête d'une feuille : celle qui nomme l'unité et la quantité
 * (la désignation n'a pas toujours son en-tête). Rend les colonnes trouvées.
 * @param grille [[{ texte, valeur } | null]]
 */
export function trouverEnTete(grille = []) {
  for (let r = 0; r < Math.min(grille.length, 80); r++) {
    const ligne = grille[r] ?? []
    const col = {}
    ligne.forEach((c, x) => {
      const t = cle(c?.texte)
      if (!t) return
      for (const [nom, test] of Object.entries(EN_TETE)) if (col[nom] == null && test(t)) col[nom] = x
    })
    if (col.unite != null && col.quantite != null) return { ligne: r, colonnes: col }
  }
  return null
}

const texteCase = (c) => propre(c?.texte ?? (c?.valeur != null ? String(c.valeur) : ''))

// Les valeurs d'une colonne d'en-tête sont parfois posées dans la colonne
// voisine : on garde, parmi la colonne et ses deux voisines, celle qui porte
// le plus de valeurs du bon genre
function recaler(grille, debut, x, test) {
  let meilleur = x
  let score = -1
  for (const c of [x, x - 1, x + 1]) {
    if (c < 0) continue
    let n = 0
    for (let r = debut; r < Math.min(grille.length, debut + 400); r++) if (test(grille[r]?.[c])) n++
    if (n > score) { score = n; meilleur = c }
  }
  return meilleur
}

/**
 * Colonnes d'une feuille : unité et quantité d'après l'en-tête (recalées sur
 * les valeurs), numéro = la colonne à gauche de l'unité qui porte le plus de
 * numéros d'article ; la désignation va de la colonne qui suit le numéro à
 * celle qui précède l'unité.
 */
export function colonnesDpgf(grille, enTete) {
  const debut = enTete.ligne + 1
  const unite = recaler(grille, debut, enTete.colonnes.unite, (c) => estUnite(texteCase(c)) || SANS_QUANTITE.test(cle(texteCase(c))))
  const quantite = recaler(grille, debut, enTete.colonnes.quantite, (c) => c && lireNombre(c.valeur ?? c.texte) != null)
  let numero = null
  let meilleur = 1
  for (let x = 0; x < unite; x++) {
    let n = 0
    for (let r = debut; r < grille.length; r++) if (NUMERO.test(texteCase(grille[r]?.[x]))) n++
    if (n > meilleur) { meilleur = n; numero = x }
  }
  return { numero, designation: numero == null ? 0 : numero + 1, unite, quantite }
}

/**
 * Lit les lignes d'une feuille d'après ses colonnes.
 * @returns lignes de DPGF (voir `finaliser`)
 */
export function lignesExcel(grille, colonnes, debut = 0) {
  const resultat = []
  let precedent = null
  let commence = false
  for (let r = debut; r < grille.length; r++) {
    const ligne = grille[r] ?? []
    const desig = []
    for (let x = colonnes.designation; x < colonnes.unite; x++) if (x !== colonnes.numero) desig.push(texteCase(ligne[x]))
    const brute = {
      numero: colonnes.numero != null ? texteCase(ligne[colonnes.numero]) : '',
      designation: desig.filter(Boolean).join(' '),
      unite: texteCase(ligne[colonnes.unite]),
      quantite: ligne[colonnes.quantite]?.valeur ?? texteCase(ligne[colonnes.quantite]),
    }
    if (!brute.numero && !brute.designation && !brute.unite && lireNombre(brute.quantite) == null) continue
    // En-tête répété au-dessus d'un groupe de lignes
    if (EN_TETE.unite(cle(brute.unite)) && EN_TETE.quantite(cle(texteCase(ligne[colonnes.quantite])))) continue
    const l = construire(brute, precedent)
    if (estFin(l.designation) && commence) break
    if (estTotal(l.designation)) continue
    if (!commence && !l.numero) continue // préambule, abréviations
    if (!l.designation && !l.unite && l.quantite == null && !l.quantiteTexte) continue
    commence = true
    if (l.numero) precedent = l.numero
    resultat.push(l)
  }
  return finaliser(resultat)
}

/**
 * Un DPGF Excel. `feuilles` : [{ nom, grille }] ; `choix` (repli manuel) :
 * { feuille, colonnes: { numero, designation, unite, quantite } }.
 * @returns { lot, indice, lignes, feuille, colonnes } — `lignes` vide et
 *   `colonnes` nul si aucune feuille n'a été reconnue (l'écran demande alors)
 */
export function lireDpgfExcel({ feuilles = [], nomFichier = '', choix = null }) {
  let retenu = null
  if (choix) {
    const f = feuilles.find((x) => x.nom === choix.feuille) ?? feuilles[0]
    if (f) retenu = { feuille: f.nom, colonnes: choix.colonnes, lignes: lignesExcel(f.grille, choix.colonnes) }
  } else {
    for (const f of feuilles) {
      const enTete = trouverEnTete(f.grille)
      if (!enTete) continue
      const colonnes = colonnesDpgf(f.grille, enTete)
      // Depuis le haut : l'en-tête n'arrive parfois qu'après les premiers
      // articles (en-tête répété au-dessus de chaque groupe chiffré)
      const lignes = lignesExcel(f.grille, colonnes)
      const chiffrees = lignes.filter((l) => l.quantite != null).length
      if (!retenu || chiffrees > retenu.chiffrees) retenu = { feuille: f.nom, colonnes, lignes, chiffrees }
    }
  }
  // Le lot : nom de la feuille du tableau (« Lot N°140 PLATRERIE »), puis le
  // haut des feuilles (page de garde), puis les autres noms de feuilles
  // (« Lot N°140 PDG » n'est qu'une page de garde), enfin le nom du fichier
  const sansExtension = String(nomFichier).replace(/\.(xlsx?|xlsm|pdf)$/i, '')
  const autres = feuilles.filter((f) => f.nom !== retenu?.feuille)
  const couverture = [
    retenu?.feuille,
    ...feuilles.flatMap((f) => f.grille.slice(0, 60).flatMap((l) => (l ?? []).map(texteCase))),
    ...autres.map((f) => f.nom),
  ].map(propre).filter(Boolean).map((texte) => ({ texte, taille: 1 }))
  const pages = [{ numero: 1, lignes: couverture }]
  const lot = lireLot(pages, sansExtension)
  const indice = lireIndice(pages, sansExtension)
  if (!retenu || retenu.lignes.length === 0) return { lot, indice, lignes: [], feuille: null, colonnes: null }
  return { lot, indice, lignes: retenu.lignes, feuille: retenu.feuille, colonnes: retenu.colonnes }
}

// ─── 2. PDF ──────────────────────────────────────────────────────────────────

/**
 * Fragments pdf.js → lignes de cases positionnées (même ordonnée à 2 points
 * près), de haut en bas, cases de gauche à droite.
 * @returns [{ texte, cases: [{ x, fin, texte }] }]
 */
export function casesDePage(items = []) {
  const groupes = []
  for (const it of items) {
    const texte = String(it.str ?? '')
    if (!texte.trim()) continue
    const y = it.transform?.[5] ?? 0
    const x = it.transform?.[4] ?? 0
    let g = groupes.find((gr) => Math.abs(gr.y - y) <= 2)
    if (!g) { g = { y, cases: [] }; groupes.push(g) }
    g.cases.push({ x, fin: x + (it.width ?? 0), texte })
  }
  return groupes
    .sort((a, b) => b.y - a.y)
    .map((g) => {
      const cases = g.cases.sort((a, b) => a.x - b.x)
      // Fragments proches (« 7 » « 3,53 ») réunis en une case ; un petit écart
      // reste une espace (« 4.3.3.6 » « Dépose »)
      const unies = []
      for (const c of cases) {
        const d = unies[unies.length - 1]
        if (d && c.x - d.fin < 2.5) {
          const espace = c.x - d.fin > 0.8 && !/\s$/.test(d.texte) && !/^\s/.test(c.texte)
          d.texte += (espace ? ' ' : '') + c.texte
          d.fin = Math.max(d.fin, c.fin)
        } else unies.push({ ...c })
      }
      return { texte: propre(unies.map((c) => c.texte).join(' ')), cases: unies.map((c) => ({ x: c.x, fin: c.fin, texte: propre(c.texte) })) }
    })
}

// En-tête d'un tableau de prix : au moins trois des colonnes unité,
// quantité, prix, total sur la même ligne
function enTeteTableau(ligne) {
  const col = {}
  for (const c of ligne.cases) {
    const t = cle(c.texte)
    for (const nom of ['unite', 'quantite', 'prix', 'total']) if (col[nom] == null && EN_TETE[nom](t)) col[nom] = c.x
  }
  return Object.keys(col).length >= 3 && col.unite != null && col.quantite != null ? col : null
}

// Bornes des colonnes d'après l'en-tête : la désignation s'arrête un peu
// avant l'unité, la quantité va jusqu'à mi-chemin du prix
function bornes(col) {
  const apres = col.prix ?? col.total ?? col.quantite + 60
  return {
    unite: col.unite - 14,
    quantite: (col.unite + col.quantite) / 2,
    finQuantite: (col.quantite + apres) / 2,
  }
}

/**
 * Pages d'un PDF où se trouve un tableau de DPGF, avec leurs colonnes : une
 * page qui porte un en-tête, ou qui suit une telle page et porte des lignes
 * chiffrées dans les mêmes colonnes.
 * @param pages [{ numero, cases: lignes de `casesDePage` }]
 * @returns Map numero de page → bornes
 */
export function pagesTableau(pages = []) {
  const resultat = new Map()
  let courantes = null
  for (const p of pages) {
    const enTete = (p.cases ?? []).map(enTeteTableau).find(Boolean)
    if (enTete) { courantes = bornes(enTete); resultat.set(p.numero, courantes); continue }
    if (!courantes) continue
    const chiffrees = (p.cases ?? []).filter((l) => {
      const u = l.cases.find((c) => c.x >= courantes.unite && c.x < courantes.quantite)
      const q = l.cases.find((c) => c.x >= courantes.quantite && c.x < courantes.finQuantite)
      return u && estUnite(u.texte) && q && lireNombre(q.texte) != null
    }).length
    if (chiffrees >= 2) resultat.set(p.numero, courantes)
    else courantes = null
  }
  return resultat
}

const commencePetit = (t) => /^[a-zà-ÿœæ0-9(«"]/.test(t)
// « Localisation : … », « Nota : … » : une rubrique ouvre toujours une ligne
const RUBRIQUE = /^[A-ZÀ-Ö][\p{L}'’ ]{2,30}?\s?:/u
const finDePhrase = (t) => /[.:;!?]["»)]?$/.test(t)

/**
 * Lignes de DPGF des pages à tableau. Une désignation peut courir sur
 * plusieurs lignes, et sa quantité être posée entre deux d'entre elles :
 * - une ligne qui commence par un numéro ou un tiret ouvre une ligne ;
 * - une ligne sans texte (unité et quantité seules) complète la ligne en cours ;
 * - une ligne de texte continue la ligne en cours si elle commence par une
 *   minuscule, ou si le texte précédent a été coupé (il allait jusqu'au bord
 *   de la colonne, sans fin de phrase) et qu'elle reprend à la même marge —
 *   sauf rubrique (« Localisation : … ») ;
 * - sinon elle en ouvre une : « Localisation : … » sous un titre court,
 *   « Boulangerie | M2 | 73,53 », un sous-titre (« Prises de courant »).
 * @param pages [{ numero, cases }] (bruit déjà retiré)
 */
export function lignesPdf(pages = [], tableau = pagesTableau(pages)) {
  const resultat = []
  let courant = null
  let precedent = null
  const clore = () => { if (courant) { resultat.push(courant); if (courant.numero) precedent = courant.numero } courant = null }
  for (const p of pages) {
    const b = tableau.get(p.numero)
    if (!b) continue
    // Bord droit du texte de la page, lu sur les lignes de texte ordinaires
    // (un sous-total déborde sur les colonnes de prix) : une ligne qui
    // l'atteint a été coupée
    const fins = (p.cases ?? [])
      .map((l) => l.cases.filter((c) => c.x < b.unite))
      .filter((t) => t.length && propre(t.map((c) => c.texte).join(' ')).length >= 30 && !estTotal(t.map((c) => c.texte).join(' ')))
      .map((t) => Math.max(...t.map((c) => c.fin ?? c.x)))
      .sort((x, y) => x - y)
    const bord = fins.length ? fins[Math.floor((fins.length - 1) * 0.8)] : Infinity
    for (const ligne of p.cases ?? []) {
      if (enTeteTableau(ligne)) continue
      let texte = ligne.cases.filter((c) => c.x < b.unite)
      // « Inclus en armoire » en bout de ligne, juste avant les colonnes : c'est la quantité
      let sansQuantite = null
      if (texte.length > 1 && SANS_QUANTITE.test(cle(texte[texte.length - 1].texte))) {
        sansQuantite = texte[texte.length - 1].texte
        texte = texte.slice(0, -1)
      }
      const u = ligne.cases.find((c) => c.x >= b.unite && c.x < b.quantite)
      const q = ligne.cases.find((c) => c.x >= b.quantite && c.x < b.finQuantite)
      const desig = propre(texte.map((c) => c.texte).join(' '))
      const x0 = texte[0]?.x ?? null
      const fin = Math.max(0, ...texte.map((c) => c.fin ?? c.x))
      if (!desig) {
        if (!u && !q) continue
        if (courant && courant.quantite == null && !courant.quantiteTexte) {
          const l = construire({ unite: u?.texte, quantite: q?.texte }, null)
          Object.assign(courant, { unite: l.unite, quantite: l.quantite, quantiteTexte: l.quantiteTexte })
        }
        continue
      }
      if (estTotal(desig)) { clore(); continue }
      if (estFin(desig) && resultat.length) { clore(); break }
      // Un numéro posé dans sa propre case est celui de l'article, même quand
      // la numérotation saute (5.4.3 → 5.5.4) ; sinon on le cherche en tête
      const propreCase = texte.length > 1 && NUMERO.test(texte[0].texte)
      const l = construire({
        numero: propreCase ? texte[0].texte : '',
        designation: propreCase ? propre(texte.slice(1).map((c) => c.texte).join(' ')) : desig,
        unite: u?.texte ?? sansQuantite,
        quantite: q?.texte,
      }, courant?.numero ?? precedent)
      const ouvre = l.numero || PUCE.test(desig) || RUBRIQUE.test(desig)
      const sansQte = courant && courant.quantite == null && !courant.quantiteTexte
      const continue_ = courant && !ouvre && (
        commencePetit(desig)
        || (courant.coupee && !finDePhrase(courant.designation) && Math.abs(x0 - courant.x) <= 8 && ((!u && !q) || sansQte))
      )
      if (continue_) {
        courant.designation = propre(`${courant.designation} ${desig}`)
        courant.coupee = fin >= bord - (bord - x0) * 0.12
        if (courant.quantite == null && !courant.quantiteTexte && (l.unite || l.quantite != null || l.quantiteTexte)) {
          Object.assign(courant, { unite: l.unite, quantite: l.quantite, quantiteTexte: l.quantiteTexte })
        }
        continue
      }
      clore()
      if (!l.numero && !resultat.length) continue // avant le premier article
      // Marge du texte (après le numéro) : celle des lignes qui continuent
      const xTexte = l.numero && texte.length > 1 && NUMERO.test(texte[0].texte) ? texte[1].x : x0
      courant = { ...l, page: p.numero, x: xTexte, coupee: fin >= bord - (bord - x0) * 0.12 }
    }
  }
  clore()
  // Marge et coupure ne servaient qu'à la lecture
  return finaliser(resultat.map((l) => { const ligne = { ...l }; delete ligne.x; delete ligne.coupee; return ligne }))
}

/**
 * Un PDF : DPGF dans les pages à tableau, CCTP dans les autres (un PDF peut
 * contenir les deux). Le CCTP n'est proposé que s'il reste au moins deux
 * pages de texte en dehors de la couverture et qu'elles donnent des articles
 * numérotés.
 * @param pages [{ numero, lignes, cases }] (lecturePdf)
 * @returns { lot, indice, nbPages, dpgf: { lignes, pages } | null, cctp: { articles, pages } | null }
 */
export function lirePdfPieces({ pages = [], nomFichier = '' }) {
  const lot = lireLot(pages, nomFichier)
  const indice = lireIndice(pages, nomFichier)
  // En-têtes et pieds de page retirés, comme pour un CCTP, sur les lignes à cases
  const nettes = retirerBruit(pages.map((p) => ({ ...p, lignes: p.cases ?? [] })))
    .map((p) => ({ ...p, cases: p.lignes }))
  const tableau = pagesTableau(nettes)
  const lignes = tableau.size ? lignesPdf(nettes, tableau) : []
  const dpgf = lignes.length ? { lignes, pages: [...tableau.keys()] } : null

  const autres = pages.filter((p) => !tableau.has(p.numero))
  let cctp = null
  if (!dpgf) {
    cctp = { articles: decouperArticles(retirerBruit(pages)), pages: pages.map((p) => p.numero) }
  } else if (autres.filter((p) => p.numero !== pages[0]?.numero).length >= 2) {
    // Une page isolée hors tableau (récapitulatif) ne fait pas un CCTP
    const articles = decouperArticles(retirerBruit(autres))
    if (articles.filter((a) => a.numero).length >= 3) cctp = { articles, pages: autres.map((p) => p.numero) }
  }
  return { lot, indice, nbPages: pages.length, dpgf, cctp }
}

// ─── 3. Lien au CCTP ─────────────────────────────────────────────────────────

/** Clé d'un numéro d'article : « 3.0 » ≡ « 3 », « 01.2 » ≡ « 1.2 », « 2.1. » ≡ « 2.1 ». */
export function cleNumero(numero) {
  const t = String(numero ?? '').replace(/\s+/g, '').replace(/\.+$/, '')
  if (!/^\d+(\.\d+)*$/.test(t)) return null
  const parts = t.split('.').map((n) => String(Number(n)))
  while (parts.length > 1 && parts[parts.length - 1] === '0') parts.pop()
  return parts.join('.')
}

/**
 * Les lignes de DPGF de chaque article du CCTP du même lot.
 * @param pieces toutes les pièces de l'affaire ; @param articles ceux des CCTP ;
 * @param lignes celles des DPGF (avec `piece_id`)
 * @returns { parArticle: Map article.id → [ligne], sansArticle: Map piece_id (DPGF) → nombre,
 *            articleDeLigne: Map ligne.id → article }
 */
export function lienCctpDpgf(pieces = [], articles = [], lignes = []) {
  const cctpDuLot = new Map()
  for (const p of pieces) if ((p.type ?? 'cctp') === 'cctp' && p.lot_id) cctpDuLot.set(p.lot_id, p.id)
  const index = new Map() // piece CCTP → clé → article
  for (const a of articles) {
    const k = cleNumero(a.numero)
    if (!k) continue
    if (!index.has(a.piece_id)) index.set(a.piece_id, new Map())
    if (!index.get(a.piece_id).has(k)) index.get(a.piece_id).set(k, a)
  }
  const dpgfs = new Map(pieces.filter((p) => p.type === 'dpgf').map((p) => [p.id, p]))
  const parArticle = new Map()
  const sansArticle = new Map()
  const articleDeLigne = new Map()
  for (const l of lignes) {
    const piece = dpgfs.get(l.piece_id)
    if (!piece) continue
    const cctp = piece.lot_id ? cctpDuLot.get(piece.lot_id) : null
    const article = cctp ? index.get(cctp)?.get(cleNumero(l.article)) : null
    if (article) {
      if (!parArticle.has(article.id)) parArticle.set(article.id, [])
      parArticle.get(article.id).push(l)
      articleDeLigne.set(l.id, article)
    } else {
      sansArticle.set(l.piece_id, (sansArticle.get(l.piece_id) ?? 0) + 1)
    }
  }
  for (const liste of parArticle.values()) liste.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
  return { parArticle, sansArticle, articleDeLigne }
}

/** « 73,53 », « 1 650 » : la quantité à la française, sans zéros inutiles. */
export function formatQuantite(ligne) {
  if (ligne?.quantite != null) return Number(ligne.quantite).toLocaleString('fr-FR', { maximumFractionDigits: 3 })
  return ligne?.quantiteTexte ?? ''
}
