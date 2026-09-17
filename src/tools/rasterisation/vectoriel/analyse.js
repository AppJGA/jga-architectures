// ─── Analyse d'une page : ce qui est caché ───────────────────────────────────
//
// On rejoue le dessin de la page en suivant l'état graphique (transformation,
// découpe, opacité, calques) pour repérer :
//   · les traits de la page entièrement recouverts par un aplat opaque posé
//     après eux ;
//   · les symboles (formulaires `Do`) entièrement recouverts de même ;
//   · l'opacité avec laquelle chaque symbole est posé — un symbole n'est
//     fusionnable de l'intérieur que s'il est toujours posé opaque.
//
// Prudence partout : un aplat ne masque que s'il est opaque, sans mode de
// fusion ni masque doux, convexe, fait de segments droits, et seulement dans
// sa zone de découpe (elle-même convexe). Un trait et son masque doivent
// appartenir au même calque (contenu optionnel) : masquer un calque pourrait
// sinon faire réapparaître un trait retiré.

import { lireInstructions } from './lexique'
import {
  IDENTITE, concat, appliquer, echelle, estConvexe, dansConvexe, emprise, sommetsDistincts,
} from './geometrie'

const CONSTRUCTION = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're'])
const TRAITS = new Set(['S', 's'])
const REMPLISSAGES = new Set(['f', 'F', 'f*'])
const DESSINS_MIXTES = new Set(['B', 'B*', 'b', 'b*'])

/**
 * @param octets flux de contenu de la page, décompressé
 * @param ressources { extGState(nom) → {CA, ca, BM, SMask} | null,
 *                     forme(nom) → { id, bbox, matrice, octets, ressources } | null }
 * @param options.respecterCalques un masque ne cache que les éléments de son
 *   propre calque — masquer un calque dans le lecteur ne fait alors jamais
 *   apparaître de trou. Désactivé, le gain est plus grand mais l'affichage des
 *   calques un par un n'est plus fidèle.
 * @returns {
 *   suppressions: [{ debut, fin }]  — plages d'octets du flux de page à retirer,
 *   formesOpaques: Map(id → booléen) — posée chaque fois avec un trait opaque ?
 *   stats
 * }
 */
