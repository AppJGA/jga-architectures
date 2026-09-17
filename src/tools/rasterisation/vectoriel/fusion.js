// ─── Réécriture d'un flux : fusion des traits et retrait du caché ────────────
//
// ArchiCAD écrit chaque petit trait dans son propre bloc :
//     q /G1 gs 0.36 0.45 0.25 RG 224.4 601.7 m 224.4 601.7 l S Q
// Des milliers de blocs identiques se suivent. Les regrouper en un seul
//     q /G1 gs 0.36 0.45 0.25 RG <tous les tracés> S Q
// donne exactement le même dessin, vectoriel, en une instruction de peinture
// au lieu de milliers. De même, dans un symbole, `tracé S tracé S …` sans
// changement d'état devient `tracé tracé … S`.
//
// La fusion n'a lieu que si le trait est opaque, sans mode de fusion ni masque
// doux : deux traits semi-transparents qui se croisent foncent à l'endroit du
// croisement, un trait unique non. Tout ce qui n'entre pas dans ces motifs est
// recopié octet pour octet.

import { lireInstructions } from './lexique'

const CONSTRUCTION = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're'])
// Réglages qui peuvent précéder un tracé dans un bloc fusionnable
const REGLAGES = new Set([
  'gs', 'RG', 'rg', 'G', 'g', 'K', 'k', 'CS', 'cs', 'SC', 'SCN', 'sc', 'scn',
  'w', 'J', 'j', 'M', 'd', 'i', 'ri', 'cm',
])

// Au-delà, un seul tracé devient lourd pour certains lecteurs
export const SOUS_TRACES_MAX = 2000

const encodeur = new TextEncoder()
const decodeur = new TextDecoder('latin1')

/**
 * @param octets flux décompressé
 * @param options {
 *   suppressions: [{ debut, fin }] triées — plages à retirer (analyse),
 *   extGState(nom) → {CA, BM, SMask} | null,
 *   opaqueAuDepart: le trait hérité est-il opaque (page : oui ; symbole : selon ses poses)
 * }
 * @returns { octets: Uint8Array, stats: { blocsFusionnes, groupes, traitsFusionnes, retires } }
 */
