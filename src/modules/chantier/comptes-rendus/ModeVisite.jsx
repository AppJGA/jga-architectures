import { useState, useEffect, useRef, useContext, useMemo } from 'react'
import { Search, Plus, Camera, MapPin, MessageSquare, Pencil, MoreHorizontal, WifiOff, AlertTriangle, X, LogOut, Lock, RefreshCw } from 'lucide-react'
import { IconeFtm, IconeAvancement, IconePresence } from '../../../shared/icones/IconesAffaire'
import { FILTRES_VISITE, filtreVisite, groupesVisite, compteursVisite } from './visiteLogique'
import { STATUTS, infosStatut, estEnRetard, libelleZone, peutModifierRemarque, auteurExterieur, miseEnForme, COULEUR_SURLIGNE } from './crLogique'
import { useCr } from './CrContexte'
import { Panneau, PanneauRemarque, PanneauSuite, PanneauPresences, PanneauStatuts, PanneauAvancement } from './PanneauxVisite'
import { piecesPourConsultation } from '../../etude/pieces-ecrites/piecesDonnees'
import { RecherchePieces } from '../../etude/pieces-ecrites/RecherchePieces'
import { libelleLot, nomInterlocuteur, numerosParties, champsDestinataire } from './remarquesLogique'
import { creerRemarqueAdressee, champsModification } from './rangerRemarque'
import { usePhotosRemarque, PhotosContexte } from './usePhotosRemarque'
import { PhotosDeRemarque } from './PhotosRemarque'
import { usePlansCr } from './PlansContexte'
import { ftmDeRemarque, resumeFtm } from '../ftm/lienFtm'
import { useAuth } from '../../../core/auth/useAuth'
import { useEnregistrementVisite } from './enregistrement/useEnregistrementVisite'
import { BoutonRobot } from './enregistrement/BoutonRobot'
import { PanneauEnregistrements } from './enregistrement/PanneauEnregistrements'
import { vocabulaireAffaire } from './enregistrement/transcriptionLogique'
import { propositionsAValider } from './enregistrement/analyseIaLogique'
import { proposerRemarques } from './enregistrement/propositions'
import { EtiquetteProposition, ExtraitProposition, BoutonsProposition, BandeauPropositions } from './enregistrement/Proposition'
import { styleProposition } from './enregistrement/styleProposition'
import { useGlisserRemarque } from './useGlisserRemarque'
import { PoigneeGlisser, BandeDepot } from './GlisserRemarque'
import { peutGlisser } from './glisserLogique'

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
    if (l) return libelleLot(l)
  }
  if (rem.interlocuteur_id) {
    const i = interlocuteurs.find(x => x.id === rem.interlocuteur_id)
    if (i) return nomInterlocuteur(i)
  }
  return rem.copie_destinataire ?? null
}

