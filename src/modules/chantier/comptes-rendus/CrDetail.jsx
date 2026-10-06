import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ArrowRight, ChevronRight, Lock, RotateCcw, Pencil,
  AlertTriangle, X,
} from 'lucide-react'
import {
  IconeVisitesChantier, IconeTablette, IconeOrdinateur, IconeEmission, IconePlans, IconeRobot, IconeAvancement, IconePresence, IconeExportPdf, IconeGeneralites, IconeRemarques, IconeOrganisation,
} from '../../../shared/icones/IconesAffaire'
import { useEnregistrementsDisponibles } from './enregistrement/useEnregistrementVisite'
import { ListeEnregistrements } from './enregistrement/PanneauEnregistrements'
import { vocabulaireAffaire } from './enregistrement/transcriptionLogique'
import { propositionsAValider } from './enregistrement/analyseIaLogique'
import { proposerRemarques } from './enregistrement/propositions'
import { BandeauPropositions } from './enregistrement/Proposition'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRetourPage } from '../../../core/layout/retourContexte'
import { useConvocationsPrecedentes } from './useConvocationsPrecedentes'
import { useCompteRendu } from '../../../shared/hooks/useCompteRendu'
import { useAuth } from '../../../core/auth/useAuth'
import { useAffaireInterlocuteurs } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { supabase } from '../../../core/supabase/client'
import { CrPresences } from './CrPresences'
import { CrSectionEditor } from './CrSectionEditor'
import { ProchaineVisite } from './ProchaineVisite'
import { ModaleIdentiteVisite } from './ModaleIdentiteVisite'
import { useAffaireCollaborateurs } from '../../../shared/hooks/useAffaireCollaborateurs'
import { ExportRapport } from './ExportRapport'
import { lireReglagesRapport } from './rapportReglages'
import { genererPdfCr, libelleVersion } from './genererRapport'
import { archivesDuCr, archiverPdf, supprimerArchive } from './rapportStockage'
import { compterPresents, FAMILLES_STATUT, infosStatut, estEnRetard } from './crLogique'
import { CrContexte } from './CrContexte'
import { PhotosContexte } from './usePhotosRemarque'
import { ordonnerParties, numeroterParties } from './remarquesLogique'
import { GeneralitesVue } from './GeneralitesVue'
import { generalitesAImprimer, normaliserGeneralites } from './generalitesLogique'
import { useGeneralites } from '../../../shared/hooks/useGeneralites'
import { espaceUtilise } from './photosStockage'
import { niveauEspace } from './photosLogique'
import { PlansContexte } from './PlansContexte'
import { usePlans } from './usePlans'
import { PlansVue } from './PlansVue'
import { PlacementPlan } from './PlacementPlan'
import { ModeVisite } from './ModeVisite'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { ModaleEmission } from './ModaleEmission'
import { AvancementLots } from './AvancementLots'
import { garderImages } from './horsLigne/images'
import { erreurReseau } from './horsLigne/envoi'
import { avancementParLot, avancementGlobal, lignesAvancement } from './avancementLogique'

// ─── Vues disponibles ─────────────────────────────────────────────────────────

const VUES = [
  {
    id: 'organisation',
    label: 'Prochaine visite',
    description: 'Date de la prochaine réunion,\nconvocations',
    icon: IconeOrganisation,
    couleur: '#E8602C',
    fondClair: 'rgba(232,96,44,0.10)',
  },
  {
    id: 'presences',
    label: 'Gérer les présences',
    description: 'Pointage P/R/A/E, rappel des\nconvocations du CR précédent',
    icon: IconePresence,
    couleur: '#1B3A5C',
    fondClair: 'rgba(27,58,92,0.10)',
  },
  {
    id: 'generalites',
    label: 'Généralités',
    description: 'Parties I à V, communes\nà tous les CR de l’affaire',
    icon: IconeGeneralites,
    couleur: '#5E5854',
    fondClair: 'rgba(94,88,84,0.10)',
  },
  {
    id: 'remarques',
    label: 'Remarques',
    description: 'Sections, sous-sections\net points de suivi',
    icon: IconeRemarques,
    couleur: '#2A8A4E',
    fondClair: 'rgba(42,138,78,0.12)',
  },
  {
    id: 'plans',
    label: 'Plans',
    description: 'Plans de l’affaire\net pastilles',
    icon: IconePlans,
    couleur: '#6B4E9B',
    fondClair: 'rgba(107,78,155,0.10)',
  },
  {
    id: 'avancement',
    label: 'Avancement des lots',
    description: 'Lu dans le planning chantier,\nfigé à l’émission',
    icon: IconeAvancement,
    couleur: '#B8862C',
    fondClair: 'rgba(184,134,44,0.10)',
  },
  {
    id: 'enregistrements',
    label: 'Enregistrements de la réunion',
    description: 'Transcriptions du robot\net fichiers importés',
    icon: IconeRobot,
    couleur: '#B8412C',
    fondClair: 'rgba(184,65,44,0.10)',
  },
  {
    id: 'export',
    label: 'Exporter le CR',
    description: 'Générer le PDF\ndu compte rendu',
    icon: IconeExportPdf,
    couleur: '#9C9591',
    fondClair: '#FAF7F2',
  },
]

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(232,96,44,0.10)', borderTopColor: '#E8602C', animation: 'jga-spin 0.7s linear infinite' }} />
    </div>
  )
}

