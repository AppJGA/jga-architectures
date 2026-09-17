// ─── Analyse d'une page : ce qui est caché ───────────────────────────────────
//
// On rejoue le dessin de la page en suivant l'état graphique (transformation,
// découpe, opacité, calques), puis on le reparcourt de la fin vers le début
// sur une trame de pixels (`trame.js`) : chaque aplat opaque recouvre ce qui a
// été peint avant lui. Sont retirés, au niveau de la page :
//   · les traits, aplats et symboles posés (`Do`) entièrement recouverts ;
//   · ceux qui tombent entièrement hors de leur découpe — ArchiCAD pose ses
//     motifs de hachure sur tout le rectangle englobant d'une zone, puis la
//     découpe à sa forme réelle.
// Aplats et découpes peuvent être de forme quelconque (non convexes, troués,
// courbes). On relève aussi l'opacité avec laquelle chaque symbole est posé —
// un symbole n'est fusionnable de l'intérieur que s'il est toujours posé opaque.
//
// Prudence : un aplat ne masque que s'il est opaque, de couleur unie, sans
// mode de fusion ni masque doux. Un élément et son masque doivent appartenir
// au même calque (contenu optionnel) : masquer un calque pourrait sinon faire
// réapparaître un élément retiré. Une découpe, elle, s'applique même quand son
// calque est masqué : ce qui tombe hors d'elle ne se voit jamais. Texte et
// images ne sont jamais retirés et ne masquent rien.

import { lireInstructions } from './lexique'
import { IDENTITE, concat, appliquer } from './geometrie'
import {
  PIXELS_PAR_POINT, parcourirConvexe, quadSegment, rectangleAutour, aplatirCourbe, zoneDe,
  ligneDeZone, intersecterIntervalles, Occultation,
} from './trame'

const TRAITS = new Set(['S', 's'])
const REMPLISSAGES = new Set(['f', 'F', 'f*'])
const DESSINS_MIXTES = new Set(['B', 'B*', 'b', 'b*'])
const FERMANTS = new Set(['s', 'b', 'b*'])
const PROFONDEUR_MAX = 12

/**
 * @param octets flux de contenu de la page, décompressé
 * @param ressources { extGState(nom) → {CA, ca, BM, SMask} | null,
 *                     forme(nom) → { id, bbox, matrice, octets, ressources } | null }
 * @param options.respecterCalques un masque ne cache que les éléments de son
 *   propre calque — masquer un calque dans le lecteur ne fait alors jamais
 *   apparaître de trou. Désactivé, le gain est un peu plus grand mais
 *   l'affichage des calques un par un n'est plus fidèle.
 * @param options.pixelsParPoint finesse de la trame
 * @returns {
 *   suppressions: [{ debut, fin, type }] — plages d'octets du flux de page à retirer,
 *   formesOpaques: Map(id → booléen) — posée chaque fois avec un trait opaque ?
 *   stats
 * }
 */
