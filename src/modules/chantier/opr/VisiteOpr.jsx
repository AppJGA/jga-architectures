import { useState, useMemo } from 'react'
import {
  ArrowLeft, Users, Send, RotateCcw, Lock, Plus, Camera, MapPin, Pencil, MoreHorizontal,
  FileDown, Eye, Archive, Download, Mail, AlertTriangle, X, FileSignature,
} from 'lucide-react'
import { CrContexte } from '../comptes-rendus/CrContexte'
import { PhotosContexte, usePhotosRemarque } from '../comptes-rendus/usePhotosRemarque'
import { PhotosDeRemarque } from '../comptes-rendus/PhotosRemarque'
import { PlacementPlan } from '../comptes-rendus/PlacementPlan'
import { PanneauPresences, Panneau } from '../comptes-rendus/PanneauxVisite'
import { BoutonDictee } from '../comptes-rendus/BoutonDictee'
import { BoutonSupprimer } from '../comptes-rendus/BoutonSupprimer'
import { DiffusionDocument } from '../comptes-rendus/DiffusionCr'
import { texteEmailDocument, entreprisesDiffusion } from '../comptes-rendus/diffusionLogique'
import { telechargerBlob } from '../comptes-rendus/genererRapport'
import { lienArchive } from '../comptes-rendus/rapportStockage'
import { ajouterDictee, normaliserTexte } from '../comptes-rendus/visiteLogique'
import { formatOctets } from '../comptes-rendus/photosLogique'
import {
  TYPES_VISITE, STATUTS_RESERVE, groupesVisiteOpr, infosStatutReserve, reserveEnRetard, peutSupprimerReserve, libelleLot,
} from './oprLogique'
import { statutPourVisite, REGLAGES_OPR_DEFAUT } from './rapportOprLogique'
import { genererPdfOpr } from './genererRapportOpr'
import { PanneauReserve } from './PanneauReserve'
import { ProcesVerbaux } from './ProcesVerbaux'

// ─── Une visite OPR ou de levée ──────────────────────────────────────────────

const PAR_CODE = new Map(STATUTS_RESERVE.map(s => [s.code, s]))

const bouton = (fond = 'white', couleur = '#1F1B17') => ({
  minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
  border: fond === 'white' ? '1px solid rgba(0,0,0,0.15)' : 'none', background: fond, color: couleur,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
})

function jour(d, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', options) : ''
}

function messageErreur(err) {
  const brut = err?.message ?? String(err)
  if (/Failed to fetch|NetworkError/i.test(brut)) return 'Connexion au serveur impossible : vérifiez la connexion internet et réessayez.'
  return brut
}

