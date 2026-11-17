// ─── Faire relire le découpage d'un étage par Claude (navigateur) ────────────
//
// L'image envoyée est l'aperçu de l'étage (2 000 px) avec chaque pièce
// dessinée en orange et son numéro d'ordre au centre : Claude désigne les
// pièces par ce numéro, l'appareil le ramène à l'identifiant de la pièce.

import { aire, centre, versPixels } from './geometrieEdl'
import { canevasBlanc } from './renduNiveau'
import { lireRelecture } from './relectureIaLogique'
import { controlesAutomatiques } from './relectureLogique'
import { appelerClaude } from './piecesIa'

const TAILLE_MAX = 2000

async function chargerImage(source) {
  if (source instanceof Blob) return createImageBitmap(source)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = source
  await img.decode()
  return img
}

function imageNumerotee(fond, niveau, pieces) {
  const largeurFond = fond.naturalWidth ?? fond.width
  const hauteurFond = fond.naturalHeight ?? fond.height
  const echelle = Math.min(1, TAILLE_MAX / Math.max(largeurFond, hauteurFond))
  const { canvas, ctx } = canevasBlanc(largeurFond * echelle, hauteurFond * echelle)
  ctx.drawImage(fond, 0, 0, canvas.width, canvas.height)
  // Coordonnées du plan → pixels de l'image envoyée (l'aperçu est l'image
  // pleine définition réduite)
  const k = canvas.width / niveau.largeur
  const enPixels = (p) => versPixels(niveau.cadrage, p).map((v) => v * k)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#E8602C'
  ctx.fillStyle = 'rgba(232,96,44,0.10)'
  for (const p of pieces) {
    ctx.beginPath()
    p.contour.map(enPixels).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  pieces.forEach((p, i) => {
    const [x, y] = enPixels(centre(p.contour))
    const taille = Math.max(11, Math.min(22, Math.sqrt(aire(p.contour)) * k * 0.35))
    ctx.font = `700 ${Math.round(taille)}px Arial, sans-serif`
    ctx.lineWidth = 4
    ctx.strokeStyle = 'white'
    ctx.strokeText(String(i + 1), x, y)
    ctx.fillStyle = '#B8412C'
    ctx.fillText(String(i + 1), x, y)
  })
  const url = canvas.toDataURL('image/jpeg', 0.85)
  const taille = { largeur: canvas.width, hauteur: canvas.height }
  canvas.width = 0
  canvas.height = 0
  return { image: url.slice(url.indexOf(',') + 1), ...taille }
}

/**
 * @param source l'aperçu de l'étage : Blob (à l'import) ou adresse
 * @param pieces lignes `edl_pieces` de l'étage
 * @returns { le, signalements: [{ cle, pieceId, motif, source: 'ia' }] }
 */
export async function relireNiveau({ niveau, pieces, source }) {
  const fond = await chargerImage(source)
  const { image, largeur, hauteur } = imageNumerotee(fond, niveau, pieces)
  fond.close?.()
  const nomsSansPiece = controlesAutomatiques(pieces, niveau.textes ?? [])
    .filter((s) => s.type === 'nom-sans-piece')
    .map((s) => s.nom)
  // Le serveur construit la demande (consignes, schéma) : on n'envoie que des données
  const resultat = await appelerClaude('/api/edl-relecture', {
    image, largeur, hauteur, nomsSansPiece,
    pieces: pieces.map((p, i) => ({ n: i + 1, nom: p.nom, numero: p.numero, surface: aire(p.contour), surfaceLue: p.surface_lue })),
  })
  const le = new Date().toISOString()
  return {
    le,
    signalements: lireRelecture(resultat, pieces.length).map((s, i) => ({
      cle: `ia:${le}:${i}`, pieceId: s.index ? pieces[s.index - 1].id : null, motif: s.motif, source: 'ia',
    })),
  }
}
