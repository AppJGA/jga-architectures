// ─── Relecture du découpage : les contrôles sans IA ──────────────────────────
//
// Avant (et à côté de) la relecture par Claude, ce qui se vérifie d'office et
// gratuitement : un nom écrit sur le plan qu'aucune pièce n'entoure, une
// pièce sans nom, une surface dessinée qui s'écarte de la surface écrite, une
// pièce minuscule, deux pièces de même nom et même numéro. On signale, on ne
// corrige jamais : l'utilisateur décide (« C'est juste » écarte un
// signalement). Chaque signalement a une clé stable pour être écarté.

import { aire, ecartSurface, SEUIL_ECART, pointDansPolygone } from './geometrieEdl'
import { CALQUE_DESIGNATION, estNom } from './piecesDxfLogique'

const AIRE_MINIMALE = 0.5
const fmt = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const premiereLigne = (t) => String(t ?? '').split('\n')[0].trim()

/**
 * @param pieces lignes `edl_pieces` (id, nom, numero, contour, surface_lue)
 * @param textes textes de l'étage ({ texte, calque, pos }) ; sans calque
 *   (étages importés avant qu'il soit gardé), pas de contrôle des noms
 * @returns [{ cle, type, pieceId, motif, source: 'regle', nom?, pos? }] — `nom` et
 *   `pos` pour un nom écrit sans pièce
 */
export function controlesAutomatiques(pieces, textes = []) {
  const signalements = []
  const ajouter = (type, pieceId, motif, distinctif = pieceId, extra = {}) =>
    signalements.push({ cle: `regle:${type}:${distinctif}`, type, pieceId, motif, source: 'regle', ...extra })

  const vus = new Set()
  for (const t of textes) {
    if (!t.calque || !CALQUE_DESIGNATION.test(t.calque) || !estNom(t.texte)) continue
    if (pieces.some((p) => pointDansPolygone(t.pos, p.contour))) continue
    const nom = premiereLigne(t.texte)
    const distinctif = `${nom}@${t.pos.map((v) => Math.round(v)).join(',')}`
    if (vus.has(distinctif)) continue
    vus.add(distinctif)
    ajouter('nom-sans-piece', null, `« ${nom} » est écrit sur le plan, mais aucune pièce ne l’entoure.`, distinctif, { nom, pos: t.pos })
  }

  const parDesignation = new Map()
  for (const p of pieces) {
    if (p.nom && p.numero) {
      const cle = `${p.nom.toLowerCase()}|${p.numero}`
      parDesignation.set(cle, [...(parDesignation.get(cle) ?? []), p.id])
    }
  }
  for (const p of pieces) {
    const surface = aire(p.contour)
    if (!p.nom) ajouter('sans-nom', p.id, 'Pièce sans nom.')
    const ecart = ecartSurface(p.contour, Number(p.surface_lue))
    if (ecart != null && Math.abs(ecart) > SEUIL_ECART) ajouter('surface', p.id, `Surface dessinée ${fmt(surface)} m² pour ${fmt(Number(p.surface_lue))} m² écrits sur le plan.`)
    if (surface < AIRE_MINIMALE) ajouter('petite', p.id, `Très petite (${fmt(surface)} m²) : est-ce une vraie pièce ?`)
    if (p.nom && p.numero && parDesignation.get(`${p.nom.toLowerCase()}|${p.numero}`).length > 1) {
      ajouter('doublon', p.id, `Même nom et même numéro qu’une autre pièce (${p.numero} · ${p.nom}).`)
    }
  }
  return signalements
}

/** Signalements à montrer : ni écartés à la main, ni sur une pièce disparue. */
export function signalementsVisibles(signalements, pieces, ecartes = []) {
  const ids = new Set(pieces.map((p) => p.id))
  const masques = new Set(ecartes)
  return signalements.filter((s) => !masques.has(s.cle) && (s.pieceId == null || ids.has(s.pieceId)))
}
