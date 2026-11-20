// ─── Visite d'un état des lieux : données et gestes ──────────────────────────
//
// L'écran montre l'instantané emporté (visiteDonnees.js) plus la file des
// gestes (fileEdlLogique.js) ; chaque geste est rangé dans la file puis
// envoyé aussitôt s'il y a du réseau (synchroEdl.js), sinon par le moteur de
// synchro de l'app. Rien n'est jamais calculé dans un setState(prev => …) :
// numéros et heures sont décidés avant d'écrire.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { disponible as memoireDisponible, instantaneEtOperations, lire, ecrire, effacer, MAGASINS_EDL } from './baseEdl'
import { preparerVisite } from './visiteDonnees'
import { envoyerFileEdl, signalerFileEdl, sousVerrouEdl, EVENEMENT_FILE_EDL } from './synchroEdl'
import {
  TYPES_EDL, operationEdl, etatAvecFileEdl, horodatageSuivant, evenementEdl, operationInverse, resumeFileEdl,
} from './fileEdlLogique'
import { numeroSuivant, delaiDepasse } from './visiteLogique'
import { preparerPhoto } from './photosEdl'
import { nouvelleTrace, traceValide, TYPES_JOURNAL_TRACES, MESSAGE_TRACES_INDISPONIBLES } from '../tracesEdl'

// Ce que le journal garde d'une trace posée : de quoi la frise de l'analyse
// la décrit sans relire la table
function detailTrace(t) {
  return t.sorte === 'commande'
    ? { traceId: t.id, sorte: t.sorte, point_a: t.point_a, point_b: t.point_b }
    : { traceId: t.id, sorte: t.sorte, xa: t.xa, ya: t.ya, xb: t.xb, yb: t.yb, valeur: t.valeur }
}

