import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { Upload, RefreshCw, X } from 'lucide-react'
import { useLiensSignes } from '../../chantier/comptes-rendus/useLiensSignes'
import { garderImages } from '../../chantier/comptes-rendus/horsLigne/images'
import { useEtatDesLieux } from './useEtatDesLieux'
import { BUCKET_EDL, enregistrerPieces, supprimerEtat } from './edlDonnees'
import { ImportEdl } from './ImportEdl'
import { EditeurPieces } from './EditeurPieces'

// ─── État des lieux d'un bâtiment existant ───────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md.
// Lot 1 : importer les plans de l'existant (DXF), relire et corriger les
// pièces de chaque étage. Ouvert avec du réseau, le module recopie les images
// des étages sur l'appareil ; sans réseau, il les relit de là. Présentation
// commune aux modules de l'affaire (barre d'outils, onglets soulignés,
// fenêtres à liseré de la couleur de la phase).

const texteDiscret = { margin: 0, fontSize: 12, color: '#9C9591' }
const boutonPrincipal = { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const boutonSecondaire = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 13, cursor: 'pointer' }
const alerte = { margin: 0, fontSize: 13, color: '#B8412C', background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

function ConfirmerRemplacement({ onConfirmer, onAnnuler }) {
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler])
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(80px + env(safe-area-inset-top)) 16px 32px' }}>
      <div role="alertdialog" aria-modal="true" aria-label="Remplacer les plans"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 460, borderTop: '3px solid #B8412C', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Remplacer les plans ?</h2>
          <button type="button" onClick={onAnnuler} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4, display: 'inline-flex' }}><X size={18} /></button>
        </div>
        <p style={{ margin: 0, padding: '16px 20px', fontSize: 13, color: '#5E5854' }}>
          Les étages et les pièces de cet état des lieux, corrections comprises, seront supprimés avant le nouvel import.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onAnnuler} style={boutonSecondaire}>Annuler</button>
          <button type="button" onClick={onConfirmer} style={{ ...boutonPrincipal, background: '#B8412C' }}>Supprimer et réimporter</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function EtatDesLieuxModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const edl = useEtatDesLieux(affaireId)
  const { obtenirLiens } = useLiensSignes(BUCKET_EDL)
  const [niveauId, setNiveauId] = useState(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [confirmer, setConfirmer] = useState(false)

  const niveau = edl.niveaux.find((n) => n.id === niveauId) ?? edl.niveaux[0]

  useEffect(() => {
    if (!edl.charge || !navigator.onLine || !edl.niveaux.length) return
    garderImages(edl.niveaux.flatMap((n) => [n.chemin_apercu, n.chemin]), obtenirLiens).catch(() => {})
  }, [edl.charge, edl.niveaux, obtenirLiens])

  if (edl.indisponible) {
    return <p style={{ margin: 0, maxWidth: 760, fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 14px' }}>L’état des lieux demande la migration 077 dans Supabase.</p>
  }
  if (!edl.charge) return <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Chargement…</p>
  // Sans lecture, ne pas proposer l'import : il s'ajouterait à des étages
  // peut-être déjà enregistrés
  if (edl.echec) {
    return (
      <p role="alert" style={{ ...alerte, maxWidth: 760 }}>
        <span style={{ flex: 1 }}>L’état des lieux n’a pas pu être lu{edl.erreur ? ` : ${edl.erreur}` : '.'}</span>
        <button type="button" onClick={edl.recharger} style={{ border: 'none', background: 'none', color: '#B8412C', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><RefreshCw size={13} /> Réessayer</button>
      </p>
    )
  }

  const fenetreImport = importOuvert && (
    <ImportEdl
      affaireId={affaireId}
      onFermer={() => setImportOuvert(false)}
      onTermine={() => { setImportOuvert(false); setNiveauId(null); edl.recharger() }}
    />
  )

  if (!edl.niveaux.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
        <div style={{ background: 'white', border: '0.5px dashed rgba(0,0,0,0.15)', padding: '36px 20px', textAlign: 'center', fontSize: 13, color: '#5E5854', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <span>
            Aucun plan de l’existant pour cette affaire.
            {!lectureSeule && ' Importez-le en DXF : les étages et les pièces sont lus dans le plan, puis vous les relisez avant la visite.'}
          </span>
          {!lectureSeule && <button type="button" onClick={() => setImportOuvert(true)} style={boutonPrincipal}><Upload size={15} /> Importer les plans</button>}
        </div>
        {fenetreImport}
      </div>
    )
  }

  const remplacer = async () => {
    setConfirmer(false)
    try {
      await supprimerEtat(affaireId, edl.niveaux)
      edl.recharger()
      setImportOuvert(true)
    } catch (err) {
      edl.setErreur(err?.message ?? String(err))
    }
  }

  const piecesDe = (id) => edl.pieces.filter((p) => p.niveau_id === id)
  const horsLigne = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 230px)', minHeight: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ ...texteDiscret, flex: 1 }}>
          {pluriel(edl.niveaux.length, 'étage')} · {pluriel(edl.pieces.length, 'pièce')}
          {horsLigne ? ' · sans réseau : plans lus sur cet appareil' : ' · plans gardés sur cet appareil pour la visite'}
        </p>
        {!lectureSeule && (
          <button type="button" onClick={() => setConfirmer(true)} style={boutonSecondaire}><RefreshCw size={14} /> Remplacer les plans</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
        <div role="tablist" aria-label="Étages" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {edl.niveaux.map((n) => {
            const actif = n.id === niveau?.id
            return (
              <button key={n.id} type="button" role="tab" aria-selected={actif} onClick={() => setNiveauId(n.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', cursor: 'pointer',
                  border: 'none', borderTop: '2px solid transparent', borderBottom: `2px solid ${actif ? 'var(--affaire-accent, #E8602C)' : 'transparent'}`,
                  background: 'none', fontSize: 14, fontWeight: actif ? 600 : 400, color: actif ? '#1F1B17' : '#5E5854',
                }}>
                {n.nom}
                <span style={{ fontSize: 12, color: '#9C9591', fontWeight: 400 }}>{piecesDe(n.id).length}</span>
              </button>
            )
          })}
        </div>
        {!lectureSeule && niveau && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5E5854', paddingBottom: 4 }}>
            Nom de l’étage
            <input
              defaultValue={niveau.nom} key={niveau.id}
              onBlur={(e) => { const nom = e.target.value.trim(); if (nom && nom !== niveau.nom) edl.renommerNiveau(niveau.id, nom) }}
              style={{ height: 34, minHeight: 0, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', boxSizing: 'border-box', width: 180 }}
            />
          </label>
        )}
      </div>

      {edl.erreur && (
        <p role="alert" style={alerte}>
          <span style={{ flex: 1 }}>{edl.erreur}</span>
          <button type="button" onClick={() => edl.setErreur(null)} style={{ border: 'none', background: 'none', color: '#B8412C', cursor: 'pointer', fontSize: 12 }}>Fermer</button>
        </p>
      )}
      {niveau && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <EditeurPieces
            key={niveau.id}
            niveau={niveau}
            pieces={piecesDe(niveau.id)}
            obtenirLiens={obtenirLiens}
            lectureSeule={lectureSeule}
            onModifier={edl.modifierPiece}
            onAjouter={edl.ajouterPiece}
            onSupprimer={edl.supprimerPiece}
            onAjouterPlusieurs={async (niveauIdCible, pieces) => { await enregistrerPieces(affaireId, niveauIdCible, pieces); edl.recharger() }}
          />
        </div>
      )}
      {confirmer && <ConfirmerRemplacement onConfirmer={remplacer} onAnnuler={() => setConfirmer(false)} />}
      {fenetreImport}
    </div>
  )
}