function CarteRemarque({ rem, cr, lots, interlocuteurs, zones, ftms, ouvrirFtm, lectureSeule: lectureSeuleCr, surbrillance, masquerDestinataire, ops, onPanneau, demarrerGlisser }) {
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
  // Proposée par l'IA (migration 058) : en surbrillance, à valider avant tout
  const proposee = !!rem.a_valider

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
        ...(proposee && !surbrillance ? styleProposition : {}),
      }}
    >
      {proposee && <div style={{ marginBottom: 8 }}><EtiquetteProposition /></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        {demarrerGlisser && !lectureSeule && <PoigneeGlisser rem={rem} demarrer={demarrerGlisser} />}
        {rem.numero != null
          ? <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#E8602C' }}>n°{rem.numero}</span>
          : <span title="Le numéro est attribué à l’envoi" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#9C9591' }}>n° en attente</span>}
        {rem.sousSection && <span style={{ fontSize: 12, color: '#9C9591' }}>{rem.sousSection.code} {rem.sousSection.titre}</span>}
        {destinataire && !masquerDestinataire && <span style={{ fontSize: 12, fontWeight: 500, color: '#2A8A4E', background: 'rgba(42,138,78,0.10)', borderRadius: 3, padding: '2px 8px' }}>{destinataire}</span>}
        {zoneLibelle && <span style={{ fontSize: 12, fontWeight: 500, color: '#1B3A5C', background: 'rgba(27,58,92,0.10)', borderRadius: 3, padding: '2px 8px' }}>{zoneLibelle}</span>}
        {signature && <span style={{ fontSize: 12, fontWeight: 500, color: '#6B4E9B', background: 'rgba(107,78,155,0.10)', borderRadius: 3, padding: '2px 8px' }}>{signature}</span>}
        {ftm && (
          <button type="button" onClick={() => ouvrirFtm(ftm)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, borderRadius: 3, padding: '2px 8px', color: resumeFtm(ftm).couleur, background: resumeFtm(ftm).fond }}>
            <IconeFtm size={16} /> {resumeFtm(ftm).texte}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {rem.est_nouveau && <span style={{ fontSize: 12, color: '#E8602C' }}>▶ Nouvelle</span>}
        <span style={{ fontSize: 12, fontWeight: 600, color: statut.couleur, background: statut.fond, borderRadius: 3, padding: '3px 10px' }}>{statut.libelle}</span>
      </div>

      {/* Toucher le texte ouvre « Ajouter une suite » : la sous-remarque
          s'écrit en un geste, sans chercher de bouton */}
      <p
        role={lectureSeuleCr && suivis.length === 0 ? undefined : 'button'}
        tabIndex={lectureSeuleCr && suivis.length === 0 ? undefined : 0}
        onClick={() => { if (!lectureSeuleCr || suivis.length > 0) onPanneau({ type: 'suivi', remarque: rem }) }}
        onKeyDown={e => { if (e.key === 'Enter' && (!lectureSeuleCr || suivis.length > 0)) onPanneau({ type: 'suivi', remarque: rem }) }}
        style={{
          fontSize: 16, lineHeight: 1.45, color: statut.clos ? '#9CA3AF' : '#1F1B17', margin: 0,
          textDecoration: statut.clos ? 'line-through' : 'none',
          fontWeight: miseEnForme(rem).gras ? 700 : 400, fontStyle: miseEnForme(rem).italique ? 'italic' : 'normal',
          background: miseEnForme(rem).surligne && !statut.clos ? COULEUR_SURLIGNE : 'transparent',
          cursor: lectureSeuleCr && suivis.length === 0 ? 'default' : 'pointer',
        }}>
        {rem.description}
      </p>
      {proposee && <ExtraitProposition rem={rem} />}
      {suivis.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {suivis.map(sr => {
            const st = infosStatut(sr)
            if (sr.a_valider) return (
              <li key={sr.id} id={`visite-remarque-${sr.id}`} style={{ ...styleProposition, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, scrollMarginTop: 180 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 14 }}>
                  <EtiquetteProposition petite />
                  <span style={{ color: '#9C9591', fontSize: 12 }}>▶ suite</span>
                  <span style={{ flex: 1, color: '#1F1B17' }}>{sr.description}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: st.couleur, whiteSpace: 'nowrap' }}>{st.libelle}{sr.ia_clore_origine ? ' · clôt la remarque' : ''}</span>
                </div>
                <ExtraitProposition rem={sr} petit />
                {!lectureSeule && <BoutonsProposition rem={sr} ops={ops} />}
              </li>
            )
            return (
              <li key={sr.id} onClick={() => onPanneau({ type: 'suivi', remarque: rem })}
                style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14, paddingLeft: 10, cursor: 'pointer' }}>
                <span style={{ color: '#9C9591', fontSize: 12, whiteSpace: 'nowrap' }}>▶ {fmtJour(sr.date_note)}</span>
                <span style={{ flex: 1, color: st.clos ? '#9CA3AF' : '#1F1B17', textDecoration: st.clos ? 'line-through' : 'none' }}>{sr.description}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: st.couleur, whiteSpace: 'nowrap' }}>{st.libelle}</span>
              </li>
            )
          })}
        </ul>
      )}

      {(rem.date_echeance || (statut.clos && rem.date_cloture) || planNom) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 13, color: '#5E5854' }}>
          {rem.date_echeance && <span style={{ color: enRetard ? '#B8412C' : undefined, fontWeight: enRetard ? 600 : 400 }}>Pour le {fmtJour(rem.date_echeance)}</span>}
          {enRetard && <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: '#B8412C', borderRadius: 3, padding: '2px 7px' }}>EN RETARD</span>}
          {statut.clos && rem.date_cloture && <span style={{ color: '#2A8A4E' }}>{statut.libelle} le {fmtJour(rem.date_cloture)}</span>}
          {planNom && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#6B4E9B' }}><MapPin size={13} /> {planNom}</span>}
        </div>
      )}

      <PhotosDeRemarque ctl={photos} />

      {proposee && !lectureSeule ? (
        <div style={{ marginTop: 12 }}>
          <BoutonsProposition rem={rem} ops={ops} onModifier={(r) => onPanneau({ type: 'modifier', remarque: r })} />
        </div>
      ) : (
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
        {(!lectureSeuleCr || suivis.length > 0) && (
          <button type="button" onClick={() => onPanneau({ type: 'suivi', remarque: rem })} style={bouton()}>
            <MessageSquare size={17} /> Suite{suivis.length > 0 ? ` (${suivis.length})` : ''}
          </button>
        )}
        {!lectureSeule && (
          <button type="button" onClick={() => onPanneau({ type: 'modifier', remarque: rem })} aria-label="Modifier" style={{ ...bouton(), padding: '0 12px' }}>
            <Pencil size={17} />
          </button>
        )}
      </div>
      )}
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
  'suivi.creer': 'Suite ajoutée',
  'presence.definir': 'Présence',
  'photo.ajouter': 'Photo',
  'pastille.poser': 'Pastille sur un plan',
}

