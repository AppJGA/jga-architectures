import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useSearchParams } from 'react-router-dom'
import { Upload, RefreshCw, X, Mic, FileDown, ClipboardCheck } from 'lucide-react'
import { useLiensSignes } from '../../chantier/comptes-rendus/useLiensSignes'
import { garderImages } from '../../chantier/comptes-rendus/horsLigne/images'
import { useEtatDesLieux } from './useEtatDesLieux'
import { BUCKET_EDL, enregistrerPieces, supprimerEtat } from './edlDonnees'
import { ImportEdl } from './ImportEdl'
import { EditeurPieces } from './EditeurPieces'
import { useVisiteEdl } from './visite/useVisiteEdl'
import { VisiteEdl } from './visite/VisiteEdl'
import { visiteEnCours, perteRemplacement } from './visite/visiteLogique'
import { oublierEdlLocal } from './visite/synchroEdl'
import { useAnalyseEdl } from './analyse/useAnalyseEdl'
import { RelectureEdl } from './analyse/RelectureEdl'
import { resumePieceRelecture } from './analyse/relectureAnalyseLogique'
import { COULEUR_IA } from '../../chantier/comptes-rendus/enregistrement/styleProposition'
import { morceauxEtatsDesLieux } from '../../chantier/comptes-rendus/enregistrement/audioLocal'

// Lot 4 : la fenêtre d'export (aperçu, DXF, rapport, ZIP) n'est chargée qu'à
// son ouverture — pdf.js et pdfmake n'ont rien à faire dans la visite
const ExportEdl = lazy(() => import('./export/ExportEdl'))

// ─── État des lieux d'un bâtiment existant ───────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md.
// Lot 1 : importer les plans de l'existant (DXF), relire et corriger les
// pièces de chaque étage. Ouvert avec du réseau, le module recopie les images
// des étages sur l'appareil ; sans réseau, il les relit de là. Présentation
// commune aux modules de l'affaire (barre d'outils, onglets soulignés,
// fenêtres à liseré de la couleur de la phase).
// Lot 2 : « Démarrer la visite » ouvre l'écran plein de la visite (?visite=1,
// gardé au rechargement) ; l'état des lieux est recopié sur l'appareil à
// chaque ouverture avec du réseau. « Remplacer les plans » reste proposé
// après une visite (demande de l'agence, 2026-11-18) : la fenêtre dit tout ce
// qui sera supprimé, visites, points et photos compris (migration 080).
// Lot 3 : « Relecture », à côté de « Pièces » dès qu'une visite existe, pour
// relire au bureau ce que Claude a tiré de chaque pièce. La vue et la pièce
// ouverte sont dans l'adresse (?vue=relecture&piece=…) : un rechargement y
// ramène.
// Lot 4 : « Exporter » (dès qu'il y a des étages, lecture seule comprise :
// l'export ne modifie rien) ouvre la fenêtre d'export avec son aperçu.

