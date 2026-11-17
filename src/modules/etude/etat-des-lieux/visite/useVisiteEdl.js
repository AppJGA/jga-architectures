// ─── Visite d'un état des lieux : données et gestes ──────────────────────────
//
// L'écran montre l'instantané emporté (visiteDonnees.js) plus la file des
// gestes (fileEdlLogique.js) ; chaque geste est rangé dans la file puis
// envoyé aussitôt s'il y a du réseau (synchroEdl.js), sinon par le moteur de
// synchro de l'app. Rien n'est jamais calculé dans un setState(prev => …) :
// numéros et heures sont décidés avant d'écrire.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { disponible as memoireDisponible, operationsDeLAffaire, ecrire, effacer, MAGASINS_EDL } from './baseEdl'
import { preparerVisite, instantaneGarde } from './visiteDonnees'
import { envoyerFileEdl, signalerFileEdl, EVENEMENT_FILE_EDL } from './synchroEdl'
import {
  TYPES_EDL, operationEdl, etatAvecFileEdl, horodatageSuivant, evenementEdl, operationInverse, resumeFileEdl,
} from './fileEdlLogique'
import { numeroSuivant } from './visiteLogique'
import { preparerPhoto } from './photosEdl'

const enLigne = () => typeof navigator === 'undefined' || navigator.onLine !== false
const VIDE = { charge: false, indisponible: false, erreur: null }