export function analyserPage(octets, ressources, { respecterCalques = true } = {}) {
  const traits = []   // traits de la page : { ordre, debut, fin, temoins, calque }
  const poses = []    // symboles posés depuis la page : { ordre, debut, fin, temoins, calque }
  const masques = []  // { ordre, poly, clips, calque, emp }
  const formesOpaques = new Map()
  let ordre = 0

  // ── Interprétation d'un flux (page ou symbole) ───────────────────────────────
  const interpreter = (flux, res, etatInitial, dansPage, ordreFixe, profondeur = 0) => {
    // Un symbole qui se pose lui-même bouclerait sans fin
    if (profondeur > 12) return
    let etat = { ...etatInitial, clips: etatInitial.clips.slice(), calques: etatInitial.calques.slice() }
    const pile = []
    let chemin = []           // points (coordonnées de page) du tracé en cours
    let cheminDroit = true    // tracé fait de segments droits seulement
    let debutChemin = -1
    let decoupeEnAttente = false

    lireInstructions(flux, (op, nb, n, nom, debut, fin) => {
      const rang = ordreFixe ?? ordre++

      if (CONSTRUCTION.has(op)) {
        if (debutChemin < 0) debutChemin = debut
        const m = etat.ctm
        if (op === 'm' || op === 'l') chemin.push(appliquer(m, nb[0], nb[1]))
        else if (op === 'c') { chemin.push(appliquer(m, nb[0], nb[1]), appliquer(m, nb[2], nb[3]), appliquer(m, nb[4], nb[5])); cheminDroit = false }
        else if (op === 'v' || op === 'y') { chemin.push(appliquer(m, nb[0], nb[1]), appliquer(m, nb[2], nb[3])); cheminDroit = false }
        else if (op === 're') {
          const [x, y, w, h] = [nb[0], nb[1], nb[2], nb[3]]
          chemin.push(appliquer(m, x, y), appliquer(m, x + w, y), appliquer(m, x + w, y + h), appliquer(m, x, y + h))
        }
        return
      }

      switch (op) {
        case 'q': pile.push(etat); etat = { ...etat, clips: etat.clips.slice(), calques: etat.calques.slice() }; break
        case 'Q': etat = pile.pop() ?? etat; break
        case 'cm': etat.ctm = concat(etat.ctm, [nb[0], nb[1], nb[2], nb[3], nb[4], nb[5]]); break
        case 'w': etat.largeur = nb[0]; break
        case 'j': etat.jonction = nb[0]; break
        case 'M': etat.onglet = nb[0]; break
        case 'gs': {
          const g = nom ? res.extGState(nom) : null
          if (g) {
            if (g.CA !== undefined) etat.CA = g.CA
            if (g.ca !== undefined) etat.ca = g.ca
            if (g.BM !== undefined) etat.fusionNormale = g.BM === 'Normal' || g.BM === 'Compatible'
            if (g.SMask !== undefined) etat.sansMasqueDoux = g.SMask === 'None'
          }
          break
        }
        // Couleur de remplissage : un motif ou un espace nommé inconnu n'est pas un aplat sûr
        case 'rg': case 'g': case 'k': etat.remplissageUni = true; break
        case 'cs': etat.remplissageUni = nom === 'DeviceRGB' || nom === 'DeviceGray' || nom === 'DeviceCMYK'; break
        case 'scn': case 'sc': if (nom) etat.remplissageUni = false; break
        // `/OC /oc1 BDC` : le dernier nom est la propriété du calque ; deux
        // éléments ne sont comparés que s'ils sont dans les mêmes calques
        case 'BDC': case 'BMC': etat.calques.push(nom ?? '·'); break
        case 'EMC': etat.calques.pop(); break
        case 'W': case 'W*': decoupeEnAttente = true; break

        case 'Do': {
          const forme = nom ? res.forme(nom) : null
          if (!forme) break
          const opaque = etat.CA === 1 && etat.fusionNormale && etat.sansMasqueDoux
          formesOpaques.set(forme.id, (formesOpaques.get(forme.id) ?? true) && opaque)
          const ctmForme = concat(etat.ctm, forme.matrice ?? IDENTITE)
          if (dansPage && forme.bbox) {
            const [x0, y0, x1, y1] = forme.bbox
            const coins = [appliquer(ctmForme, x0, y0), appliquer(ctmForme, x1, y0), appliquer(ctmForme, x1, y1), appliquer(ctmForme, x0, y1)]
            poses.push({ ordre: rang, debut, fin, temoins: coins, calque: etat.calques.join('/') })
          }
          // Les aplats d'un symbole masquent comme ceux de la page, au rang de sa pose
          interpreter(forme.octets, forme.ressources ?? res, { ...etat, ctm: ctmForme }, false, rang, profondeur + 1)
          break
        }

        default: {
          const peint = TRAITS.has(op) || REMPLISSAGES.has(op) || DESSINS_MIXTES.has(op) || op === 'n'
          if (!peint) break

          if (TRAITS.has(op) && dansPage && chemin.length) {
            // Trait élargi de sa demi-épaisseur ; une jonction en onglet peut
            // dépasser jusqu'à la limite d'onglet
            const demi = Math.max(etat.largeur * echelle(etat.ctm), 0.25) / 2
            const marge = etat.jonction === 0 ? demi * Math.min(Math.max(etat.onglet, 1), 10) : demi
            const temoins = []
            for (const [x, y] of chemin) temoins.push([x - marge, y - marge], [x + marge, y - marge], [x - marge, y + marge], [x + marge, y + marge])
            traits.push({ ordre: rang, debut: debutChemin, fin, temoins, calque: etat.calques.join('/') })
          }

          if (REMPLISSAGES.has(op) && cheminDroit && chemin.length >= 3
            && etat.ca === 1 && etat.fusionNormale && etat.sansMasqueDoux && etat.remplissageUni) {
            const poly = sommetsDistincts(chemin)
            const clipsConvexes = etat.clips.every(c => c !== null)
            if (estConvexe(poly) && clipsConvexes) {
              masques.push({ ordre: rang, poly, clips: etat.clips.slice(), calque: etat.calques.join('/'), emp: emprise(poly) })
            }
          }

          if (decoupeEnAttente) {
            const poly = sommetsDistincts(chemin)
            // Une découpe non convexe (ou courbe) rend incertain tout ce qu'elle limite
            etat.clips.push(cheminDroit && estConvexe(poly) ? poly : null)
            decoupeEnAttente = false
          }

          chemin = []
          cheminDroit = true
          debutChemin = -1
        }
      }
    })
  }

  const etatDepart = {
    ctm: IDENTITE, largeur: 1, jonction: 0, onglet: 10,
    CA: 1, ca: 1, fusionNormale: true, sansMasqueDoux: true, remplissageUni: true,
    clips: [], calques: [],
  }
  interpreter(octets, ressources, etatDepart, true, null)

  // ── Recouvrement ─────────────────────────────────────────────────────────────
  const PAS = 150
  const grille = new Map()
  for (const m of masques) {
    for (let gx = Math.floor(m.emp[0] / PAS); gx <= Math.floor(m.emp[2] / PAS); gx++) {
      for (let gy = Math.floor(m.emp[1] / PAS); gy <= Math.floor(m.emp[3] / PAS); gy++) {
        const k = gx * 100000 + gy
        if (!grille.has(k)) grille.set(k, [])
        grille.get(k).push(m)
      }
    }
  }

  const cache = (element) => {
    const [x, y] = element.temoins[0]
    const candidats = grille.get(Math.floor(x / PAS) * 100000 + Math.floor(y / PAS))
    if (!candidats) return false
    return candidats.some(m => m.ordre > element.ordre
      && (!respecterCalques || m.calque === element.calque)
      && element.temoins.every(p => dansConvexe(p, m.poly) && m.clips.every(c => dansConvexe(p, c))))
  }

  const suppressions = []
  let traitsCaches = 0
  let posesCachees = 0
  for (const t of traits) if (cache(t)) { suppressions.push({ debut: t.debut, fin: t.fin, type: 'trait' }); traitsCaches++ }
  for (const p of poses) if (cache(p)) { suppressions.push({ debut: p.debut, fin: p.fin, type: 'pose' }); posesCachees++ }
  suppressions.sort((a, b) => a.debut - b.debut)

  return {
    suppressions,
    formesOpaques,
    stats: { traits: traits.length, traitsCaches, poses: poses.length, posesCachees, masques: masques.length },
  }
}
