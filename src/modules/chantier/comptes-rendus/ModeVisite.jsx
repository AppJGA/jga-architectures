import { useState, useEffect, useRef, useContext } from 'react'
import { Users, Search, Plus, Camera, MapPin, MessageSquare, Pencil, MoreHorizontal, WifiOff, AlertTriangle, X, LogOut, Lock, FilePen, TrendingUp, RefreshCw } from 'lucide-react'
import { FILTRES_VISITE, filtreVisite, groupesVisite, compteursVisite } from './visiteLogique'
import { STATUTS, infosStatut, estEnRetard, libelleZone, peutModifierRemarque, auteurExterieur } from './crLogique'
import { useCr } from './CrContexte'
import { PanneauRemarque, PanneauSuivi, PanneauPresences, PanneauStatuts, PanneauAvancement } from './PanneauxVisite'
import { usePhotosRemarque, PhotosContexte } from './usePhotosRemarque'
import { PhotosDeRemarque } from './PhotosRemarque'
import { usePlansCr } from './PlansContexte'
import { ftmDeRemarque, resumeFtm } from '../ftm/lienFtm'
import { useRemarquesTypes } from './useRemarquesTypes'

// ─── Mode Visite ─────────────────────────────────────────────────────────────
//
// Écran plein pour mener la visite sur la tablette : cartes de remarques aux
// boutons larges, statut en un appui, photo, plan, suivi, et ajout de remarque
// en bas d'écran. L'éditeur de bureau reste l'écran de rédaction complet.

const PAR_CODE = new Map(STATUTS.map(st => [st.code, st]))
const RAPIDES = ['a_faire', 'en_cours', 'fait']

function fmtJour(d, options = { day: '2-digit', month: '2-digit' }) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', options) : ''
}

const bouton = (fond = 'white', couleur = '#1F1B17', bordure = 'rgba(0,0,0,0.15)') => ({
  minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
  border: fond === 'white' ? `1px solid ${bordure}` : 'none', background: fond, color: couleur,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
})

// Garde l'écran allumé tant que la visite est ouverte (Safari 16.4+, Chrome).
// Le verrou tombe quand l'onglet passe en arrière-plan : on le redemande au retour.
function useEcranAllume() {
  useEffect(() => {
    let verrou = null
    let fini = false
    const demander = async () => {
      if (fini || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
      try { verrou = await navigator.wakeLock.request('screen') } catch { /* refusé : batterie faible, etc. */ }
    }
    demander()
    document.addEventListener('visibilitychange', demander)
    return () => {
      fini = true
      document.removeEventListener('visibilitychange', demander)
      verrou?.release().catch(() => {})
    }
  }, [])
}

function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => navigator.onLine)
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    return () => { window.removeEventListener('online', maj); window.removeEventListener('offline', maj) }
  }, [])
  return enLigne
}