export function useVisiteEdl(affaireId) {
  const [garde, setGarde] = useState(null) // { donnees, prepareLe }
  const [file, setFile] = useState([])
  const [statut, setStatut] = useState(VIDE)
  const [affaireVue, setAffaireVue] = useState(affaireId)
  // Changement d'affaire sans démontage : l'état précédent est vidé dès le rendu
  if (affaireVue !== affaireId) {
    setAffaireVue(affaireId)
    setGarde(null)
    setFile([])
    setStatut(VIDE)
  }
  const sansMemoire = !memoireDisponible()
  const dernierCreeLe = useRef(0)
  // Deux touchers rapides ne doivent pas recevoir le même numéro : le dernier
  // donné est retenu ici, par affaire, avant même que l'écran se redessine
  const numeros = useRef({ affaireId: null, dernier: 0 })
  const donneesCourantes = useRef(null)

  const relire = useCallback(async () => {
    const [g, ops] = await Promise.all([instantaneGarde(affaireId), operationsDeLAffaire(affaireId)])
    for (const o of ops) dernierCreeLe.current = Math.max(dernierCreeLe.current, o.creeLe)
    setGarde(g)
    setFile(ops)
  }, [affaireId])

  const recharger = useCallback(async () => {
    if (!memoireDisponible()) return
    let indisponible = false
    let erreur = null
    if (enLigne()) {
      try {
        indisponible = (await preparerVisite(affaireId)).indisponible
      } catch (err) {
        // Réseau qui lâche : on garde ce qui est déjà sur l'appareil
        erreur = err?.message ?? String(err)
      }
    }
    await relire().catch(() => {})
    setStatut({ charge: true, indisponible, erreur })
  }, [affaireId, relire])

  // Chargement initial, asynchrone (pas de setState synchrone dans l'effet)
  useEffect(() => {
    let actif = true
    Promise.resolve().then(() => { if (actif) recharger() })
    return () => { actif = false }
  }, [recharger])

  useEffect(() => {
    const surFile = () => { relire().catch(() => {}) }
    const surReseau = () => { envoyerFileEdl(affaireId).catch(() => {}) }
    window.addEventListener(EVENEMENT_FILE_EDL, surFile)
    window.addEventListener('online', surReseau)
    return () => {
      window.removeEventListener(EVENEMENT_FILE_EDL, surFile)
      window.removeEventListener('online', surReseau)
    }
  }, [affaireId, relire])

  const donnees = useMemo(() => (garde?.donnees ? etatAvecFileEdl(garde.donnees, file) : null), [garde, file])
  useEffect(() => { donneesCourantes.current = donnees })

  const executer = useCallback(async (type, charge) => {
    const creeLe = horodatageSuivant(dernierCreeLe.current, Date.now())
    dernierCreeLe.current = creeLe
    const op = operationEdl(type, charge, { affaireId, creeLe })
    await ecrire(MAGASINS_EDL.operations, op)
    setFile((f) => [...f, op])
    signalerFileEdl()
    if (enLigne()) envoyerFileEdl(affaireId).catch(() => {})
    return op
  }, [affaireId])

  const noter = useCallback((type, ctx, detail = {}, le = new Date()) => executer(TYPES_EDL.evenement, {
    evenement: evenementEdl(type, { ...ctx, affaireId, detail }, le),
  }), [affaireId, executer])

  const prochainNumero = useCallback(() => {
    const dernier = numeros.current.affaireId === affaireId ? numeros.current.dernier : 0
    const n = Math.max(numeroSuivant(donneesCourantes.current?.points), dernier + 1)
    numeros.current = { affaireId, dernier: n }
    return n
  }, [affaireId])

  const commencer = useCallback(async (visiteId, ctx) => {
    await executer(TYPES_EDL.visiteCreer, {
      visite: { id: visiteId, etat_id: donneesCourantes.current?.etat?.id, affaire_id: affaireId, debut: new Date().toISOString(), fin: null },
    })
    await noter('debut', { ...ctx, visiteId })
  }, [affaireId, executer, noter])

  const terminer = useCallback(async (visiteId, ctx) => {
    await noter('fin', { ...ctx, visiteId })
    await executer(TYPES_EDL.visiteTerminer, { id: visiteId, fin: new Date().toISOString() })
  }, [executer, noter])

  const poserPoint = useCallback(async ({ visiteId, niveauId, pieceId, x, y }) => {
    const point = {
      id: crypto.randomUUID(), visite_id: visiteId, affaire_id: affaireId, niveau_id: niveauId, piece_id: pieceId,
      numero: prochainNumero(), x, y, calque: null, type: null, pose_le: new Date().toISOString(),
    }
    await executer(TYPES_EDL.pointPoser, { point, photos: [] })
    await noter('point', { visiteId, niveauId, pieceId, pointId: point.id }, { numero: point.numero, x, y })
    return point
  }, [affaireId, executer, noter, prochainNumero])

  const modifierPoint = useCallback(async (point, champs, ctx) => {
    await executer(TYPES_EDL.pointModifier, { id: point.id, champs })
    await noter('point-modifie', { ...ctx, pieceId: point.piece_id, pointId: point.id }, champs)
  }, [executer, noter])

  const supprimerPoint = useCallback(async (point, ctx) => {
    await executer(TYPES_EDL.pointSupprimer, { id: point.id })
    await noter('point-supprime', { ...ctx, pieceId: point.piece_id, pointId: point.id }, { numero: point.numero })
  }, [executer, noter])

  const ajouterPhoto = useCallback(async (point, fichier, ctx) => {
    const prete = await preparerPhoto(affaireId, fichier)
    const photo = { ...prete, point_id: point.id, visite_id: ctx.visiteId, affaire_id: affaireId, prise_le: new Date().toISOString() }
    await executer(TYPES_EDL.photoAjouter, { photo })
    await noter('photo', { ...ctx, pieceId: point.piece_id, pointId: point.id }, { photoId: photo.id })
    return photo
  }, [affaireId, executer, noter])

  const annuler = useCallback(async (geste, ctx) => {
    const inverse = operationInverse(geste, donneesCourantes.current?.points ?? [])
    if (!inverse) return
    await executer(inverse.type, inverse.charge)
    const pointId = inverse.charge.id ?? inverse.charge.point?.id ?? null
    await noter(inverse.evenement, { ...ctx, pointId }, { annulation: true })
  }, [executer, noter])

  const rejouer = useCallback(async (opId) => {
    const op = file.find((o) => o.id === opId)
    if (!op) return
    await ecrire(MAGASINS_EDL.operations, { ...op, essais: 0, erreur: null })
    signalerFileEdl()
    envoyerFileEdl(affaireId).catch(() => {})
  }, [affaireId, file])

  const abandonner = useCallback(async (opId) => {
    const op = file.find((o) => o.id === opId)
    await effacer(MAGASINS_EDL.operations, opId)
    if (op?.type === TYPES_EDL.photoAjouter) await effacer(MAGASINS_EDL.fichiers, op.charge.photo.id).catch(() => {})
    signalerFileEdl()
  }, [file])

  // Objet stable : un objet neuf à chaque rendu relancerait les effets qui en dépendent
  return useMemo(() => ({
    ...statut, sansMemoire, donnees, prepareLe: garde?.prepareLe ?? null, file, resume: resumeFileEdl(file),
    disponible: statut.charge && !statut.indisponible && !sansMemoire && !!donnees?.etat,
    recharger, commencer, terminer, noter, poserPoint, modifierPoint, supprimerPoint, ajouterPhoto, annuler, rejouer, abandonner,
  }), [statut, sansMemoire, donnees, garde, file, recharger, commencer, terminer, noter, poserPoint, modifierPoint, supprimerPoint, ajouterPhoto, annuler, rejouer, abandonner])
}
