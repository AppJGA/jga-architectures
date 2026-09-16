import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ArrowLeft, ArrowRight, Send, FileDown, ChevronRight,
  Users, ClipboardList, MessageSquare, Zap, LayoutDashboard,
  Lock, RotateCcw, AlertTriangle, X, Map as IconePlan, Smartphone,
} from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useCompteRendu } from '../../../shared/hooks/useCompteRendu'
import { useAffaireInterlocuteurs } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { supabase } from '../../../core/supabase/client'
import { CrPresences } from './CrPresences'
import { CrSectionEditor } from './CrSectionEditor'
import { TemplateModal } from './TemplateModal'
import { ExportRapport } from './ExportRapport'
import { lireReglagesRapport } from './rapportReglages'
import { genererPdfCr, libelleVersion } from './genererRapport'
import { archivesDuCr, archiverPdf } from './rapportStockage'
import { compterPresents, FAMILLES_STATUT, infosStatut, estEnRetard } from './crLogique'
import { CrContexte, useCr } from './CrContexte'
import { PhotosContexte } from './usePhotosRemarque'
import { espaceUtilise } from './photosStockage'
import { niveauEspace } from './photosLogique'
import { PlansContexte } from './PlansContexte'
import { usePlans } from './usePlans'
import { PlansVue } from './PlansVue'
import { PlacementPlan } from './PlacementPlan'
import { ModeVisite } from './ModeVisite'

// ─── Styles partagés ──────────────────────────────────────────────────────────

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}
function focusOn(e)  { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.07)' }
function focusOff(e) { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }

// ─── Vues disponibles ─────────────────────────────────────────────────────────