export function analyserPage(octets, ressources, { respecterCalques = true, pixelsParPoint = PIXELS_PAR_POINT } = {}) {
  // Éléments dans l'ordre de peinture. Coordonnées de page, en points :
  //   { rang, retirable, debut, fin, type, calque, clips,
  //     morceaux: [[x, y], …][] (polygones convexes touchés, hors épaisseur),
  //     rayon (demi-épaisseur en points), zone: { sousChemins, pairImpair },
  //     masque: booléen }
  const elements = []
  const formesOpaques = new Map()
  let rang = 0
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  const etendre = (p) => {
    if (p[0] < xmin) xmin = p[0]
    if (p[1] < ymin) ymin = p[1]
    if (p[0] > xmax) xmax = p[0]
    if (p[1] > ymax) ymax = p[1]
  }

  // ── Rejeu d'un flux (page ou symbole) ─────────────────────────────────────────
  const interpreter = (flux, res, etatInitial, dansPage, rangFixe, profondeur) => {
    // Un symbole qui se pose lui-même bouclerait sans fin
    if (profondeur > PROFONDEUR_MAX) return
    let etat = { ...etatInitial, calques: etatInitial.calques.slice() }
    const pile = []
    let sousChemin = []      // points du sous-chemin en cours
    let sousChemins = []     // sous-chemins terminés (courbes aplaties, pour les aplats)
    let morceaux = []        // polygones qui enveloppent chaque segment ou courbe (pour les traits)
    let courant = null
    let depart = null
    let debutChemin = -1
    let decoupe = null

    const terminerSousChemin = (fermer) => {
      if (fermer && sousChemin.length > 1 && courant && depart) morceaux.push([courant, depart])
      if (sousChemin.length) sousChemins.push(sousChemin)
      sousChemin = []
    }

    lireInstructions(flux, (op, nb, n, nom, debut, fin) => {
      const P = (x, y) => { const p = appliquer(etat.ctm, x, y); etendre(p); return p }

      switch (op) {
        case 'm':
          if (debutChemin < 0) debutChemin = debut
          terminerSousChemin(false)
          courant = depart = P(nb[0], nb[1])
          sousChemin.push(courant)
          return
        case 'l': {
          if (debutChemin < 0) debutChemin = debut
          const p = P(nb[0], nb[1])
          morceaux.push([courant ?? p, p])
          sousChemin.push(p)
          courant = p
          return
        }
        case 'c': case 'v': case 'y': {
          if (debutChemin < 0) debutChemin = debut
          const a = courant ?? P(nb[0], nb[1])
          const [p1, p2, p3] = op === 'c' ? [P(nb[0], nb[1]), P(nb[2], nb[3]), P(nb[4], nb[5])]
            : op === 'v' ? [a, P(nb[0], nb[1]), P(nb[2], nb[3])]
              : [P(nb[0], nb[1]), P(nb[2], nb[3]), P(nb[2], nb[3])]
          // Une courbe reste dans l'enveloppe de ses points de contrôle
          morceaux.push([a, p1, p2, p3])
          aplatirCourbe(a, p1, p2, p3, sousChemin, 0.1 / pixelsParPoint)
          courant = p3
          return
        }
        case 're': {
          if (debutChemin < 0) debutChemin = debut
          terminerSousChemin(false)
          const [x, y, w, h] = [nb[0], nb[1], nb[2], nb[3]]
          const q = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)]
          for (let i = 0; i < 4; i++) morceaux.push([q[i], q[(i + 1) % 4]])
          sousChemins.push(q)
          courant = depart = q[0]
          return
        }
        case 'h':
          terminerSousChemin(true)
          // Un segment qui suit repart du début du sous-chemin fermé
          courant = depart
          if (depart) sousChemin.push(depart)
          return
        case 'q': pile.push(etat); etat = { ...etat, calques: etat.calques.slice() }; return
        case 'Q': etat = pile.pop() ?? etat; return
        case 'cm': etat.ctm = concat(etat.ctm, [nb[0], nb[1], nb[2], nb[3], nb[4], nb[5]]); return
        case 'w': etat.largeur = nb[0]; return
        case 'j': etat.jonction = nb[0]; return
        case 'M': etat.onglet = nb[0]; return
        case 'gs': {
          const g = nom ? res.extGState(nom) : null
          if (g) {
            if (g.CA !== undefined) etat.CA = g.CA
            if (g.ca !== undefined) etat.ca = g.ca
            if (g.BM !== undefined) etat.fusionNormale = g.BM === 'Normal' || g.BM === 'Compatible'
            if (g.SMask !== undefined) etat.sansMasqueDoux = g.SMask === 'None'
          }
          return
        }
        // Couleur de remplissage : un motif ou un espace nommé inconnu n'est pas un aplat sûr
        case 'rg': case 'g': case 'k': etat.remplissageUni = true; return
        case 'cs': etat.remplissageUni = nom === 'DeviceRGB' || nom === 'DeviceGray' || nom === 'DeviceCMYK'; return
        case 'scn': case 'sc': if (nom) etat.remplissageUni = false; return
        // `/OC /oc1 BDC` : le dernier nom est la propriété du calque ; deux
        // éléments ne sont comparés que s'ils sont dans les mêmes calques
        case 'BDC': case 'BMC': etat.calques.push(nom ?? '·'); return
        case 'EMC': etat.calques.pop(); return
        case 'W': case 'W*': decoupe = op; return

        case 'Do': {
          const r = rangFixe ?? rang++
          const forme = nom ? res.forme(nom) : null
          if (!forme) return
          const opaque = etat.CA === 1 && etat.fusionNormale && etat.sansMasqueDoux
          formesOpaques.set(forme.id, (formesOpaques.get(forme.id) ?? true) && opaque)
          if (!forme.bbox) return
          const ctmForme = concat(etat.ctm, forme.matrice ?? IDENTITE)
          const [x0, y0, x1, y1] = forme.bbox
          const coins = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => appliquer(ctmForme, x, y))
          coins.forEach(etendre)
          if (dansPage) {
            elements.push({ rang: r, retirable: true, type: 'pose', debut, fin, calque: etat.calques.join('/'), clips: etat.clips, morceaux: [coins], rayon: 0 })
          }
          // Le contenu d'un symbole est découpé par sa BBox ; ses aplats
          // masquent comme ceux de la page, au rang de sa pose
          const clipForme = { sousChemins: [coins], pairImpair: false }
          interpreter(forme.octets, forme.ressources ?? res, { ...etat, ctm: ctmForme, clips: [...etat.clips, clipForme] }, false, r, profondeur + 1)
          return
        }
      }

      const peint = TRAITS.has(op) || REMPLISSAGES.has(op) || DESSINS_MIXTES.has(op) || op === 'n'
      if (!peint) return
      terminerSousChemin(FERMANTS.has(op))
      const r = rangFixe ?? rang++

      const remplit = !TRAITS.has(op) && op !== 'n'
      const opaque = etat.ca === 1 && etat.fusionNormale && etat.sansMasqueDoux && etat.remplissageUni
      // Dans un symbole, seuls comptent ses aplats opaques : le reste n'est ni
      // retirable ni masquant (et un plan pose des milliers de symboles)
      if (op !== 'n' && (dansPage || (remplit && opaque))) {
        const trace = TRAITS.has(op) || DESSINS_MIXTES.has(op)
        const m = etat.ctm
        // Majorant de l'étirement de l'épaisseur par la transformation
        const etirement = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2] + m[3] * m[3])
        // Une jonction en onglet peut dépasser jusqu'à la limite d'onglet — il
        // faut au moins deux morceaux pour faire une jonction
        const onglet = etat.jonction === 0 && morceaux.length > 1 ? Math.min(Math.max(etat.onglet, 1), 10) : 1
        elements.push({
          rang: r,
          retirable: dansPage,
          type: remplit ? 'aplat' : 'trait',
          debut: debutChemin >= 0 ? debutChemin : debut,
          fin,
          calque: etat.calques.join('/'),
          clips: etat.clips,
          morceaux: trace ? morceaux : [],
          rayon: trace ? (etat.largeur * etirement * onglet) / 2 : 0,
          onglet,
          zone: remplit ? { sousChemins, pairImpair: op.endsWith('*') } : null,
          masque: remplit && opaque,
        })
      }

      if (decoupe) {
        etat.clips = [...etat.clips, { sousChemins, pairImpair: decoupe === 'W*' }]
        decoupe = null
      }
      sousChemin = []
      sousChemins = []
      morceaux = []
      courant = depart = null
      debutChemin = -1
    })
  }

  const etatDepart = {
    ctm: IDENTITE, largeur: 1, jonction: 0, onglet: 10,
    CA: 1, ca: 1, fusionNormale: true, sansMasqueDoux: true, remplissageUni: true,
    clips: [], calques: [],
  }
  interpreter(octets, ressources, etatDepart, true, null, 0)

  const stats = { traits: 0, traitsCaches: 0, poses: 0, posesCachees: 0, aplats: 0, aplatsCaches: 0, masques: 0 }
  for (const e of elements) if (e.masque) stats.masques++
  if (!elements.length) return { suppressions: [], formesOpaques, stats }

  // ── Trame : origine sous tout ce qui a été dessiné ──────────────────────────────
  const S = pixelsParPoint
  const ox = Math.floor(xmin) - 4
  const oy = Math.floor(ymin) - 4
  const px = (p) => [(p[0] - ox) * S, (p[1] - oy) * S]
  const zones = new WeakMap()
  const zone = (z) => {
    let r = zones.get(z)
    if (!r) { r = zoneDe(z.sousChemins.map(sc => sc.map(px)), z.pairImpair); zones.set(z, r) }
    return r
  }

  // Intervalles de la ligne y que les découpes laissent peut-être voir
  const restreindre = (clips, y, xa, xb) => {
    let lignes = [xa, xb]
    for (const c of clips) {
      const zc = zone(c)
      if (zc.illimitee) continue
      lignes = intersecterIntervalles(lignes, ligneDeZone(zc, y, 'possible'))
      if (!lignes.length) break
    }
    return lignes
  }
  const libre = (occ, clips, y, xa, xb) => {
    const lignes = restreindre(clips, y, xa, xb)
    for (let i = 0; i < lignes.length; i += 2) if (occ.libreDans(y, lignes[i], lignes[i + 1])) return true
    return false
  }

  // Demi-épaisseur en pixels, avec une marge d'un demi-pixel : un trait très
  // fin couvre malgré tout un pixel à l'écran
  const visible = (e, occ) => {
    const rayon = Math.max(e.rayon * S, 0.25 * e.onglet) + 0.5
    for (const morceau of e.morceaux) {
      const pts = morceau.map(px)
      const poly = e.type === 'pose' ? pts
        : pts.length === 2 ? quadSegment(pts[0], pts[1], rayon)
          : rectangleAutour(pts, rayon)
      let vu = false
      parcourirConvexe(poly, (y, xa, xb) => { if (!vu && libre(occ, e.clips, y, xa, xb)) vu = true })
      if (vu) return true
    }
    if (e.zone) {
      const z = zone(e.zone)
      if (z.illimitee) return true
      for (let j = 0; j < z.possibles.length; j++) {
        const lignes = z.possibles[j]
        for (let i = 0; i < lignes.length; i += 2) if (libre(occ, e.clips, z.y0 + j, lignes[i], lignes[i + 1])) return true
      }
    }
    return false
  }

  const recouvrir = (e, occ) => {
    const z = zone(e.zone)
    if (z.illimitee) return
    for (let j = 0; j < z.surs.length; j++) {
      const y = z.y0 + j
      let lignes = z.surs[j]
      for (const c of e.clips) {
        if (!lignes.length) break
        const zc = zone(c)
        // Une découpe illimitée ne dit pas où l'aplat s'arrête : il ne masque pas
        lignes = zc.illimitee ? [] : intersecterIntervalles(lignes, ligneDeZone(zc, y, 'sur'))
      }
      for (let i = 0; i < lignes.length; i += 2) occ.marquer(y, lignes[i], lignes[i + 1])
    }
  }

  // ── Passe arrière, rang par rang ──────────────────────────────────────────────
  // Les aplats d'un symbole partagent le rang de sa pose : ils ne doivent pas
  // la cacher elle-même, d'où le test de tout le rang avant de le peindre
  const occultations = new Map()
  const occultationDe = (calque) => {
    const cle = respecterCalques ? calque : ''
    let o = occultations.get(cle)
    if (!o) { o = new Occultation(); occultations.set(cle, o) }
    return o
  }

  const suppressions = []
  const compter = { trait: ['traits', 'traitsCaches'], aplat: ['aplats', 'aplatsCaches'], pose: ['poses', 'posesCachees'] }
  let fin = elements.length
  while (fin > 0) {
    let debut = fin - 1
    while (debut > 0 && elements[debut - 1].rang === elements[fin - 1].rang) debut--
    const groupe = elements.slice(debut, fin)
    for (const e of groupe) {
      if (!e.retirable) continue
      const [total, caches] = compter[e.type]
      stats[total]++
      if (!visible(e, occultationDe(e.calque))) {
        e.cache = true
        stats[caches]++
        suppressions.push({ debut: e.debut, fin: e.fin, type: e.type })
      }
    }
    for (const e of groupe) if (e.masque && !e.cache) recouvrir(e, occultationDe(e.calque))
    fin = debut
  }

  suppressions.sort((a, b) => a.debut - b.debut)
  return { suppressions, formesOpaques, stats }
}
