import { useState, useEffect, useCallback } from 'react'
import {
  plansDeLAffaire, importerPlan, nouvelleVersionPlan, renommerPlan, supprimerPlan, BUCKET_PLANS,
} from './plansStockage'
import { useLiensSignes } from './useLiensSignes'

/** Plans d'une affaire, leurs versions et leurs liens d'affichage */
export function usePlans(affaireId) {
  const [etat, setEtat] = useState({ plans: [], versions: [], disponible: true, charge: false })
  const { liens, obtenirLiens } = useLiensSignes(BUCKET_PLANS)

  const appliquer = useCallback((resultat) => {
    setEtat(resultat === null
      ? { plans: [], versions: [], disponible: false, charge: true } // migration 041 absente
      : { ...resultat, disponible: true, charge: true })
  }, [])

  const recharger = useCallback(async () => {
    if (!affaireId) return
    appliquer(await plansDeLAffaire(affaireId))
  }, [affaireId, appliquer])

  useEffect(() => {
    if (!affaireId) return
    let abandon = false
    plansDeLAffaire(affaireId)
      .then(r => { if (!abandon) appliquer(r) })
      .catch(err => console.error('Plans :', err))
    return () => { abandon = true }
  }, [affaireId, appliquer])

  const importer = useCallback(async (options) => {
    const ordre = etat.plans.reduce((m, p) => Math.max(m, p.ordre ?? 0), -1) + 1
    try {
      return await importerPlan(affaireId, { ...options, ordre })
    } finally {
      await recharger()
    }
  }, [affaireId, etat.plans, recharger])

  const nouvelleVersion = useCallback(async (plan, options) => {
    try {
      return await nouvelleVersionPlan(affaireId, plan, etat.versions, options)
    } finally {
      await recharger()
    }
  }, [affaireId, etat.versions, recharger])

  const renommer = useCallback(async (planId, nom) => {
    await renommerPlan(planId, nom)
    await recharger()
  }, [recharger])

  const supprimer = useCallback(async (plan) => {
    await supprimerPlan(plan, etat.versions)
    await recharger()
  }, [etat.versions, recharger])

  return { ...etat, liens, obtenirLiens, importer, nouvelleVersion, renommer, supprimer, recharger }
}
