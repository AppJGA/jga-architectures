import { Suspense, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ClipboardList, ClipboardCheck, Calendar, CalendarRange,
  BarChart2, TrendingUp, CheckSquare, FilePen, Building2, Pencil, FileText, ChevronRight,
  LayoutDashboard,
} from 'lucide-react'
import { useAffaire } from '../shared/hooks/useAffaires'
import { phases, getAllModules } from '../modules/manifest'
import { PhaseBadge } from '../shared/components/Badge'
import { ProgressBar } from '../shared/components/ProgressBar'
import { AffaireFormModal } from '../dashboard/AffaireFormModal'
import { supabase } from '../core/supabase/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ICON_MAP = {
  ClipboardList, ClipboardCheck, Calendar, CalendarRange,
  BarChart2, TrendingUp, CheckSquare, FilePen, Building2,
}

const PHASE_BAR_COLORS = {
  esq: 'var(--jga-orange)', avp: 'var(--jga-orange)',
  pro: 'var(--jga-orange)', dce: 'var(--jga-orange)',
  chantier: 'var(--jga-green)', livree: 'var(--jga-beige)',
}

const COLLAB = [
  { initials: 'MR', bg: 'var(--jga-orange)', color: 'white' },
  { initials: 'JG', bg: '#C5BEB9', color: 'white' },
  { initials: 'AL', bg: '#6B7280', color: 'white' },
]