// ─── Page d'accueil du CR ─────────────────────────────────────────────────────

function remarquesDeSection(s) {
  return [
    ...(s.directRemarques ?? []),
    ...(s.sousSections ?? []).flatMap(ss => ss.remarques ?? []),
  ]
}

// Raccourci vers une autre vue du CR : ligne compacte, icône, chevron. Trois
// tuiles par rangée même sur un écran étroit (iPad en portrait) : le texte
// passe alors sous l'icône plutôt que de s'écraser à côté.
function TuileVue({ vue, titre, sousTitre, onClick }) {
  const [survol, setSurvol] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', alignContent: 'flex-start', flexWrap: 'wrap', gap: 12,
        background: 'white', padding: '14px 30px 14px 16px', cursor: 'pointer',
        border: `0.5px solid ${survol ? vue.couleur : 'rgba(0,0,0,0.08)'}`,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: vue.fondClair,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Les icônes de l'agence sont plus détaillées que celles de lucide : un cran plus grand */}
        <vue.icon size={32} color={vue.couleur} strokeWidth={1.25} />
      </div>
      <div style={{ flex: '1 1 110px', minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{titre}</p>
        <p style={{ fontSize: 11, color: '#9C9591', marginTop: 1 }}>{sousTitre}</p>
      </div>
      <ChevronRight size={14} color="#C9C4C0" strokeWidth={1.5} style={{ position: 'absolute', right: 12, top: '50%', marginTop: -7 }} />
    </div>
  )
}

function CrAccueil({ cr, affaire, presences, sections, onNavigate, onEmettre, onVisite, onModifier, peutModifier, nbPlans, nbPastilles, avancement, nbPartiesGeneralites, enregistrements }) {
  const [survolEditeur, setSurvolEditeur] = useState(false)
  const dateLabel = cr.date_reunion
    ? new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date non définie'

  const toutesRemarques = sections.flatMap(remarquesDeSection)
  const parFamille = FAMILLES_STATUT.map(f => ({
    ...f,
    total: toutesRemarques.filter(r => infosStatut(r).famille === f.id).length,
  }))
  const enRetard = toutesRemarques.filter(r => estEnRetard(r, cr.date_reunion)).length

  const convoques = presences.filter(p => p.convoque).length
  const redacteur = [cr.profiles?.prenom, cr.profiles?.nom].filter(Boolean).join(' ')
  const presents = compterPresents(presences)

  const vueOrga = VUES.find(v => v.id === 'organisation')
  const vuePresences = VUES.find(v => v.id === 'presences')
  const vueExport = VUES.find(v => v.id === 'export')
  const vuePlans = VUES.find(v => v.id === 'plans')
  const vueAvancement = VUES.find(v => v.id === 'avancement')
  const vueGeneralites = VUES.find(v => v.id === 'generalites')
  const vueEnregistrements = VUES.find(v => v.id === 'enregistrements')

  return (
    <div>
      {/* En-tête du CR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
          {/* Hauteurs de ligne fixées : les chiffres vont du haut du titre au
              bas de la date */}
          <span aria-hidden="true" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 47, lineHeight: '40px', marginTop: 5, fontWeight: 600, color: '#E8602C', letterSpacing: '-0.03em', flexShrink: 0 }}>
            {String(cr.numero).padStart(2, '0')}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontFamily: "'Archivo', sans-serif", fontSize: 16, lineHeight: '20px', fontWeight: 500, color: '#1F1B17' }}>
                Réunion n°{cr.numero}
              </p>
              {onModifier && (
                <button
                  type="button" onClick={onModifier}
                  title="Modifier le numéro, la date et le rédacteur" aria-label="Modifier le numéro, la date et le rédacteur"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, minHeight: 0, borderRadius: 3, border: 'none', background: 'transparent', color: '#9C9591', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,96,44,0.10)'; e.currentTarget.style.color = '#E8602C' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9C9591' }}
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, lineHeight: '16px', color: '#9C9591', marginTop: 4 }}>
              {dateLabel}{affaire?.nom && ` · ${affaire.nom}`}
              {redacteur && ` · rédigé par ${redacteur}`}
            </p>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 500, borderRadius: 3, padding: '3px 10px',
          backgroundColor: cr.statut === 'emis' ? 'rgba(42,138,78,0.12)' : '#F3F4F6',
          color: cr.statut === 'emis' ? '#2A8A4E' : '#5E5854',
        }}>
          {cr.statut === 'emis' ? 'Émis' : 'Brouillon'}
        </span>
        <button
          onClick={onVisite}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', minHeight: 44, borderRadius: 3, fontSize: 13, fontWeight: 600,
            border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer',
            boxShadow: '0 6px 16px -8px rgba(232,96,44,0.8)',
          }}
        >
          <IconeTablette size={20} />
          Ouvrir la visite
        </button>
        {/* Émis : la réouverture se fait depuis le bandeau au-dessus */}
        {peutModifier && cr.statut !== 'emis' && (
          <button
            onClick={onEmettre}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 2, fontSize: 12, fontWeight: 500,
              border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white',
              color: '#1F1B17', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2A8A4E'; e.currentTarget.style.color = '#2A8A4E' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#1F1B17' }}
          >
            <IconeEmission size={20} /> Émettre le CR
          </button>
        )}
      </div>

      {/* Bloc principal : les remarques */}
      <div style={{
        background: 'white', padding: 24, marginBottom: 16,
        border: '0.5px solid rgba(42,138,78,0.35)',
        borderTop: '3px solid #2A8A4E',
        boxShadow: '0 14px 34px -22px rgba(31,27,23,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(42,138,78,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconeRemarques size={34} color="#2A8A4E" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ fontFamily: "'Archivo', sans-serif", fontSize: 18, fontWeight: 500, color: '#1F1B17' }}>
              Remarques
            </h3>
            <p style={{ fontSize: 12, color: '#9C9591', marginTop: 4 }}>
              {toutesRemarques.length === 0
                ? 'Aucune remarque pour l’instant'
                : `${toutesRemarques.length} remarque${toutesRemarques.length > 1 ? 's' : ''} réparties en ${sections.length} section${sections.length > 1 ? 's' : ''}`}
            </p>
          </div>
          {/* Même allure que la porte de l'éditeur dans la liste des visites :
              la visite (tablette) reste l'action mise en avant */}
          <button
            onClick={() => onNavigate('remarques')}
            onMouseEnter={() => setSurvolEditeur(true)}
            onMouseLeave={() => setSurvolEditeur(false)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
              minHeight: 44, padding: '0 18px', borderRadius: 3,
              border: `0.5px solid ${survolEditeur ? '#1F1B17' : 'rgba(0,0,0,0.15)'}`,
              background: 'white', color: '#1F1B17', fontSize: 14, cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
          >
            <IconeOrdinateur size={22} /> Éditeur des remarques
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: sections.length > 0 ? 20 : 0 }}>
          {parFamille.map(f => (
            <div key={f.id} style={{
              border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#C9C4C0' }}>
                {f.libelle}
              </span>
              <span style={{ fontSize: 22, fontWeight: 600, color: f.couleur }}>{f.total}</span>
            </div>
          ))}
          {enRetard > 0 && (
            <div style={{
              border: '0.5px solid rgba(184,65,44,0.45)', background: 'rgba(184,65,44,0.06)', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#B8412C' }}>
                En retard
              </span>
              <span style={{ fontSize: 22, fontWeight: 600, color: '#B8412C' }}>{enRetard}</span>
            </div>
          )}
        </div>

      </div>

      {/* Les autres vues, dans l'ordre du déroulé d'une visite. Toujours trois
          par rangée, à la demande de l'agence : ce sont les tuiles qui
          s'élargissent avec l'écran, pas leur disposition qui change. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <TuileVue
          vue={vuePresences}
          titre="Présences"
          sousTitre={presences.length === 0 ? 'Aucun participant' : `${presents} présent${presents > 1 ? 's' : ''} sur ${presences.length}`}
          onClick={() => onNavigate('presences')}
        />
        <TuileVue
          vue={vueAvancement}
          titre="Avancement"
          sousTitre={avancement ? `${avancement.realise}% réalisé · prévu ${avancement.prevu}%` : 'Planning non renseigné'}
          onClick={() => onNavigate('avancement')}
        />
        <TuileVue
          vue={vueOrga}
          titre="Prochaine visite"
          sousTitre={[
            cr.date_prochaine_reunion
              ? `${new Date(cr.date_prochaine_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${cr.heure_prochaine_reunion ? ` à ${cr.heure_prochaine_reunion.slice(0, 5).replace(':', 'h')}` : ''}`
              : 'Date à fixer',
            convoques > 0 ? `${convoques} convoqué${convoques > 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(' · ')}
          onClick={() => onNavigate('organisation')}
        />
        {enregistrements && (
          <TuileVue
            vue={vueEnregistrements}
            titre="Enregistrement"
            sousTitre="Transcriptions de la réunion"
            onClick={() => onNavigate('enregistrements')}
          />
        )}
        <TuileVue
          vue={vuePlans}
          titre="Plans"
          sousTitre={nbPlans === 0 ? 'Aucun plan' : `${nbPlans} plan${nbPlans > 1 ? 's' : ''} · ${nbPastilles} pastille${nbPastilles > 1 ? 's' : ''}`}
          onClick={() => onNavigate('plans')}
        />
        <TuileVue
          vue={vueGeneralites}
          titre="Généralités"
          sousTitre={nbPartiesGeneralites > 0 ? `Parties I à ${nbPartiesGeneralites > 5 ? 'V+' : ['I', 'II', 'III', 'IV', 'V'][nbPartiesGeneralites - 1]} · communes à l’affaire` : 'À remplir ou importer'}
          onClick={() => onNavigate('generalites')}
        />
      </div>

      {/* L'export à part : c'est l'aboutissement de la rédaction, pas une page parmi d'autres */}
      <BlocExport vue={vueExport} emis={cr.statut === 'emis'} onClick={() => onNavigate('export')} />
    </div>
  )
}

function BlocExport({ vue, emis, onClick }) {
  const [survol, setSurvol] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      marginTop: 28, padding: '18px 20px', background: 'white',
      border: '0.5px solid rgba(31,27,23,0.25)', borderLeft: '3px solid #1F1B17',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', flexShrink: 0, background: '#F3F1EE',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <vue.icon size={34} color="#1F1B17" strokeWidth={1.25} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h3 style={{ fontFamily: "'Archivo', sans-serif", fontSize: 17, fontWeight: 500, color: '#1F1B17' }}>
          Exporter le PDF
        </h3>
        <p style={{ fontSize: 12, color: '#9C9591', marginTop: 3 }}>
          {emis ? 'Le compte rendu émis : aperçu, téléchargement, archives' : 'Possible une fois le compte rendu émis — réglages du PDF dès maintenant'}
        </p>
      </div>
      <button
        onClick={onClick}
        onMouseEnter={() => setSurvol(true)}
        onMouseLeave={() => setSurvol(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '10px 20px', minHeight: 44, borderRadius: 2, border: 'none',
          backgroundColor: survol ? '#000' : '#1F1B17', color: 'white',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Exporter <ArrowRight size={15} strokeWidth={1.8} />
      </button>
    </div>
  )
}

// ─── CrDetail principal ───────────────────────────────────────────────────────

// Fait défiler jusqu'à une section de l'éditeur. L'ancre n'existe qu'une fois
// l'éditeur monté : on laisse passer une frame, et on réessaie deux fois si le
// rendu a pris plus longtemps.
function defilerVers(idAncre, essais = 2, block = 'start') {
  requestAnimationFrame(() => {
    const cible = document.getElementById(idAncre)
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block })
    else if (essais > 0) defilerVers(idAncre, essais - 1, block)
  })
}

// ─── Bandeaux ─────────────────────────────────────────────────────────────────

function fmtDateHeure(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function BandeauEmis({ cr, peutModifier, onRouvrir }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'rgba(42,138,78,0.08)', border: '0.5px solid rgba(42,138,78,0.35)',
      borderLeft: '3px solid #2A8A4E', padding: '10px 14px', marginBottom: 16,
      fontSize: 12, color: '#1F1B17',
    }}>
      <Lock size={14} color="#2A8A4E" strokeWidth={1.8} />
      <span style={{ flex: 1, minWidth: 200 }}>
        Compte rendu émis{cr.date_emission ? ` le ${fmtDateHeure(cr.date_emission)}` : ''} : il n’est plus modifiable.
      </span>
      {peutModifier && (
        <button onClick={onRouvrir} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17', cursor: 'pointer' }}>
          <RotateCcw size={12} /> Rouvrir
        </button>
      )}
    </div>
  )
}

