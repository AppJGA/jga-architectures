import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../core/supabase/client'
import { copiePresence } from '../comptes-rendus/crLogique'
import { photosIndisponibles, envoyerPhoto, nettoyerFichiers, BUCKET_PHOTOS } from '../comptes-rendus/photosStockage'
import { BUCKET_ARCHIVES } from '../comptes-rendus/rapportStockage'
import { useLiensSignes } from '../comptes-rendus/useLiensSignes'
import { libelleLot } from './oprLogique'

// ─── Données du module OPR d'une affaire ─────────────────────────────────────
// Volumes modestes (quelques visites, quelques centaines de réserves) : tout
// est chargé en une fois et rechargé après chaque écriture.

const SELECT_PRESENCES = `
  *,
  affaire_interlocuteurs:interlocuteur_id(id, categorie, categorie_label, prenom, nom, fonction, organisation, adresse, email, telephone, ordre),
  lot_entreprises:lot_entreprise_id(id, lot_id, lots:lot_id(id, numero, nom), entreprises:entreprise_id(id, raison_sociale, email, telephone), interlocuteurs:interlocuteur_id(prenom, nom, telephone, email))
`

function verifier(resultat) {
  if (resultat.error) throw resultat.error
  return resultat.data
}

const VIDE = { visites: [], reserves: [], constats: [], photos: [], pastilles: [], presences: [], archives: [], lots: [], lotEntreprises: [] }