const texteDiscret = { margin: 0, fontSize: 12, color: '#9C9591' }
const boutonPrincipal = { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const boutonSecondaire = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 13, cursor: 'pointer' }
const alerte = { margin: 0, fontSize: 13, color: '#B8412C', background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

function ConfirmerRemplacement({ perte, enCours, onConfirmer, onAnnuler }) {
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler, enCours])
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(80px + env(safe-area-inset-top)) 16px 32px' }}>
      <div role="alertdialog" aria-modal="true" aria-label="Remplacer les plans"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 460, borderTop: '3px solid #B8412C', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Remplacer les plans ?</h2>
          <button type="button" onClick={onAnnuler} disabled={enCours} aria-label="Fermer" style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </div>
        {perte && (
          <p role="alert" style={{ margin: '16px 20px 0', fontSize: 13, fontWeight: 600, color: '#B8412C', background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '10px 12px' }}>
            {perte}
          </p>
        )}
        <p style={{ margin: 0, padding: '16px 20px', fontSize: 13, color: '#5E5854' }}>
          Les étages et les pièces de cet état des lieux, corrections comprises, seront supprimés avant le nouvel import.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onAnnuler} disabled={enCours} style={boutonSecondaire}>Annuler</button>
          <button type="button" onClick={onConfirmer} disabled={enCours} style={{ ...boutonPrincipal, background: '#B8412C', opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Suppression…' : perte ? 'Tout supprimer et réimporter' : 'Supprimer et réimporter'}
          </button>
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
  const [exportOuvert, setExportOuvert] = useState(false)
  const [params, setParams] = useSearchParams()
  const visite = useVisiteEdl(affaireId)
  // Lot 3 : à l'ouverture avec du réseau, les pièces visitées partent à l'analyse
  const analyse = useAnalyseEdl(affaireId, { lectureSeule })
  const visiteOuverte = params.get('visite') === '1' && !lectureSeule
  const [suppression, setSuppression] = useState(false)
  // Morceaux de son de l'affaire pas encore transcrits sur cet appareil :
  // « Remplacer les plans » les efface, la fenêtre doit le dire
  const [sonAPerdre, setSonAPerdre] = useState({ affaireId: null, n: 0 })
  useEffect(() => {
    if (!confirmer) return undefined
    let vivant = true
    morceauxEtatsDesLieux()
      .then((l) => { if (vivant) setSonAPerdre({ affaireId, n: l.filter((m) => m.affaireId === affaireId).length }) })
      .catch(() => {})
    return () => { vivant = false }
  }, [confirmer, affaireId])
  const aEuUneVisite = (visite.donnees?.visites?.length ?? 0) > 0
  const ouvrirVisite = () => setParams((p) => { const n = new URLSearchParams(p); n.set('visite', '1'); return n })
  const fermerVisite = () => {
    setParams((p) => { const n = new URLSearchParams(p); n.delete('visite'); return n }, { replace: true })
    edl.recharger()
    visite.recharger()
  }

  // Relecture : possible dès qu'une visite existe (ou que l'analyse a déjà
  // laissé quelque chose, visite lue sur un autre appareil)
  const relecturePossible = aEuUneVisite || analyse.elements.length > 0
    || [...analyse.pieces.values()].some((p) => p.analyse_le)
  // Tant que la visite n'est pas lue, l'adresse fait foi : pas de saut vers
  // « Pièces » au rechargement
  const vueRelecture = params.get('vue') === 'relecture' && (relecturePossible || !visite.charge)
  const pieceRelue = vueRelecture ? params.get('piece') : null
  const changerAdresse = (modifier) => setParams((p) => { const n = new URLSearchParams(p); modifier(n); return n })
  const choisirVue = (relecture) => changerAdresse((n) => {
    if (relecture) n.set('vue', 'relecture')
    else n.delete('vue')
    n.delete('piece')
  })
  const ouvrirPiece = (id) => changerAdresse((n) => { if (id) n.set('piece', id); else n.delete('piece') })
  const choisirNiveau = (id) => {
    setNiveauId(id)
    if (pieceRelue) ouvrirPiece(null)
  }

  // Une pièce ouverte depuis l'adresse impose son étage (rechargement)
  const niveauDeLaPiece = pieceRelue ? edl.pieces.find((p) => p.id === pieceRelue)?.niveau_id : null
  const niveau = edl.niveaux.find((n) => n.id === niveauId)
    ?? edl.niveaux.find((n) => n.id === niveauDeLaPiece)
    ?? edl.niveaux[0]

  useEffect(() => {
    if (!edl.charge || !navigator.onLine || !edl.niveaux.length) return
    // Le budget de l'appareil est fini et la copie s'arrête au premier
    // fichier qui le dépasse : tous les aperçus, puis tous les fichiers
    // vectoriels (quelques centaines de Ko, c'est eux que la visite affiche),
    // puis les images pleines des seuls étages qui n'en ont pas
    garderImages([
      ...edl.niveaux.map((n) => n.chemin_apercu),
      ...edl.niveaux.map((n) => n.chemin_vecteurs),
      ...edl.niveaux.filter((n) => !n.chemin_vecteurs).map((n) => n.chemin),
    ], obtenirLiens).catch(() => {})
  }, [edl.charge, edl.niveaux, obtenirLiens])

  // La visite s'ouvre même si la lecture du lot 1 échoue sans réseau : elle
  // lit son propre instantané
  if (visiteOuverte) {
    return <VisiteEdl affaireId={affaireId} visite={visite} analyse={analyse} obtenirLiens={obtenirLiens} onFermer={fermerVisite} />
  }

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
      onTermine={() => { setImportOuvert(false); setNiveauId(null); edl.recharger(); visite.recharger() }}
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
    setSuppression(true)
    try {
      await supprimerEtat(affaireId, edl.niveaux)
      // L'appareil oublie aussi la visite : ses gestes en attente viseraient
      // des lignes supprimées. Un échec ici ne remet rien en cause en base.
      await oublierEdlLocal(affaireId).catch(() => {})
      setConfirmer(false)
      edl.recharger()
      visite.recharger()
      setImportOuvert(true)
    } catch (err) {
      setConfirmer(false)
      edl.setErreur(err?.message ?? String(err))
    } finally {
      setSuppression(false)
    }
  }

  const perte = perteRemplacement({
    visites: visite.donnees?.visites?.length ?? 0,
    points: visite.donnees?.points?.length ?? 0,
    photos: visite.donnees?.photos?.length ?? 0,
    enAttente: visite.resume?.enAttente ?? 0,
    son: sonAPerdre.affaireId === affaireId ? sonAPerdre.n : 0,
  })

  const piecesDe = (id) => edl.pieces.filter((p) => p.niveau_id === id)
  const aValiderDe = (id) => piecesDe(id).reduce((n, p) => {
    const a = analyse.pieces.get(p.id)
    return n + (a ? resumePieceRelecture({ ...p, ...a }, analyse.elements, analyse.traces).aValider : 0)
  }, 0)
  const aValiderTotal = vueRelecture || relecturePossible ? edl.niveaux.reduce((n, nv) => n + aValiderDe(nv.id), 0) : 0
  // « État des lieux » (la relecture, ce qui sera rendu) un peu mis en
  // valeur à côté de « Fond de plans » (l'outil de préparation), à la
  // demande de l'agence : fond teinté, icône, couleur de la phase
  const ongletVue = (actif, libelle, compte, onClick, { enValeur = false } = {}) => (
    <button type="button" role="tab" aria-selected={actif} onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', cursor: 'pointer',
        border: 'none', borderTop: '2px solid transparent', borderBottom: `2px solid ${actif ? 'var(--affaire-accent, #E8602C)' : 'transparent'}`,
        borderRadius: enValeur ? '3px 3px 0 0' : 0,
        background: enValeur ? 'var(--affaire-accent-clair, rgba(232,96,44,0.10))' : 'none',
        fontSize: 14, fontWeight: actif || enValeur ? 600 : 400,
        color: enValeur && !actif ? 'var(--affaire-accent, #E8602C)' : actif ? '#1F1B17' : '#5E5854',
      }}>
      {enValeur && <ClipboardCheck size={16} aria-hidden="true" />}
      {libelle}
      {compte > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: COULEUR_IA }}>{compte} à valider</span>}
    </button>
  )
  const horsLigne = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 230px)', minHeight: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ ...texteDiscret, flex: 1 }}>
          {pluriel(edl.niveaux.length, 'étage')} · {pluriel(edl.pieces.length, 'pièce')}
          {aEuUneVisite && ` · ${pluriel(visite.donnees.visites.length, 'visite')} · ${pluriel(visite.donnees.points.length, 'point')}`}
          {visite.resume.enAttente > 0 && ` · ${visite.resume.enAttente} geste${visite.resume.enAttente > 1 ? 's' : ''} de visite à envoyer`}
          {horsLigne ? ' · sans réseau : plans lus sur cet appareil' : ' · plans gardés sur cet appareil pour la visite'}
        </p>
        {visite.resume.echecs > 0 && (
          <span style={{ fontSize: 12, color: '#B8412C' }}>
            {visite.resume.echecs} geste{visite.resume.echecs > 1 ? 's' : ''} de visite refusé{visite.resume.echecs > 1 ? 's' : ''} par la base
          </span>
        )}
        {!lectureSeule && visite.indisponible && (
          <span style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '6px 10px' }}>La visite demande la migration 079 dans Supabase.</span>
        )}
        {!lectureSeule && visite.disponible && (
          <button type="button" onClick={ouvrirVisite} style={boutonPrincipal}>
            <Mic size={15} /> {visiteEnCours(visite.donnees.visites) ? 'Reprendre la visite' : 'Démarrer la visite'}
          </button>
        )}
        <button type="button" onClick={() => setExportOuvert(true)} style={{ ...boutonSecondaire, minHeight: 44 }}><FileDown size={14} /> Exporter</button>
        {!lectureSeule && (
          <button type="button" onClick={() => setConfirmer(true)} style={boutonSecondaire}><RefreshCw size={14} /> Remplacer les plans</button>
        )}
      </div>

      {(relecturePossible || vueRelecture) && (
        <div role="tablist" aria-label="Vue" style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
          {ongletVue(!vueRelecture, 'Fond de plans', 0, () => choisirVue(false))}
          {ongletVue(vueRelecture, 'État des lieux', aValiderTotal, () => choisirVue(true), { enValeur: true })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
        <div role="tablist" aria-label="Étages" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {edl.niveaux.map((n) => {
            const actif = n.id === niveau?.id
            const aValider = vueRelecture ? aValiderDe(n.id) : 0
            return (
              <button key={n.id} type="button" role="tab" aria-selected={actif} onClick={() => choisirNiveau(n.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', cursor: 'pointer',
                  border: 'none', borderTop: '2px solid transparent', borderBottom: `2px solid ${actif ? 'var(--affaire-accent, #E8602C)' : 'transparent'}`,
                  background: 'none', fontSize: 14, fontWeight: actif ? 600 : 400, color: actif ? '#1F1B17' : '#5E5854',
                }}>
                {n.nom}
                <span style={{ fontSize: 12, color: '#9C9591', fontWeight: 400 }}>{piecesDe(n.id).length}</span>
                {aValider > 0 && <span style={{ fontSize: 12, color: COULEUR_IA, fontWeight: 600 }}>· {aValider} à valider</span>}
              </button>
            )
          })}
        </div>
        {!lectureSeule && niveau && !vueRelecture && (
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
      {niveau && vueRelecture && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <RelectureEdl
            affaireId={affaireId} niveau={niveau} pieces={piecesDe(niveau.id)} visite={visite} analyse={analyse}
            obtenirLiens={obtenirLiens} lectureSeule={lectureSeule} pieceId={pieceRelue} onOuvrirPiece={ouvrirPiece}
          />
        </div>
      )}
      {niveau && !vueRelecture && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <EditeurPieces
            key={niveau.id}
            niveau={niveau}
            pieces={piecesDe(niveau.id)}
            points={(visite.donnees?.points ?? []).filter((p) => p.niveau_id === niveau.id)}
            obtenirLiens={obtenirLiens}
            lectureSeule={lectureSeule}
            onModifier={edl.modifierPiece}
            onAjouter={edl.ajouterPiece}
            onSupprimer={edl.supprimerPiece}
            onAjouterPlusieurs={async (niveauIdCible, pieces) => { await enregistrerPieces(affaireId, niveauIdCible, pieces); edl.recharger() }}
            onRelecture={(relecture) => edl.enregistrerRelecture(niveau.id, relecture)}
          />
        </div>
      )}
      {exportOuvert && (
        <Suspense fallback={null}>
          <ExportEdl affaireId={affaireId} obtenirLiens={obtenirLiens} enAttente={visite.resume?.enAttente ?? 0} onFermer={() => setExportOuvert(false)} />
        </Suspense>
      )}
      {confirmer && <ConfirmerRemplacement perte={perte} enCours={suppression} onConfirmer={remplacer} onAnnuler={() => setConfirmer(false)} />}
      {fenetreImport}
    </div>
  )
}
