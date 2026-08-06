import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, ArrowRight, Send, FileText, FileDown, ChevronRight,
  Users, ClipboardList, MessageSquare, Zap, LayoutDashboard,
} from 'lucide-react'
import { useCompteRendu } from '../../../shared/hooks/useCompteRendu'
import { useAffaireInterlocuteurs } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { supabase } from '../../../core/supabase/client'
import { CrPresences } from './CrPresences'
import { CrSectionEditor } from './CrSectionEditor'
import { TemplateModal } from './TemplateModal'
import { generateCrPdf } from './CrPdfExport'

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
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 600 }}>
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

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
        </div>
      </div>

      {templateOpen && (
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

// ─── Vue export ───────────────────────────────────────────────────────────────

function ExportView({ cr, sections, presences, affaire, lotEntreprises, interlocuteurs }) {
  const num = String(cr.numero).padStart(2, '0')
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <FileText size={28} color="#9C9591" />
      </div>
      <p style={{ fontSize: 14, fontWeight: 500, color: '#1F1B17', marginBottom: 6 }}>
        Compte rendu n°{num}
      </p>
      <p style={{ fontSize: 13, color: '#5E5854', marginBottom: 24 }}>
        {cr.date_reunion
          ? new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'Date non définie'}
      </p>
      <button
        onClick={() => generateCrPdf(cr, sections, presences, affaire, {
          lots: lotEntreprises.map(le => le.lots).filter(Boolean),
          interlocuteurs,
        })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 24px', borderRadius: 2, fontSize: 13, fontWeight: 500,
          border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer',
        }}
      >
        <FileDown size={15} /> Générer le PDF
      </button>
      <p style={{ fontSize: 11, color: '#9C9591', marginTop: 12 }}>
        Une fenêtre s'ouvrira avec l'aperçu avant impression.
      </p>
    </div>
  )
}

// ─── Page d'accueil du CR ─────────────────────────────────────────────────────

// Le statut d'une remarque est du texte libre (voir les suggestions de
// CrSectionEditor : « À faire », « Fait », « Pour mémoire », « À prévoir »,
// « En cours », « Urgent », « Annulé »), plus un booléen `est_clos`. Ces quatre
// familles regroupent ce vocabulaire. L'ordre des tests compte : « Fait » doit
// être reconnu avant « À faire ».
const FAMILLES = [
  { id: 'afaire', label: 'À faire', couleur: '#B8412C' },
  { id: 'encours', label: 'En cours', couleur: '#D97706' },
  { id: 'soldees', label: 'Soldées', couleur: '#2A8A4E' },
  { id: 'sansSuite', label: 'Sans suite donnée', couleur: '#9C9591' },
]

function familleRemarque(r) {
  if (r.est_clos) return 'soldees'
  const s = (r.statut ?? '').toLowerCase()
  if (/\bfaits?\b|sold|clos/.test(s)) return 'soldees'
  if (/faire|prévoir|prevoir|urgent/.test(s)) return 'afaire'
  if (/cours/.test(s)) return 'encours'
  return 'sansSuite'
}

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

function CrAccueil({ cr, affaire, presences, sections, onNavigate, onOuvrirSection, onEmit }) {
  const [survolEditeur, setSurvolEditeur] = useState(false)
  const dateLabel = cr.date_reunion
    ? new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date non définie'

  const toutesRemarques = sections.flatMap(remarquesDeSection)
  const parFamille = FAMILLES.map(f => ({
    ...f,
    total: toutesRemarques.filter(r => familleRemarque(r) === f.id).length,
  }))

  const convoques = presences.filter(p => p.convoque).length
  const presents = presences.filter(p => p.presence === 'P').length

  const vueOrga = VUES.find(v => v.id === 'organisation')
  const vuePresences = VUES.find(v => v.id === 'presences')
  const vueExport = VUES.find(v => v.id === 'export')

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
          onClick={onEmit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 2, fontSize: 12, fontWeight: 500,
            border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white',
            color: '#1F1B17', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#2A8A4E'; e.currentTarget.style.color = '#2A8A4E' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#1F1B17' }}
        >
          <Send size={13} />
          {cr.statut === 'emis' ? 'Repasser en brouillon' : 'Émettre le CR'}
        </button>
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
              {cr.numero > 1 && toutesRemarques.length > 0 && ` · reprises du CR n°${cr.numero - 1}`}
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
            Ouvrir l'éditeur
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
                {f.label}
              </span>
              <span style={{ fontSize: 22, fontWeight: 600, color: f.couleur }}>{f.total}</span>
            </div>
          ))}
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
                const chaude = rems.some(r => familleRemarque(r) === 'afaire')
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

      {/* Les trois autres vues */}
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
function defilerVersSection(sectionId, essais = 2) {
  requestAnimationFrame(() => {
    const cible = document.getElementById(`cr-section-${sectionId}`)
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else if (essais > 0) defilerVersSection(sectionId, essais - 1)
  })
}

export function CrDetail({ crId, affaire, onBack }) {
  const [activeView, setActiveView] = useState(null)
  const { interlocuteurs } = useAffaireInterlocuteurs(affaire?.id)
  const [lotEntreprises, setLotEntreprises] = useState([])
  const syncDone = useRef(false)

  useEffect(() => {
    if (!affaire?.id) return
    supabase
      .from('lot_entreprises')
      .select('id, lot_id, lots(id, numero, nom), entreprises(id, raison_sociale), interlocuteurs:interlocuteur_id(prenom, nom, telephone, email)')
      .eq('affaire_id', affaire.id)
      .then(({ data }) => setLotEntreprises(data ?? []))
  }, [affaire?.id])

  const {
    cr, sections, presences, profiles, loading,
    syncPresences, updateCr,
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque,
    setPresence, setConvoque, refetch,
  } = useCompteRendu(crId, affaire?.id)

  useEffect(() => {
    if (syncDone.current) return
    syncDone.current = true
    syncPresences()
  }, [crId]) // eslint-disable-line react-hooks/exhaustive-deps

  const ops = {
    addSection, updateSection, deleteSection, reorderSection, reorderSectionsByIds,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, addSectionRemarque, updateRemarque, deleteRemarque, reorderRemarque, reorderSectionRemarque,
    addSousRemarque,
  }

  const handleEmit = async () => {
    if (!cr) return
    await updateCr({ statut: cr.statut === 'emis' ? 'brouillon' : 'emis' })
  }

  if (loading || !cr) return <Spinner />

  const vueMeta = VUES.find(v => v.id === activeView)

  return (
    <div>
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

      {/* Contenu */}
      {activeView === null && (
        <CrAccueil
          cr={cr}
          affaire={affaire}
          presences={presences}
          sections={sections}
          onNavigate={setActiveView}
          onOuvrirSection={(id) => { setActiveView('remarques'); defilerVersSection(id) }}
          onEmit={handleEmit}
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
          setConvoque={setConvoque}
        />
      )}

      {activeView === 'remarques' && (
        <CrSectionEditor
          sections={sections}
          crDate={cr.date_reunion}
          interlocuteurs={interlocuteurs}
          lotEntreprises={lotEntreprises}
          ops={ops}
        />
      )}

      {activeView === 'export' && (
        <ExportView
          cr={cr}
          sections={sections}
          presences={presences}
          affaire={affaire}
          lotEntreprises={lotEntreprises}
          interlocuteurs={interlocuteurs}
        />
      )}
    </div>
  )
}