export function reecrireFlux(octets, { suppressions = [], extGState = () => null, opaqueAuDepart = true, fusionner = true } = {}) {
  // ── 1. Instructions, en tableaux compacts ────────────────────────────────────
  const ops = []
  const debuts = []
  const fins = []
  const noms = []
  let s = 0
  lireInstructions(octets, (op, nb, n, nom, debut, fin) => {
    // Une instruction dans une plage retirée disparaît
    while (s < suppressions.length && suppressions[s].fin <= debut) s++
    if (s < suppressions.length && suppressions[s].debut <= debut && fin <= suppressions[s].fin) return
    ops.push(op)
    debuts.push(debut)
    fins.push(fin)
    noms.push(op === 'gs' ? nom : null)
  })
  const N = ops.length

  // Opacité du trait : suivie à travers q/Q et gs
  const opaciteGs = (nom) => {
    const g = nom ? extGState(nom) : null
    if (!g) return null
    if (g.CA !== undefined && g.CA !== 1) return false
    if (g.BM !== undefined && g.BM !== 'Normal' && g.BM !== 'Compatible') return false
    if (g.SMask !== undefined && g.SMask !== 'None') return false
    return g.CA === 1 ? true : null // null : ce gs ne dit rien du trait
  }

  // ── 2. Reconnaissance des blocs « un trait isolé » ───────────────────────────
  // Rend { fin: index du Q, reglages: [a, b] instructions, morceaux: [...], vide } ou null
  const lireBloc = (i, opaqueAvant) => {
    let j = i + 1
    let opaque = opaqueAvant
    while (j < N && REGLAGES.has(ops[j])) {
      if (ops[j] === 'gs') { const o = opaciteGs(noms[j]); if (o !== null) opaque = o }
      j++
    }
    const finReglages = j
    const morceaux = []
    let debutMorceau = -1
    while (j < N && ops[j] !== 'Q') {
      const op = ops[j]
      if (CONSTRUCTION.has(op)) { if (debutMorceau < 0) debutMorceau = j }
      else if ((op === 'S' || op === 's') && debutMorceau >= 0) {
        morceaux.push({ de: debutMorceau, a: j - 1, ferme: op === 's' })
        debutMorceau = -1
      } else return null
      j++
    }
    if (j >= N || debutMorceau >= 0) return null
    return { fin: j, reglages: [i + 1, finReglages], morceaux, opaque, vide: morceaux.length === 0 }
  }

  // ── 3. Parcours et réécriture ────────────────────────────────────────────────
  const sortie = []
  let copieDepuis = 0
  // Recopie de l'original jusqu'à `jusqua`, sans les plages retirées
  const copier = (jusqua) => {
    if (jusqua > copieDepuis) copierAvecSuppressions(octets, copieDepuis, jusqua, suppressions, (m) => sortie.push(m))
  }
  const texte = (a, b) => octets.subarray(a, b)
  const SEP = encodeur.encode('\n')

  const stats = { blocsFusionnes: 0, groupes: 0, traitsFusionnes: 0, retires: suppressions.length }

  // Écrit un groupe de morceaux (tracés) peints d'un seul trait
  const ecrireMorceaux = (morceaux) => {
    for (const m of morceaux) {
      sortie.push(texte(debuts[m.de], fins[m.a]))
      if (m.ferme) sortie.push(encodeur.encode(' h'))
      sortie.push(SEP)
    }
  }

  const pileOpacite = []
  let opaque = opaqueAuDepart
  let i = 0

  while (i < N) {
    const op = ops[i]

    if (op === 'q') {
      const bloc = lireBloc(i, opaque)
      if (bloc) {
        // Blocs identiques qui se suivent : mêmes réglages, au caractère près
        const cle = (b) => (b.reglages[1] > b.reglages[0]
          ? decodeur.decode(texte(debuts[b.reglages[0]], fins[b.reglages[1] - 1]))
          : '')
        const groupe = [bloc]
        const debutGroupe = debuts[i]
        let k = bloc.fin + 1
        if (fusionner && bloc.opaque && !bloc.vide) {
          const cleGroupe = cle(bloc)
          let sousTraces = bloc.morceaux.length
          while (k < N && ops[k] === 'q' && sousTraces < SOUS_TRACES_MAX) {
            const suivant = lireBloc(k, opaque)
            if (!suivant) break
            if (suivant.vide) { groupe.push(suivant); k = suivant.fin + 1; continue }
            if (!suivant.opaque || cle(suivant) !== cleGroupe) break
            groupe.push(suivant)
            sousTraces += suivant.morceaux.length
            k = suivant.fin + 1
          }
        }

        const pleins = groupe.filter(b => !b.vide)
        const morceaux = pleins.flatMap(b => b.morceaux)
        const aReecrire = groupe.length > 1 || bloc.vide || (fusionner && morceaux.length > 1)

        if (aReecrire) {
          copier(debutGroupe)
          if (pleins.length > 0) {
            const tete = pleins[0]
            sortie.push(encodeur.encode('q\n'))
            if (tete.reglages[1] > tete.reglages[0]) {
              sortie.push(texte(debuts[tete.reglages[0]], fins[tete.reglages[1] - 1]))
              sortie.push(SEP)
            }
            if (tete.opaque && fusionner) {
              ecrireMorceaux(morceaux)
              sortie.push(encodeur.encode('S\nQ\n'))
            } else {
              // Non opaque : on garde un trait par morceau, sans fusion
              for (const m of morceaux) {
                sortie.push(texte(debuts[m.de], fins[m.a]))
                sortie.push(encodeur.encode(m.ferme ? '\ns\n' : '\nS\n'))
              }
              sortie.push(encodeur.encode('Q\n'))
            }
            if (pleins.length > 1) stats.groupes++
            stats.blocsFusionnes += groupe.length - 1
            stats.traitsFusionnes += Math.max(0, morceaux.length - 1)
          }
          copieDepuis = fins[groupe[groupe.length - 1].fin]
        }
        i = groupe[groupe.length - 1].fin + 1
        continue
      }
      pileOpacite.push(opaque)
      i++
      continue
    }

    if (op === 'Q') { opaque = pileOpacite.pop() ?? opaque; i++; continue }
    if (op === 'gs') { const o = opaciteGs(noms[i]); if (o !== null) opaque = o; i++; continue }

    // Tracés successifs peints chacun d'un trait, sans rien entre eux
    if (fusionner && CONSTRUCTION.has(op) && opaque) {
      const morceaux = []
      let j = i
      while (j < N && morceaux.length < SOUS_TRACES_MAX) {
        let d = j
        while (d < N && CONSTRUCTION.has(ops[d])) d++
        if (d === j || d >= N || (ops[d] !== 'S' && ops[d] !== 's')) break
        morceaux.push({ de: j, a: d - 1, ferme: ops[d] === 's' })
        j = d + 1
      }
      if (morceaux.length > 1) {
        copier(debuts[i])
        ecrireMorceaux(morceaux)
        sortie.push(encodeur.encode('S\n'))
        copieDepuis = fins[j - 1]
        stats.traitsFusionnes += morceaux.length - 1
        i = j
        continue
      }
    }

    i++
  }

  copier(octets.length)
  const total = sortie.reduce((t, m) => t + m.length, 0)
  const final = new Uint8Array(total)
  let pos = 0
  for (const m of sortie) { final.set(m, pos); pos += m.length }
  return { octets: final, stats }
}

// Recopie [a, b) en sautant les plages supprimées
function copierAvecSuppressions(octets, a, b, suppressions, emettre) {
  let curseur = a
  for (const s of suppressions) {
    if (s.fin <= curseur || s.debut >= b) continue
    if (s.debut > curseur) emettre(octets.subarray(curseur, s.debut))
    curseur = Math.max(curseur, s.fin)
  }
  if (curseur < b) emettre(octets.subarray(curseur, b))
}