function formatEuro(v) {
  if (!v) return null
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

// ─── Stats overview ───────────────────────────────────────────────────────────
function useAffaireStats(affaireId) {
  const [stats, setStats] = useState({
    comptesRendus: 0, reserves: 0, todos: 0, todosDone: 0,
    lots: 0, lotsAttributed: 0, lotsTotalHt: 0,
    financierSupplementsHt: 0, financierAleasHt: 0, financierDeltaPct: 0, financierAleasPct: 0,
    planningTaches: 0, planningAvancement: 0, planningDateFin: null, prochainJalon: null,
    ftmTotal: 0, ftmAccepte: 0, ftmEnAttente: 0, ftmRenonce: 0, ftmMontantAccepte: 0,
    etudeTotal: 0, prochainJalonEtude: null,
  })
  useEffect(() => {
    if (!affaireId) return
    Promise.all([
      supabase.from('comptes_rendus').select('id', { count: 'exact', head: true }).eq('affaire_id', affaireId),
      supabase.from('reserves').select('id', { count: 'exact', head: true }).eq('affaire_id', affaireId).eq('statut', 'ouverte'),
      supabase.from('todos').select('id, fait').eq('affaire_id', affaireId),
      supabase.from('lots').select('id', { count: 'exact', head: true }).eq('affaire_id', affaireId),
      supabase.from('lot_entreprises').select('montant_marche_ht').eq('affaire_id', affaireId),
      supabase.from('lignes_financieres').select('montant_ht, categorie, statut').eq('affaire_id', affaireId),
      supabase.from('planning').select('id, avancement, debut, duree').eq('affaire_id', affaireId),
      supabase.from('planning_jalons').select('id, label, date, couleur').eq('affaire_id', affaireId).order('date'),
      supabase.from('ftm').select('id, decision, montant_travaux_ht').eq('affaire_id', affaireId),
      supabase.from('planning_etude_phases').select('id').eq('affaire_id', affaireId),
      supabase.from('planning_etude_jalons').select('id, label, semaine, annee, couleur').eq('affaire_id', affaireId).order('annee').order('semaine'),
    ]).then(([cr, res, t, lots, le, lf, pl, ja, fa, ea, ej]) => {
      const lotsTotalHt = le.data?.reduce((sum, x) => sum + (x.montant_marche_ht ?? 0), 0) ?? 0
      const activeLignes = lf.data?.filter(l => l.statut !== 'refuse') ?? []
      const financierSupplementsHt = activeLignes.reduce((s, l) => s + (l.montant_ht ?? 0), 0)
      const financierAleasHt = activeLignes.filter(l => l.categorie === 'aleas').reduce((s, l) => s + (l.montant_ht ?? 0), 0)

      const planningRows = pl.data ?? []
      const planningTaches = planningRows.length
      const planningAvancement = planningTaches > 0
        ? Math.round(planningRows.reduce((s, t) => s + (t.avancement ?? 0), 0) / planningTaches)
        : 0
      // Approximate end date: debut + ceil(duree * 7/5) calendar days
      let planningDateFin = null
      if (planningTaches > 0) {
        const maxEnd = Math.max(...planningRows.map((t) => {
          const d = new Date(t.debut)
          d.setDate(d.getDate() + Math.ceil((t.duree ?? 0) * 1.4))
          return d.getTime()
        }))
        planningDateFin = new Date(maxEnd)
      }

      const todayStr = new Date().toISOString().split('T')[0]
      const prochainJalon = (ja.data ?? [])
        .filter(j => j.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null

      const ftmRows = fa.data ?? []
      const ftmAccepte = ftmRows.filter(f => f.decision === 'accepte').length
      const ftmEnAttente = ftmRows.filter(f => f.decision === 'en_attente' || !f.decision).length
      const ftmRenonce = ftmRows.filter(f => f.decision === 'renonce').length
      const ftmMontantAccepte = ftmRows
        .filter(f => f.decision === 'accepte')
        .reduce((sum, f) => sum + (Number(f.montant_travaux_ht) || 0), 0)

      const etudeTotal = (ea.data ?? []).length
      const { semaine: curSem, annee: curAnn } = (() => {
        const d = new Date(); d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
        const w1 = new Date(d.getFullYear(), 0, 4)
        const sem = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)
        return { semaine: sem, annee: d.getFullYear() }
      })()
      const prochainJalonEtude = (ej.data ?? [])
        .filter(j => j.annee > curAnn || (j.annee === curAnn && j.semaine >= curSem))
        .sort((a, b) => a.annee !== b.annee ? a.annee - b.annee : a.semaine - b.semaine)[0] ?? null

      setStats({
        comptesRendus: cr.count ?? 0,
        reserves: res.count ?? 0,
        todos: t.data?.length ?? 0,
        todosDone: t.data?.filter(x => x.fait).length ?? 0,
        lots: lots.count ?? 0,
        lotsAttributed: le.data?.length ?? 0,
        lotsTotalHt,
        financierSupplementsHt,
        financierAleasHt,
        financierDeltaPct: lotsTotalHt > 0 ? (financierSupplementsHt / lotsTotalHt) * 100 : 0,
        financierAleasPct: lotsTotalHt > 0 ? (financierAleasHt / lotsTotalHt) * 100 : 0,
        planningTaches,
        planningAvancement,
        planningDateFin,
        prochainJalon,
        ftmTotal: ftmRows.length,
        ftmAccepte,
        ftmEnAttente,
        ftmRenonce,
        ftmMontantAccepte,
        etudeTotal,
        prochainJalonEtude,
      })
    })
  }, [affaireId])
  return stats
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        border: '2px solid var(--jga-orange-light)',
        borderTopColor: 'var(--jga-orange)',
        animation: 'jga-spin 0.7s linear infinite',
      }} />
    </div>
  )
}

// ─── Module renderer ──────────────────────────────────────────────────────────
function ModuleRenderer({ mod }) {
  const Comp = mod.component
  return <Suspense fallback={<Spinner />}><Comp /></Suspense>
}

