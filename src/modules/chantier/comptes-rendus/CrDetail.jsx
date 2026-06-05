import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, ChevronLeft, Send, FileText, FileDown,
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
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13,
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
          <select value={form.redacteur_id ?? ''} onChange={e => set('redacteur_id', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
            <option value="">— Non défini —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{[p.prenom, p.nom].filter(Boolean).join(' ') || p.email}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleSave} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={() => setTemplateOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}
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
          padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 500,
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

// ─── Page d'accueil (grille de bulles) ───────────────────────────────────────

function CrAccueil({ cr, presences, sections, onNavigate, onEmit }) {
  const num = String(cr.numero).padStart(2, '0')
  const dateLabel = cr.date_reunion
    ? new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date non définie'

  const allRemarques = sections.flatMap(s => (s.sousSections ?? []).flatMap(ss => ss.remarques ?? []))
  const enCoursCount = allRemarques.filter(r => !r.est_clos && r.statut && (
    r.statut.toLowerCase().includes('faire') || r.statut.toLowerCase().includes('cours')
  )).length

  return (
    <div style={{ maxWidth: 640 }}>
      {/* En-tête du CR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 500, color: '#1F1B17', marginBottom: 3 }}>Réunion n°{num}</p>
          <p style={{ fontSize: 12, color: '#9C9591' }}>{dateLabel}</p>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '3px 10px',
          backgroundColor: cr.statut === 'emis' ? 'rgba(42,138,78,0.12)' : '#F3F4F6',
          color: cr.statut === 'emis' ? '#2A8A4E' : '#5E5854',
        }}>
          {cr.statut === 'emis' ? 'Émis' : 'Brouillon'}
        </span>
        <button
          onClick={onEmit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            border: 'none', cursor: 'pointer',
            backgroundColor: cr.statut === 'emis' ? '#F3F4F6' : '#2A8A4E',
            color: cr.statut === 'emis' ? '#5E5854' : 'white',
          }}
        >
          <Send size={13} />
          {cr.statut === 'emis' ? 'Repasser en brouillon' : 'Émettre le CR'}
        </button>
      </div>

      {/* Grille 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {VUES.map(vue => (
          <div
            key={vue.id}
            onClick={() => onNavigate(vue.id)}
            style={{
              background: 'white', borderRadius: 16,
              border: '0.5px solid rgba(0,0,0,0.08)',
              padding: '28px 24px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 14, textAlign: 'center',
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = vue.couleur
              e.currentTarget.style.background = vue.fondClair
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'
              e.currentTarget.style.background = 'white'
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: vue.fondClair,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <vue.icon size={28} color={vue.couleur} />
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1F1B17', marginBottom: 6 }}>
                {vue.label}
              </div>
              <div style={{ fontSize: 11, color: '#9C9591', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {vue.description}
              </div>
            </div>

            {vue.id === 'presences' && presences.length > 0 && (
              <span style={{
                fontSize: 10, color: vue.couleur, background: vue.fondClair,
                border: `0.5px solid ${vue.couleur}40`, borderRadius: 20, padding: '2px 8px',
              }}>
                {presences.length} participant{presences.length > 1 ? 's' : ''}
              </span>
            )}

            {vue.id === 'remarques' && allRemarques.length > 0 && (
              <span style={{
                fontSize: 10, color: vue.couleur, background: vue.fondClair,
                border: `0.5px solid ${vue.couleur}40`, borderRadius: 20, padding: '2px 8px',
              }}>
                {enCoursCount > 0 ? `${enCoursCount} point${enCoursCount > 1 ? 's' : ''} en cours` : `${allRemarques.length} remarque${allRemarques.length > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── CrDetail principal ───────────────────────────────────────────────────────

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
    addSection, updateSection, deleteSection, reorderSection,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, updateRemarque, deleteRemarque, reorderRemarque,
    setPresence, setConvoque, refetch,
  } = useCompteRendu(crId, affaire?.id)

  useEffect(() => {
    if (syncDone.current) return
    syncDone.current = true
    syncPresences()
  }, [crId]) // eslint-disable-line react-hooks/exhaustive-deps

  const ops = {
    addSection, updateSection, deleteSection, reorderSection,
    addSousSection, updateSousSection, deleteSousSection, reorderSousSection,
    addRemarque, updateRemarque, deleteRemarque, reorderRemarque,
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
              padding: '10px 16px', borderRadius: 10,
              border: '0.5px solid rgba(0,0,0,0.15)', background: 'white',
              fontSize: 13, fontWeight: 500, color: '#1F1B17',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--jga-orange)'; e.currentTarget.style.color = 'var(--jga-orange)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#1F1B17' }}
          >
            <LayoutDashboard size={16} /> Retour au compte rendu
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#5E5854', cursor: 'pointer' }}
          >
            <ArrowLeft size={13} /> Liste des visites
          </button>
        </div>
      )}

      {/* Contenu */}
      {activeView === null && (
        <CrAccueil
          cr={cr}
          presences={presences}
          sections={sections}
          onNavigate={setActiveView}
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