function libelleDestinataire(rem, lots, interlocuteurs) {
  if (rem.lot_id) {
    const l = lots.find(x => x.id === rem.lot_id)
    if (l) return l.numero ? `Lot ${l.numero} — ${l.nom}` : l.nom
  }
  if (rem.interlocuteur_id) {
    const i = interlocuteurs.find(x => x.id === rem.interlocuteur_id)
    if (i) return [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation
  }
  return rem.copie_destinataire ?? null
}

function CarteRemarque({ rem, cr, lots, interlocuteurs, zones, ftms, creerFtm, ouvrirFtm, lectureSeule: lectureSeuleCr, surbrillance, ops, onPanneau }) {
  // Un intervenant extérieur ne touche qu'à ses propres observations
  const acces = useCr()
  const lectureSeule = lectureSeuleCr || !peutModifierRemarque(rem, acces)
  const signature = auteurExterieur(rem, acces.profils)
  const photos = usePhotosRemarque(rem)
  const plansCr = usePlansCr()
  const statut = infosStatut(rem)
  const enRetard = estEnRetard(rem, cr.date_reunion)
  const destinataire = libelleDestinataire(rem, lots, interlocuteurs)
  const zoneLibelle = libelleZone(rem, zones)
  const ftm = ftmDeRemarque(ftms, rem)
  const pastille = plansCr.pastilles.find(p => p.remarque_id === rem.id)
  const planNom = pastille && plansCr.plans.find(p => p.id === pastille.plan_id)?.nom
  const suivis = rem.sous_remarques ?? []

  const changerStatut = (code) => ops.updateRemarque(rem.id, { statut: code, est_clos: PAR_CODE.get(code).clos }).catch(() => {})

  return (
    <article
      id={`visite-remarque-${rem.id}`}
      style={{
        background: 'white', padding: '14px 16px', scrollMarginTop: 180,
        borderTop: `1px solid ${surbrillance ? '#E8602C' : 'rgba(0,0,0,0.08)'}`,
        borderRight: `1px solid ${surbrillance ? '#E8602C' : 'rgba(0,0,0,0.08)'}`,
        borderBottom: `1px solid ${surbrillance ? '#E8602C' : 'rgba(0,0,0,0.08)'}`,
        borderLeft: `4px solid ${statut.couleur}`,
        boxShadow: surbrillance ? '0 0 0 3px rgba(232,96,44,0.2)' : 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {rem.numero != null
          ? <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#E8602C' }}>n°{rem.numero}</span>
          : <span title="Le numéro est attribué à l’envoi" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#9C9591' }}>n° en attente</span>}
        {rem.sousSection && <span style={{ fontSize: 12, color: '#9C9591' }}>{rem.sousSection.code} {rem.sousSection.titre}</span>}
        {destinataire && <span style={{ fontSize: 12, fontWeight: 500, color: '#2A8A4E', background: 'rgba(42,138,78,0.10)', borderRadius: 3, padding: '2px 8px' }}>{destinataire}</span>}
        {zoneLibelle && <span style={{ fontSize: 12, fontWeight: 500, color: '#1B3A5C', background: 'rgba(27,58,92,0.10)', borderRadius: 3, padding: '2px 8px' }}>{zoneLibelle}</span>}
        {signature && <span style={{ fontSize: 12, fontWeight: 500, color: '#6B4E9B', background: 'rgba(107,78,155,0.10)', borderRadius: 3, padding: '2px 8px' }}>{signature}</span>}
        {ftm && (
          <button type="button" onClick={() => ouvrirFtm(ftm)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, borderRadius: 3, padding: '2px 8px', color: resumeFtm(ftm).couleur, background: resumeFtm(ftm).fond }}>
            <FilePen size={12} /> {resumeFtm(ftm).texte}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {rem.est_nouveau && <span style={{ fontSize: 12, color: '#E8602C' }}>▶ Nouvelle</span>}
        <span style={{ fontSize: 12, fontWeight: 600, color: statut.couleur, background: statut.fond, borderRadius: 3, padding: '3px 10px' }}>{statut.libelle}</span>
      </div>

      <p style={{
        fontSize: 16, lineHeight: 1.45, color: statut.clos ? '#9CA3AF' : '#1F1B17',
        textDecoration: statut.clos ? 'line-through' : 'none', fontWeight: rem.est_important ? 600 : 400,
      }}>
        {rem.description}
      </p>

      {(rem.pour || rem.date_echeance || (statut.clos && rem.date_cloture) || suivis.length > 0 || planNom) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 13, color: '#5E5854' }}>
          {rem.pour && <span style={{ color: '#E8602C', fontWeight: 500 }}>{rem.pour}</span>}
          {rem.date_echeance && <span style={{ color: enRetard ? '#B8412C' : undefined, fontWeight: enRetard ? 600 : 400 }}>Pour le {fmtJour(rem.date_echeance)}</span>}
          {enRetard && <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: '#B8412C', borderRadius: 3, padding: '2px 7px' }}>EN RETARD</span>}
          {statut.clos && rem.date_cloture && <span style={{ color: '#2A8A4E' }}>{statut.libelle} le {fmtJour(rem.date_cloture)}</span>}
          {planNom && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#6B4E9B' }}><MapPin size={13} /> {planNom}</span>}
          {suivis.length > 0 && <span>{suivis.length} suivi{suivis.length > 1 ? 's' : ''}</span>}
        </div>
      )}

      <PhotosDeRemarque ctl={photos} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        {!lectureSeule && (
          <div role="group" aria-label="Statut" style={{ display: 'flex', gap: 6 }}>
            {RAPIDES.map(code => {
              const st = PAR_CODE.get(code)
              const actif = statut.code === code
              return (
                <button key={code} type="button" aria-pressed={actif} onClick={() => changerStatut(code)}
                  style={{ ...bouton(actif ? st.couleur : 'white', actif ? 'white' : st.couleur), fontWeight: actif ? 600 : 500, minWidth: 88 }}>
                  {st.libelle}
                </button>
              )
            })}
            <button type="button" aria-label="Autres statuts" onClick={() => onPanneau({ type: 'statuts', remarque: rem })}
              style={{ ...bouton(RAPIDES.includes(statut.code) ? 'white' : statut.couleur, RAPIDES.includes(statut.code) ? '#5E5854' : 'white'), minWidth: 44, padding: '0 10px' }}>
              <MoreHorizontal size={18} />
            </button>
          </div>
        )}
        <span style={{ flex: 1 }} />
        {!lectureSeule && (
          <label style={{ ...bouton(), cursor: 'pointer' }} title="Prendre une photo">
            <Camera size={17} /> Photo
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; photos.annoterNouvelle(f) }} />
          </label>
        )}
        {plansCr.disponible && (!lectureSeule || pastille) && (
          <button type="button" onClick={() => plansCr.ouvrirPlacement(rem)} style={bouton('white', pastille ? '#6B4E9B' : '#1F1B17')}>
            <MapPin size={17} /> Plan
          </button>
        )}
        {(!lectureSeule || suivis.length > 0) && (
          <button type="button" onClick={() => onPanneau({ type: 'suivi', remarque: rem })} style={bouton()}>
            <MessageSquare size={17} /> Suivi{suivis.length > 0 ? ` (${suivis.length})` : ''}
          </button>
        )}
        {!lectureSeule && creerFtm && !ftm && (
          <button type="button" onClick={() => creerFtm(rem)} title="Créer une fiche de travaux modificatifs" style={bouton()}>
            <FilePen size={17} /> FTM
          </button>
        )}
        {!lectureSeule && (
          <button type="button" onClick={() => onPanneau({ type: 'modifier', remarque: rem })} aria-label="Modifier" style={{ ...bouton(), padding: '0 12px' }}>
            <Pencil size={17} />
          </button>
        )}
      </div>
    </article>
  )
}

