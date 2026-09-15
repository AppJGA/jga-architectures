import { useState } from 'react'
import { useCr } from './CrContexte'
import { fichiersOrphelins, supprimerFichiers } from './photosStockage'
import { formatOctets, resumeOrphelines, libelleFichiers } from './photosLogique'

// Recherche puis suppression des fichiers (photos, plans) qu'aucun compte rendu
// n'utilise (affaire supprimée, envoi interrompu). Rien n'est effacé sans
// confirmation.
export function NettoyageStockage({ onTermine }) {
  const [etat, setEtat] = useState('repos') // repos | recherche | resultat | suppression | fini
  const [fichiers, setFichiers] = useState([])
  const [bilan, setBilan] = useState(null)
  const { signalerErreur } = useCr()

  const rechercher = async () => {
    setEtat('recherche')
    try {
      const liste = await fichiersOrphelins()
      if (liste === null) {
        signalerErreur(new Error('Le nettoyage demande la migration 040 dans Supabase.'))
        setEtat('repos')
        return
      }
      setFichiers(liste)
      setEtat('resultat')
    } catch (err) {
      signalerErreur(err)
      setEtat('repos')
    }
  }

  const supprimer = async () => {
    setEtat('suppression')
    try {
      await supprimerFichiers(fichiers)
      setBilan(resumeOrphelines(fichiers))
      setFichiers([])
      setEtat('fini')
      onTermine?.()
    } catch (err) {
      signalerErreur(err)
      setEtat('resultat')
    }
  }

  const resume = resumeOrphelines(fichiers)
  const lien = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }

  return (
    <div style={{ fontSize: 11, color: '#5E5854', marginTop: 10 }}>
      {etat === 'repos' && (
        <button type="button" onClick={rechercher} style={{ ...lien, color: '#1B3A5C' }}>Nettoyer le stockage</button>
      )}
      {etat === 'recherche' && <span>Recherche des fichiers inutilisés…</span>}
      {etat === 'resultat' && (resume.fichiers === 0 ? (
        <span>Aucun fichier inutilisé. <button type="button" onClick={() => setEtat('repos')} style={{ ...lien, color: '#5E5854' }}>Fermer</button></span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>
            Inutilisés : <strong style={{ color: '#1F1B17' }}>{libelleFichiers(resume)}</strong>
            {' · '}{formatOctets(resume.taille)}
          </span>
          <button type="button" onClick={supprimer} style={{ padding: '4px 10px', borderRadius: 2, fontSize: 11, fontWeight: 500, border: 'none', background: '#B8412C', color: 'white', cursor: 'pointer' }}>
            Supprimer définitivement
          </button>
          <button type="button" onClick={() => setEtat('repos')} style={{ ...lien, color: '#5E5854' }}>Annuler</button>
        </div>
      ))}
      {etat === 'suppression' && <span>Suppression…</span>}
      {etat === 'fini' && bilan && (
        <span style={{ color: '#2A8A4E' }}>
          Supprimés : {libelleFichiers(bilan)} — {formatOctets(bilan.taille)} libérés.
        </span>
      )}
    </div>
  )
}
