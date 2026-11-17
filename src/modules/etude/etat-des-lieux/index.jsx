import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiensSignes } from '../../chantier/comptes-rendus/useLiensSignes'
import { garderImages } from '../../chantier/comptes-rendus/horsLigne/images'
import { useEtatDesLieux } from './useEtatDesLieux'
import { BUCKET_EDL, enregistrerPieces, supprimerEtat } from './edlDonnees'
import { ImportEdl } from './ImportEdl'
import { EditeurPieces } from './EditeurPieces'

// ─── État des lieux d'un bâtiment existant ───────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md.
// Lot 1 : importer les plans de l'existant, relire et corriger les pièces de
// chaque étage. Ouvert avec du réseau, le module recopie les images des
// étages sur l'appareil ; sans réseau, il les relit de là.

const onglet = (actif) => ({
  minHeight: 40, padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
  border: actif ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
  background: actif ? 'var(--affaire-accent)' : 'white', color: actif ? 'white' : '#1F1B17',
})

export default function EtatDesLieuxModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const edl = useEtatDesLieux(affaireId)
  const { obtenirLiens } = useLiensSignes(BUCKET_EDL)
  const [niveauId, setNiveauId] = useState(null)
  const [reimport, setReimport] = useState(false)
  const [confirmer, setConfirmer] = useState(false)

  const niveau = edl.niveaux.find((n) => n.id === niveauId) ?? edl.niveaux[0]

  useEffect(() => {
    if (!edl.charge || !navigator.onLine || !edl.niveaux.length) return
    garderImages(edl.niveaux.flatMap((n) => [n.chemin_apercu, n.chemin]), obtenirLiens).catch(() => {})
  }, [edl.charge, edl.niveaux, obtenirLiens])

  if (edl.indisponible) return <p style={{ fontSize: 13, color: '#5E5854' }}>L’état des lieux demande la migration 077 dans Supabase.</p>
  if (!edl.charge) return <p style={{ fontSize: 13, color: '#5E5854' }}>Chargement…</p>
  // Sans lecture, ne pas proposer l'import : il s'ajouterait à des étages
  // peut-être déjà enregistrés
  if (edl.echec) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>L’état des lieux n’a pas pu être lu{edl.erreur ? ` : ${edl.erreur}` : '.'}</p>
        <button type="button" style={onglet(false)} onClick={edl.recharger}>Réessayer</button>
      </div>
    )
  }

  if (!edl.niveaux.length || reimport) {
    if (lectureSeule) return <p style={{ fontSize: 13, color: '#5E5854' }}>Aucun plan de l’existant importé pour cette affaire.</p>
    return (
      <ImportEdl
        affaireId={affaireId}
        onAnnuler={reimport ? () => setReimport(false) : null}
        onTermine={() => { setReimport(false); setNiveauId(null); edl.recharger() }}
      />
    )
  }

  const remplacer = async () => {
    setConfirmer(false)
    try {
      await supprimerEtat(affaireId, edl.niveaux)
      setReimport(true)
      edl.recharger()
    } catch (err) {
      edl.setErreur(err?.message ?? String(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 230px)', minHeight: 520 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {edl.niveaux.map((n) => (
          <button key={n.id} type="button" style={onglet(n.id === niveau?.id)} onClick={() => setNiveauId(n.id)}>
            {n.nom} · {edl.pieces.filter((p) => p.niveau_id === n.id).length}
          </button>
        ))}
        {!lectureSeule && niveau && (
          <input
            aria-label="Nom de l’étage" defaultValue={niveau.nom} key={niveau.id}
            onBlur={(e) => { const nom = e.target.value.trim(); if (nom && nom !== niveau.nom) edl.renommerNiveau(niveau.id, nom) }}
            style={{ minHeight: 36, padding: '0 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 14 }}
          />
        )}
        <span style={{ flex: 1 }} />
        {!lectureSeule && !confirmer && (
          <button type="button" style={onglet(false)} onClick={() => setConfirmer(true)}>Remplacer les plans</button>
        )}
        {confirmer && (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            Les étages et les pièces corrigées seront perdus.
            <button type="button" style={{ ...onglet(true), background: '#B42318' }} onClick={remplacer}>Remplacer</button>
            <button type="button" style={onglet(false)} onClick={() => setConfirmer(false)}>Annuler</button>
          </span>
        )}
      </div>
      {edl.erreur && <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{edl.erreur}</p>}
      {niveau && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <EditeurPieces
            key={niveau.id}
            niveau={niveau}
            pieces={edl.pieces.filter((p) => p.niveau_id === niveau.id)}
            obtenirLiens={obtenirLiens}
            lectureSeule={lectureSeule}
            onModifier={edl.modifierPiece}
            onAjouter={edl.ajouterPiece}
            onSupprimer={edl.supprimerPiece}
            onAjouterPlusieurs={async (niveauIdCible, pieces) => { await enregistrerPieces(affaireId, niveauIdCible, pieces); edl.recharger() }}
          />
        </div>
      )}
    </div>
  )
}