// Bandeau d'état : réseau, modifications en attente, envoi en cours. C'est le
// seul endroit où l'on parle de synchronisation — le reste de l'écran ne
// change pas selon le réseau.
function BandeauSynchro({ enLigne, horsLigne }) {
  const [detail, setDetail] = useState(false)
  if (!horsLigne) return null
  const { resume, envoiEnCours, envoyerFile, file, rejouer, abandonner } = horsLigne
  const enAttente = resume.total > 0
  if (enLigne && !enAttente) return null
  const refusees = file.filter(o => (o.essais ?? 0) >= 3)

  const fond = enLigne ? '#1B3A5C' : '#1F1B17'
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: fond, color: 'white', fontSize: 14, flexWrap: 'wrap' }}>
      {enLigne ? <RefreshCw size={16} /> : <WifiOff size={16} />}
      <span style={{ flex: 1, minWidth: 220 }}>
        {enLigne
          ? (envoiEnCours ? `Envoi en cours… ${resume.libelle}` : resume.libelle)
          : `Hors connexion : tout est gardé sur l’appareil${enAttente ? ` — ${resume.libelle.toLowerCase()}` : ''}.`}
      </span>
      {resume.alertePhotos && (
        <span style={{ fontSize: 13, background: 'rgba(255,255,255,0.18)', borderRadius: 3, padding: '2px 8px' }}>
          Beaucoup de photos en attente : revenez au réseau dès que possible.
        </span>
      )}
      {resume.echecs > 0 && (
        <button type="button" onClick={() => setDetail(d => !d)} aria-expanded={detail}
          style={{ minHeight: 44, fontSize: 13, background: '#B8412C', color: 'white', border: 'none', borderRadius: 3, padding: '0 10px', cursor: 'pointer' }}>
          {resume.echecs} refusée{resume.echecs > 1 ? 's' : ''} par la base — voir
        </button>
      )}
      {enLigne && enAttente && !envoiEnCours && (
        <button type="button" onClick={() => envoyerFile()} style={{ minHeight: 44, padding: '0 14px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.4)', background: 'none', color: 'white', fontSize: 14, cursor: 'pointer' }}>
          Envoyer maintenant
        </button>
      )}

      {detail && refusees.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {refusees.map(o => (
            <li key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(255,255,255,0.10)', padding: '8px 10px', borderRadius: 3 }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                {LIBELLE_OPERATION[o.type] ?? o.type} — {o.erreur ?? 'refus de la base'}
              </span>
              <button type="button" onClick={() => rejouer(o.id)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.4)', background: 'none', color: 'white', fontSize: 13, cursor: 'pointer' }}>
                Réessayer
              </button>
              <button type="button" onClick={() => abandonner(o.id)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 3, border: 'none', background: 'rgba(0,0,0,0.25)', color: 'white', fontSize: 13, cursor: 'pointer' }}>
                Abandonner
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const LIBELLE_OPERATION = {
  'section.creer': 'Nouvelle section',
  'remarque.creer': 'Nouvelle remarque',
  'remarque.modifier': 'Modification d’une remarque',
  'suivi.creer': 'Suivi ajouté',
  'presence.definir': 'Présence',
  'photo.ajouter': 'Photo',
  'pastille.poser': 'Pastille sur un plan',
}

export function ModeVisite({ cr, sections, presences, setPresence, lotEntreprises, interlocuteurs, zones = [], ftms = [], creerFtm, ouvrirFtm, planning, modifierAvancementTache, horsLigne, ops, lectureSeule, erreur, onFermerErreur, signalerErreur, onTerminer }) {
  const [filtre, setFiltre] = useState('ouvertes')
  const [destinataire, setDestinataire] = useState('')
  const [zone, setZone] = useState('')
  const [recherche, setRecherche] = useState('')
  const [panneau, setPanneau] = useState(null)
  const [surbrillance, setSurbrillance] = useState(null)
  const champRecherche = useRef(null)
  const enLigne = useEnLigne()
  const { contributeur } = useCr()
  const typesAgence = useRemarquesTypes()
  const { ajouterPhotos } = useContext(PhotosContexte)
  useEcranAllume()

  const lots = (lotEntreprises ?? []).map(le => le.lots).filter(Boolean)
    .filter((l, i, a) => a.findIndex(x => x.id === l.id) === i)
  const groupes = groupesVisite(sections, filtreVisite(filtre, destinataire, recherche, zone), cr.date_reunion)
  const compteurs = compteursVisite(sections, cr.date_reunion)

  // La page derrière ne défile plus tant que la visite est ouverte
  useEffect(() => {
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = avant }
  }, [])

  // Raccourcis sur ordinateur : N nouvelle remarque, / recherche
  useEffect(() => {
    const touche = (e) => {
      if (panneau || e.metaKey || e.ctrlKey || e.altKey) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
      if ((e.key === 'n' || e.key === 'N') && !lectureSeule) { e.preventDefault(); setPanneau({ type: 'nouvelle' }) }
      if (e.key === '/') { e.preventDefault(); champRecherche.current?.focus() }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [panneau, lectureSeule])

  useEffect(() => {
    if (!surbrillance) return
    const t = setTimeout(() => setSurbrillance(null), 2500)
    return () => clearTimeout(t)
  }, [surbrillance])

  const montrer = (id) => {
    setSurbrillance(id)
    // La nouvelle carte peut être masquée par le filtre : on revient à « Toutes »
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`visite-remarque-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
  }

  const enregistrerRemarque = async (payload, { emplacement, compressions, commeType }) => {
    if (panneau.type === 'modifier') {
      await ops.updateRemarque(panneau.remarque.id, payload)
      montrer(panneau.remarque.id)
      return
    }
    let id
    if (contributeur) {
      // Ses observations vont dans la section dédiée (migration 052)
      const sectionId = await ops.sectionDesIntervenants()
      id = await ops.addSectionRemarque(sectionId, payload)
    } else if (!emplacement) {
      const sectionId = await ops.addSection({ numero_romain: 'I', titre: 'Observations générales', type_section: 'general' })
      id = await ops.addSectionRemarque(sectionId, payload)
    } else if (emplacement.sousSectionId) {
      id = await ops.addRemarque(emplacement.sousSectionId, { ...payload, section_id: emplacement.sectionId })
    } else {
      id = await ops.addSectionRemarque(emplacement.sectionId, payload)
    }
    if (compressions.length > 0) await ajouterPhotos(id, compressions).catch(() => {})
    if (commeType) await typesAgence.ajouter(payload.description).catch(signalerErreur)
    if (filtre !== 'toutes' && filtre !== 'ouvertes') setFiltre('toutes')
    setDestinataire('')
    setZone('')
    setRecherche('')
    montrer(id)
  }

  const jour = fmtJour(cr.date_reunion, { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLabel = jour.charAt(0).toUpperCase() + jour.slice(1)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#F5F1E9', display: 'flex', flexDirection: 'column' }}>
      {/* Bande sous la barre d'état de l'iPad (app installée) : même raison que dans AppShell */}
      <div style={{ height: 'env(safe-area-inset-top)', background: '#1F1B17', flexShrink: 0 }} />
      <header style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 600, color: '#1F1B17' }}>
              Visite · CR n°{cr.numero}
              {lectureSeule && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: '#5E5854' }}><Lock size={12} style={{ verticalAlign: -1 }} /> consultation</span>}
            </p>
            <p style={{ fontSize: 13, color: '#9C9591' }}>
              {dateLabel}
              {horsLigne?.prepareLe && (
                <span title="La visite s’ouvrira même sans réseau" style={{ marginLeft: 8, color: '#2A8A4E' }}>
                  · emportée à {new Date(horsLigne.prepareLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <span style={{ fontSize: 13, color: '#B8412C', fontWeight: 600 }}>{compteurs.aTraiter} à traiter</span>
          {compteurs.enRetard > 0 && <span style={{ fontSize: 13, color: 'white', background: '#B8412C', fontWeight: 600, borderRadius: 3, padding: '3px 8px' }}>{compteurs.enRetard} en retard</span>}
          <button type="button" onClick={() => setPanneau({ type: 'presences' })} style={bouton()}>
            <Users size={17} /> Présences
          </button>
          <button type="button" onClick={() => setPanneau({ type: 'avancement' })} style={bouton()}>
            <TrendingUp size={17} /> Avancement
          </button>
          <button type="button" onClick={onTerminer} style={bouton('#1F1B17', 'white')}>
            <LogOut size={17} /> Terminer
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', paddingBottom: 2 }}>
          {FILTRES_VISITE.map(f => (
            <button key={f.id} type="button" aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}
              style={{ ...bouton(filtre === f.id ? '#E8602C' : 'white', filtre === f.id ? 'white' : '#1F1B17'), borderRadius: 22, flexShrink: 0, fontWeight: filtre === f.id ? 600 : 400 }}>
              {f.libelle}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {zones.length > 0 && (
            <select value={zone} onChange={e => setZone(e.target.value)} aria-label="Zone"
              style={{ minHeight: 44, padding: '0 10px', fontSize: 15, borderRadius: 3, border: `1px solid ${zone ? '#1B3A5C' : 'rgba(0,0,0,0.15)'}`, background: 'white', flexShrink: 0, maxWidth: 200 }}>
              <option value="">Toutes zones</option>
              <option value="sans-zone">Sans zone</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
            </select>
          )}
          {(lots.length > 0 || (interlocuteurs ?? []).length > 0) && (
            <select value={destinataire} onChange={e => setDestinataire(e.target.value)} aria-label="Destinataire"
              style={{ minHeight: 44, padding: '0 10px', fontSize: 15, borderRadius: 3, border: `1px solid ${destinataire ? '#E8602C' : 'rgba(0,0,0,0.15)'}`, background: 'white', flexShrink: 0, maxWidth: 220 }}>
              <option value="">Tous destinataires</option>
              {lots.map(l => <option key={l.id} value={`lot:${l.id}`}>{l.numero ? `Lot ${l.numero} — ${l.nom}` : l.nom}</option>)}
              {(interlocuteurs ?? []).map(i => <option key={i.id} value={`interlo:${i.id}`}>{[i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation}</option>)}
            </select>
          )}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={16} color="#9C9591" style={{ position: 'absolute', left: 12, top: 14, pointerEvents: 'none' }} />
            <input ref={champRecherche} type="search" value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher, n°…" aria-label="Rechercher une remarque"
              style={{ width: '100%', minHeight: 44, padding: '0 12px 0 36px', fontSize: 16, borderRadius: 3, border: '1px solid rgba(0,0,0,0.15)', boxSizing: 'border-box' }} />
          </div>
        </div>
      </header>

      <BandeauSynchro enLigne={enLigne} horsLigne={horsLigne} />
      {erreur && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#FBEAE6', color: '#7A2A1C', fontSize: 14, borderBottom: '1px solid rgba(184,65,44,0.3)' }}>
          <AlertTriangle size={16} color="#B8412C" />
          <span style={{ flex: 1 }}><strong>Non enregistré.</strong> {erreur}</span>
          <button type="button" onClick={onFermerErreur} aria-label="Fermer" style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', color: '#B8412C' }}><X size={18} /></button>
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 96px', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groupes.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: 15, color: '#5E5854', padding: '48px 0' }}>
              {compteurs.total === 0 ? 'Aucune remarque pour l’instant.' : 'Aucune remarque ne correspond à ce filtre.'}
            </p>
          )}
          {groupes.map(g => (
            <section key={g.section.id} aria-label={g.section.titre}>
              <h2 style={{ position: 'sticky', top: -12, zIndex: 2, background: '#F5F1E9', padding: '10px 0 8px', margin: 0, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5E5854' }}>
                <span style={{ color: '#E8602C' }}>{g.section.numero_romain}</span> — {g.section.titre}
                <span style={{ fontWeight: 400, color: '#9C9591' }}> · {g.remarques.length}</span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.remarques.map(rem => (
                  <CarteRemarque
                    key={rem.id} rem={rem} cr={cr} lots={lots} interlocuteurs={interlocuteurs ?? []} zones={zones}
                    ftms={ftms} creerFtm={creerFtm} ouvrirFtm={ouvrirFtm}
                    lectureSeule={lectureSeule} surbrillance={surbrillance === rem.id} ops={ops}
                    onPanneau={setPanneau}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {!lectureSeule && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, rgba(245,241,233,0) 0%, #F5F1E9 40%)', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <button type="button" onClick={() => setPanneau({ type: 'nouvelle' })}
            style={{ ...bouton('#2A8A4E', 'white'), pointerEvents: 'auto', minHeight: 56, padding: '0 32px', fontSize: 17, fontWeight: 600, borderRadius: 28, boxShadow: '0 10px 24px -10px rgba(42,138,78,0.8)', width: '100%', maxWidth: 480 }}>
            <Plus size={22} /> Nouvelle remarque
          </button>
        </div>
      )}

      {(panneau?.type === 'nouvelle' || panneau?.type === 'modifier') && (
        <PanneauRemarque
          remarque={panneau.type === 'modifier' ? panneau.remarque : null}
          cr={cr} sections={sections} lots={lots} interlocuteurs={interlocuteurs ?? []} zones={zones}
          typesAgence={typesAgence}
          onEnregistrer={enregistrerRemarque}
          onFermer={() => setPanneau(null)}
          signalerErreur={signalerErreur}
        />
      )}
      {panneau?.type === 'suivi' && (
        <PanneauSuivi
          remarque={groupesVisite(sections, filtreVisite('toutes'), cr.date_reunion).flatMap(g => g.remarques).find(r => r.id === panneau.remarque.id) ?? panneau.remarque}
          cr={cr} lectureSeule={lectureSeule} ops={ops} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur}
        />
      )}
      {panneau?.type === 'avancement' && (
        <PanneauAvancement
          cr={cr} planning={planning} onModifierTache={modifierAvancementTache}
          lectureSeule={lectureSeule} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur}
        />
      )}

      {panneau?.type === 'presences' && (
        <PanneauPresences presences={presences} setPresence={setPresence} lectureSeule={lectureSeule} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur} />
      )}
      {panneau?.type === 'statuts' && (
        <PanneauStatuts remarque={panneau.remarque} onChoisir={code => ops.updateRemarque(panneau.remarque.id, { statut: code, est_clos: PAR_CODE.get(code).clos }).catch(() => {})} onFermer={() => setPanneau(null)} />
      )}
    </div>
  )
}
