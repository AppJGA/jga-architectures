import { useCallback, useMemo, useState } from 'react'
import { piecesVisitees } from '../visite/visiteLogique'
import { ajouterLiaison, supprimerPoint, MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonnees'
import { messageLancement, tracesRelecture, choixLiaisonRelecture, suiteEcartElement, suppressionPoint, pointsSansElement, pieceSansRevue } from './relectureAnalyseLogique'
import { avecTypeEffectif } from '../tracesEdl'

// ─── État et écritures de la revue d'une pièce (RevuePiece.jsx) ──────────────
//
// Tenu par l'onglet « Plans » (`PlansEdl`) pour la pièce choisie : le
// panneau (RevuePiece) et le plan (point, élément ou trace en évidence,
// « Relier ») lisent le même état. Aucune pièce choisie : tout est vide.
// Une autre pièce : erreur, message, élément en évidence et confirmation
// sont oubliés ; le point et la trace choisis, eux, sont posés par le plan
// (toucher le point d'une autre pièce choisit cette pièce ET ce point).
// Chaque écriture est relue par le hook de l'analyse (`analyse.relire`) :
// rien n'est calculé dans un setState(prev => …), l'écran montre la base.
// Un refus (0 ligne) remonte « Lecture seule… » des fonctions de données.

/**
 * État et écritures de la revue d'une pièce. `piece` (ou null) porte déjà
 * les champs de l'analyse (fiche, analyse_le…) ; `niveau` est son étage.
 */
export function useRevuePiece({ affaireId, niveau, piece, visite, analyse }) {
  const donnees = visite.donnees
  const [survol, setSurvol] = useState(null) // point de l'élément sous la souris
  const [elementChoisi, setElementChoisi] = useState(null)
  const [pointChoisi, setPointChoisi] = useState(null) // touché sur le plan
  const [traceChoisie, setTraceChoisie] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [message, setMessage] = useState(null)
  const [lancement, setLancement] = useState(null) // pièce dont l'analyse part de ce bouton
  const [confirmerRelance, setConfirmerRelance] = useState(false)
  const pieceId = piece?.id ?? null
  const [pieceVue, setPieceVue] = useState(pieceId)
  if (pieceVue !== pieceId) {
    setPieceVue(pieceId)
    setErreur(null)
    setMessage(null)
    setConfirmerRelance(false)
    setElementChoisi(null)
    setSurvol(null)
  }

  const niveauId = piece?.niveau_id ?? niveau.id
  const visitee = useMemo(() => !!pieceId && piecesVisitees(donnees?.entrees).has(pieceId), [donnees?.entrees, pieceId])
  const points = useMemo(() => (donnees?.points ?? []).filter((p) => p.niveau_id === niveau.id), [donnees?.points, niveau.id])
  const elements = useMemo(() => (pieceId ? analyse.elements.filter((e) => e.piece_id === pieceId) : []), [analyse.elements, pieceId])
  // Liaisons et cotes lues avec l'analyse (la base, pas la copie de la visite)
  const tracesNiveau = useMemo(() => (analyse.tracesDisponibles ? (analyse.traces ?? []).filter((t) => t.niveau_id === niveau.id) : []),
    [analyse.tracesDisponibles, analyse.traces, niveau.id])
  const traces = useMemo(() => (pieceId ? tracesRelecture(tracesNiveau, pieceId, points) : []), [tracesNiveau, pieceId, points])
  // Un point posé sans type prend celui de son élément relevé : les liaisons
  // le nomment ainsi et « Ajouter une liaison » le propose
  const pointsTypes = useMemo(() => avecTypeEffectif(points, analyse.elements), [points, analyse.elements])
  const choixLiaison = useMemo(() => choixLiaisonRelecture({ points, elements: analyse.elements, pieceId }),
    [points, analyse.elements, pieceId])
  // Écarter le dernier élément d'un point emporte le point (photos et
  // liaisons comprises) ; les points déjà sans élément se suppriment à la main
  const photos = donnees?.photos
  const suiteEcart = useCallback(
    (element) => suiteEcartElement(element, { elements: analyse.elements, points, photos, traces: tracesNiveau }),
    [analyse.elements, points, photos, tracesNiveau],
  )
  const pointsSeuls = useMemo(() => (pieceId ? pointsSansElement(points, analyse.elements, pieceId) : [])
    .map((p) => ({ point: p, suppression: suppressionPoint(p, { photos, traces: tracesNiveau }) })),
  [points, analyse.elements, pieceId, photos, tracesNiveau])
  const sansRevue = pieceSansRevue(piece, { visitee, elements: analyse.elements, points, traces: tracesNiveau })

  // Écrire puis relire : l'écran suit toujours la base. Rend vrai si
  // l'écriture est passée ; sinon le motif s'affiche en rouge
  const ecrire = async (travail) => {
    setErreur(null)
    try {
      const r = await travail()
      if (r?.indisponible) { setErreur(MESSAGE_ANALYSE_INDISPONIBLE); return false }
      return true
    } catch (err) {
      setErreur(err?.message ?? String(err))
      return false
    } finally {
      await analyse.relire()
    }
  }

  // Le point part de la base ; la copie de la visite (relue en ligne,
  // instantané remplacé) suit, sans quoi la pastille resterait sur le plan
  const retirerPoint = async (pointId, options) => {
    try {
      return await supprimerPoint(pointId, options)
    } finally {
      if (pointChoisi === pointId) setPointChoisi(null)
      await visite.recharger?.()
    }
  }

  const lancer = async (action) => {
    if (!pieceId) return
    setMessage(null)
    setLancement(pieceId)
    try {
      setMessage(messageLancement(await action(pieceId)))
    } catch (err) {
      setMessage(err?.message ?? String(err))
    } finally {
      setLancement(null)
      await analyse.relire()
    }
  }

  // `pieceLiaison` : la pièce de la liaison posée sur le plan (celle du
  // luminaire, `pieceDeLiaison`) ; depuis le panneau, la pièce choisie
  const relier = (interrupteurId, luminaireId, pieceLiaison = pieceId) => ecrire(() => ajouterLiaison({
    affaireId, niveauId, pieceId: pieceLiaison, interrupteurId, luminaireId,
  }))

  // Un seul objet en évidence à la fois : élément, point ou trace
  const choisirElement = (id) => { setPointChoisi(null); setTraceChoisie(null); setElementChoisi((c) => (c === id ? null : id)) }
  const choisirTrace = (id) => { setElementChoisi(null); setPointChoisi(null); setTraceChoisie((c) => (c === id ? null : id)) }
  const pointElement = elements.find((e) => e.id === elementChoisi)?.point_id ?? null

  return {
    affaireId, niveauId, piece, visitee, sansRevue,
    points, elements, tracesNiveau, traces, pointsTypes, choixLiaison, suiteEcart, pointsSeuls,
    survol, setSurvol, elementChoisi, setElementChoisi, pointChoisi, setPointChoisi, traceChoisie, setTraceChoisie,
    choisirElement, choisirTrace, pointEnEvidence: survol ?? pointElement ?? pointChoisi,
    erreur, setErreur, message, setMessage, confirmerRelance, setConfirmerRelance,
    enAnalyse: !!pieceId && (analyse.enCours === pieceId || lancement === pieceId),
    ecrire, retirerPoint, lancer, relier, analyse,
  }
}

