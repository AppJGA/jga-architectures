// ─── Relecture du découpage par Claude ───────────────────────────────────────
//
// Claude relit, il ne redessine pas : sur un plan dense, ses contours sont
// moins justes que ceux du DXF. Il reçoit l'image de l'étage avec les pièces
// numérotées, la liste des pièces et les noms écrits sans pièce, et rend des
// signalements (pièce mal découpée, mal nommée, espace oublié). Fichier
// partagé avec api/edl-relecture.js : imports avec l'extension `.js`.

export const MODELE_RELECTURE = 'claude-opus-5-5'
export const SIGNALEMENTS_MAX = 40

export const SCHEMA_RELECTURE = {
  type: 'object',
  additionalProperties: false,
  required: ['signalements'],
  properties: {
    signalements: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['piece', 'motif'],
        properties: { piece: { type: 'integer' }, motif: { type: 'string' } },
      },
    },
  },
}

export const CONSIGNES_RELECTURE = `Tu relis le découpage en pièces d'un plan de bâtiment existant, préparé pour un état des lieux par une agence d'architecture.

Tu reçois l'image d'un étage : le plan en gris, chaque pièce repérée en orange avec son numéro d'ordre (1, 2, 3…) écrit en son centre ; puis la liste des pièces (numéro d'ordre, nom, numéro de local, surface dessinée en m², surface écrite sur le plan) et les noms écrits sur le plan qu'aucune pièce n'entoure.

Signale seulement ce qui est manifestement faux :
- une pièce qui englobe plusieurs locaux séparés par des murs, ou qui déborde nettement sur un local voisin ;
- un local fermé, visible sur le plan, qu'aucune pièce ne couvre (piece = 0, et dis où il se trouve : « en haut à gauche, entre la chambre 4 et l'escalier ») ;
- un nom incohérent avec la pièce (un « WC » de 40 m², une « Circulation » qui est un bureau) ;
- deux pièces qui sont en réalité le même local.

Règles :
- « piece » : le numéro d'ordre de la pièce concernée, ou 0 si le signalement ne vise aucune pièce existante.
- « motif » : une phrase courte en français, concrète, qui dit quoi vérifier.
- N'invente rien : en cas de doute, ne signale pas. Les petits écarts de tracé (quelques centimètres) ne comptent pas.
- ${SIGNALEMENTS_MAX} signalements au plus, les plus importants d'abord. Aucun s'il n'y a rien à dire.
- Réponds uniquement par le JSON demandé.`

const fmt = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 1 }))

/**
 * @param pieces [{ n, nom, numero, surface, surfaceLue }] (n = numéro d'ordre sur l'image)
 * @param nomsSansPiece noms écrits sur le plan qu'aucune pièce n'entoure
 */
export function construireDemandeRelecture({ image, largeur, hauteur, pieces = [], nomsSansPiece = [] }) {
  const lignes = pieces.map((p) => [p.n, p.nom ?? '', p.numero ?? '', fmt(p.surface), fmt(p.surfaceLue)].join('\t'))
  const consigne = [
    `Image : ${largeur} × ${hauteur} pixels.`,
    `Pièces (n°, nom, numéro, surface dessinée, surface écrite) — ${pieces.length} :`,
    ...lignes,
    nomsSansPiece.length ? `Noms écrits sur le plan sans pièce autour : ${nomsSansPiece.join(' ; ')}` : 'Aucun nom écrit sans pièce autour.',
  ].join('\n')
  return {
    system: CONSIGNES_RELECTURE,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: consigne },
      ],
    }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_RELECTURE } },
  }
}

/** @returns [{ index, motif }] — index 1…nbPieces, ou 0 hors pièce */
export function lireRelecture(resultat, nbPieces) {
  return (resultat?.signalements ?? [])
    .map((s) => ({ index: Number(s?.piece), motif: String(s?.motif ?? '').trim() }))
    .filter((s) => s.motif && Number.isInteger(s.index) && s.index >= 0 && s.index <= nbPieces)
    .slice(0, SIGNALEMENTS_MAX)
}