function BandeauErreur({ message, onFermer }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: 'rgba(184,65,44,0.08)', border: '0.5px solid rgba(184,65,44,0.4)',
      borderLeft: '3px solid #B8412C', padding: '10px 14px', marginBottom: 16,
      fontSize: 12, color: '#7A2A1C', position: 'sticky', top: 0, zIndex: 20,
    }}>
      <AlertTriangle size={14} color="#B8412C" strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1 }}>
        <strong>La modification n’a pas été enregistrée.</strong> {message}
      </span>
      <button onClick={onFermer} title="Fermer" data-compact style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C', padding: 2 }}>
        <X size={14} />
      </button>
    </div>
  )
}

// Confirmation d'émission ou de réouverture
function messageErreur(err) {
  const brut = err?.message ?? String(err)
  // « no-response » : la mémoire hors ligne n'avait pas la réponse (Safari)
  if (/Failed to fetch|NetworkError|Load failed|no-response|respondWith/i.test(brut)) return 'Pas de réseau : cette action demande une connexion internet. Réessayez une fois connecté.'
  return brut
}

export function CrDetail({ crId, affaire, onBack, lectureSeule: lectureSeuleAffaire = false }) {
  const { user, estAgence } = useAuth()
  // Dans une page du CR (Organisation, Présences…), le retour du bandeau
  // ramène au tableau de bord de la visite ; sinon, à la liste des visites
  const [activeView, setActiveView] = useState(null)
  useRetourPage(activeView ? { libelle: 'Tableau de bord de la visite', Icone: IconeVisitesChantier, onClick: () => setActiveView(null) } : null)
  const enregistrementsVisibles = useEnregistrementsDisponibles(estAgence)
  const { interlocuteurs } = useAffaireInterlocuteurs(affaire?.id)
  const [lotEntreprises, setLotEntreprises] = useState([])
  const [erreur, setErreur] = useState(null)
  const [confirmation, setConfirmation] = useState(null) // 'emettre' | 'rouvrir'
  const [identiteOuverte, setIdentiteOuverte] = useState(false)
  const { collaborateurs } = useAffaireCollaborateurs(affaire?.id)
  const syncDone = useRef(false)

  const signalerErreur = useCallback((err) => {
    console.error(err)
    setErreur(messageErreur(err))
  }, [])

  useEffect(() => {
    if (!affaire?.id) return
    supabase
      .from('lot_entreprises')
      .select('id, lot_id, lots(*), entreprises(id, raison_sociale), interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)')
      .eq('affaire_id', affaire.id)
      .then(({ data, error }) => {
        // Sans réseau, la liste gardée sur l'appareil (ou rien) : pas d'alerte
        if (error && !erreurReseau(error)) signalerErreur(error)
        else setLotEntreprises(data ?? [])
      })
  }, [affaire?.id, signalerErreur])

  const {
    photos, liens, ajouterPhotos, remplacerPhoto, modifierLegendePhoto, supprimerPhoto, liensPhotos,
    pastilles, placerPastille, enleverPastille, zones, ftms,
    planning, modifierAvancementTache, horsLigne, sectionDesIntervenants, assurerPartiesRemarques,
    cr, sections: sectionsBrutes, presences, profiles, loading, erreurChargement, historique, miseEnFormeDisponible,
    syncPresences, updateCr, emettre, rouvrir, updatePresence,
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque, changerStatutRemarques,
    setPresence,
  } = useCompteRendu(crId, affaire?.id)
  // Qui était convoqué à cette réunion, d'après le CR précédent
  const convocations = useConvocationsPrecedentes(cr)

  // Généralités (parties I à V, migration 055) : celles de l'affaire, ou la
  // copie faite à l'émission pour un CR émis
  const generalites = useGeneralites(affaire?.id)
  const generalitesCr = useMemo(() => generalitesAImprimer(cr, generalites.contenu), [cr, generalites.contenu])

  // Partie VI toujours avant la VII, quel que soit l'ordre de création ; leurs
  // numéros suivent les généralités (une sixième partie les décale)
  const sections = useMemo(
    () => numeroterParties(ordonnerParties(sectionsBrutes), generalitesCr.parties.length),
    [sectionsBrutes, generalitesCr.parties.length],
  )

  // Avancement affiché et exporté : les chiffres gelés pour un CR émis
  const lignesAvancementCr = useMemo(() => {
    if (!cr) return []
    return lignesAvancement(cr, avancementParLot(planning.taches, planning.lots, {
      date: cr.date_reunion, periodes: planning.periodes,
    }))
  }, [cr, planning])
  const resumeAvancement = useMemo(
    () => (lignesAvancementCr.length > 0 ? avancementGlobal(lignesAvancementCr) : null),
    [lignesAvancementCr],
  )

  // Feuille de présence complétée à l'ouverture (rien sur un CR émis, ni pour
  // qui consulte sans droit de modification). Elle interroge la base : sans
  // réseau, elle attend son retour au lieu d'afficher une erreur — la visite
  // emportée a déjà sa feuille.
  useEffect(() => {
    if (lectureSeuleAffaire) return undefined
    const lancer = () => {
      if (syncDone.current || navigator.onLine === false) return
      syncDone.current = true
      syncPresences().catch((err) => {
        if (erreurReseau(err)) { syncDone.current = false; return }
        signalerErreur(err)
      })
    }
    lancer()
    window.addEventListener('online', lancer)
    return () => window.removeEventListener('online', lancer)
  }, [crId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chaque écriture signale son échec dans le bandeau, puis relaie l'erreur :
  // un formulaire ne doit pas se fermer comme si la saisie était enregistrée.
  const ops = useMemo(() => {
    const brutes = {
      addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
      addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
      addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
      addSousRemarque, changerStatutRemarques, sectionDesIntervenants,
    }
    return Object.fromEntries(Object.entries(brutes).map(([nom, op]) => [nom, async (...args) => {
      try {
        setErreur(null)
        return await op(...args)
      } catch (err) {
        signalerErreur(err)
        throw err
      }
    }]))
  }, [
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque, changerStatutRemarques, sectionDesIntervenants, signalerErreur,
  ])

  // Espace utilisé, relu quand le nombre de photos change
  const [espace, setEspace] = useState(null)
  const [versionEspace, setVersionEspace] = useState(0)
  useEffect(() => {
    let abandon = false
    espaceUtilise().then(v => { if (!abandon) setEspace(v) }).catch(err => console.warn('Espace de stockage :', err))
    return () => { abandon = true }
  }, [photos.length, versionEspace])

  const contextePhotos = useMemo(() => {
    const signaler = (op) => async (...args) => {
      try {
        setErreur(null)
        return await op(...args)
      } catch (err) {
        signalerErreur(err)
        throw err
      }
    }
    return {
      photos, liens, liensPhotos,
      espacePlein: espace != null && niveauEspace(espace).plein,
      ajouterPhotos: signaler(ajouterPhotos),
      remplacerPhoto: signaler(remplacerPhoto),
      modifierLegendePhoto: signaler(modifierLegendePhoto),
      supprimerPhoto: signaler(supprimerPhoto),
    }
  }, [photos, liens, liensPhotos, espace, ajouterPhotos, remplacerPhoto, modifierLegendePhoto, supprimerPhoto, signalerErreur])

  // Mode Visite dans l'adresse (?visite=1) : il reste ouvert au rechargement
  const [params, setParams] = useSearchParams()
  const visite = params.get('visite') === '1'
  const setVisite = (ouvert) => setParams(prev => {
    const suivant = new URLSearchParams(prev)
    if (ouvert) suivant.set('visite', '1')
    else suivant.delete('visite')
    return suivant
  })

  const naviguer = useNavigate()
  const affaireId = affaire?.id
  const ouvrirFtm = useCallback((ftm) => naviguer(`/affaires/${affaireId}/financier-chantier?ftm=${ftm.id}`), [naviguer, affaireId])

  const plansCr = usePlans(affaire?.id)

  // Ouvrir la visite avec du réseau, c'est l'emporter : les images des photos
  // et des plans sont recopiées sur l'appareil, le reste l'a été au chargement.
  useEffect(() => {
    if (!visite || !navigator.onLine || !plansCr.charge) return
    const cheminsPhotos = photos.map(p => p.chemin_miniature)
    const cheminsPlans = plansCr.versions.flatMap(v => [v.chemin_apercu, v.chemin].filter(Boolean))
    Promise.all([
      garderImages(cheminsPhotos, liensPhotos),
      garderImages(cheminsPlans, plansCr.obtenirLiens),
    ]).catch(err => console.warn('Images emportées :', err))
  }, [visite, photos, plansCr.charge, plansCr.versions, plansCr.obtenirLiens, liensPhotos])

  const [placement, setPlacement] = useState(null) // remarque
  const toutesRemarques = useMemo(() => sections.flatMap(s => [
    ...(s.directRemarques ?? []),
    ...(s.sousSections ?? []).flatMap(ss => ss.remarques ?? []),
  ]), [sections])
  const contextePlans = useMemo(() => ({
    disponible: plansCr.disponible, plans: plansCr.plans, versions: plansCr.versions, pastilles,
    ouvrirPlacement: setPlacement,
  }), [plansCr.disponible, plansCr.plans, plansCr.versions, pastilles])

  // Un intervenant extérieur consulte l'affaire (lectureSeuleAffaire), mais
  // dépose ses propres observations tant que le compte rendu est un brouillon
  // (migrations 050 à 052). Ses droits sont tenus en base ; ici, on n'affiche
  // que les boutons qui aboutiront.
  const contributeur = !estAgence && cr?.statut !== 'emis'
  const lectureSeule = (lectureSeuleAffaire && !contributeur) || cr?.statut === 'emis'
  const contexte = useMemo(
    () => ({ lectureSeule, contributeur, utilisateurId: user?.id ?? null, profils: profiles, signalerErreur, miseEnForme: miseEnFormeDisponible }),
    [lectureSeule, contributeur, user?.id, profiles, signalerErreur, miseEnFormeDisponible],
  )

  // Tous les lots de l'affaire, qu'une entreprise y soit déjà attribuée ou non :
  // une remarque peut viser un lot encore sans titulaire
  const lotsAffaire = planning.lots

  // Parties VI et VII mises en place à l'ouverture d'un brouillon (agence)
  const partiesPretes = useRef(null)
  useEffect(() => {
    if (!cr || lectureSeule || contributeur || lectureSeuleAffaire || partiesPretes.current === cr.id) return
    partiesPretes.current = cr.id
    assurerPartiesRemarques().catch((err) => {
      signalerErreur(err?.code === '23514'
        ? new Error('Ranger les remarques par destinataire demande la mise à jour 054 de la base (Supabase → SQL Editor).')
        : err)
    })
  }, [cr, lectureSeule, contributeur, lectureSeuleAffaire, assurerPartiesRemarques, signalerErreur])

  // Archive PDF de chaque émission (migration 043 ; null tant qu'elle manque)
  const [archives, setArchives] = useState(null)
  const [versionArchives, setVersionArchives] = useState(0)
  useEffect(() => {
    let abandon = false
    archivesDuCr(crId).then(a => { if (!abandon) setArchives(a) }).catch(err => console.warn('Archives :', err))
    return () => { abandon = true }
  }, [crId, versionArchives])

  const fabriquerPdf = (reglages, crPdf) => genererPdfCr({
    cr: crPdf, affaire, sections, presences, convocations, generalites: generalitesAImprimer(crPdf, generalites.contenu),
    lots: lotsAffaire, interlocuteurs: interlocuteurs ?? [], zones,
    avancement: lignesAvancementCr, profils: profiles,
    photos, liensPhotos, pastilles, plansCr, reglages,
  })

  const archiver = async (reglages, crPdf, emisLe) => {
    const { blob } = await fabriquerPdf(reglages, crPdf)
    await archiverPdf({ affaireId: affaire.id, crId, blob, reglages, emisLe })
    setVersionArchives(v => v + 1)
    setVersionEspace(v => v + 1)
  }

  // Version d'un CR émis pour une entreprise : fabriquée et archivée au
  // premier envoi, réutilisée ensuite pour la même émission
  const preparerVersion = async (destinataire, inclureGenerales) => {
    const emission = new Date(cr.date_emission ?? 0).getTime()
    const existante = (archives ?? []).find(a => a.destinataire === destinataire
      && new Date(a.emis_le).getTime() === emission
      && (a.reglages?.inclureGenerales ?? true) === inclureGenerales)
    if (existante) return existante
    const reglages = { ...lireReglagesRapport(affaire?.id), destinataire, inclureGenerales }
    const lots = lotsAffaire
    const { blob } = await fabriquerPdf(reglages, cr)
    const ligne = await archiverPdf({
      affaireId: affaire.id, crId, blob, reglages, emisLe: cr.date_emission ?? new Date().toISOString(),
      destinataire, versionPour: libelleVersion(destinataire, lots, interlocuteurs ?? []),
    })
    setVersionArchives(v => v + 1)
    setVersionEspace(v => v + 1)
    return ligne
  }

  const confirmer = async () => {
    setErreur(null)
    if (confirmation === 'rouvrir') {
      try { await rouvrir() } catch (err) { signalerErreur(err) }
      setConfirmation(null)
      return
    }
    // Émission : le PDF est fabriqué avant le verrou, avec les réglages du
    // moment ; un échec d'archive n'empêche pas l'émission, il est signalé.
    const emisLe = new Date().toISOString()
    const reglages = lireReglagesRapport(affaire?.id)
    let pdf = null
    let echecArchive = null
    if (archives !== null) {
      try { pdf = await fabriquerPdf(reglages, { ...cr, statut: 'emis', date_emission: emisLe }) } catch (err) { echecArchive = err }
    }
    try {
      // Les généralités du jour sont recopiées dans le CR émis
      await emettre(emisLe, { generalites: generalites.disponible ? normaliserGeneralites(generalites.contenu) : null })
    } catch (err) {
      signalerErreur(err)
      setConfirmation(null)
      return
    }
    if (pdf) {
      try {
        await archiverPdf({ affaireId: affaire.id, crId, blob: pdf.blob, reglages, emisLe })
        setVersionArchives(v => v + 1)
        setVersionEspace(v => v + 1)
      } catch (err) { echecArchive = err }
    }
    if (echecArchive) {
      signalerErreur(new Error(`Le compte rendu est émis, mais son PDF n’a pas été archivé (${messageErreur(echecArchive)}). Utilisez « Archiver maintenant » dans l’écran d’export.`))
    }
    setConfirmation(null)
  }

  if (!loading && !cr && erreurChargement) {
    return (
      <div>
        <BandeauErreur message={`Le compte rendu n’a pas pu être chargé : ${erreurChargement}`} onFermer={onBack} />
      </div>
    )
  }
  if (loading || !cr) return <Spinner />

  const vueMeta = VUES.find(v => v.id === activeView)

  // Propositions de l'IA pas encore validées (migration 058) : la base refuse
  // l'émission ; on le dit avant d'ouvrir la confirmation
  const aValider = propositionsAValider(sections)
  const allerALaProposition = () => {
    const p = aValider[0]
    if (!p) return
    setActiveView('remarques')
    defilerVers(`cr-remarque-${p.parent_id ?? p.id}`, 4, 'center')
  }
  // La liste de contrôle de la fenêtre dit ce qui manque, propositions de
  // l'IA comprises (seul point qui bloque : la base refuserait)
  const demanderEmission = () => setConfirmation('emettre')

  return (
    <CrContexte.Provider value={contexte}>
    <PhotosContexte.Provider value={contextePhotos}>
    <PlansContexte.Provider value={contextePlans}>
    <div>
      {erreur && <BandeauErreur message={erreur} onFermer={() => setErreur(null)} />}
      {cr.statut !== 'emis' && aValider.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <BandeauPropositions petit nombre={aValider.length} onSuivante={allerALaProposition} />
        </div>
      )}

      {/* Navigation */}
      {activeView ? (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 0',
            fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em',
            color: vueMeta?.couleur ?? '#1F1B17',
          }}>
            {/* La même icône que la tuile : on reconnaît la page d'un coup d'œil */}
            {vueMeta?.icon && (
              <span style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: vueMeta.fondClair,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <vueMeta.icon size={30} color={vueMeta.couleur} strokeWidth={1.25} />
              </span>
            )}
            {vueMeta?.label}
          </h2>
        </div>
      ) : null /* le retour à la liste des visites est dans le bandeau du haut */}

      {cr.statut === 'emis' && (
        <BandeauEmis cr={cr} peutModifier={!lectureSeuleAffaire} onRouvrir={() => setConfirmation('rouvrir')} />
      )}

      {/* Contenu */}
      {activeView === null && (
        <CrAccueil
          cr={cr}
          affaire={affaire}
          presences={presences}
          sections={sections}
          onNavigate={setActiveView}
          onEmettre={demanderEmission}
          onVisite={() => setVisite(true)}
          onModifier={lectureSeule || contributeur ? null : () => setIdentiteOuverte(true)}
          peutModifier={!lectureSeuleAffaire}
          nbPlans={plansCr.plans.length}
          nbPastilles={pastilles.length}
          avancement={resumeAvancement}
          nbPartiesGeneralites={generalitesCr.parties.length}
          enregistrements={enregistrementsVisibles}
        />
      )}

      {identiteOuverte && (
        <ModaleIdentiteVisite
          cr={cr}
          profils={profiles}
          collaborateurs={collaborateurs}
          onEnregistrer={updateCr}
          onFermer={() => setIdentiteOuverte(false)}
        />
      )}

      {activeView === 'generalites' && (
        <GeneralitesVue
          cr={cr}
          generalites={generalites}
          peutModifier={!lectureSeule && !contributeur}
          signalerErreur={signalerErreur}
        />
      )}

      {activeView === 'organisation' && (
        <ProchaineVisite
          cr={cr}
          presences={presences}
          updateCr={updateCr}
          updatePresence={updatePresence}
        />
      )}

      {activeView === 'presences' && (
        <CrPresences
          presences={presences}
          setPresence={setPresence}
          convocations={convocations}
        />
      )}

      {activeView === 'remarques' && (
        <CrSectionEditor
          sections={sections}
          crId={cr.id}
          historique={historique}
          crDate={cr.date_reunion}
          interlocuteurs={interlocuteurs}
          lotEntreprises={lotEntreprises}
          lots={lotsAffaire}
          zones={zones}
          ftms={ftms}
          ouvrirFtm={ouvrirFtm}
          ops={ops}
        />
      )}

      {activeView === 'avancement' && (
        <AvancementLots cr={cr} planning={planning} onModifierTache={modifierAvancementTache} />
      )}

      {activeView === 'plans' && (
        <PlansVue
          plansCr={plansCr}
          remarques={toutesRemarques}
          pastilles={pastilles}
          peutGerer={!lectureSeuleAffaire}
          onAllerRemarque={(id) => { setActiveView('remarques'); defilerVers(`cr-remarque-${id}`, 4, 'center') }}
        />
      )}

      {visite && (
        <ModeVisite
          cr={cr}
          affaire={affaire}
          convocations={convocations}
          sections={sections}
          presences={presences}
          setPresence={setPresence}
          lots={lotsAffaire}
          interlocuteurs={interlocuteurs}
          zones={zones}
          ftms={ftms}
          ouvrirFtm={ouvrirFtm}
          planning={planning}
          modifierAvancementTache={modifierAvancementTache}
          horsLigne={horsLigne}
          ops={ops}
          lectureSeule={lectureSeule}
          erreur={erreur}
          onFermerErreur={() => setErreur(null)}
          signalerErreur={signalerErreur}
          onTerminer={() => setVisite(false)}
        />
      )}

      {placement && (
        <PlacementPlan
          remarque={toutesRemarques.find(r => r.id === placement.id) ?? placement}
          remarques={toutesRemarques}
          plans={plansCr.plans}
          versions={plansCr.versions}
          pastilles={pastilles}
          obtenirLiens={plansCr.obtenirLiens}
          onPoser={(remarqueId, position) => placerPastille(remarqueId, position).catch(err => { signalerErreur(err); throw err })}
          onRetirer={(remarqueId) => enleverPastille(remarqueId).catch(err => { signalerErreur(err); throw err })}
          onFermer={() => setPlacement(null)}
        />
      )}

      {activeView === 'enregistrements' && enregistrementsVisibles && (
        <ListeEnregistrements
          crId={cr.id} affaireId={affaire?.id ?? cr.affaire_id}
          vocabulaire={vocabulaireAffaire({ lots: lotsAffaire ?? [], interlocuteurs: interlocuteurs ?? [], zones })}
          lectureSeule={lectureSeuleAffaire}
          onProposer={cr.statut !== 'emis'
            ? () => proposerRemarques({ cr, affaire, lots: lotsAffaire ?? [], interlocuteurs: interlocuteurs ?? [], zones, sections, ops })
            : undefined}
        />
      )}

      {activeView === 'export' && (
        <ExportRapport
          cr={cr}
          onEmettre={!lectureSeuleAffaire && cr.statut !== 'emis' ? demanderEmission : undefined}
          sections={sections}
          presences={presences}
          convocations={convocations}
          affaire={affaire}
          lotEntreprises={lotEntreprises}
          lots={lotsAffaire}
          generalites={generalitesCr}
          interlocuteurs={interlocuteurs}
          photos={photos}
          liensPhotos={liensPhotos}
          zones={zones}
          avancement={lignesAvancementCr}
          profils={profiles}
          pastilles={pastilles}
          plansCr={plansCr}
          espace={espace}
          peutGerer={!lectureSeuleAffaire}
          onEspaceChange={() => setVersionEspace(v => v + 1)}
          archives={archives}
          onArchiverMaintenant={(reglages) => archiver({ ...reglages, destinataire: '' }, cr, cr.date_emission ?? new Date().toISOString())}
          onPreparerVersion={preparerVersion}
          onSupprimerArchive={async (archive) => {
            await supprimerArchive(archive)
            setVersionArchives(v => v + 1)
            setVersionEspace(v => v + 1)
          }}
          signataire={[cr.profiles?.prenom, cr.profiles?.nom].filter(Boolean).join(' ') || null}
        />
      )}

      {confirmation === 'emettre' && (
        <ModaleEmission
          cr={cr}
          presences={presences}
          convocations={convocations}
          avancement={lignesAvancementCr}
          nbPropositions={aValider.length}
          onConfirmer={confirmer}
          onAnnuler={() => setConfirmation(null)}
          onAller={(vue) => { setConfirmation(null); setActiveView(vue) }}
          onVoirPropositions={() => { setConfirmation(null); allerALaProposition() }}
        />
      )}
      {confirmation === 'rouvrir' && (
        <ModaleConfirmation
          titre={`Rouvrir le compte rendu n°${cr.numero} ?`}
          texte="Il repasse en brouillon et redevient modifiable. Pensez à l’émettre à nouveau après correction : les destinataires ont peut-être déjà reçu la version émise."
          libelle="Rouvrir"
          couleur="#E8602C"
          onConfirmer={confirmer}
          onAnnuler={() => setConfirmation(null)}
        />
      )}
    </div>
    </PlansContexte.Provider>
    </PhotosContexte.Provider>
    </CrContexte.Provider>
  )
}
