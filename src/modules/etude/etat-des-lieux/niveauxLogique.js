// ─── Les étages d'un DXF ─────────────────────────────────────────────────────
//
// ArchiCAD superpose les étages au même endroit (le sous-sol sous le rez-de-
// chaussée) : on les distingue par le nom des blocs de vues et des calques
// (« ----_SSOL_EDL_----__3D_ », « M-RDC »). Faute de noms, un fichier de
// géomètre mêle le bâtiment à d'autres dessins (plan de division, cartouche) :
// on regroupe les traits proches, et l'étage est la grappe qui porte les
// pièces. L'utilisateur relit, renomme ou écarte avant l'import.

import { boite, dansBoite, centre, retirerSuperpositions } from './geometrieEdl'
import { piecesDesRestes } from './restesLogique'

const MIN_TRAITS_NIVEAU = 50
const CELLULES_MAX_PAR_TRAIT = 4000

const normaliser = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export function niveauDeNom(nom) {
  const n = normaliser(nom)
  if (!n) return null
  if (/SOUS[-_ ]?SOL|(^|[^A-Z])S[-_]SOL|(^|[^A-Z])SSOL([^A-Z]|$)/.test(n)) return { cle: 'SS', nom: 'Sous-sol', ordre: -1 }
  if (/(^|[^A-Z])RDJ([^A-Z]|$)|REZ[-_ ]?DE[-_ ]?JARDIN/.test(n)) return { cle: 'RDJ', nom: 'Rez-de-jardin', ordre: -0.5 }
  if (/(^|[^A-Z])RDC([^A-Z]|$)|REZ[-_ ]?DE[-_ ]?CHAUSSEE/.test(n)) return { cle: 'RDC', nom: 'Rez-de-chaussée', ordre: 0 }
  const etage = n.match(/R\s*\+\s*(\d)/) ?? n.match(/ETAGE[-_ ]?(\d)/) ?? n.match(/(\d)\s*(?:ER|EME|E)[-_ ]?ETAGE/)
  if (etage) return { cle: `R+${etage[1]}`, nom: `R+${etage[1]}`, ordre: Number(etage[1]) }
  if (/COMBLES?/.test(n)) return { cle: 'COMBLES', nom: 'Combles', ordre: 50 }
  return null
}

const PAR_CODE = { 1: 39.37007874, 2: 3.280839895, 4: 1000, 5: 100, 6: 1 }

export function uniteParDefaut(lecture) {
  if (PAR_CODE[lecture.unites]) return PAR_CODE[lecture.unites]
  const xs = [], ys = []
  for (const t of lecture.traits) for (const [x, y] of t.pts) { xs.push(x); ys.push(y) }
  if (!xs.length) return 1
  const quantile = (a, f) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(f * (s.length - 1))] }
  const etendue = Math.max(quantile(xs, 0.95) - quantile(xs, 0.05), quantile(ys, 0.95) - quantile(ys, 0.05))
  if (etendue > 50_000) return 1000
  if (etendue > 500) return 100
  return 1
}

export function grappes(traits, cellule) {
  const parent = traits.map((_, i) => i)
  const racine = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const grille = new Map()
  traits.forEach((t, i) => {
    const [x0, y0, x1, y1] = boite(t.pts)
    const cx0 = Math.floor(x0 / cellule), cx1 = Math.floor(x1 / cellule)
    const cy0 = Math.floor(y0 / cellule), cy1 = Math.floor(y1 / cellule)
    // Un grand cadre relierait tout ce qu'il entoure
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > CELLULES_MAX_PAR_TRAIT) return
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cle = `${cx},${cy}`
        const autre = grille.get(cle)
        if (autre === undefined) grille.set(cle, i)
        else parent[racine(i)] = racine(autre)
      }
    }
  })
  const groupes = new Map()
  traits.forEach((t, i) => {
    const r = racine(i)
    if (!groupes.has(r)) groupes.set(r, [])
    groupes.get(r).push(t)
  })
  return [...groupes.values()]
}

const surfaceBoite = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0)

