// ─── Numéros des photos, communs au DXF et au rapport ────────────────────────
//
// « Ph 12 » sur le plan DXF et « Ph 12 » sous la photo du rapport doivent
// désigner la même photo : la numérotation se fait une fois, pour toute
// l'affaire, et les deux exports reçoivent les photos déjà numérotées
// (`genererDxfEdl` lit `numero`). Pur, testé
// (tests/etat-des-lieux-export-pdf.test.js).

const rang = (ordres, id) => (ordres.has(id) ? ordres.get(id) : Infinity)
const ordresDe = (lignes) => new Map((lignes ?? []).map((l, i) => [l.id, [l.ordre ?? 0, i]]))
// Un rang inconnu (Infinity) passe après tous les autres
const ecart = (a, b) => (a === b ? 0 : a === Infinity ? 1 : b === Infinity ? -1 : a - b)
const comparerRangs = (a, b) => {
  if (a === b) return 0
  if (a === Infinity || b === Infinity) return a === Infinity ? 1 : -1
  return a[0] - b[0] || a[1] - b[1]
}

/**
 * Photos numérotées de 1 à n : par étage, puis par pièce (ordre du plan),
 * puis par numéro de point, puis par heure de prise de vue. Une photo dont
 * le point est inconnu passe en fin.
 *
 * @param photos lignes `edl_photos` ({ id, point_id, prise_le })
 * @param points lignes `edl_points` ({ id, niveau_id, piece_id, numero })
 * @param niveaux, pieces ({ id, ordre }) : ordre des étages et des pièces
 * @returns copies des photos avec `numero`, dans l'ordre des numéros
 */
export function numeroterPhotos(photos = [], points = [], { niveaux = [], pieces = [] } = {}) {
  const parPoint = new Map((points ?? []).map((p) => [p.id, p]))
  const ordreNiveaux = ordresDe(niveaux)
  const ordrePieces = ordresDe(pieces)
  const cle = (ph) => {
    const p = parPoint.get(ph.point_id)
    return {
      connu: p ? 0 : 1,
      niveau: p ? rang(ordreNiveaux, p.niveau_id) : Infinity,
      piece: p ? rang(ordrePieces, p.piece_id) : Infinity,
      point: Number.isFinite(Number(p?.numero)) && p?.numero != null ? Number(p.numero) : Infinity,
      heure: Date.parse(ph.prise_le ?? '') || Infinity,
    }
  }
  return (photos ?? [])
    .map((ph, i) => ({ ph, i, k: cle(ph) }))
    .sort((a, b) => a.k.connu - b.k.connu
      || comparerRangs(a.k.niveau, b.k.niveau)
      || comparerRangs(a.k.piece, b.k.piece)
      || ecart(a.k.point, b.k.point)
      || ecart(a.k.heure, b.k.heure)
      || a.i - b.i)
    .map(({ ph }, n) => ({ ...ph, numero: n + 1 }))
}
