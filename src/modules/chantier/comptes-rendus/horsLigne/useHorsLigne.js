import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MAGASINS, lire, ecrire, effacer, operationsDuCr, disponible } from './baseLocale'
import { aEnvoyer, resumeFile, ESSAIS_MAX } from './fileLogique'
import { envoyerOperation, erreurReseau } from './envoi'

// ─── File d'attente d'un compte rendu, côté écran ────────────────────────────
//
// Tient l'état réseau, la file gardée sur l'appareil et son envoi. Rien n'est
// retiré de la file avant que la base ait confirmé : une coupure en plein
// envoi laisse l'opération en attente, jamais à moitié partie.

export function useHorsLigne(crId) {
  const [enLigne, setEnLigne] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [file, setFile] = useState([])
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [prepareLe, setPrepareLe] = useState(null)
  const envoiLance = useRef(false)

  useEffect(() => {
    const enHaut = () => setEnLigne(true)
    const enBas = () => setEnLigne(false)
    window.addEventListener('online', enHaut)
    window.addEventListener('offline', enBas)
    return () => { window.removeEventListener('online', enHaut); window.removeEventListener('offline', enBas) }
  }, [])

  const relireFile = useCallback(async () => {
    if (!crId || !disponible()) return []
    const ops = await operationsDuCr(crId).catch(() => [])
    setFile(ops)
    return ops
  }, [crId])

  useEffect(() => {
    if (!crId || !disponible()) return
    operationsDuCr(crId).then(setFile).catch(() => {})
    lire(MAGASINS.visites, crId).then(v => setPrepareLe(v?.prepareLe ?? null)).catch(() => {})
  }, [crId])

  /** Range une opération déjà construite dans la file. */
  const enfiler = useCallback(async (op) => {
    await ecrire(MAGASINS.operations, op)
    setFile(f => [...f, op])
    return op
  }, [])

  /**
   * Envoie la file dans l'ordre. Une coupure arrête l'envoi sans compter
   * d'échec ; un refus de la base (compte rendu émis, ligne interdite) est
   * compté, et l'opération est mise de côté après trois tentatives.
   */
  const envoyerFile = useCallback(async () => {
    if (!crId || envoiLance.current) return { envoyees: 0, restantes: 0 }
    envoiLance.current = true
    setEnvoiEnCours(true)
    let envoyees = 0
    try {
      const ops = aEnvoyer(await operationsDuCr(crId).catch(() => []))
      for (const op of ops) {
        try {
          await envoyerOperation(op)
          await effacer(MAGASINS.operations, op.id)
          envoyees++
        } catch (err) {
          if (erreurReseau(err)) break // le réseau est reparti : on reprendra
          const essais = (op.essais ?? 0) + 1
          await ecrire(MAGASINS.operations, { ...op, essais, erreur: err?.message ?? String(err) })
          if (essais < ESSAIS_MAX) break // la suite dépend peut-être de celle-ci
        }
      }
    } finally {
      envoiLance.current = false
      setEnvoiEnCours(false)
    }
    const restantes = await relireFile()
    return { envoyees, restantes: restantes.length }
  }, [crId, relireFile])

  // Retour du réseau : la file part d'elle-même
  useEffect(() => {
    if (!enLigne || file.length === 0 || envoiLance.current) return
    envoyerFile().catch(err => console.warn('Envoi de la file :', err))
  }, [enLigne, file.length, envoyerFile])

  /** Met la visite de côté pour qu'elle s'ouvre sans réseau. */
  const preparer = useCallback(async (donnees) => {
    if (!crId || !disponible()) return null
    const prepare = Date.now()
    await ecrire(MAGASINS.visites, { crId, donnees, prepareLe: prepare })
    setPrepareLe(prepare)
    return prepare
  }, [crId])

  const instantane = useCallback(async () => {
    if (!crId || !disponible()) return null
    const enregistre = await lire(MAGASINS.visites, crId).catch(() => null)
    return enregistre?.donnees ?? null
  }, [crId])

  /** Remet une opération mise de côté dans le circuit. */
  const rejouer = useCallback(async (opId) => {
    const op = file.find(o => o.id === opId)
    if (!op) return
    await ecrire(MAGASINS.operations, { ...op, essais: 0, erreur: null })
    await relireFile()
    await envoyerFile()
  }, [file, relireFile, envoyerFile])

  /** Abandonne une opération que la base refuse définitivement. */
  const abandonner = useCallback(async (opId) => {
    await effacer(MAGASINS.operations, opId)
    await relireFile()
  }, [relireFile])

  // Objet stable : `useCompteRendu` s'en sert dans des `useCallback`, et un
  // objet neuf à chaque rendu y relançait le chargement en boucle.
  return useMemo(() => ({
    enLigne, file, resume: resumeFile(file), envoiEnCours, prepareLe,
    enfiler, envoyerFile, preparer, instantane, rejouer, abandonner, relireFile,
    utilisable: disponible(),
  }), [enLigne, file, envoiEnCours, prepareLe, enfiler, envoyerFile, preparer, instantane, rejouer, abandonner, relireFile])
}
