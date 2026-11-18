// ─── Lignes de l'analyse, sans base ──────────────────────────────────────────
//
// Ce que `analyseDonnees.js` écrit dans les tables de la migration 082, mis
// en forme ici pour se tester sans navigateur (tests/etat-des-lieux-analyse.test.js).
// Chaque ligne est réduite à ses colonnes : un champ de plus (l'alias
// `synchro_id`, une référence « P7 » de Claude) ferait refuser toute la ligne.

// Base sans la 082 : table absente (42P01 de PostgreSQL, PGRST205 de
// PostgREST) ou colonne absente des pièces (42703, PGRST204). Pour une
// colonne, son nom est exigé : une autre colonne manquante est une vraie
// erreur, qui ne doit pas passer pour « migration à faire ».
const COLONNES_082 = /analyse_le|analyse_erreur|fiche_a_valider|edl_enregistrements|edl_elements/i

export function analyseIndisponible(error) {
  if (!error) return false
  const texte = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  // « relation … » en tête seulement : « column "x" of relation "edl_pieces"
  // does not exist » est une colonne manquante, jugée ci-dessous
  if (/^relation\s.*does not exist/i.test(error.message ?? '')) return true
  if (!COLONNES_082.test(texte)) return false
  return error.code === '42703' || error.code === 'PGRST204' || /does not exist|schema cache/i.test(texte)
}

export const MESSAGE_ANALYSE_INDISPONIBLE = 'L’analyse demande la migration 082 dans Supabase.'

// Longueur gardée du motif d'un échec : un message d'API peut porter tout un
// corps de réponse, inutile à l'écran
export const LONGUEUR_ERREUR = 500

const texteOuNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const texte = (v) => (typeof v === 'string' ? v.trim() : '')

/** Ligne `edl_enregistrements` prête pour l'upsert (identifiant du morceau). */
export function ligneEnregistrement(l) {
  if (!l?.id) throw new Error('Morceau sans identifiant : la transcription ne peut pas être gardée.')
  return {
    id: String(l.id),
    visite_id: l.visite_id,
    affaire_id: l.affaire_id,
    debut: l.debut,
    duree_s: Number.isFinite(l.duree_s) ? l.duree_s : null,
    segments: Array.isArray(l.segments) ? l.segments : [],
    texte: typeof l.texte === 'string' ? l.texte : '',
    horodate: l.horodate !== false,
  }
}

const nouvelIdParDefaut = () => crypto.randomUUID()

/**
 * Éléments proposés par Claude pour une pièce → lignes `edl_elements`. Le
 * point est déjà résolu (« P7 » → `point_id`) par la lecture de la réponse.
 * L'identifiant vient de l'appelant quand il l'a fixé : une écriture
 * relancée réécrit alors les mêmes lignes.
 */
export function lignesElementsIa({ affaireId, piece, elements, nouvelId = nouvelIdParDefaut }) {
  return (elements ?? []).map((e) => ({
    id: e.id ?? nouvelId(),
    affaire_id: affaireId,
    niveau_id: piece.niveau_id ?? null,
    piece_id: piece.id,
    point_id: e.point_id ?? e.pointId ?? null,
    calque: e.calque,
    type: texteOuNull(e.type),
    libelle: texte(e.libelle),
    cotes: texteOuNull(e.cotes),
    extrait: texteOuNull(e.extrait),
    a_valider: true,
    a_verifier: e.a_verifier === true,
    origine: 'ia',
    valide_le: null,
  }))
}

// Ce que la relecture peut changer sur un élément ; le reste (pièce,
// origine, extrait entendu) appartient à l'analyse
const CHAMPS_MODIFIABLES = ['point_id', 'calque', 'type', 'libelle', 'cotes', 'a_verifier']

/** Modifier vaut validation : les champs changés, plus la validation datée. */
export function champsValidation(champs = {}, maintenant = new Date()) {
  const ligne = {}
  for (const c of CHAMPS_MODIFIABLES) {
    if (!(c in champs)) continue
    const v = champs[c]
    if (c === 'a_verifier') ligne[c] = v === true
    else if (c === 'libelle') ligne[c] = texte(v)
    else if (c === 'calque') {
      // Colonne NOT NULL : un calque vide n'est pas envoyé (la base
      // refuserait toute la validation), l'élément garde le sien
      const calque = texteOuNull(v)
      if (calque) ligne[c] = calque
    } else if (c === 'point_id') ligne[c] = v || null
    else ligne[c] = texteOuNull(v)
  }
  return { ...ligne, a_valider: false, valide_le: new Date(maintenant).toISOString() }
}

/** Élément ajouté à la main : déjà validé, jamais remplacé par une réanalyse. */
export function ligneElementMain(l, { maintenant = new Date(), nouvelId = nouvelIdParDefaut } = {}) {
  return {
    id: l.id ?? nouvelId(),
    affaire_id: l.affaire_id,
    niveau_id: l.niveau_id ?? null,
    piece_id: l.piece_id ?? null,
    point_id: l.point_id ?? null,
    calque: l.calque,
    type: texteOuNull(l.type),
    libelle: texte(l.libelle),
    cotes: texteOuNull(l.cotes),
    extrait: null,
    a_valider: false,
    a_verifier: l.a_verifier === true,
    origine: 'main',
    valide_le: new Date(maintenant).toISOString(),
  }
}

/** Ce que la pièce reçoit avec une analyse réussie : fiche à relire. */
export function champsPieceAnalysee(fiche, analyseLe) {
  return {
    fiche: fiche ?? {},
    fiche_a_valider: true,
    analyse_le: new Date(analyseLe).toISOString(),
    analyse_erreur: null,
  }
}

export function messageErreurAnalyse(message) {
  const t = String(message ?? '').trim() || 'Analyse impossible.'
  return t.length > LONGUEUR_ERREUR ? `${t.slice(0, LONGUEUR_ERREUR - 1)}…` : t
}
