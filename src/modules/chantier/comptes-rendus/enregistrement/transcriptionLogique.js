// ─── Visite enregistrée : transcription, ce qui se calcule sans navigateur ───
//
// Segments de texte d'un enregistrement (un par morceau transcrit), état
// d'avancement, texte à relire et vocabulaire de l'affaire donné à Mistral.
// Pur, pour être testé (tests/transcription.test.js).

// 3 minutes : Chrome sur ordinateur produit ≈ 800 Ko d'AAC par minute (essai
// du lot 0) ; 5 minutes frôleraient la limite de 4,5 Mo d'une fonction Vercel
export const DUREE_MORCEAU_MS = 180_000

// Mistral accepte au plus 100 termes de vocabulaire
const VOCABULAIRE_MAX = 100

/** Range le texte d'un morceau ; un morceau retranscrit remplace l'ancien. */
export function fusionnerSegment(segments = [], segment) {
  const autres = (segments ?? []).filter((s) => s.rang !== segment.rang)
  return [...autres, segment].sort((a, b) => a.rang - b.rang)
}

/** Le texte à relire, morceau après morceau. */
export function texteTranscription(segments = []) {
  return [...(segments ?? [])]
    .sort((a, b) => a.rang - b.rang)
    .map((s) => String(s.texte ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Où en est un enregistrement.
 * @param segments ceux déjà transcrits (base)
 * @param enAttente nombre de morceaux encore sur l'appareil
 */
export function resumeEnregistrement(segments = [], enAttente = 0) {
  const liste = segments ?? []
  const duree_s = Math.round(liste.reduce((n, s) => n + (Number(s.duree_s) || 0), 0))
  return { transcrits: liste.length, enAttente, duree_s, pret: liste.length > 0 && enAttente === 0 }
}

/**
 * Noms propres de l'affaire, ceux que la transcription écorche le plus sur
 * un chantier : entreprises, lots, personnes, zones. Les plus longs d'abord
 * (plus distinctifs), sans doublon, 100 au plus.
 */
export function vocabulaireAffaire({ lots = [], interlocuteurs = [], zones = [] } = {}) {
  const termes = [
    ...lots.flatMap((l) => [l.raison_sociale, l.nom]),
    ...interlocuteurs.flatMap((i) => [[i.prenom, i.nom].filter(Boolean).join(' '), i.organisation]),
    ...zones.map((z) => z.nom),
  ]
  const vus = new Set()
  const retenus = []
  for (const t of termes) {
    const terme = String(t ?? '').replace(/\s+/g, ' ').trim()
    const cle = terme.toLocaleLowerCase('fr')
    if (terme.length < 3 || vus.has(cle)) continue
    vus.add(cle)
    retenus.push(terme)
  }
  return retenus.sort((a, b) => b.length - a.length).slice(0, VOCABULAIRE_MAX)
}