export function useOpr(affaireId) {
  const [donnees, setDonnees] = useState(VIDE)
  const [etat, setEtat] = useState({ charge: false, disponible: true, erreur: null })
  const { liens, obtenirLiens } = useLiensSignes(BUCKET_PHOTOS)

  const lire = useCallback(async () => {
    const tables = await Promise.all([
      supabase.from('opr_visites').select('*').eq('affaire_id', affaireId).order('numero'),
      supabase.from('opr_reserves').select('*').eq('affaire_id', affaireId).order('numero'),
      supabase.from('opr_constats').select('*').eq('affaire_id', affaireId).order('created_at'),
      supabase.from('opr_photos').select('*').eq('affaire_id', affaireId).order('ordre').order('created_at'),
      supabase.from('opr_pastilles').select('*').eq('affaire_id', affaireId),
      supabase.from('opr_presences').select(SELECT_PRESENCES).eq('affaire_id', affaireId),
      supabase.from('opr_archives').select('*').eq('affaire_id', affaireId).order('emis_le', { ascending: false }),
      supabase.from('lots').select('*').eq('affaire_id', affaireId).order('numero'),
      supabase.from('lot_entreprises').select('id, lot_id, lots(id, numero, nom), entreprises(id, raison_sociale, email, telephone), interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)').eq('affaire_id', affaireId),
    ])
    const echec = tables.find((t) => t.error)
    if (echec) {
      if (photosIndisponibles(echec.error)) return null
      throw echec.error
    }
    const [visites, reserves, constats, photos, pastilles, presences, archives, lots, lotEntreprises] = tables.map((t) => t.data ?? [])
    return { visites, reserves, constats, photos, pastilles, presences, archives, lots, lotEntreprises }
  }, [affaireId])

  const appliquer = useCallback(async (resultat) => {
    if (resultat === null) {
      setDonnees(VIDE)
      setEtat({ charge: true, disponible: false, erreur: null })
      return
    }
    await obtenirLiens(resultat.photos.map((p) => p.chemin_miniature)).catch((err) => console.warn('Photos :', err))
    setDonnees(resultat)
    setEtat({ charge: true, disponible: true, erreur: null })
  }, [obtenirLiens])

  const recharger = useCallback(async () => {
    appliquer(await lire())
  }, [lire, appliquer])

  useEffect(() => {
    if (!affaireId) return
    let abandon = false
    lire().then((r) => { if (!abandon) appliquer(r) })
      .catch((err) => { if (!abandon) setEtat({ charge: true, disponible: true, erreur: err.message }) })
    return () => { abandon = true }
  }, [affaireId, lire, appliquer])

  // Toute écriture recharge ensuite, même en cas d'échec
  const ecrire = useCallback((fn) => async (...args) => {
    try {
      return await fn(...args)
    } finally {
      await recharger().catch((err) => console.warn('OPR :', err))
    }
  }, [recharger])

  // ── Visites ──────────────────────────────────────────────────────────────────
  const creerVisite = ecrire(async ({ type, date_visite, lot_ids }) => {
    let visite = null
    for (let essai = 0; essai < 3 && !visite; essai++) {
      const { data: dernier } = await supabase.from('opr_visites').select('numero').eq('affaire_id', affaireId).order('numero', { ascending: false }).limit(1).maybeSingle()
      const { data, error } = await supabase.from('opr_visites')
        .insert({ affaire_id: affaireId, numero: (dernier?.numero ?? 0) + 1, type, date_visite, lot_ids }).select().single()
      if (error && error.code !== '23505') throw error
      visite = data
    }
    if (!visite) throw new Error('Impossible d’attribuer un numéro à la visite, réessayez.')

    // Feuille de présence : interlocuteurs de l'affaire et entreprises des lots concernés
    const [interlos, lotsEnt] = await Promise.all([
      supabase.from('affaire_interlocuteurs').select('id, categorie, categorie_label, prenom, nom, fonction, organisation, adresse, email, telephone, ordre').eq('affaire_id', affaireId),
      supabase.from('lot_entreprises').select('id, lot_id, lots:lot_id(id, numero, nom), entreprises:entreprise_id(id, raison_sociale, email, telephone), interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)').eq('affaire_id', affaireId),
    ])
    const concernes = new Set(lot_ids)
    const lignes = [
      ...verifier(interlos).map((i) => ({ interlocuteur_id: i.id, convoque: true, ...copiePresence({ interlocuteur_id: i.id, affaire_interlocuteurs: i }) })),
      ...verifier(lotsEnt).filter((le) => concernes.size === 0 || concernes.has(le.lot_id))
        .map((le) => ({ lot_entreprise_id: le.id, convoque: true, ...copiePresence({ lot_entreprise_id: le.id, lot_entreprises: le }) })),
    ].map((l) => ({ affaire_id: affaireId, visite_id: visite.id, ...l }))
    if (lignes.length > 0) verifier(await supabase.from('opr_presences').insert(lignes))
    return visite
  })

  const modifierVisite = ecrire(async (id, changements) => {
    verifier(await supabase.from('opr_visites').update(changements).eq('id', id))
  })

  const supprimerVisite = ecrire(async (visite) => {
    const reservesVisite = new Set(donnees.reserves.filter((r) => r.visite_origine_id === visite.id).map((r) => r.id))
    const photos = donnees.photos.filter((p) => p.visite_id === visite.id || reservesVisite.has(p.reserve_id))
    verifier(await supabase.from('opr_visites').delete().eq('id', visite.id))
    await nettoyerFichiers(photos)
  })

  const emettreVisite = ecrire(async (visite, dateEmission) => {
    verifier(await supabase.from('opr_visites').update({ statut: 'emis', date_emission: dateEmission }).eq('id', visite.id))
  })

  const rouvrirVisite = ecrire(async (visite) => {
    verifier(await supabase.from('opr_visites').update({ statut: 'brouillon', date_emission: null }).eq('id', visite.id))
  })

  // ── Réserves et constats ─────────────────────────────────────────────────────
  const copieLot = (lotId) => {
    const lot = donnees.lots.find((l) => l.id === lotId)
    return lot ? libelleLot(lot) : null
  }

  const ajouterReserve = ecrire(async (visite, champs) => {
    const { data, error } = await supabase.from('opr_reserves').insert({
      affaire_id: affaireId, visite_origine_id: visite.id, ...champs, copie_lot: copieLot(champs.lot_id),
    }).select('id').single()
    if (error) throw error
    return data.id
  })

  const modifierReserve = ecrire(async (id, champs) => {
    verifier(await supabase.from('opr_reserves').update({ ...champs, ...('lot_id' in champs && { copie_lot: copieLot(champs.lot_id) }) }).eq('id', id))
  })

  const supprimerReserve = ecrire(async (reserve) => {
    const photos = donnees.photos.filter((p) => p.reserve_id === reserve.id)
    verifier(await supabase.from('opr_reserves').delete().eq('id', reserve.id))
    await nettoyerFichiers(photos)
  })

  // Un constat par réserve et par visite : le refaire le remplace
  const constater = ecrire(async (reserve, visite, statut, commentaire = null) => {
    const existant = donnees.constats.find((c) => c.reserve_id === reserve.id && c.visite_id === visite.id)
    if (existant) {
      verifier(await supabase.from('opr_constats').update({ statut, commentaire }).eq('id', existant.id))
    } else {
      verifier(await supabase.from('opr_constats').insert({ affaire_id: affaireId, reserve_id: reserve.id, visite_id: visite.id, statut, commentaire }))
    }
  })

  const annulerConstat = ecrire(async (constat) => {
    verifier(await supabase.from('opr_constats').delete().eq('id', constat.id))
  })

  // ── Photos (mêmes fichiers et compression que les comptes rendus) ────────────
  const ajouterPhotos = ecrire(async (reserveId, compressions, visiteId) => {
    let ordre = donnees.photos.filter((p) => p.reserve_id === reserveId).reduce((m, p) => Math.max(m, p.ordre ?? 0), -1) + 1
    for (const compression of compressions) {
      const fichier = await envoyerPhoto(affaireId, compression)
      const { error } = await supabase.from('opr_photos').insert({ ...fichier, affaire_id: affaireId, reserve_id: reserveId, visite_id: visiteId, ordre: ordre++ })
      if (error) {
        await nettoyerFichiers([fichier])
        throw error
      }
    }
  })

  const remplacerPhoto = ecrire(async (photo, compression) => {
    const fichier = await envoyerPhoto(affaireId, compression)
    const { error } = await supabase.from('opr_photos').update({
      chemin: fichier.chemin, chemin_miniature: fichier.chemin_miniature,
      largeur: fichier.largeur, hauteur: fichier.hauteur, poids_octets: fichier.poids_octets,
    }).eq('id', photo.id)
    if (error) {
      await nettoyerFichiers([fichier])
      throw error
    }
    await nettoyerFichiers([photo])
  })

  const modifierLegendePhoto = ecrire(async (photoId, legende) => {
    verifier(await supabase.from('opr_photos').update({ legende: legende || null }).eq('id', photoId))
  })

  const supprimerPhoto = ecrire(async (photo) => {
    verifier(await supabase.from('opr_photos').delete().eq('id', photo.id))
    await nettoyerFichiers([photo])
  })

  // ── Pastilles ────────────────────────────────────────────────────────────────
  const placerPastille = ecrire(async (reserveId, { planId, versionId, x, y }) => {
    verifier(await supabase.from('opr_pastilles').upsert({ affaire_id: affaireId, reserve_id: reserveId, plan_id: planId, version_id: versionId, x, y }, { onConflict: 'reserve_id' }))
  })

  const retirerPastille = ecrire(async (reserveId) => {
    verifier(await supabase.from('opr_pastilles').delete().eq('reserve_id', reserveId))
  })

  // ── Présences ────────────────────────────────────────────────────────────────
  const setPresence = async (id, presence) => {
    setDonnees((d) => ({ ...d, presences: d.presences.map((p) => (p.id === id ? { ...p, presence } : p)) }))
    const { error } = await supabase.from('opr_presences').update({ presence }).eq('id', id)
    if (error) {
      await recharger()
      throw error
    }
  }

  // ── Archives et diffusions ───────────────────────────────────────────────────
  const archiver = ecrire(async ({ visite, blob, reglages, emisLe, destinataire = null, versionPour = null }) => {
    const chemin = `${affaireId}/opr/${visite.id}/${crypto.randomUUID()}.pdf`
    const envoi = await supabase.storage.from(BUCKET_ARCHIVES).upload(chemin, blob, { contentType: 'application/pdf', upsert: false })
    if (envoi.error) throw envoi.error
    const { data, error } = await supabase.from('opr_archives').insert({
      affaire_id: affaireId, visite_id: visite.id, chemin, taille_octets: blob.size, reglages, emis_le: emisLe, destinataire, version_pour: versionPour,
    }).select().single()
    if (error) {
      await supabase.storage.from(BUCKET_ARCHIVES).remove([chemin])
      throw error
    }
    return data
  })

  const diffusionsDeVisite = useCallback(async (visiteId) => {
    const { data, error } = await supabase.from('opr_diffusions').select('*').eq('visite_id', visiteId).order('prepare_le', { ascending: false })
    if (error) throw error
    return data ?? []
  }, [])

  const noterDiffusion = useCallback(async (ligne) => {
    const { error } = await supabase.from('opr_diffusions').insert({ affaire_id: affaireId, ...ligne })
    if (error) throw error
  }, [affaireId])

  return {
    ...donnees, ...etat, liens, obtenirLiens, recharger,
    creerVisite, modifierVisite, supprimerVisite, emettreVisite, rouvrirVisite,
    ajouterReserve, modifierReserve, supprimerReserve, constater, annulerConstat,
    ajouterPhotos, remplacerPhoto, modifierLegendePhoto, supprimerPhoto,
    placerPastille, retirerPastille, setPresence,
    archiver, diffusionsDeVisite, noterDiffusion,
  }
}
