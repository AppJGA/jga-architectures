// ─── Faire choisir le traitement des calques par Claude (navigateur) ────────
//
// Chaque calque est dessiné seul, en noir sur blanc, sur un petit extrait
// cadré là où il est le plus chargé : c'est ce qui montre à Claude qu'un
// calque au nom muet est un remplissage de murs, des tuiles ou des portes.
// Un aperçu de tout l'étage, tous calques en gris, lui donne le contexte.
// Les traits arrivent en mètres, repère du plan (y vers le haut).

import { canevasBlanc } from './renduNiveau'
import { appelerClaude } from './piecesIa'
import { TEXTES_PAR_CALQUE, cadreDense, lireDecisionsCalques, calquesAEnvoyer } from './calquesIaLogique'

const TAILLE_EXTRAIT = 384
// Repli si la demande dépasse ce poids : la limite des fonctions Vercel est
// de 4,5 Mo, en-têtes et JSON compris.
const TAILLE_EXTRAIT_REDUITE = 256
const POIDS_MAX = 3.5 * 1024 * 1024
const TAILLE_APERCU = 1024
const QUALITE = 0.8
// Un chemin de canevas de centaines de milliers de segments fige le
// navigateur au moment du tracé : on trace par paquets.
const SEGMENTS_PAR_TRACE = 5000

// Rend la main au navigateur entre deux calques : sur un étage de centaines
// de milliers de traits, soixante extraits et l'aperçu dessinés d'un bloc
// figeaient la fenêtre juste après la lecture du fichier
const souffler = () => new Promise((r) => setTimeout(r, 0))

function enJpeg(canvas) {
  const url = canvas.toDataURL('image/jpeg', QUALITE)
  canvas.width = 0
  canvas.height = 0
  return url.slice(url.indexOf(',') + 1)
}

function tracer(ctx, traits, [x0, y0, x1, y1], k, hauteur, rogner) {
  const px = (x) => (x - x0) * k
  const py = (y) => hauteur - (y - y0) * k
  let segments = 0
  ctx.beginPath()
  for (const t of traits) {
    const pts = t.pts
    if (!pts || pts.length < 2) continue
    if (rogner) {
      let gx = Infinity, gy = Infinity, dx = -Infinity, dy = -Infinity
      for (const [x, y] of pts) {
        if (x < gx) gx = x
        if (y < gy) gy = y
        if (x > dx) dx = x
        if (y > dy) dy = y
      }
      if (dx < x0 || gx > x1 || dy < y0 || gy > y1) continue
    }
    ctx.moveTo(px(pts[0][0]), py(pts[0][1]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i][0]), py(pts[i][1]))
    if (t.ferme && pts.length > 2) ctx.closePath()
    segments += pts.length
    if (segments >= SEGMENTS_PAR_TRACE) {
      ctx.stroke()
      ctx.beginPath()
      segments = 0
    }
  }
  if (segments) ctx.stroke()
}

function extrait(traits, taille) {
  const cadre = cadreDense(traits)
  if (!cadre) return null
  const k = taille / (cadre[2] - cadre[0])
  const { canvas, ctx } = canevasBlanc(taille, taille)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  tracer(ctx, traits, cadre, k, taille, true)
  return enJpeg(canvas)
}

async function apercuEtage(analyse, traitsParCalque) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const c of analyse) {
    if (!c.boite?.every(Number.isFinite)) continue
    b[0] = Math.min(b[0], c.boite[0])
    b[1] = Math.min(b[1], c.boite[1])
    b[2] = Math.max(b[2], c.boite[2])
    b[3] = Math.max(b[3], c.boite[3])
  }
  if (!b.every(Number.isFinite)) return null
  const cote = Math.max(b[2] - b[0], b[3] - b[1])
  if (!(cote > 0)) return null
  const k = TAILLE_APERCU / cote
  const largeur = Math.max(1, Math.round((b[2] - b[0]) * k))
  const hauteur = Math.max(1, Math.round((b[3] - b[1]) * k))
  const { canvas, ctx } = canevasBlanc(largeur, hauteur)
  ctx.strokeStyle = '#8A8A8A'
  ctx.lineWidth = 1
  for (const traits of traitsParCalque.values()) {
    tracer(ctx, traits, b, k, hauteur, false)
    await souffler()
  }
  return enJpeg(canvas)
}

const textesDe = (liste) => {
  const vus = new Set()
  for (const t of liste ?? []) {
    const s = String(typeof t === 'string' ? t : t?.texte ?? '').replace(/\s+/g, ' ').trim()
    if (s) vus.add(s)
    if (vus.size >= TEXTES_PAR_CALQUE) break
  }
  return [...vus]
}

/**
 * @param analyse sortie d'`analyserCalques` (calques les plus fournis d'abord)
 * @param traitsParCalque Map nom du calque → traits en mètres
 * @param textesParCalque Map nom du calque → textes (chaînes ou { texte }), facultatif
 * @returns { decisions, raisons } — seulement les calques que Claude a traités ;
 *   l'appelant complète par `fusionnerDecisions` avec les décisions par défaut
 */
export async function proposerTraitementsIa(analyse, traitsParCalque, textesParCalque = new Map()) {
  const envoyes = calquesAEnvoyer(analyse)
  if (!envoyes.length) return { decisions: {}, raisons: {} }
  const apercu = await apercuEtage(analyse, traitsParCalque)
  const demande = async (taille) => {
    const calques = []
    for (const c of envoyes) {
      const traits = traitsParCalque.get(c.nom) ?? []
      calques.push({
        nom: c.nom, traits: c.traits, partCourts: c.partCourts, fermes: c.fermes, nbTextes: c.textes,
        textes: textesDe(textesParCalque.get(c.nom)),
        extrait: traits.length ? extrait(traits, taille) : null,
      })
      await souffler()
    }
    return { apercu, calques }
  }
  let corps = await demande(TAILLE_EXTRAIT)
  if (JSON.stringify(corps).length > POIDS_MAX) corps = await demande(TAILLE_EXTRAIT_REDUITE)
  const resultat = await appelerClaude('/api/edl-calques', corps)
  return lireDecisionsCalques(resultat, envoyes.map((c) => c.nom))
}