export function proposerNiveaux(lecture, detection, unitesParMetre, nomFichier = '') {
  const u = unitesParMetre
  const tagDe = (el) => niveauDeNom(el.bloc) ?? niveauDeNom(el.calque)

  const parCle = new Map()
  for (const t of lecture.traits) {
    const n = tagDe(t)
    if (!n) continue
    if (!parCle.has(n.cle)) parCle.set(n.cle, { ...n, traits: [] })
    parCle.get(n.cle).traits.push(t)
  }
  const seuil = Math.max(MIN_TRAITS_NIVEAU, lecture.traits.length * 0.01)
  const parNom = [...parCle.values()].filter((g) => g.traits.length >= seuil).sort((a, b) => a.ordre - b.ordre)

  let niveaux
  if (parNom.length >= 2) {
    niveaux = parNom.map((g) => ({
      nom: g.nom,
      traits: g.traits,
      textes: lecture.textes.filter((t) => tagDe(t)?.cle === g.cle),
      pieces: detection.pieces.filter((p) => tagDe(p)?.cle === g.cle),
    }))
  } else {
    const groupes = grappes(lecture.traits, u).map((traits) => ({ traits, boite: boite(traits.flatMap((t) => t.pts)), pieces: [] }))
    // Une pièce va à la plus petite grappe qui la contient, parmi les vrais
    // dessins : une limite de terrain trop longue pour la grille fait une
    // grappe d'un seul trait dont la boîte entoure souvent les pièces — elle
    // les emportait, et l'étage s'affichait sans ses murs
    const consistantes = groupes.filter((g) => g.traits.length >= seuil)
    for (const p of detection.pieces) {
      const c = centre(p.contour).map((v) => v * u)
      const dedans = (g) => dansBoite(c, g.boite)
      const candidats = consistantes.some(dedans) ? consistantes.filter(dedans) : groupes.filter(dedans)
      if (candidats.length) candidats.reduce((a, b) => (surfaceBoite(b.boite) < surfaceBoite(a.boite) ? b : a)).pieces.push(p)
    }
    let retenus = groupes.filter((g) => g.pieces.length > 0)
    if (!retenus.length) retenus = groupes.filter((g) => g.traits.length >= lecture.traits.length * 0.1).slice(0, 6)
    // Dessin morcelé (aucune grappe dominante) : tout en un étage, sinon
    // l'écran n'aurait rien à importer
    if (!retenus.length && lecture.traits.length) retenus = [{ traits: lecture.traits, boite: boite(lecture.traits.flatMap((t) => t.pts)), pieces: [] }]
    retenus.sort((a, b) => b.boite[3] - a.boite[3])
    const nomFichierNiveau = niveauDeNom(nomFichier)?.nom
    niveaux = retenus.map((g, i) => ({
      nom: retenus.length === 1 ? (nomFichierNiveau ?? 'Niveau 1') : `Niveau ${i + 1}`,
      traits: g.traits,
      textes: lecture.textes.filter((t) => dansBoite(t.pos, g.boite)),
      pieces: g.pieces,
    }))
  }

  return niveaux.map((n) => {
    const traits = n.traits.map((t) => ({ calque: t.calque, ferme: t.ferme, pts: t.pts.map(([x, y]) => [x / u, y / u]) }))
    const textes = n.textes.map((t) => ({ texte: t.texte, calque: t.calque, hauteur: t.hauteur / u, pos: [t.pos[0] / u, t.pos[1] / u] }))
    // Étage par étage : ceux d'ArchiCAD se superposent entre eux, pas leurs
    // pièces. Les zones englobantes écartées rendent leurs couloirs.
    const { gardees, ecartees } = retirerSuperpositions(n.pieces)
    const couloirs = piecesDesRestes(ecartees, gardees, textes)
    return {
      nom: n.nom,
      traits,
      textes,
      pieces: [...gardees, ...couloirs],
      ecartees: ecartees.length,
      couloirs: couloirs.length,
      boite: boite(traits.flatMap((t) => t.pts)),
      aProposer: gardees.length + couloirs.length === 0,
    }
  })
}
