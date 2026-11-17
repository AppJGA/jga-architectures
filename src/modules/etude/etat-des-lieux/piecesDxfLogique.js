// ─── Les pièces dessinées dans un DXF ────────────────────────────────────────
//
// On ne reconstruit pas les pièces à partir des murs (plans plus ou moins
// précis : trop fragile). Les plans de l'agence portent déjà leurs contours :
// zones d'ArchiCAD, calque des pièces du géomètre. Le bon calque est celui
// dont les polylignes fermées contiennent une surface écrite qui correspond à
// la surface dessinée — le rapport des deux donne en plus l'unité du dessin
// (m, cm, mm). Aucune IA ici.

import { aire, pointDansPolygone, boite, dansBoite, mediane } from './geometrieEdl'

const TOLERANCE_RAPPORT = 0.1
const MIN_PIECES = 3
// Unités par mètre : m, dm, cm, mm, pouce, pied
const UNITES_CONNUES = [1, 10, 100, 1000, 39.37007874, 3.280839895]

const nombre = (s) => parseFloat(s.replace(',', '.'))
const premiereLigne = (t) => t.split('\n')[0].trim()

/**
 * Surface écrite dans un texte. « S=22.9 m² » ou « 16.0 m carrés » partout ;
 * un nombre seul (« 4.40 », tampon de zone ArchiCAD) seulement si
 * `seulAccepte` — sinon une cote prise dans la pièce passerait pour sa surface.
 */
export function lireSurface(texte, { seulAccepte = true } = {}) {
  const ecrite = texte.match(/\bS\s*=\s*(\d+(?:[.,]\d+)?)/i) ?? texte.match(/(\d+(?:[.,]\d+)?)\s*m\s*(?:²|2(?!\d)|carr)/i)
  if (ecrite) return nombre(ecrite[1])
  if (!seulAccepte) return null
  const seul = texte.trim().match(/^(\d{1,4}[.,]\d{1,2})$/)
  return seul ? nombre(seul[1]) : null
}

// « HP » du géomètre = hauteur sous plafond ; « Hp » (sous porte) et « HSP »
// (sous poutre) n'en sont pas : la casse compte
export function lireHsp(texte) {
  const m = texte.match(/\bHP\s*[:=]\s*(\d+(?:[.,]\d+)?)/)
  return m ? nombre(m[1]) : null
}

export function lireNumero(texte) {
  const t = texte.trim()
  return /^[A-Z]{0,3}\d{2,5}[A-Z]?$/.test(t) ? t : null
}

export function estNom(texte) {
  const premiere = premiereLigne(texte)
  if (!premiere || premiere.includes('_')) return false // « 02_RDC » : code de niveau ArchiCAD
  if (/^(S\s*=|HP\b|HSP\b|Hp\b|Hf\b)/.test(premiere)) return false
  return (premiere.match(/\p{L}/gu) ?? []).length >= 3
}

export function arrondirUnite(u) {
  for (const c of UNITES_CONNUES) if (Math.abs(u / c - 1) < 0.02) return c
  return u
}

// Chaque texte va au plus petit contour qui le contient : le contour du
// bâtiment, dessiné sur le même calque, ne vole pas le nom des pièces
function textesParPolygone(polys, textes) {
  const boites = polys.map((p) => boite(p.pts))
  const aires = polys.map((p) => aire(p.pts))
  const propres = polys.map(() => [])
  for (const t of textes) {
    let choisi = -1
    for (let i = 0; i < polys.length; i++) {
      if (!dansBoite(t.pos, boites[i]) || !pointDansPolygone(t.pos, polys[i].pts)) continue
      if (choisi < 0 || aires[i] < aires[choisi]) choisi = i
    }
    if (choisi >= 0) propres[choisi].push(t)
  }
  return propres
}

function lirePiece(poly, propres) {
  const memeCalque = propres.filter((t) => t.calque === poly.calque)
  const sources = memeCalque.length ? memeCalque : propres
  let surfaceLue = null, hspLue = null, numero = null, nom = ''
  for (const t of sources) {
    surfaceLue ??= lireSurface(t.texte, { seulAccepte: memeCalque.length > 0 })
    hspLue ??= lireHsp(t.texte)
    numero ??= lireNumero(t.texte)
    if (!nom && estNom(t.texte)) nom = premiereLigne(t.texte)
  }
  return { nom, numero, surfaceLue, hspLue }
}

export function detecterPieces({ traits, textes }) {
  const parCalque = new Map()
  for (const t of traits) {
    if (!t.ferme || t.pts.length < 3) continue
    if (!parCalque.has(t.calque)) parCalque.set(t.calque, [])
    parCalque.get(t.calque).push(t)
  }

  let meilleur = null
  for (const [calque, polys] of parCalque) {
    if (polys.length < MIN_PIECES) continue
    const propres = textesParPolygone(polys, textes)
    const lues = polys.map((poly, i) => ({ poly, nbTextes: propres[i].length, aireBrute: aire(poly.pts), ...lirePiece(poly, propres[i]) }))
    const rapports = lues.filter((l) => l.surfaceLue > 0).map((l) => l.aireBrute / l.surfaceLue)
    if (rapports.length < MIN_PIECES) continue
    const med = mediane(rapports)
    const accord = rapports.filter((r) => Math.abs(r / med - 1) <= TOLERANCE_RAPPORT).length
    if (accord < MIN_PIECES || accord < rapports.length / 2) continue
    if (!meilleur || accord > meilleur.accord) meilleur = { calque, lues, med, accord }
  }
  if (!meilleur) return { calque: null, unitesParMetre: null, pieces: [] }

  const u = arrondirUnite(Math.sqrt(meilleur.med))
  const pieces = meilleur.lues
    .filter((l) => l.nbTextes > 0 && (l.nom || l.surfaceLue || l.numero))
    .map((l) => ({
      nom: l.nom, numero: l.numero, surfaceLue: l.surfaceLue, hspLue: l.hspLue,
      calque: l.poly.calque, bloc: l.poly.bloc ?? null,
      contour: l.poly.pts.map(([x, y]) => [x / u, y / u]),
    }))
  return { calque: meilleur.calque, unitesParMetre: u, pieces }
}
