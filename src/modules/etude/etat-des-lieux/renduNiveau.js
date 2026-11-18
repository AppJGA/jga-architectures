// ─── Dessiner un étage en image, sur l'appareil ──────────────────────────────
//
// Un étage de DXF devient une image (6 000 px au plus, comme les plans des
// visites, plafond de l'iPad) : c'est elle que la tablette affiche, même sans
// réseau. Une copie réduite (2 000 px, JPEG) part chez Claude quand il faut
// lui faire proposer les pièces.

import { encoderImage } from '../../chantier/comptes-rendus/compressionPhoto'
import { TAILLE_APERCU_PLAN } from '../../chantier/comptes-rendus/plansLogique'
import { cadrage as calculerCadrage, versPixels } from './geometrieEdl'
import { TAILLE_IMAGE_IA } from './piecesIaLogique'

export function canevasBlanc(largeur, hauteur) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(largeur))
  canvas.height = Math.max(1, Math.round(hauteur))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

// Les canevas de `reduire` sont libérés (largeur et hauteur à 0) dès
// l'encodage fait : l'iPad plafonne la mémoire de canevas
const liberer = (canvas) => { canvas.width = 0; canvas.height = 0 }

function reduire(source, max) {
  const echelle = Math.min(1, max / Math.max(source.width, source.height))
  const r = canevasBlanc(source.width * echelle, source.height * echelle)
  r.ctx.imageSmoothingQuality = 'high'
  r.ctx.drawImage(source, 0, 0, r.canvas.width, r.canvas.height)
  return { ...r, echelle: r.canvas.width / source.width }
}

export async function encoderRendu(canvas) {
  const apercu = reduire(canvas, TAILLE_APERCU_PLAN)
  const apercuTaille = { largeur: apercu.canvas.width, hauteur: apercu.canvas.height }
  try {
    const planBlob = await encoderImage(canvas, 0.85)
    const apercuBlob = await encoderImage(apercu.canvas, 0.78)
    return {
      plan: { blob: planBlob, largeur: canvas.width, hauteur: canvas.height },
      apercu: { blob: apercuBlob, ...apercuTaille },
      extension: planBlob.type === 'image/webp' ? 'webp' : 'jpg',
    }
  } finally {
    liberer(apercu.canvas)
  }
}

export function imagePourIa(canvas) {
  const r = reduire(canvas, TAILLE_IMAGE_IA)
  const { width: largeur, height: hauteur } = r.canvas
  const url = r.canvas.toDataURL('image/jpeg', 0.82)
  liberer(r.canvas)
  return { image: url.slice(url.indexOf(',') + 1), largeur, hauteur, echelle: r.echelle }
}

export async function imageIaDepuisUrl(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const { canvas, ctx } = canevasBlanc(img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, 0, 0)
  const ia = imagePourIa(canvas)
  liberer(canvas)
  return ia
}

// Contour des masses (murs pochés) : nettement plus épais que les traits,
// comme un mur coupé sur un plan imprimé
const EPAISSEUR_MASSE = 2.5
const SEGMENTS_PAR_TRACE = 5000

function tracerAnneaux(ctx, masse, c) {
  for (const anneau of masse.anneaux) {
    anneau.forEach((p, i) => {
      const [x, y] = versPixels(c, p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
}

// Masses d'abord (les traits longs gardés des murs passent par-dessus), puis
// traits, puis textes
function peindre(ctx, niveau, c) {
  const epaisseur = Math.max(1, c.largeur / 4000)
  ctx.strokeStyle = '#1F1B17'
  ctx.lineJoin = 'round'
  const masses = niveau.masses ?? []
  if (masses.length) {
    ctx.fillStyle = '#FFFFFF'
    // Une masse par remplissage : en evenodd sur un seul chemin, deux masses
    // de calques différents qui se chevauchent se creuseraient l'une l'autre
    for (const m of masses) {
      ctx.beginPath()
      tracerAnneaux(ctx, m, c)
      ctx.fill('evenodd')
    }
    ctx.lineWidth = epaisseur * EPAISSEUR_MASSE
    ctx.beginPath()
    for (const m of masses) tracerAnneaux(ctx, m, c)
    ctx.stroke()
  }
  ctx.lineWidth = epaisseur
  // Traits tracés par paquets : un étage qui garde des centaines de milliers
  // de traits en un seul chemin fige le navigateur au moment du tracé
  let segments = 0
  ctx.beginPath()
  for (const t of niveau.traits) {
    t.pts.forEach((p, i) => {
      const [x, y] = versPixels(c, p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (t.ferme) ctx.closePath()
    segments += t.pts.length
    if (segments >= SEGMENTS_PAR_TRACE) {
      ctx.stroke()
      ctx.beginPath()
      segments = 0
    }
  }
  if (segments) ctx.stroke()
  ctx.fillStyle = '#1F1B17'
  for (const t of niveau.textes) {
    const h = t.hauteur * c.pxParMetre
    if (h < 5) continue
    ctx.font = `${Math.round(h)}px Arial, sans-serif`
    const [x, y] = versPixels(c, t.pos)
    t.texte.split('\n').forEach((ligne, k) => ctx.fillText(ligne, x, y + k * h * 1.2))
  }
}

function dessiner(niveau, c) {
  const { canvas, ctx } = canevasBlanc(c.largeur, c.hauteur)
  peindre(ctx, niveau, c)
  return canvas
}

// Aperçu de la fenêtre d'import : dessiné dans le canevas affiché, sans
// canevas intermédiaire. `niveau` : traits, masses et textes déjà allégés ;
// `boite` : celle de l'étage entier, pour que l'aperçu garde le cadrage de
// l'image enregistrée même quand un calque est masqué.
export function dessinerApercu(cible, niveau, boite, largeurMax = 900) {
  if (!boite?.every(Number.isFinite)) return false
  const c = calculerCadrage(boite, { pxMax: largeurMax })
  cible.width = Math.max(1, c.largeur)
  cible.height = Math.max(1, c.hauteur)
  const ctx = cible.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, cible.width, cible.height)
  peindre(ctx, niveau, c)
  return true
}

// Les canevas affichés aussi se libèrent au démontage (plafond de l'iPad)
export { liberer as libererCanevas }

// `niveau` : { traits, masses?, textes, boite } — l'étage allégé par
// `simplifierNiveau`, avec la boîte de l'étage entier (même cadrage que les
// pièces et points, en mètres)
export async function rendreNiveauDxf(niveau) {
  const c = calculerCadrage(niveau.boite)
  const canvas = dessiner(niveau, c)
  try {
    const ia = imagePourIa(canvas)
    const rendu = await encoderRendu(canvas)
    return { cadrage: c, rendu, ia }
  } finally {
    liberer(canvas)
  }
}