export function ModeVisite({ cr, affaire = null, convocations = new Map(), sections, presences, setPresence, lots: lotsAffaire, interlocuteurs, zones = [], ftms = [], ouvrirFtm, planning, modifierAvancementTache, horsLigne, ops, lectureSeule, erreur, onFermerErreur, signalerErreur, onTerminer }) {
  const [filtre, setFiltre] = useState('ouvertes')
  const [destinataire, setDestinataire] = useState('')
  const [zone, setZone] = useState('')
  const [recherche, setRecherche] = useState('')
  const [panneau, setPanneau] = useState(null)
  const [surbrillance, setSurbrillance] = useState(null)
  const champRecherche = useRef(null)
  const enLigne = useEnLigne()
  const acces = useCr()
  const { contributeur } = acces
  const { ajouterPhotos } = useContext(PhotosContexte)
  useEcranAllume()
  const { estAgence } = useAuth()

  // Robot : enregistrer la réunion pendant qu'on note (agence seule)
  const vocabulaire = useMemo(
    () => vocabulaireAffaire({ lots: lotsAffaire ?? [], interlocuteurs: interlocuteurs ?? [], zones }),
    [lotsAffaire, interlocuteurs, zones],
  )
  const robot = useEnregistrementVisite({ crId: cr.id, affaireId: cr.affaire_id, vocabulaire, actif: estAgence })

  // Les CCTP de l'affaire, cherchables pendant la réunion : lus à l'ouverture
  // (et gardés sur l'appareil), ou, sans réseau, depuis la copie gardée
  const [pieces, setPieces] = useState(null)
  useEffect(() => {
    if (!estAgence) return undefined
    let annule = false
    piecesPourConsultation(cr.affaire_id)
      .then((d) => { if (!annule && d.disponible) setPieces(d) })
      .catch(() => {})
    return () => { annule = true }
  }, [cr.affaire_id, estAgence])
  const peutEnregistrer = robot.disponible && !lectureSeule && cr.statut !== 'emis'
  const aValider = propositionsAValider(sections)

  // Glisser une remarque vers un autre destinataire : comme une modification
  // du destinataire, donc partie VI ↔ VII si besoin, et hors ligne aussi
  const glisser = useGlisserRemarque({
    onDeposer: async (rem, cle) => {
      const champs = await champsModification(ops, sections, rem, cle, champsDestinataire(cle))
      await ops.updateRemarque(rem.id, champs).catch(() => {})
      setDestinataire('')
      montrer(rem.id)
    },
  })
  const typeDeSection = new Map(sections.map(s => [s.id, s.type_section]))
  const proposer = () => proposerRemarques({ cr, affaire, lots, interlocuteurs: interlocuteurs ?? [], zones, sections, ops })

  const lots = lotsAffaire ?? []
  const contexteDestinataires = { lots, interlocuteurs: interlocuteurs ?? [] }
  const groupes = groupesVisite(sections, filtreVisite(filtre, destinataire, recherche, zone), cr.date_reunion, contexteDestinataires)
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

  // Le destinataire range la remarque : un lot dans la partie VII, un
  // interlocuteur dans la partie VI (rangerRemarque.js)
  const enregistrerRemarque = async (payload, { destinataire: cle, compressions }) => {
    if (panneau.type === 'modifier') {
      const champs = contributeur ? payload : await champsModification(ops, sections, panneau.remarque, cle, payload)
      // Modifier une proposition de l'IA vaut validation
      await ops.updateRemarque(panneau.remarque.id, panneau.remarque.a_valider ? { ...champs, a_valider: false } : champs)
      montrer(panneau.remarque.id)
      return
    }
    let id
    if (contributeur) {
      // Ses observations vont dans la section dédiée (migration 052)
      const sectionId = await ops.sectionDesIntervenants()
      id = await ops.addSectionRemarque(sectionId, payload)
    } else {
      id = await creerRemarqueAdressee(ops, sections, cle, payload)
    }
    if (compressions.length > 0) await ajouterPhotos(id, compressions).catch(() => {})
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
              {horsLigne?.file?.some((o) => o.type === 'cr.creer') ? (
                <span title="Le numéro est confirmé à l’envoi : si une autre visite l’a pris entre-temps, celle-ci prend le suivant" style={{ marginLeft: 8, color: '#C2410C' }}>
                  · démarrée sans réseau, n° provisoire
                </span>
              ) : horsLigne?.prepareLe && (
                <span title="La visite s’ouvrira même sans réseau" style={{ marginLeft: 8, color: '#2A8A4E' }}>
                  · emportée à {new Date(horsLigne.prepareLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <span style={{ fontSize: 13, color: '#B8412C', fontWeight: 600 }}>{compteurs.aTraiter} à traiter</span>
          {compteurs.enRetard > 0 && <span style={{ fontSize: 13, color: 'white', background: '#B8412C', fontWeight: 600, borderRadius: 3, padding: '3px 8px' }}>{compteurs.enRetard} en retard</span>}
          {(peutEnregistrer || (robot.disponible && robot.etat !== 'pret')) && (
            <BoutonRobot robot={robot} onOuvrirPanneau={() => setPanneau({ type: 'enregistrements' })} />
          )}
          {pieces?.pieces.length > 0 && (
            <button type="button" onClick={() => setPanneau({ type: 'pieces' })} style={bouton()} title="Chercher dans les CCTP">
              <Search size={18} /> CCTP
            </button>
          )}
          <button type="button" onClick={() => setPanneau({ type: 'presences' })} style={bouton()}>
            <IconePresence size={22} /> Présences
          </button>
          <button type="button" onClick={() => setPanneau({ type: 'avancement' })} style={bouton()}>
            <IconeAvancement size={22} /> Avancement
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
              {lots.map(l => <option key={l.id} value={`lot:${l.id}`}>{libelleLot(l)}</option>)}
              {(interlocuteurs ?? []).map(i => <option key={i.id} value={`interlo:${i.id}`}>{nomInterlocuteur(i)}</option>)}
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
          <BandeauPropositions nombre={aValider.length} onSuivante={() => {
            // La suivante peut être cachée par un filtre : on les lève
            setFiltre('toutes'); setDestinataire(''); setZone(''); setRecherche('')
            montrer(aValider[0].id)
          }} />
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
              {(g.sousGroupes ?? [{ cle: 'tout', titre: null, destinataire: null, remarques: g.remarques }]).map(sg => (
                <div key={sg.cle} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: sg.titre ? 14 : 0 }}>
                  {sg.titre && (
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>
                      <span style={{ flex: 1 }}>{sg.titre} <span style={{ fontWeight: 400, color: '#9C9591' }}>· {sg.remarques.length}</span></span>
                      {!lectureSeule && !contributeur && sg.destinataire && (
                        <button type="button" onClick={() => setPanneau({ type: 'nouvelle', destinataire: sg.destinataire })}
                          aria-label={`Nouvelle remarque pour ${sg.titre}`} title={`Nouvelle remarque pour ${sg.titre}`}
                          style={{ ...bouton('white', '#2A8A4E', 'rgba(42,138,78,0.4)'), minWidth: 44, padding: '0 10px' }}>
                          <Plus size={18} />
                        </button>
                      )}
                    </h3>
                  )}
                  {sg.remarques.map(rem => (
                    <CarteRemarque
                      key={rem.id} rem={rem} cr={cr} lots={lots} interlocuteurs={interlocuteurs ?? []} zones={zones}
                      ftms={ftms} ouvrirFtm={ouvrirFtm}
                      lectureSeule={lectureSeule} surbrillance={surbrillance === rem.id} ops={ops}
                      masquerDestinataire={sg.cle.startsWith('lot:')}
                      onPanneau={setPanneau}
                      demarrerGlisser={!contributeur && peutGlisser(rem, { lectureSeule, sectionType: typeDeSection.get(rem.section_id) ?? null }) ? glisser.demarrer : null}
                    />
                  ))}
                </div>
              ))}
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

      <BandeDepot geste={glisser.geste} lots={lots} interlocuteurs={interlocuteurs ?? []} />

      {(panneau?.type === 'nouvelle' || panneau?.type === 'modifier') && (
        <PanneauRemarque
          remarque={panneau.type === 'modifier' ? panneau.remarque : null}
          cr={cr} lots={lots} interlocuteurs={interlocuteurs ?? []} zones={zones}
          destinataireInitial={panneau.destinataire ?? null}
          contributeur={contributeur}
          numeros={numerosParties(sections)}
          onEnregistrer={enregistrerRemarque}
          onFermer={() => setPanneau(null)}
          signalerErreur={signalerErreur}
        />
      )}
      {panneau?.type === 'suivi' && (
        <PanneauSuite
          remarque={groupesVisite(sections, filtreVisite('toutes'), cr.date_reunion).flatMap(g => g.remarques).find(r => r.id === panneau.remarque.id) ?? panneau.remarque}
          cr={cr} lectureSeule={lectureSeule} acces={acces} ops={ops}
          onModifier={rem => setPanneau({ type: 'modifier', remarque: rem })}
          onFermer={() => setPanneau(null)} signalerErreur={signalerErreur}
        />
      )}
      {panneau?.type === 'avancement' && (
        <PanneauAvancement
          cr={cr} planning={planning} onModifierTache={modifierAvancementTache}
          lectureSeule={lectureSeule} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur}
        />
      )}

      {panneau?.type === 'enregistrements' && (
        <PanneauEnregistrements
          robot={robot} peutEnregistrer={peutEnregistrer}
          crId={cr.id} affaireId={cr.affaire_id} vocabulaire={vocabulaire}
          version={robot.version} attente={robot.attente} erreur={robot.erreur}
          onTranscrire={robot.transcrire} lectureSeule={lectureSeule}
          onProposer={cr.statut !== 'emis' ? proposer : undefined}
          onFermer={() => setPanneau(null)}
        />
      )}
      {panneau?.type === 'pieces' && pieces && (
        <Panneau titre="Pièces écrites" onFermer={() => setPanneau(null)}>
          {pieces.horsLigne && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#92400E' }}>
              Sans réseau : copie gardée sur l’appareil{pieces.copieLe ? ` le ${new Date(pieces.copieLe).toLocaleDateString('fr-FR')}` : ''}.
            </p>
          )}
          <RecherchePieces pieces={pieces.pieces} articles={pieces.articles} grand autoFocus />
        </Panneau>
      )}
      {panneau?.type === 'presences' && (
        <PanneauPresences presences={presences} setPresence={setPresence} convocations={convocations} lectureSeule={lectureSeule} onFermer={() => setPanneau(null)} signalerErreur={signalerErreur} />
      )}
      {panneau?.type === 'statuts' && (
        <PanneauStatuts remarque={panneau.remarque} onChoisir={code => ops.updateRemarque(panneau.remarque.id, { statut: code, est_clos: PAR_CODE.get(code).clos }).catch(() => {})} onFermer={() => setPanneau(null)} />
      )}
    </div>
  )
}