const VUES = [
  {
    id: 'organisation',
    label: 'Organisation de la visite',
    description: 'Informations générales,\nprochaine réunion',
    icon: ClipboardList,
    couleur: '#E8602C',
    fondClair: 'rgba(232,96,44,0.10)',
  },
  {
    id: 'presences',
    label: 'Présences et convocations',
    description: 'Interlocuteurs et entreprises,\nprésences P/R/A/E',
    icon: Users,
    couleur: '#1B3A5C',
    fondClair: 'rgba(27,58,92,0.10)',
  },
  {
    id: 'remarques',
    label: 'Remarques',
    description: 'Sections, sous-sections\net points de suivi',
    icon: MessageSquare,
    couleur: '#2A8A4E',
    fondClair: 'rgba(42,138,78,0.12)',
  },
  {
    id: 'plans',
    label: 'Plans',
    description: 'Plans de l’affaire\net pastilles',
    icon: IconePlan,
    couleur: '#6B4E9B',
    fondClair: 'rgba(107,78,155,0.10)',
  },
  {
    id: 'export',
    label: 'Exporter le CR',
    description: 'Générer le PDF\ndu compte rendu',
    icon: FileDown,
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

// ─── Formulaire Infos générales ───────────────────────────────────────────────

function OrganisationView({ cr, profiles, updateCr, onApplyTemplate, lots, interlocuteurs }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const { lectureSeule, signalerErreur } = useCr()

  useEffect(() => {
    if (cr) setForm({
      numero: cr.numero ?? '',
      date_reunion: cr.date_reunion ?? '',
      date_prochaine_reunion: cr.date_prochaine_reunion ?? '',
      heure_prochaine_reunion: cr.heure_prochaine_reunion ?? '',
      redacteur_id: cr.redacteur_id ?? '',
    })
  }, [cr])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCr({
        numero: Number(form.numero) || cr.numero,
        date_reunion: form.date_reunion || null,
        date_prochaine_reunion: form.date_prochaine_reunion || null,
        heure_prochaine_reunion: form.heure_prochaine_reunion || null,
        redacteur_id: form.redacteur_id || null,
      })
    } catch (err) { signalerErreur(err) }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <fieldset disabled={lectureSeule} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>N° réunion</label>
            <input type="number" min={1} value={form.numero ?? ''} onChange={e => set('numero', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Date de la réunion</label>
            <input type="date" value={form.date_reunion ?? ''} onChange={e => set('date_reunion', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
          <div>
            <label style={LABEL}>Prochaine réunion</label>
            <input type="date" value={form.date_prochaine_reunion ?? ''} onChange={e => set('date_prochaine_reunion', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Heure</label>
            <input type="time" value={form.heure_prochaine_reunion ?? ''} onChange={e => set('heure_prochaine_reunion', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>

        <div>
          <label style={LABEL}>Rédacteur</label>
          <select value={form.redacteur_id ?? ''} onChange={e => set('redacteur_id', e.target.value || null)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
            <option value="">— Non défini —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{[p.prenom, p.nom].filter(Boolean).join(' ') || p.email}</option>
            ))}
          </select>
        </div>

        {!lectureSeule && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleSave} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={() => setTemplateOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}
          >
            <Zap size={13} /> Appliquer un template de sections
          </button>
        </div>}
      </div>
      </fieldset>

      {templateOpen && !lectureSeule && (
        <TemplateModal
          affaireId={cr.affaire_id}
          crId={cr.id}
          lots={lots}
          interlocuteurs={interlocuteurs}
          onClose={() => setTemplateOpen(false)}
          onApplied={onApplyTemplate}
        />
      )}
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

// Raccourci vers une autre vue du CR : ligne compacte, icône, chevron.
function TuileVue({ vue, titre, sousTitre, onClick }) {
  const [survol, setSurvol] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'white', padding: '14px 16px', cursor: 'pointer',
        border: `0.5px solid ${survol ? vue.couleur : 'rgba(0,0,0,0.08)'}`,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: vue.fondClair,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <vue.icon size={17} color={vue.couleur} strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{titre}</p>
        <p style={{ fontSize: 11, color: '#9C9591', marginTop: 1 }}>{sousTitre}</p>
      </div>
      <ChevronRight size={14} color="#C9C4C0" strokeWidth={1.5} style={{ flexShrink: 0 }} />
    </div>
  )
}

function CrAccueil({ cr, affaire, presences, sections, onNavigate, onOuvrirSection, onEmettre, onVisite, peutModifier, nbPlans, nbPastilles }) {
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
  const presents = compterPresents(presences)

  const vueOrga = VUES.find(v => v.id === 'organisation')
  const vuePresences = VUES.find(v => v.id === 'presences')
  const vueExport = VUES.find(v => v.id === 'export')
  const vuePlans = VUES.find(v => v.id === 'plans')

  return (
    <div>
      {/* En-tête du CR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 600, color: '#E8602C', letterSpacing: '-0.02em' }}>
            {String(cr.numero).padStart(2, '0')}
          </span>
          <div>
            <p style={{ fontFamily: "'Archivo', sans-serif", fontSize: 16, fontWeight: 500, color: '#1F1B17' }}>
              Réunion n°{cr.numero}
            </p>
            <p style={{ fontSize: 12, color: '#9C9591', marginTop: 2 }}>
              {dateLabel}{affaire?.nom && ` · ${affaire.nom}`}
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
          <Smartphone size={15} />
          {cr.statut !== 'emis' && peutModifier ? 'Démarrer la visite' : 'Mode visite'}
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
            <Send size={13} /> Émettre le CR
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
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(42,138,78,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessageSquare size={24} color="#2A8A4E" strokeWidth={1.5} />
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
          <button
            onClick={() => onNavigate('remarques')}
            onMouseEnter={() => setSurvolEditeur(true)}
            onMouseLeave={() => setSurvolEditeur(false)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
              padding: '10px 20px', borderRadius: 2, border: 'none',
              backgroundColor: survolEditeur ? '#227341' : '#2A8A4E', color: 'white',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 6px 16px -8px rgba(42,138,78,0.7)',
              transform: survolEditeur ? 'translateY(-2px)' : 'none',
              transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), background 0.18s ease',
            }}
          >
            {cr.statut === 'emis' || !peutModifier ? 'Consulter' : "Ouvrir l'éditeur"}
            <ArrowRight size={15} strokeWidth={1.8} />
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

        {sections.length > 0 && (
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#C9C4C0', marginBottom: 8 }}>
              Sections — accès direct
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sections.map((s, i) => {
                const rems = remarquesDeSection(s)
                // Une section « chaude » a au moins un point à faire
                const chaude = rems.some(r => infosStatut(r).famille === 'rouge')
                return (
                  <button
                    key={s.id}
                    onClick={() => onOuvrirSection(s.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', borderRadius: 2, cursor: 'pointer',
                      border: '0.5px solid rgba(0,0,0,0.10)', background: 'white',
                      fontSize: 12, color: '#374151',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2A8A4E'; e.currentTarget.style.background = 'rgba(42,138,78,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)'; e.currentTarget.style.background = 'white' }}
                  >
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#C9C4C0' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.titre}
                    <span style={{
                      fontSize: 10, fontWeight: 500, borderRadius: 3, padding: '1px 6px',
                      color: chaude ? '#B8412C' : '#9C9591',
                      background: chaude ? 'rgba(184,65,44,0.10)' : '#F1EFE8',
                    }}>
                      {rems.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Les autres vues */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <TuileVue
          vue={vueOrga}
          titre="Organisation"
          sousTitre="Dates, rédacteur, template"
          onClick={() => onNavigate('organisation')}
        />
        <TuileVue
          vue={vuePresences}
          titre="Présences"
          sousTitre={presences.length === 0 ? 'Aucun participant' : `${convoques} convoqué${convoques > 1 ? 's' : ''} · ${presents} présent${presents > 1 ? 's' : ''}`}
          onClick={() => onNavigate('presences')}
        />
        <TuileVue
          vue={vuePlans}
          titre="Plans"
          sousTitre={nbPlans === 0 ? 'Aucun plan' : `${nbPlans} plan${nbPlans > 1 ? 's' : ''} · ${nbPastilles} pastille${nbPastilles > 1 ? 's' : ''}`}
          onClick={() => onNavigate('plans')}
        />
        <TuileVue
          vue={vueExport}
          titre="Exporter le PDF"
          sousTitre="Aperçu avant impression"
          onClick={() => onNavigate('export')}
        />
      </div>
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
const defilerVersSection = (sectionId) => defilerVers(`cr-section-${sectionId}`)

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
function ModaleConfirmation({ titre, texte, libelle, couleur, onConfirmer, onAnnuler }) {
  const [enCours, setEnCours] = useState(false)
  return (
    <div onClick={onAnnuler} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: 'white', padding: '24px 28px', maxWidth: 440, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 10 }}>{titre}</p>
        <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 22 }}>{texte}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onAnnuler} style={{ padding: '8px 16px', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.15)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
            Annuler
          </button>
          <button
            disabled={enCours}
            onClick={async () => { setEnCours(true); await onConfirmer(); setEnCours(false) }}
            style={{ padding: '8px 16px', borderRadius: 2, border: 'none', background: couleur, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : libelle}
          </button>
        </div>
      </div>
    </div>
  )
}

// Message lisible pour une erreur Supabase ou JavaScript
function messageErreur(err) {
  const brut = err?.message ?? String(err)
  if (/Failed to fetch|NetworkError/i.test(brut)) return 'Connexion au serveur impossible : vérifiez la connexion internet et réessayez.'
  return brut
}

export function CrDetail({ crId, affaire, onBack, lectureSeule: lectureSeuleAffaire = false }) {
  const [activeView, setActiveView] = useState(null)
  const { interlocuteurs } = useAffaireInterlocuteurs(affaire?.id)
  const [lotEntreprises, setLotEntreprises] = useState([])
  const [erreur, setErreur] = useState(null)
  const [confirmation, setConfirmation] = useState(null) // 'emettre' | 'rouvrir'
  const syncDone = useRef(false)

  const signalerErreur = useCallback((err) => {
    console.error(err)
    setErreur(messageErreur(err))
  }, [])

  useEffect(() => {
    if (!affaire?.id) return
    supabase
      .from('lot_entreprises')
      .select('id, lot_id, lots(id, numero, nom), entreprises(id, raison_sociale), interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)')
      .eq('affaire_id', affaire.id)
      .then(({ data, error }) => {
        if (error) signalerErreur(error)
        else setLotEntreprises(data ?? [])
      })
  }, [affaire?.id, signalerErreur])

  const {
    photos, liens, ajouterPhotos, remplacerPhoto, modifierLegendePhoto, supprimerPhoto, liensPhotos,
    pastilles, placerPastille, enleverPastille, zones, ftms, creerFtmPourRemarque,
    cr, sections, presences, profiles, loading, erreurChargement, historique,
    syncPresences, updateCr, emettre, rouvrir, updatePresence,
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque, changerStatutRemarques,
    setPresence, refetch,
  } = useCompteRendu(crId, affaire?.id)

  // Feuille de présence complétée à l'ouverture (rien sur un CR émis, ni pour
  // qui consulte sans droit de modification)
  useEffect(() => {
    if (syncDone.current || lectureSeuleAffaire) return
    syncDone.current = true
    syncPresences().catch(signalerErreur)
  }, [crId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chaque écriture signale son échec dans le bandeau, puis relaie l'erreur :
  // un formulaire ne doit pas se fermer comme si la saisie était enregistrée.
  const ops = useMemo(() => {
    const brutes = {
      addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
      addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
      addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
      addSousRemarque, changerStatutRemarques,
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
    addSousRemarque, changerStatutRemarques, signalerErreur,
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
  const ouvrirFtm = useCallback((ftm) => naviguer(`/affaires/${affaireId}/ftm?ftm=${ftm.id}`), [naviguer, affaireId])
  const creerFtm = useCallback(async (remarque) => {
    try {
      const fiche = await creerFtmPourRemarque(remarque)
      ouvrirFtm(fiche)
    } catch (err) { signalerErreur(err) }
  }, [creerFtmPourRemarque, ouvrirFtm, signalerErreur])

  const plansCr = usePlans(affaire?.id)
  const [placement, setPlacement] = useState(null) // remarque
  const toutesRemarques = useMemo(() => sections.flatMap(s => [
    ...(s.directRemarques ?? []),
    ...(s.sousSections ?? []).flatMap(ss => ss.remarques ?? []),
  ]), [sections])
  const contextePlans = useMemo(() => ({
    disponible: plansCr.disponible, plans: plansCr.plans, versions: plansCr.versions, pastilles,
    ouvrirPlacement: setPlacement,
  }), [plansCr.disponible, plansCr.plans, plansCr.versions, pastilles])

  const lectureSeule = lectureSeuleAffaire || cr?.statut === 'emis'
  const contexte = useMemo(() => ({ lectureSeule, signalerErreur }), [lectureSeule, signalerErreur])

  // Archive PDF de chaque émission (migration 043 ; null tant qu'elle manque)
  const [archives, setArchives] = useState(null)
  const [versionArchives, setVersionArchives] = useState(0)
  useEffect(() => {
    let abandon = false
    archivesDuCr(crId).then(a => { if (!abandon) setArchives(a) }).catch(err => console.warn('Archives :', err))
    return () => { abandon = true }
  }, [crId, versionArchives])

  const fabriquerPdf = (reglages, crPdf) => genererPdfCr({
    cr: crPdf, affaire, sections, presences,
    lots: lotEntreprises.map(le => le.lots).filter(Boolean), interlocuteurs: interlocuteurs ?? [], zones,
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
    const lots = lotEntreprises.map(le => le.lots).filter(Boolean)
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
      await emettre(emisLe)
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
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#5E5854', cursor: 'pointer', marginBottom: 16 }}>
          <ArrowLeft size={13} /> Liste des visites
        </button>
        <BandeauErreur message={`Le compte rendu n’a pas pu être chargé : ${erreurChargement}`} onFermer={onBack} />
      </div>
    )
  }
  if (loading || !cr) return <Spinner />

  const vueMeta = VUES.find(v => v.id === activeView)

  return (
    <CrContexte.Provider value={contexte}>
    <PhotosContexte.Provider value={contextePhotos}>
    <PlansContexte.Provider value={contextePlans}>
    <div>
      {erreur && <BandeauErreur message={erreur} onFermer={() => setErreur(null)} />}

      {/* Navigation */}
      {activeView ? (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em',
            color: vueMeta?.couleur ?? '#1F1B17', marginBottom: 16,
          }}>
            {vueMeta?.label}
          </h2>
          <button
            onClick={() => setActiveView(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 2,
              border: '0.5px solid rgba(0,0,0,0.15)', background: 'white',
              fontSize: 13, fontWeight: 500, color: '#1F1B17',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--jga-orange)'; e.currentTarget.style.color = 'var(--jga-orange)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#1F1B17' }}
          >
            <LayoutDashboard size={16} /> Retour à la visite
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#5E5854', cursor: 'pointer' }}
          >
            <ArrowLeft size={13} /> Liste des visites
          </button>
        </div>
      )}

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
          onOuvrirSection={(id) => { setActiveView('remarques'); defilerVersSection(id) }}
          onEmettre={() => setConfirmation('emettre')}
          onVisite={() => setVisite(true)}
          peutModifier={!lectureSeuleAffaire}
          nbPlans={plansCr.plans.length}
          nbPastilles={pastilles.length}
        />
      )}

      {activeView === 'organisation' && (
        <OrganisationView
          cr={cr}
          profiles={profiles}
          updateCr={updateCr}
          onApplyTemplate={refetch}
          lots={lotEntreprises.map(le => le.lots).filter(Boolean)}
          interlocuteurs={interlocuteurs}
        />
      )}

      {activeView === 'presences' && (
        <CrPresences
          presences={presences}
          setPresence={setPresence}
          updatePresence={updatePresence}
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
          zones={zones}
          ftms={ftms}
          creerFtm={lectureSeule ? null : creerFtm}
          ouvrirFtm={ouvrirFtm}
          ops={ops}
        />
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
          sections={sections}
          presences={presences}
          setPresence={setPresence}
          lotEntreprises={lotEntreprises}
          interlocuteurs={interlocuteurs}
          zones={zones}
          ftms={ftms}
          creerFtm={lectureSeule ? null : creerFtm}
          ouvrirFtm={ouvrirFtm}
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

      {activeView === 'export' && (
        <ExportRapport
          cr={cr}
          sections={sections}
          presences={presences}
          affaire={affaire}
          lotEntreprises={lotEntreprises}
          interlocuteurs={interlocuteurs}
          photos={photos}
          liensPhotos={liensPhotos}
          zones={zones}
          pastilles={pastilles}
          plansCr={plansCr}
          espace={espace}
          peutGerer={!lectureSeuleAffaire}
          onEspaceChange={() => setVersionEspace(v => v + 1)}
          archives={archives}
          onArchiverMaintenant={(reglages) => archiver({ ...reglages, destinataire: '' }, cr, cr.date_emission ?? new Date().toISOString())}
          onPreparerVersion={preparerVersion}
          signataire={[cr.profiles?.prenom, cr.profiles?.nom].filter(Boolean).join(' ') || null}
        />
      )}

      {confirmation === 'emettre' && (
        <ModaleConfirmation
          titre={`Émettre le compte rendu n°${cr.numero} ?`}
          texte="Une fois émis, le compte rendu est verrouillé : présences, sections et remarques ne sont plus modifiables. Vous pourrez le rouvrir si une correction s’impose."
          libelle="Émettre"
          couleur="#2A8A4E"
          onConfirmer={confirmer}
          onAnnuler={() => setConfirmation(null)}
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