// ─── Header ───────────────────────────────────────────────────────────────────
function AffaireHeader({ affaire, onEdit }) {
  const navigate = useNavigate()
  const barColor = PHASE_BAR_COLORS[affaire.phase] ?? 'var(--jga-beige)'

  return (
    <div style={{
      backgroundColor: 'white',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--jga-beige)', padding: 0, flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--jga-orange)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--jga-beige)'}
        >
          <ArrowLeft size={13} />
          Tableau de bord
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
        <div style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: barColor, flexShrink: 0 }} />

        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.06em', flexShrink: 0 }}>
          {affaire.code_affaire}
        </span>

        <span style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {affaire.nom}
        </span>

        {affaire.moa_nom && (
          <span style={{ fontSize: 12, color: 'var(--jga-beige)', flexShrink: 0 }}>
            {affaire.moa_nom}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <PhaseBadge phase={affaire.phase} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 120 }}>
            <ProgressBar value={affaire.avancement} phase={affaire.phase} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--jga-beige)', fontWeight: 500 }}>
            {affaire.avancement}%
          </span>
        </div>

        <div style={{ display: 'flex' }}>
          {COLLAB.map((c, i) => (
            <div key={i} style={{
              width: 24, height: 24, borderRadius: '50%',
              backgroundColor: c.bg, color: c.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 500,
              marginLeft: i > 0 ? -6 : 0,
              border: '1.5px solid white',
            }}>
              {c.initials}
            </div>
          ))}
        </div>

        <button
          onClick={onEdit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6,
            border: '0.5px solid var(--jga-orange)',
            backgroundColor: 'transparent', color: 'var(--jga-orange)',
            fontSize: 11, cursor: 'pointer',
          }}
        >
          <Pencil size={11} />
          Modifier
        </button>
      </div>
    </div>
  )
}

// ─── Bandeau infos clés ───────────────────────────────────────────────────────
function InfoBandeau({ affaire }) {
  const pills = [
    affaire.projet_commune && (affaire.projet_code_postal
      ? `${affaire.projet_commune} (${affaire.projet_code_postal})`
      : affaire.projet_commune),
    (affaire.cadastre_section || affaire.cadastre_parcelle) &&
      `${affaire.cadastre_section ?? ''}${affaire.cadastre_parcelle ? ' ' + affaire.cadastre_parcelle : ''}`,
    affaire.enveloppe_ttc && formatEuro(affaire.enveloppe_ttc),
    affaire.surface_plancher && `${affaire.surface_plancher} m² SP`,
    affaire.date_livraison && `Livraison ${fmtDate(affaire.date_livraison)}`,
  ].filter(Boolean)

  if (pills.length === 0) return null

  return (
    <div style={{
      backgroundColor: 'var(--jga-beige-light)',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      padding: '8px 24px',
      display: 'flex', alignItems: 'center', gap: 0,
      flexShrink: 0, flexWrap: 'wrap',
    }}>
      {pills.map((p, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{p}</span>
          {i < pills.length - 1 && (
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.2)', margin: '0 8px' }}>·</span>
          )}
        </span>
      ))}
    </div>
  )
}

