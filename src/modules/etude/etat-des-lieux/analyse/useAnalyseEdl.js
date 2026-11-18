// ─── État de l'analyse d'une affaire, pour l'écran ───────────────────────────
//
// Pièces (fiche, état de l'analyse), éléments relevés, pièce en cours
// d'analyse. Relu (jamais réanalysé) quand une analyse avance, quand un
// morceau est transcrit et au retour du réseau ; les relectures rapprochées
// se regroupent. Sans réseau, la dernière lecture reste affichée.
//
// Le seul déclenchement d'analyse est celui de l'ouverture (affaire ouverte
// avec du réseau, compte qui peut écrire) : transcription puis analyse des
// pièces qui l'attendent. Les écouteurs ne font que relire : une analyse
// signale `jga-analyse-edl`, qui ne relance rien.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lireEtatAnalyse } from './analyseDonnees'
import { EVENEMENT_TRANSCRIPTION_EDL } from './transcriptionEdl'
import { EVENEMENT_ANALYSE_EDL, transcrireEtAnalyser, analyserPiece } from './analyseEdl'

const enLigne = () => typeof navigator === 'undefined' || navigator.onLine !== false
const DELAI_RELECTURE_MS = 400
const VIDE = { affaireId: null, charge: false, indisponible: false, pieces: new Map(), elements: [] }

// Ce que l'analyse change sur une pièce : posé par-dessus la pièce de l'écran
const champsAnalyse = (p) => ({
  fiche: p.fiche ?? {}, hsp_lue: p.hsp_lue ?? null, analyse_le: p.analyse_le ?? null,
  analyse_erreur: p.analyse_erreur ?? null, fiche_a_valider: p.fiche_a_valider === true,
})

export function useAnalyseEdl(affaireId, { lectureSeule = false } = {}) {
  const [lu, setLu] = useState(VIDE)
  const [enCours, setEnCours] = useState({ affaireId: null, pieceId: null })
  const sequence = useRef(0)
  const minuterie = useRef(null)

  const relire = useCallback(async () => {
    if (!affaireId || !enLigne()) return
    const rang = ++sequence.current
    try {
      const r = await lireEtatAnalyse(affaireId)
      if (rang !== sequence.current) return
      setLu({
        affaireId, charge: true, indisponible: r.indisponible,
        pieces: new Map(r.pieces.map((p) => [p.id, champsAnalyse(p)])), elements: r.elements,
      })
    } catch {
      // Réseau faible ou lecture refusée : la dernière lecture reste
    }
  }, [affaireId])

  const planifier = useCallback(() => {
    clearTimeout(minuterie.current)
    minuterie.current = setTimeout(() => { relire() }, DELAI_RELECTURE_MS)
  }, [relire])

  useEffect(() => {
    const surAnalyse = (e) => {
      const d = e.detail ?? {}
      if (d.affaireId !== affaireId) return
      setEnCours({ affaireId, pieceId: d.etape === 'debut' ? d.pieceId : null })
      planifier()
    }
    window.addEventListener(EVENEMENT_ANALYSE_EDL, surAnalyse)
    window.addEventListener(EVENEMENT_TRANSCRIPTION_EDL, planifier)
    window.addEventListener('online', planifier)
    return () => {
      window.removeEventListener(EVENEMENT_ANALYSE_EDL, surAnalyse)
      window.removeEventListener(EVENEMENT_TRANSCRIPTION_EDL, planifier)
      window.removeEventListener('online', planifier)
      clearTimeout(minuterie.current)
    }
  }, [affaireId, planifier])

  const lancer = useCallback(() => {
    if (!affaireId || lectureSeule || !enLigne()) return Promise.resolve(null)
    return transcrireEtAnalyser(affaireId)
  }, [affaireId, lectureSeule])

  // Ouverture de l'affaire : une lecture, et un seul déclenchement par
  // affaire (asynchrone : pas de mise à jour d'état pendant l'effet)
  useEffect(() => {
    let vivant = true
    Promise.resolve().then(() => {
      if (!vivant) return
      relire()
      lancer()
    })
    return () => { vivant = false }
  }, [relire, lancer])

  // Gestes de l'utilisateur (relecture au bureau)
  const reessayer = useCallback((pieceId) => analyserPiece(affaireId, pieceId, { forcer: true }), [affaireId])
  const relancer = useCallback((pieceId) => analyserPiece(affaireId, pieceId, { relancer: true }), [affaireId])

  const actuel = lu.affaireId === affaireId ? lu : VIDE
  const pieceEnCours = enCours.affaireId === affaireId ? enCours.pieceId : null
  return useMemo(() => ({
    charge: actuel.charge, indisponible: actuel.indisponible, pieces: actuel.pieces, elements: actuel.elements,
    enCours: pieceEnCours, relire, lancer, reessayer, relancer,
  }), [actuel, pieceEnCours, relire, lancer, reessayer, relancer])
}