function exigerTraces(donnees) {
  if (donnees?.tracesDisponibles !== true) throw new Error(MESSAGE_TRACES_INDISPONIBLES)
}

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

  // Affaire affichée et ordre des relectures : un résultat qui arrive après un
  // changement d'affaire, ou après une relecture plus récente, est jeté.
  const affaireCourante = useRef(affaireId)
  const sequence = useRef(0)
  useEffect(() => {
    affaireCourante.current = affaireId
    sequence.current++
  }, [affaireId])

  // Instantané et file lus d'un seul tenant (`instantaneEtOperations`) : lus
  // séparément, on pouvait voir l'ancien instantané avec la file déjà vidée
  // (un point disparaissait un instant). Pas sous le verrou de l'envoi : un
  // envoi bloqué par un réseau faible retenait l'ouverture de la visite.
  // Rend l'instantané retenu (`undefined` si le résultat a été jeté).
  const relire = useCallback(async () => {
    const rang = ++sequence.current
    const [g, ops] = await instantaneEtOperations(affaireId)
    if (rang !== sequence.current || affaireCourante.current !== affaireId) return undefined
    for (const o of ops) dernierCreeLe.current = Math.max(dernierCreeLe.current, o.creeLe)
    setGarde(g)
    setFile(ops)
    return g
  }, [affaireId])

  // Une recharge à la fois : après un rechargement en ?visite=1, le module et
  // l'écran de la visite la demandent ensemble ; la seconde rejoint la première
  // au lieu d'attendre une deuxième lecture derrière le verrou.
  const enVol = useRef(null)

  const recharger = useCallback(() => {
    if (!memoireDisponible()) return Promise.resolve()
    if (enVol.current?.affaireId === affaireId) return enVol.current.promesse
    const promesse = (async () => {
      const message = (err) => err?.message ?? String(err)
      let erreurLocale = null
      let erreurReseau = null
      let indisponible = null
      // La copie de l'appareil d'abord : la visite s'ouvre sans attendre le
      // réseau, qui peut se dire présent sans rien répondre
      try {
        const g = await relire()
        if (g?.donnees && affaireCourante.current === affaireId) setStatut((s) => (s.charge ? s : { ...s, charge: true }))
      } catch (err) {
        erreurLocale = message(err)
      }
      if (enLigne()) {
        try {
          indisponible = (await preparerVisite(affaireId)).indisponible
        } catch (err) {
          // Délai dépassé = pas de réseau : la copie de l'appareil reste, sans
          // message, comme hors ligne. Un autre échec est signalé.
          if (!delaiDepasse(err)) erreurReseau = message(err)
        }
        try {
          await relire()
          erreurLocale = null
        } catch (err) {
          erreurLocale = message(err)
        }
      }
      if (affaireCourante.current !== affaireId) return
      const erreur = erreurReseau ?? erreurLocale
      setStatut((s) => ({ charge: true, indisponible: indisponible ?? s.indisponible, erreur }))
    })()
    enVol.current = { affaireId, promesse }
    const fin = () => { if (enVol.current?.promesse === promesse) enVol.current = null }
    promesse.then(fin, fin)
    return promesse
  }, [affaireId, relire])

  // Chargement initial, asynchrone (pas de setState synchrone dans l'effet)
  useEffect(() => {
    let actif = true
    Promise.resolve().then(() => { if (actif) recharger() })
    return () => { actif = false }
  }, [recharger])

  useEffect(() => {
    // Choix retenu : toute relecture locale réussie (instantané + file de
    // l'appareil) efface l'erreur affichée, même si elle venait du réseau
    const surFile = () => {
      relire().then(
        () => { if (affaireCourante.current === affaireId) setStatut((s) => (s.erreur ? { ...s, erreur: null } : s)) },
        (err) => { if (affaireCourante.current === affaireId) setStatut((s) => ({ ...s, erreur: err?.message ?? String(err) })) },
      )
    }
    const surReseau = () => { envoyerFileEdl(affaireId).catch(() => {}) }
    window.addEventListener(EVENEMENT_FILE_EDL, surFile)
    window.addEventListener('online', surReseau)
    return () => {
      window.removeEventListener(EVENEMENT_FILE_EDL, surFile)
      window.removeEventListener('online', surReseau)
    }
  }, [affaireId, relire])

  // `traces` toujours présent (un instantané d'avant la 084 n'en a pas) ;
  // `tracesDisponibles` n'est vrai que lu en ligne sur une base qui a la 084
  const donnees = useMemo(() => {
    if (!garde?.donnees) return null
    const etat = etatAvecFileEdl(garde.donnees, file)
    return { ...etat, traces: etat.traces ?? [], tracesDisponibles: etat.tracesDisponibles === true }
  }, [garde, file])
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

  // Sans la 084, la base refuse les types de journal des traces (touchers
  // compris) : ils ne sont pas notés du tout. Rend null dans ce cas.
  const noter = useCallback(async (type, ctx, detail = {}, le = new Date()) => {
    if (TYPES_JOURNAL_TRACES.includes(type) && donneesCourantes.current?.tracesDisponibles !== true) return null
    return executer(TYPES_EDL.evenement, { evenement: evenementEdl(type, { ...ctx, affaireId, detail }, le) })
  }, [affaireId, executer])

  const prochainNumero = useCallback(() => {
    const dernier = numeros.current.affaireId === affaireId ? numeros.current.dernier : 0
    const n = Math.max(numeroSuivant(donneesCourantes.current?.points), dernier + 1)
    numeros.current = { affaireId, dernier: n }
    return n
  }, [affaireId])

  const commencer = useCallback(async (visiteId, ctx) => {
    const etatId = donneesCourantes.current?.etat?.id
    if (!etatId) throw new Error('L’état des lieux n’est pas chargé : impossible de commencer la visite.')
    await executer(TYPES_EDL.visiteCreer, {
      visite: { id: visiteId, etat_id: etatId, affaire_id: affaireId, debut: new Date().toISOString(), fin: null },
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

  // ─── Liaisons et cotes (084) ───────────────────────────────────────────────
  // Comme les points : par la file, identifiant décidé ici. Chaque fonction
  // lève une erreur si la base n'a pas la 084 (les boutons sont alors masqués)
  // ou si la trace est incomplète. Le journal note `trace` (posée, modifiée)
  // et `trace-supprimee`, avec l'id de la trace dans `detail.traceId`.
  /**
   * `champs` : { sorte: 'commande', visiteId, niveauId, pieceId, interrupteur, luminaire }
   * ou { sorte: 'cote', visiteId, niveauId, pieceId, a: [x, y], b: [x, y], valeur? }.
   * Rend la trace créée (à garder pour « Annuler » : geste 'trace-creation').
   */
  const creerTrace = useCallback(async (champs, ctx = {}) => {
    exigerTraces(donneesCourantes.current)
    const trace = nouvelleTrace({ ...champs, affaireId })
    if (!traceValide(trace)) throw new Error('Liaison ou cote incomplète : rien n’a été enregistré.')
    await executer(TYPES_EDL.traceCreer, { trace })
    await noter('trace', { ...ctx, visiteId: trace.visite_id ?? ctx.visiteId, niveauId: trace.niveau_id, pieceId: trace.piece_id, pointId: trace.point_a }, detailTrace(trace))
    return trace
  }, [affaireId, executer, noter])

  /** `champs` : ce qui change (par exemple { valeur: '3,45 m', a_valider: false }). */
  const modifierTrace = useCallback(async (trace, champs, ctx = {}) => {
    exigerTraces(donneesCourantes.current)
    await executer(TYPES_EDL.traceModifier, { id: trace.id, champs })
    await noter('trace', { ...ctx, niveauId: trace.niveau_id, pieceId: trace.piece_id, pointId: trace.point_a ?? null }, { traceId: trace.id, sorte: trace.sorte, modification: champs })
  }, [executer, noter])

  const supprimerTrace = useCallback(async (trace, ctx = {}) => {
    exigerTraces(donneesCourantes.current)
    await executer(TYPES_EDL.traceSupprimer, { id: trace.id })
    await noter('trace-supprimee', { ...ctx, niveauId: trace.niveau_id, pieceId: trace.piece_id, pointId: trace.point_a ?? null }, { traceId: trace.id, sorte: trace.sorte })
  }, [executer, noter])

  const annuler = useCallback(async (geste, ctx) => {
    const inverse = operationInverse(geste, donneesCourantes.current?.points ?? [])
    if (!inverse) return
    await executer(inverse.type, inverse.charge)
    // Pour une trace, `charge.id` est celui de la trace, pas d'un point
    const pointId = inverse.traceId ? null : (inverse.charge.id ?? inverse.charge.point?.id ?? null)
    const detail = inverse.traceId ? { annulation: true, traceId: inverse.traceId } : { annulation: true }
    await noter(inverse.evenement, { ...ctx, pointId }, detail)
  }, [executer, noter])

  // L'opération se lit en base, sous le verrou de l'envoi : la copie de
  // l'écran peut être en retard, et un envoi en cours ne doit pas perdre
  // le fichier de la photo qu'il téléverse.
  const rejouer = useCallback(async (opId) => {
    await sousVerrouEdl(async () => {
      const op = await lire(MAGASINS_EDL.operations, opId).catch(() => null)
      if (op) await ecrire(MAGASINS_EDL.operations, { ...op, essais: 0, erreur: null })
    })
    signalerFileEdl()
    envoyerFileEdl(affaireId).catch(() => {})
  }, [affaireId])

  const abandonner = useCallback(async (opId) => {
    await sousVerrouEdl(async () => {
      const op = await lire(MAGASINS_EDL.operations, opId).catch(() => null)
      await effacer(MAGASINS_EDL.operations, opId)
      if (op?.type === TYPES_EDL.photoAjouter) await effacer(MAGASINS_EDL.fichiers, op.charge.photo.id).catch(() => {})
    })
    signalerFileEdl()
  }, [])

  // Objet stable : un objet neuf à chaque rendu relancerait les effets qui en dépendent
  return useMemo(() => ({
    ...statut, sansMemoire, donnees, prepareLe: garde?.prepareLe ?? null, file, resume: resumeFileEdl(file),
    disponible: statut.charge && !statut.indisponible && !sansMemoire && !!donnees?.etat,
    tracesDisponibles: donnees?.tracesDisponibles === true,
    recharger, commencer, terminer, noter, poserPoint, modifierPoint, supprimerPoint, ajouterPhoto,
    creerTrace, modifierTrace, supprimerTrace, annuler, rejouer, abandonner,
  }), [statut, sansMemoire, donnees, garde, file, recharger, commencer, terminer, noter, poserPoint, modifierPoint, supprimerPoint, ajouterPhoto,
    creerTrace, modifierTrace, supprimerTrace, annuler, rejouer, abandonner])
}