// ─── Sidebar modules ──────────────────────────────────────────────────────────
function ModuleItem({ mod, phaseColor, affaireId, isActive }) {
  const [hovered, setHovered] = useState(false)
  const navigate = useNavigate()
  const Icon = ICON_MAP[mod.icon]
  const disabled = !mod.enabled
  const show = (isActive || hovered) && !disabled

  const hoverBg = phaseColor === '#639922' ? 'var(--jga-green-light)' : 'var(--jga-orange-light)'
  const activeColor = phaseColor === '#639922' ? 'var(--jga-green)' : 'var(--jga-orange)'
  const activeShadow = phaseColor === '#639922'
    ? 'inset 2px 0 0 var(--jga-green)'
    : 'inset 2px 0 0 var(--jga-orange)'

  return (
    <button
      onClick={disabled ? undefined : () => navigate(`/affaires/${affaireId}/${mod.path}`)}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        padding: '7px 12px',
        borderRadius: 8,
        fontSize: 12,
        backgroundColor: show ? hoverBg : 'transparent',
        boxShadow: isActive && !disabled ? activeShadow : 'none',
        color: show ? activeColor : '#6b7280',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {Icon && <Icon size={15} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{mod.label}</span>
    </button>
  )
}

function ModulesSidebar({ affaireId, moduleId }) {
  const navigate = useNavigate()

  return (
    <aside style={{
      width: 200, minWidth: 200,
      backgroundColor: 'white',
      borderRight: '0.5px solid rgba(0,0,0,0.08)',
      padding: '12px',
      overflowY: 'auto',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Informations générales */}
      <button
        onClick={() => navigate(`/affaires/${affaireId}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '8px 12px',
          borderRadius: 8, fontSize: 12,
          backgroundColor: !moduleId ? 'var(--jga-orange-light)' : 'transparent',
          color: !moduleId ? 'var(--jga-orange)' : '#6b7280',
          border: !moduleId ? '0.5px solid var(--jga-orange)' : '0.5px solid transparent',
          fontWeight: !moduleId ? 500 : 400,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <LayoutDashboard size={14} />
        Informations générales
      </button>

      <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '8px 0 12px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {phases.map((phase, pi) => (
          <div key={phase.id}>
            {/* Phase header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingLeft: 4 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: phase.color, flexShrink: 0,
              }} />
              <span style={{
                fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {phase.label}
              </span>
            </div>

            {/* Module items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {phase.modules.map(mod => (
                <ModuleItem
                  key={mod.id}
                  mod={mod}
                  phaseColor={phase.color}
                  affaireId={affaireId}
                  isActive={moduleId === mod.path}
                />
              ))}
            </div>

            {pi < phases.length - 1 && (
              <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '12px 0 0' }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '14px 0' }} />

      <p style={{
        fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        marginBottom: 4, paddingLeft: 4,
      }}>
        Documents
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px', borderRadius: 8,
        fontSize: 12, color: '#6b7280',
        opacity: 0.4, cursor: 'default',
      }}>
        <FileText size={15} style={{ flexShrink: 0 }} />
        <span>Documents · bientôt</span>
      </div>
    </aside>
  )
}

// ─── Tuile module ─────────────────────────────────────────────────────────────
function ModuleTile({ icon: Icon, label, phaseColor, active, children, onClick }) {
  const [hovered, setHovered] = useState(false)

  const hoverBorder = phaseColor === '#639922' ? 'var(--jga-green)' : 'var(--jga-orange-mid)'
  const iconColor = active
    ? (phaseColor === '#639922' ? 'var(--jga-green)' : 'var(--jga-orange)')
    : '#9B8F85'

  return (
    <div
      onClick={active ? onClick : undefined}
      onMouseEnter={() => active && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        backgroundColor: 'white',
        borderRadius: 14,
        border: hovered ? `0.5px solid ${hoverBorder}` : '0.5px solid rgba(0,0,0,0.08)',
        padding: 20,
        cursor: active ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        opacity: active ? 1 : 0.7,
      }}
    >
      {!active && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 10, fontWeight: 500,
          backgroundColor: '#F1EFE8', color: '#9B8F85',
          borderRadius: 20, padding: '2px 7px',
        }}>
          Bientôt
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={18} style={{ color: iconColor }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: active ? '#1a1a1a' : '#9B8F85' }}>
            {label}
          </span>
        </div>
        {active && <ChevronRight size={14} style={{ color: 'var(--jga-beige)' }} />}
      </div>

      {children}
    </div>
  )
}

// ─── Vue d'ensemble ───────────────────────────────────────────────────────────
function InfoField({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 500, color: value ? '#1a1a1a' : 'var(--jga-beige)' }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function PhaseSection({ phase, affaire, stats, affaireId, navigate }) {
  const isEtude = phase.id === 'etude'
  const isChantier = phase.id === 'chantier'

  return (
    <div>
      {/* Phase label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: phase.color }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>{phase.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {phase.modules.map(mod => {
          const Icon = ICON_MAP[mod.icon]
          if (!Icon) return null

          return (
            <ModuleTile
              key={mod.id}
              icon={Icon}
              label={mod.label}
              phaseColor={phase.color}
              active={mod.enabled}
              onClick={() => navigate(`/affaires/${affaireId}/${mod.path}`)}
            >
              {isChantier && mod.id === 'lots-entreprises' && mod.enabled && (
                stats.lots === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucun lot — configurer les entreprises</p>
                ) : (
                  <>
                    <p style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 2 }}>
                      {stats.lotsAttributed}/{stats.lots}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                      lots attribués{stats.lotsTotalHt > 0 ? ` · ${formatEuro(stats.lotsTotalHt)} HT` : ''}
                    </p>
                  </>
                )
              )}

              {isChantier && mod.id === 'comptes-rendus' && (
                stats.comptesRendus === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Commencer le suivi de chantier</p>
                ) : (
                  <>
                    <p style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 2 }}>
                      {stats.comptesRendus}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                      compte{stats.comptesRendus > 1 ? 's' : ''} rendu · {stats.reserves} réserve{stats.reserves !== 1 ? 's' : ''} ouverte{stats.reserves !== 1 ? 's' : ''}
                    </p>
                  </>
                )
              )}

              {isChantier && mod.id === 'financier-chantier' && mod.enabled && (
                stats.lotsAttributed === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Configurer les lots et marchés</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a' }}>
                        {formatEuro(stats.lotsTotalHt + stats.financierSupplementsHt)}
                      </p>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>HT</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats.financierAleasPct > 5 ? 8 : 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                        Marchés {formatEuro(stats.lotsTotalHt)} HT
                      </p>
                      {stats.financierSupplementsHt !== 0 && (
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: stats.financierSupplementsHt >= 0 ? '#639922' : '#dc2626',
                        }}>
                          {stats.financierSupplementsHt > 0 ? '+' : ''}{formatEuro(stats.financierSupplementsHt)}
                        </span>
                      )}
                    </div>
                    {stats.financierAleasPct > 5 && (
                      <div style={{
                        backgroundColor: '#FEF3C7', borderRadius: 6, padding: '4px 8px',
                        fontSize: 11, color: '#92400E',
                      }}>
                        Aléas {stats.financierAleasPct.toFixed(1)}% du marché
                      </div>
                    )}
                  </>
                )
              )}

              {isEtude && mod.id === 'planning-etude' && mod.enabled && (
                stats.etudeTotal === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucune phase — ouvrir le planning</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: stats.prochainJalonEtude ? 6 : 0 }}>
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a' }}>{stats.etudeTotal}</p>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>phase{stats.etudeTotal > 1 ? 's' : ''}</span>
                    </div>
                    {stats.prochainJalonEtude && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stats.prochainJalonEtude.couleur, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          {stats.prochainJalonEtude.label} · S{stats.prochainJalonEtude.semaine} {stats.prochainJalonEtude.annee}
                        </span>
                      </div>
                    )}
                  </>
                )
              )}

              {isEtude && mod.id === 'financier-etude' && !mod.enabled && (
                affaire.enveloppe_ttc ? (
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#9B8F85' }}>
                    {formatEuro(affaire.enveloppe_ttc)}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Enveloppe non renseignée</p>
                )
              )}

              {isEtude && mod.id === 'todo' && !mod.enabled && (
                stats.todos === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucune tâche</p>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                    {stats.todos} tâche{stats.todos > 1 ? 's' : ''} · {stats.todosDone} faite{stats.todosDone > 1 ? 's' : ''}
                  </p>
                )
              )}

              {isChantier && mod.id === 'planning-chantier' && mod.enabled && (
                stats.planningTaches === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucune tâche — ouvrir le planning</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a' }}>{stats.planningTaches}</p>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>tâche{stats.planningTaches > 1 ? 's' : ''}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--jga-beige)', marginBottom: stats.planningDateFin ? 6 : 0 }}>
                      Avancement moyen : {stats.planningAvancement} %
                    </p>
                    {stats.planningDateFin && (
                      <div style={{
                        backgroundColor: '#F0F7E8', borderRadius: 6, padding: '3px 8px',
                        fontSize: 11, color: '#3a6011', display: 'inline-block',
                      }}>
                        Fin estimée {stats.planningDateFin.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                      </div>
                    )}
                    {stats.prochainJalon && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stats.prochainJalon.couleur, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          {stats.prochainJalon.label} · {new Date(stats.prochainJalon.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    )}
                  </>
                )
              )}

              {isChantier && mod.id === 'ftm' && mod.enabled && (
                stats.ftmTotal === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucune FTM enregistrée</p>
                ) : (
                  <>
                    <p style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 2 }}>
                      {stats.ftmTotal}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats.ftmMontantAccepte !== 0 ? 6 : 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                        {stats.ftmAccepte} acceptée{stats.ftmAccepte !== 1 ? 's' : ''} · {stats.ftmEnAttente} en attente
                      </p>
                    </div>
                    {stats.ftmMontantAccepte !== 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: stats.ftmMontantAccepte >= 0 ? '#639922' : '#dc2626',
                      }}>
                        {stats.ftmMontantAccepte > 0 ? '+' : '−'}{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.abs(stats.ftmMontantAccepte))} HT accepté
                      </span>
                    )}
                  </>
                )
              )}

              {!['lots-entreprises', 'comptes-rendus', 'financier-chantier', 'planning-chantier', 'planning-etude', 'financier-etude', 'todo', 'ftm'].includes(mod.id) && !mod.enabled && (
                <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>En cours de développement</p>
              )}
            </ModuleTile>
          )
        })}
      </div>
    </div>
  )
}

function AffaireOverview({ affaire, stats, affaireId, onEdit }) {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      {/* Phase sections */}
      {phases.map(phase => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          affaire={affaire}
          stats={stats}
          affaireId={affaireId}
          navigate={navigate}
        />
      ))}

      {/* Infos affaire */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 14,
        border: '0.5px solid rgba(0,0,0,0.08)',
        padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>Informations de l'affaire</span>
          <button
            onClick={onEdit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--jga-orange)',
            }}
          >
            Modifier <ChevronRight size={12} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px' }}>
          <InfoField label="Maître d'ouvrage" value={affaire.moa_nom} />
          <InfoField label="Email MOA" value={affaire.moa_email} />
          <InfoField label="Téléphone MOA" value={affaire.moa_telephone} />
          <InfoField label="Adresse du site" value={affaire.projet_adresse} />
          <InfoField label="Commune" value={affaire.projet_commune} />
          <InfoField label="Code postal" value={affaire.projet_code_postal} />
          <InfoField label="Section cadastrale" value={affaire.cadastre_section} />
          <InfoField label="Parcelle" value={affaire.cadastre_parcelle} />
          <InfoField label="Superficie terrain" value={affaire.surface_terrain ? `${affaire.surface_terrain} m²` : null} />
          <InfoField label="Enveloppe TTC" value={formatEuro(affaire.enveloppe_ttc)} />
          <InfoField label="Surface plancher" value={affaire.surface_plancher ? `${affaire.surface_plancher} m²` : null} />
          <InfoField label="Date de livraison" value={fmtDate(affaire.date_livraison)} />
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export function AffairePage() {
  const { affaireId, moduleId } = useParams()
  const { affaire: rawAffaire, loading, updateAffaire } = useAffaire(affaireId)
  const [affaire, setAffaire] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const stats = useAffaireStats(affaireId)

  useEffect(() => {
    if (rawAffaire) setAffaire(rawAffaire)
  }, [rawAffaire])

  const activeModule = getAllModules().find(m => m.path === moduleId) ?? null

  const handleSave = async (data) => {
    await updateAffaire(data)
    setEditOpen(false)
  }

  if (loading || !affaire) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <>
      <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AffaireHeader affaire={affaire} onEdit={() => setEditOpen(true)} />
        <InfoBandeau affaire={affaire} />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <ModulesSidebar affaireId={affaireId} moduleId={moduleId} />
          <main style={{
            flex: 1,
            overflowY: activeModule?.layout === 'fullbleed' ? 'hidden' : 'auto',
            backgroundColor: 'var(--jga-beige-light)',
            padding: activeModule?.layout === 'fullbleed' ? 0 : 24,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {activeModule
              ? <ModuleRenderer mod={activeModule} />
              : <AffaireOverview affaire={affaire} stats={stats} affaireId={affaireId} onEdit={() => setEditOpen(true)} />
            }
          </main>
        </div>
      </div>

      {editOpen && (
        <AffaireFormModal
          affaire={affaire}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}
