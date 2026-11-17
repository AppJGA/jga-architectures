// ─── Faire proposer les pièces par Claude ────────────────────────────────────
//
// Pour un PDF, ou un étage de DXF sans contours de pièces (le sous-sol d'un
// plan ArchiCAD sans zones) : Claude reçoit l'image de l'étage et les textes
// du plan à leur position exacte, et propose étages et contours. Moins précis
// que des contours dessinés : les pièces arrivent « à vérifier » et
// l'utilisateur les corrige avant la visite. Fichier partagé avec la fonction
// serveur api/edl-pieces.js : les consignes et le schéma ne se décident pas
// dans le navigateur.

import { aire } from './geometrieEdl.js'

export const MODELE_PIECES = 'claude-opus-5-5'
export const TAILLE_IMAGE_IA = 2000
export const TEXTES_MAX = 800

const sommets = { type: 'array', items: { type: 'array', items: { type: 'number' } } }

export const SCHEMA_PIECES = {
  type: 'object',
  additionalProperties: false,
  required: ['niveaux', 'pieces'],
  properties: {
    niveaux: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'cadre'],
        properties: { nom: { type: 'string' }, cadre: { type: 'array', items: { type: 'number' } } },
      },
    },
    pieces: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['niveau', 'nom', 'numero', 'surface', 'contour'],
        properties: {
          niveau: { type: 'integer' }, nom: { type: 'string' }, numero: { type: 'string' },
          surface: { type: 'number' }, contour: sommets,
        },
      },
    },
  },
}

export const CONSIGNES_PIECES = `Tu reçois l'image d'un plan d'architecte d'un bâtiment existant (vue en plan) et la liste des textes du plan avec leur position en pixels dans l'image (origine en haut à gauche, x vers la droite, y vers le bas).

Ta tâche : repérer les étages dessinés et le contour de chaque pièce, pour un état des lieux.

Règles :
- Un niveau = un étage dessiné. « cadre » = [x0, y0, x1, y1] en pixels : le rectangle qui contient tout l'étage, sans le cartouche ni la légende. Nomme l'étage d'après le plan (« Rez-de-chaussée », « Sous-sol », « R+1 »…).
- Une pièce = un espace fermé par des murs ou des cloisons. Son nom est écrit dedans (« CHAMBRE 14 », « Cuisine ») ; un numéro et une surface l'accompagnent parfois.
- « contour » : les sommets du contour intérieur de la pièce, dans l'ordre, en pixels de l'image. Quatre sommets pour une pièce rectangulaire, davantage pour une pièce en L ou biaise. Le contour suit la face intérieure des murs, sans déborder sur la pièce voisine.
- Sers-toi de la position des textes : le nom d'une pièce est à l'intérieur de son contour.
- Ne crée pas de pièce sans nom, sauf un espace fermé évident (nom vide alors).
- « niveau » : indice (0, 1…) de l'étage dans « niveaux ». « numero » : le numéro écrit, sinon "". « surface » : la surface écrite en m², sinon 0.
- Réponds uniquement par le JSON demandé.`

export function construireDemandePieces({ image, largeur, hauteur, textes = [], niveauUnique = false }) {
  const lignes = textes
    .filter((t) => String(t.texte ?? '').trim())
    .slice(0, TEXTES_MAX)
    .map((t) => `${Math.round(t.x)}\t${Math.round(t.y)}\t${String(t.texte).replace(/\s+/g, ' ').trim()}`)
  const consigne = [
    `Image : ${largeur} × ${hauteur} pixels.`,
    niveauUnique
      ? 'Cette image ne montre qu’un seul étage : un seul niveau, dont le cadre est toute l’image.'
      : 'L’image peut montrer plusieurs étages : un niveau par étage dessiné.',
    `Textes du plan (x, y, texte) — ${lignes.length} :`,
    ...lignes,
  ].join('\n')
  return {
    system: CONSIGNES_PIECES,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: consigne },
      ],
    }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_PIECES } },
  }
}

export function lirePropositionsPieces(resultat, { largeur, hauteur }) {
  const borne = ([x, y]) => [Math.min(Math.max(Number(x) || 0, 0), largeur), Math.min(Math.max(Number(y) || 0, 0), hauteur)]
  let niveaux = (resultat?.niveaux ?? [])
    .filter((n) => Array.isArray(n?.cadre) && n.cadre.length === 4)
    .map((n) => {
      const a = borne([n.cadre[0], n.cadre[1]])
      const b = borne([n.cadre[2], n.cadre[3]])
      return { nom: String(n.nom ?? '').trim() || 'Niveau', cadre: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] }
    })
    .filter((n) => n.cadre[2] - n.cadre[0] > 10 && n.cadre[3] - n.cadre[1] > 10)
  if (!niveaux.length) niveaux = [{ nom: 'Niveau 1', cadre: [0, 0, largeur, hauteur] }]
  const aireMin = largeur * hauteur * 0.00002
  const pieces = (resultat?.pieces ?? [])
    .map((p) => ({
      niveau: Number.isInteger(p?.niveau) && p.niveau >= 0 && p.niveau < niveaux.length ? p.niveau : 0,
      nom: String(p?.nom ?? '').trim(),
      numero: String(p?.numero ?? '').trim() || null,
      surface: Number(p?.surface) > 0 ? Number(p.surface) : null,
      contour: (Array.isArray(p?.contour) ? p.contour : []).filter((q) => Array.isArray(q) && q.length >= 2).map(borne),
    }))
    .filter((p) => p.contour.length >= 3 && aire(p.contour) >= aireMin)
  return { niveaux, pieces }
}

export const versPiecesEdl = (pieces, convertir) => pieces.map((p) => ({
  nom: p.nom, numero: p.numero, surfaceLue: p.surface, hspLue: null,
  contour: p.contour.map(convertir), origine: 'ia', aVerifier: true,
}))