function CarteReserve({ reserve, visite, lectureSeule, pastille, planNom, opr, onPanneau, onPlan, signalerErreur }) {
  const photos = usePhotosRemarque(reserve)
  const statutJour = statutPourVisite(reserve, visite)
  const statut = infosStatutReserve(reserve)
  const enRetard = reserveEnRetard(reserve, visite.date_visite)
  const revue = visite.type === 'levee' && !reserve.nouvelle
  const constat = reserve.constat

  const constater = (code) => opr.constater(reserve, visite, code, constat?.commentaire ?? null).catch(signalerErreur)

  return (
    <article id={`reserve-${reserve.id}`} style={{
      background: 'white', padding: '14px 16px', scrollMarginTop: 160,
      borderTop: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)',
      borderLeft: `4px solid ${statutJour.couleur}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#E8602C' }}>n°{reserve.numero}</span>
        {reserve.localisation && <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{reserve.localisation}</span>}
        {visite.type === 'levee' && reserve.nouvelle && <span style={{ fontSize: 12, color: '#E8602C' }}>Nouvelle</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: statutJour.couleur, background: `${statutJour.couleur}1A`, borderRadius: 3, padding: '3px 10px' }}>{statutJour.libelle}</span>
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.45, color: statut.close && !revue ? '#9CA3AF' : '#1F1B17', fontWeight: reserve.est_important ? 600 : 400 }}>
        {reserve.description}
      </p>
      {constat?.commentaire && (
        <p style={{ fontSize: 14, fontStyle: 'italic', color: '#5E5854', marginTop: 4 }}>« {constat.commentaire} »</p>
      )}
      {(reserve.date_limite || planNom) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, fontSize: 13, color: '#5E5854' }}>
          {reserve.date_limite && <span style={{ color: enRetard ? '#B8412C' : undefined, fontWeight: enRetard ? 600 : 400 }}>À lever avant le {jour(reserve.date_limite, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
          {enRetard && <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: '#B8412C', borderRadius: 3, padding: '2px 7px' }}>EN RETARD</span>}
          {planNom && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#6B4E9B' }}><MapPin size={13} /> {planNom}</span>}
        </div>
      )}
      <PhotosDeRemarque ctl={photos} />

      {!lectureSeule && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          {revue && (
            <div role="group" aria-label="Constat" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['levee', 'Levée'], ['ouverte', 'Non levée'], ['contestee', 'Contestée']].map(([code, libelle]) => {
                const actif = constat?.statut === code
                const couleur = code === 'ouverte' ? '#B8412C' : PAR_CODE.get(code).couleur
                return (
                  <button key={code} type="button" aria-pressed={actif} onClick={() => constater(code)}
                    style={{ ...bouton(actif ? couleur : 'white', actif ? 'white' : couleur), fontWeight: actif ? 600 : 500, minWidth: 96 }}>
                    {libelle}
                  </button>
                )
              })}
              <button type="button" aria-label="Autres actions" onClick={() => onPanneau({ type: 'constat', reserve })} style={{ ...bouton(), padding: '0 10px' }}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          )}
          <span style={{ flex: 1 }} />
          <label style={{ ...bouton(), cursor: 'pointer' }} title="Prendre une photo">
            <Camera size={17} /> Photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; photos.annoterNouvelle(f) }} />
          </label>
          <button type="button" onClick={onPlan} style={bouton('white', pastille ? '#6B4E9B' : '#1F1B17')}><MapPin size={17} /> Plan</button>
          {reserve.nouvelle && (
            <button type="button" onClick={() => onPanneau({ type: 'reserve', reserve })} aria-label="Modifier" style={{ ...bouton(), padding: '0 12px' }}><Pencil size={17} /></button>
          )}
        </div>
      )}
    </article>
  )
}

function PanneauConstat({ reserve, visite, opr, onFermer, signalerErreur }) {
  const constat = reserve.constat
  const [commentaire, setCommentaire] = useState(constat?.commentaire ?? '')
  const [occupe, setOccupe] = useState(false)
  const executer = async (fn) => {
    setOccupe(true)
    try { await fn(); onFermer() } catch (err) { signalerErreur(err) }
    setOccupe(false)
  }
  return (
    <Panneau titre={`Réserve n°${reserve.numero}`} onFermer={onFermer} occupe={occupe}>
      <p style={{ fontSize: 15 }}>{reserve.description}</p>
      <div>
        <label htmlFor="constat-commentaire" style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>Commentaire du constat</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea id="constat-commentaire" value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={3}
            placeholder="Reprise partielle, entreprise absente…"
            style={{ width: '100%', minHeight: 80, padding: '10px 12px', fontSize: 16, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <BoutonDictee onTexte={t => setCommentaire(c => ajouterDictee(c, t))} onErreur={m => signalerErreur(new Error(m))} />
        </div>
        <button type="button" disabled={occupe || !constat} onClick={() => executer(() => opr.constater(reserve, visite, constat.statut, normaliserTexte(commentaire) || null))}
          style={{ ...bouton('#2A8A4E', 'white'), marginTop: 8, opacity: !constat ? 0.5 : 1 }}>
          Enregistrer le commentaire
        </button>
        {!constat && <p style={{ fontSize: 12, color: '#9C9591', marginTop: 6 }}>Choisissez d’abord Levée, Non levée ou Contestée.</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={occupe} onClick={() => executer(() => opr.constater(reserve, visite, 'abandonnee', normaliserTexte(commentaire) || null))} style={bouton()}>
          Abandonner la réserve
        </button>
        {constat && (
          <button type="button" disabled={occupe} onClick={() => executer(() => opr.annulerConstat(constat))} style={bouton('white', '#B8412C')}>
            Annuler le constat du jour
          </button>
        )}
      </div>
    </Panneau>
  )
}

function DocumentVisite({ visite, affaire, opr, plansCr, lectureSeuleAffaire, signalerErreur, onArchiverMaintenant }) {
  const [reglages, setReglages] = useState(REGLAGES_OPR_DEFAUT)
  const [enCours, setEnCours] = useState(null)
  const archives = opr.archives.filter(a => a.visite_id === visite.id)
  const archiveEmission = archives.find(a => !a.destinataire)
  const lotsVisite = opr.lots.filter(l => (visite.lot_ids ?? []).length === 0 || visite.lot_ids.includes(l.id))
  const presences = opr.presences.filter(p => p.visite_id === visite.id)
  const type = TYPES_VISITE[visite.type]

  const fabriquer = (r = reglages) => genererPdfOpr({ visite, affaire, opr, plansCr, reglages: r })

  const executer = async (mode) => {
    const fenetre = mode === 'apercu' ? window.open('', '_blank') : null
    fenetre?.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#5E5854">Préparation du document…</p>')
    setEnCours(mode)
    try {
      const { blob, nomFichier } = await fabriquer()
      if (fenetre) fenetre.location.href = URL.createObjectURL(blob)
      else telechargerBlob(blob, nomFichier)
    } catch (err) { fenetre?.close(); signalerErreur(err) }
    setEnCours(null)
  }

  const ouvrirArchive = async (a) => {
    const fenetre = window.open('', '_blank')
    try {
      const url = await lienArchive(a.chemin)
      if (fenetre) fenetre.location.href = url
      else window.location.assign(url)
    } catch (err) { fenetre?.close(); signalerErreur(err) }
  }

  const preparerVersion = async (destinataire) => {
    const lotId = destinataire.slice(4)
    const emission = new Date(visite.date_emission ?? 0).getTime()
    const existante = archives.find(a => a.destinataire === destinataire && new Date(a.emis_le).getTime() === emission)
    if (existante) return existante
    const lot = opr.lots.find(l => l.id === lotId)
    const r = { ...REGLAGES_OPR_DEFAUT, lot: lotId }
    const { blob } = await fabriquer(r)
    return opr.archiver({ visite, blob, reglages: r, emisLe: visite.date_emission, destinataire, versionPour: lot ? libelleLot(lot) : null })
  }

  const choix = (valeur, options, onChange) => (
    <div style={{ display: 'inline-flex', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, overflow: 'hidden', flexWrap: 'wrap' }}>
      {options.map(([code, libelle]) => (
        <button key={code} type="button" aria-pressed={valeur === code} onClick={() => onChange(code)}
          style={{ padding: '8px 12px', fontSize: 13, border: 'none', cursor: 'pointer', background: valeur === code ? '#1F1B17' : 'white', color: valeur === code ? 'white' : '#374151' }}>
          {libelle}
        </button>
      ))}
    </div>
  )
  const carte = { background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 14 }

  return (
    <div style={{ maxWidth: 820 }}>
      {visite.statut === 'emis' && (
        <div style={carte}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, marginBottom: 8 }}><Archive size={15} color="#2A8A4E" /> Document archivé à l’émission</p>
          {archiveEmission ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ flex: 1 }}>Émis le {new Date(archiveEmission.emis_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · {formatOctets(archiveEmission.taille_octets)}</span>
              <button type="button" onClick={() => ouvrirArchive(archiveEmission)} style={bouton()}><Download size={15} /> Télécharger</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#B8412C' }}>Aucun document archivé pour cette émission.</span>
              {!lectureSeuleAffaire && <button type="button" onClick={onArchiverMaintenant} style={bouton()}>Archiver maintenant</button>}
            </div>
          )}
        </div>
      )}

      {visite.statut === 'emis' && archiveEmission && !lectureSeuleAffaire && (
        <div style={carte}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, marginBottom: 4 }}><Mail size={15} color="#E8602C" /> Diffuser</p>
          <p style={{ fontSize: 12, color: '#9C9591', marginBottom: 10 }}>L’e-mail s’ouvre dans votre messagerie avec un lien vers le PDF, valable 30 jours. Chaque entreprise peut recevoir la liste de ses seules réserves.</p>
          <DiffusionDocument
            cleDocument={visite.id} presences={presences}
            lots={opr.lots.filter(l => entreprisesDiffusion(presences, opr.lots).some(e => e.destinataire === `lot:${l.id}`))}
            archiveEmission={archiveEmission}
            texte={(o) => texteEmailDocument({
              intitule: visite.type === 'levee' ? 'Levée des réserves' : 'OPR',
              designation: visite.type === 'levee' ? 'le compte rendu de la visite de levée des réserves' : 'le compte rendu des opérations préalables à la réception',
              numero: visite.numero, date: visite.date_visite, affaire, ...o,
            })}
            preparerVersion={preparerVersion}
            chargerDiffusions={() => opr.diffusionsDeVisite(visite.id)}
            noter={(ligne) => opr.noterDiffusion({ visite_id: visite.id, ...ligne })}
          />
        </div>
      )}

      <div style={carte}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, marginBottom: 4 }}><FileSignature size={15} color="#1B3A5C" /> Procès-verbaux</p>
        <p style={{ fontSize: 12, color: '#9C9591', marginBottom: 10 }}>Remplis depuis la visite et ses réserves ; PDF archivé, à imprimer et signer à la main.</p>
        <ProcesVerbaux visite={visite} affaire={affaire} opr={opr} lectureSeuleAffaire={lectureSeuleAffaire} signalerErreur={signalerErreur} />
      </div>

      <div style={carte}>
        <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>PDF de la visite · {type.titre}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div><p style={{ fontSize: 11, color: '#9C9591', marginBottom: 6 }}>PHOTOS</p>{choix(reglages.photos, [['aucune', 'Aucune'], ['petites', 'Petites'], ['grandes', 'Grandes']], v => setReglages(r => ({ ...r, photos: v })))}</div>
          <div><p style={{ fontSize: 11, color: '#9C9591', marginBottom: 6 }}>PLANS</p>{choix(reglages.plans, [['aucun', 'Aucun'], ['extraits', 'Extraits'], ['planches', 'Plans entiers'], ['les_deux', 'Les deux']], v => setReglages(r => ({ ...r, plans: v })))}</div>
          <label style={{ fontSize: 11, color: '#9C9591' }}>
            <span style={{ display: 'block', marginBottom: 6 }}>VERSION</span>
            <select value={reglages.lot} onChange={e => setReglages(r => ({ ...r, lot: e.target.value }))} style={{ minHeight: 40, padding: '0 8px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white' }}>
              <option value="">Tous les lots</option>
              {lotsVisite.map(l => <option key={l.id} value={l.id}>{libelleLot(l)}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" disabled={!!enCours} onClick={() => executer('telecharger')} style={{ ...bouton('#E8602C', 'white'), opacity: enCours ? 0.6 : 1 }}>
            <FileDown size={16} /> {enCours === 'telecharger' ? 'Préparation…' : 'Télécharger le PDF'}
          </button>
          <button type="button" disabled={!!enCours} onClick={() => executer('apercu')} style={{ ...bouton(), opacity: enCours ? 0.6 : 1 }}>
            <Eye size={16} /> {enCours === 'apercu' ? 'Préparation…' : 'Aperçu'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function VisiteOpr({ visite, affaire, opr, plansCr, lectureSeuleAffaire, onRetour }) {
  const [onglet, setOnglet] = useState('reserves')
  const [panneau, setPanneau] = useState(null)
  const [placement, setPlacement] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [observations, setObservations] = useState(visite.observations ?? '')
  const lectureSeule = lectureSeuleAffaire || visite.statut === 'emis'
  const type = TYPES_VISITE[visite.type]

  const signalerErreur = (err) => { console.error(err); setErreur(messageErreur(err)) }
  const groupes = useMemo(() => groupesVisiteOpr({ visite, visites: opr.visites, reserves: opr.reserves, constats: opr.constats, lots: opr.lots }), [visite, opr.visites, opr.reserves, opr.constats, opr.lots])
  const reservesVisite = groupes.flatMap(g => g.reserves)
  const lotsVisite = opr.lots.filter(l => (visite.lot_ids ?? []).length === 0 || visite.lot_ids.includes(l.id))
  const localisations = [...new Set(opr.reserves.map(r => r.localisation).filter(Boolean))].sort()
  const presences = opr.presences.filter(p => p.visite_id === visite.id)
  const aRevoir = visite.type === 'levee' ? reservesVisite.filter(r => !r.nouvelle && !r.constat).length : 0

  const contextePhotos = useMemo(() => ({
    photos: opr.photos.map(p => ({ ...p, remarque_id: p.reserve_id })),
    liens: opr.liens, espacePlein: false, liensPhotos: opr.obtenirLiens,
    ajouterPhotos: (id, c) => opr.ajouterPhotos(id, c, visite.id).catch(e => { signalerErreur(e); throw e }),
    remplacerPhoto: (p, c) => opr.remplacerPhoto(p, c).catch(e => { signalerErreur(e); throw e }),
    modifierLegendePhoto: (id, l) => opr.modifierLegendePhoto(id, l).catch(e => { signalerErreur(e); throw e }),
    supprimerPhoto: (p) => opr.supprimerPhoto(p).catch(e => { signalerErreur(e); throw e }),
  }), [opr, visite.id])

  const emettre = async () => {
    const emisLe = new Date().toISOString()
    let pdf = null
    let echec = null
    try { pdf = await genererPdfOpr({ visite: { ...visite, statut: 'emis', date_emission: emisLe }, affaire, opr, plansCr, reglages: REGLAGES_OPR_DEFAUT }) } catch (e) { echec = e }
    await opr.emettreVisite(visite, emisLe)
    if (pdf) {
      try { await opr.archiver({ visite, blob: pdf.blob, reglages: REGLAGES_OPR_DEFAUT, emisLe }) } catch (e) { echec = e }
    }
    if (echec) signalerErreur(new Error(`La visite est émise, mais son PDF n’a pas été archivé (${messageErreur(echec)}). Utilisez « Archiver maintenant » dans l’onglet Document.`))
  }

  const archiverMaintenant = async () => {
    try {
      const { blob } = await genererPdfOpr({ visite, affaire, opr, plansCr, reglages: REGLAGES_OPR_DEFAUT })
      await opr.archiver({ visite, blob, reglages: REGLAGES_OPR_DEFAUT, emisLe: visite.date_emission ?? new Date().toISOString() })
    } catch (e) { signalerErreur(e) }
  }

  const confirmer = async () => {
    setErreur(null)
    try {
      if (confirmation === 'emettre') await emettre()
      else if (confirmation === 'rouvrir') await opr.rouvrirVisite(visite)
    } catch (e) { signalerErreur(e) }
    setConfirmation(null)
  }

  const reservePlacement = placement && reservesVisite.find(r => r.id === placement.id)

  return (
    <CrContexte.Provider value={{ lectureSeule, signalerErreur }}>
      <PhotosContexte.Provider value={contextePhotos}>
        <div style={{ paddingBottom: 80 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" onClick={onRetour} style={bouton()}><ArrowLeft size={16} /> Visites</button>
            <div style={{ flex: '1 1 240px' }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#1F1B17' }}>{type.libelle === 'OPR' ? 'OPR' : 'Levée des réserves'} n°{visite.numero}</p>
              <p style={{ fontSize: 13, color: '#9C9591' }}>{jour(visite.date_visite, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {lotsVisite.length} lot{lotsVisite.length > 1 ? 's' : ''}</p>
            </div>
            <button type="button" onClick={() => setPanneau({ type: 'presences' })} style={bouton()}><Users size={16} /> Présences</button>
            {!lectureSeuleAffaire && visite.statut !== 'emis' && <button type="button" onClick={() => setConfirmation('emettre')} style={bouton('#2A8A4E', 'white')}><Send size={16} /> Émettre</button>}
            {!lectureSeuleAffaire && visite.statut !== 'emis' && (
              <BoutonSupprimer libelle taille={14} onConfirm={() => opr.supprimerVisite(visite).then(onRetour).catch(signalerErreur)} style={{ minHeight: 44, padding: '0 12px', fontSize: 13 }} />
            )}
          </div>

          {erreur && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12, background: '#FBEAE6', color: '#7A2A1C', fontSize: 14, borderLeft: '3px solid #B8412C' }}>
              <AlertTriangle size={16} color="#B8412C" /><span style={{ flex: 1 }}><strong>Non enregistré.</strong> {erreur}</span>
              <button type="button" onClick={() => setErreur(null)} aria-label="Fermer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#B8412C' }}><X size={16} /></button>
            </div>
          )}
          {visite.statut === 'emis' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12, background: 'rgba(42,138,78,0.08)', borderLeft: '3px solid #2A8A4E', fontSize: 13, flexWrap: 'wrap' }}>
              <Lock size={14} color="#2A8A4E" />
              <span style={{ flex: 1 }}>Visite émise{visite.date_emission ? ` le ${new Date(visite.date_emission).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}` : ''} : elle n’est plus modifiable.</span>
              {!lectureSeuleAffaire && <button type="button" onClick={() => setConfirmation('rouvrir')} style={{ ...bouton(), minHeight: 36 }}><RotateCcw size={14} /> Rouvrir</button>}
            </div>
          )}

          <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 14 }}>
            {[['reserves', `Réserves (${reservesVisite.length})`], ['document', 'Document et diffusion']].map(([id, libelle]) => (
              <button key={id} type="button" onClick={() => setOnglet(id)} style={{ padding: '10px 16px', fontSize: 14, border: 'none', background: 'none', cursor: 'pointer', borderBottom: `2px solid ${onglet === id ? '#E8602C' : 'transparent'}`, fontWeight: onglet === id ? 600 : 400, color: onglet === id ? '#1F1B17' : '#9C9591' }}>
                {libelle}
              </button>
            ))}
            {aRevoir > 0 && onglet === 'reserves' && <span style={{ alignSelf: 'center', marginLeft: 'auto', fontSize: 13, color: '#B8412C', fontWeight: 600 }}>{aRevoir} à revoir</span>}
          </div>

          {onglet === 'reserves' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
              {groupes.length === 0 && (
                <p style={{ fontSize: 14, color: '#5E5854', padding: '24px 0' }}>
                  {visite.type === 'levee' ? 'Aucune réserve ouverte sur les lots de cette visite.' : 'Aucun lot concerné.'}
                </p>
              )}
              {groupes.map(g => (
                <section key={g.lotId ?? 'sans-lot'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <h3 style={{ flex: 1, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5E5854', margin: 0 }}>
                      {g.libelle} <span style={{ fontWeight: 400, color: '#9C9591' }}>· {g.reserves.length}</span>
                    </h3>
                    {!lectureSeule && <button type="button" onClick={() => setPanneau({ type: 'reserve', lotId: g.lotId })} style={{ ...bouton(), minHeight: 36, fontSize: 13 }}><Plus size={15} /> Réserve</button>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {g.reserves.length === 0 && <p style={{ fontSize: 13, color: '#9C9591', fontStyle: 'italic' }}>Aucune réserve pour ce lot.</p>}
                    {g.reserves.map(r => {
                      const pastille = opr.pastilles.find(p => p.reserve_id === r.id)
                      return (
                        <CarteReserve key={r.id} reserve={r} visite={visite} lectureSeule={lectureSeule} opr={opr}
                          pastille={pastille} planNom={pastille && plansCr.plans.find(p => p.id === pastille.plan_id)?.nom}
                          onPanneau={setPanneau} onPlan={() => setPlacement(r)} signalerErreur={signalerErreur} />
                      )
                    })}
                  </div>
                </section>
              ))}
              <div>
                <label htmlFor="opr-observations" style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>Observations générales</label>
                <textarea id="opr-observations" value={observations} disabled={lectureSeule} rows={3}
                  onChange={e => setObservations(e.target.value)}
                  onBlur={() => { if ((visite.observations ?? '') !== observations) opr.modifierVisite(visite.id, { observations: observations || null }).catch(signalerErreur) }}
                  placeholder="Conditions de la visite, points hors réserves…"
                  style={{ width: '100%', maxWidth: 900, padding: '10px 12px', fontSize: 15, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, boxSizing: 'border-box', fontFamily: 'inherit', background: lectureSeule ? '#FAF7F2' : 'white' }} />
              </div>
            </div>
          )}

          {onglet === 'document' && (
            <DocumentVisite visite={visite} affaire={affaire} opr={opr} plansCr={plansCr} lectureSeuleAffaire={lectureSeuleAffaire}
              signalerErreur={signalerErreur} onArchiverMaintenant={archiverMaintenant} />
          )}

          {onglet === 'reserves' && !lectureSeule && (
            <div style={{ position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'center', marginTop: 16, pointerEvents: 'none' }}>
              <button type="button" onClick={() => setPanneau({ type: 'reserve', lotId: lotsVisite[0]?.id })}
                style={{ ...bouton('#2A8A4E', 'white'), pointerEvents: 'auto', minHeight: 56, padding: '0 32px', fontSize: 17, fontWeight: 600, borderRadius: 28, boxShadow: '0 10px 24px -10px rgba(42,138,78,0.8)', width: '100%', maxWidth: 420 }}>
                <Plus size={22} /> Nouvelle réserve
              </button>
            </div>
          )}
        </div>

        {panneau?.type === 'reserve' && (
          <PanneauReserve
            reserve={panneau.reserve ?? null} lotParDefaut={panneau.lotId} lots={lotsVisite.length ? lotsVisite : opr.lots}
            localisations={localisations} dateVisite={visite.date_visite}
            peutSupprimer={panneau.reserve ? peutSupprimerReserve(panneau.reserve, opr.constats) : false}
            onEnregistrer={async (champs, compressions) => {
              try {
                if (panneau.reserve) await opr.modifierReserve(panneau.reserve.id, champs)
                else {
                  const id = await opr.ajouterReserve(visite, champs)
                  if (compressions.length) await opr.ajouterPhotos(id, compressions, visite.id)
                }
              } catch (e) { signalerErreur(e); throw e }
            }}
            onSupprimer={() => opr.supprimerReserve(panneau.reserve).catch(e => { signalerErreur(e); throw e })}
            onFermer={() => setPanneau(null)} signalerErreur={signalerErreur}
          />
        )}
        {panneau?.type === 'constat' && (
          <PanneauConstat reserve={reservesVisite.find(r => r.id === panneau.reserve.id) ?? panneau.reserve} visite={visite} opr={opr} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur} />
        )}
        {panneau?.type === 'presences' && (
          <PanneauPresences presences={presences} setPresence={opr.setPresence} lectureSeule={lectureSeule} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur} />
        )}
        {reservePlacement && (
          <PlacementPlan
            remarque={reservePlacement} remarques={reservesVisite}
            plans={plansCr.plans} versions={plansCr.versions}
            pastilles={opr.pastilles.map(p => ({ ...p, remarque_id: p.reserve_id }))}
            obtenirLiens={plansCr.obtenirLiens}
            couleurDe={(r) => infosStatutReserve(r).couleur}
            onPoser={(id, pos) => opr.placerPastille(id, pos).catch(e => { signalerErreur(e); throw e })}
            onRetirer={(id) => opr.retirerPastille(id).catch(e => { signalerErreur(e); throw e })}
            onFermer={() => setPlacement(null)}
          />
        )}
        {confirmation && (
          <div onClick={() => setConfirmation(null)} style={{ position: 'fixed', inset: 0, zIndex: 330, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: 'white', padding: '22px 26px', maxWidth: 460, width: '100%' }}>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{confirmation === 'emettre' ? `Émettre la visite n°${visite.numero} ?` : `Rouvrir la visite n°${visite.numero} ?`}</p>
              <p style={{ fontSize: 14, color: '#5E5854', lineHeight: 1.5, marginBottom: 20 }}>
                {confirmation === 'emettre'
                  ? `Le PDF est archivé et la visite verrouillée : constats, photos et présences ne sont plus modifiables.${aRevoir ? ` ${aRevoir} réserve${aRevoir > 1 ? 's n’ont' : ' n’a'} pas été revue${aRevoir > 1 ? 's' : ''}.` : ''}`
                  : 'Elle redevient modifiable. Pensez à l’émettre de nouveau après correction.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setConfirmation(null)} style={bouton()}>Annuler</button>
                <ConfirmerBouton confirmation={confirmation} onConfirmer={confirmer} />
              </div>
            </div>
          </div>
        )}
      </PhotosContexte.Provider>
    </CrContexte.Provider>
  )
}

function ConfirmerBouton({ confirmation, onConfirmer }) {
  const [occupe, setOccupe] = useState(false)
  return (
    <button type="button" disabled={occupe} onClick={async () => { setOccupe(true); await onConfirmer(); setOccupe(false) }}
      style={{ ...bouton(confirmation === 'emettre' ? '#2A8A4E' : '#E8602C', 'white'), opacity: occupe ? 0.6 : 1 }}>
      {occupe ? 'Patientez…' : confirmation === 'emettre' ? 'Émettre' : 'Rouvrir'}
    </button>
  )
}

