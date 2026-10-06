import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Pencil, ChevronRight, Eye, ChevronDown, Check, Lock } from 'lucide-react'
import { useAffaire } from '../shared/hooks/useAffaires'
import { useAffaireCollaborateurs } from '../shared/hooks/useAffaireCollaborateurs'
import { useAuth } from '../core/auth/useAuth'
import { useTitreBandeau } from '../core/layout/retourContexte'
import { RetourCourant } from '../core/layout/RetourCourant'
import { BandeauVisite } from '../modules/chantier/comptes-rendus/BandeauVisite'
import { CollabModal } from './CollabModal'
import { phasesPour, getAllModules } from '../modules/manifest'
import { PHASES_AFFAIRE, periodeAffaire, libellePhase, variablesPhase, phasesDuTableau } from './phaseAffaire'

import { AffaireFormModal } from '../dashboard/AffaireFormModal'
import { ContactsAffaire } from './ContactsAffaire'
import { supabase, verrouillerEcritures, deverrouillerEcritures, surEcritureRefusee } from '../core/supabase/client'
import { infosStatut } from '../modules/chantier/comptes-rendus/crLogique'
import { dernierePhaseRenseignee, nomPhase } from '../modules/etude/financier/phases'
import {
  IconeTableauDeBord, IconePlanningEtude, IconeFinancierEtude, IconeEntreprisesLots, IconeVisitesChantier,
  IconeOpr, IconeFtm, IconePlanningChantier, IconeFinancierChantier, IconeDocuments, IconeTodo,
} from '../shared/icones/IconesAffaire'
import { montantsAffaire, tvaAffaire, htDe, formatEuros } from '../shared/montants'
import { MontantHT } from '../shared/components/MontantHT'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Noms du manifeste → icônes de l'agence
const ICON_MAP = {
  Calendar: IconePlanningEtude,
  BarChart2: IconeFinancierEtude,
  CheckSquare: IconeTodo,
  Building2: IconeEntreprisesLots,
  ClipboardList: IconeVisitesChantier,
  ClipboardCheck: IconeOpr,
  FilePen: IconeFtm,
  CalendarRange: IconePlanningChantier,
  TrendingUp: IconeFinancierChantier,
  FileText: IconeDocuments,
}


function formatEuro(v) {
  if (!v) return null
  return formatEuros(v)
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
    financierEtudeDernierePhase: null, financierEtudeEnvActuelle: null,
    crTotal: 0, crEmis: 0, crDernierDate: null, crProchaineReunion: null, remarquesAFaire: 0,
  })
  useEffect(() => {
    if (!affaireId) return
    Promise.all([
      supabase.from('comptes_rendus').select('id, statut, date_reunion, date_prochaine_reunion').eq('affaire_id', affaireId).order('numero', { ascending: false }),
      supabase.from('cr_remarques').select('cr_id, parent_id, statut, est_clos').eq('affaire_id', affaireId).eq('est_clos', false),
      supabase.from('todos').select('id, fait').eq('affaire_id', affaireId),
      supabase.from('lots').select('id', { count: 'exact', head: true }).eq('affaire_id', affaireId),
      supabase.from('lot_entreprises').select('montant_marche_ht').eq('affaire_id', affaireId),
      supabase.from('lignes_financieres').select('montant_ht, categorie, statut').eq('affaire_id', affaireId),
      supabase.from('planning').select('id, avancement, debut, duree').eq('affaire_id', affaireId),
      supabase.from('planning_jalons').select('id, label, date, couleur').eq('affaire_id', affaireId).order('date'),
      supabase.from('ftm').select('id, decision, montant_travaux_ht').eq('affaire_id', affaireId),
      supabase.from('planning_etude_phases').select('id').eq('affaire_id', affaireId),
      supabase.from('planning_etude_jalons').select('id, label, semaine, annee, couleur').eq('affaire_id', affaireId).order('annee').order('semaine'),
      supabase.from('suivi_financier_etude').select('*').eq('affaire_id', affaireId),
    ]).then(([crData, remAFaire, t, lots, le, lf, pl, ja, fa, ea, ej, sfe]) => {
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

      // Même règle que le suivi financier : la dernière phase de la liste qui
      // porte un montant, sous le nom saisi (les phases sont nommées librement)
      const derniereSfe = dernierePhaseRenseignee(sfe.data ?? [])

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

      const crRows = crData.data ?? []
      const crEmis = crRows.filter(c => c.statut === 'emis').length

      setStats({
        comptesRendus: crRows.length,
        reserves: 0,
        crTotal: crRows.length,
        crEmis,
        crDernierDate: crRows[0]?.date_reunion ?? null,
        crProchaineReunion: crRows[0]?.date_prochaine_reunion ?? null,
        // Chaque visite reprend les remarques ouvertes de la précédente : compter
        // tous les CR comptait une même remarque autant de fois qu'elle a été
        // reprise. Seul le dernier CR fait foi, et sans les suivis.
        remarquesAFaire: (remAFaire.data ?? [])
          .filter(r => r.cr_id === crRows[0]?.id && !r.parent_id && infosStatut(r).famille === 'rouge').length,
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
        financierEtudeDernierePhase: derniereSfe ? nomPhase(derniereSfe) : null,
        // HT et TTC gardés tels quels : la tuile en tire le HT au taux de l'affaire
        financierEtudeEnvActuelle: derniereSfe ? { ht: derniereSfe.enveloppe_ht ?? null, ttc: derniereSfe.enveloppe_ttc ?? null } : null,
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
// Même en-tête pour tous les modules : icône et nom, tels qu'au menu. Un
// module n'écrit plus son propre titre, seulement ce qui le précise
// (compteurs, actions).
function TitreModule({ mod, pleinePage }) {
  const Icone = ICON_MAP[mod.icon]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      padding: pleinePage ? '16px 24px 12px' : 0, marginBottom: pleinePage ? 0 : 16,
    }}>
      {Icone && <Icone size={28} color="var(--affaire-accent)" strokeWidth={1.25} />}
      <h1 style={{ fontFamily: "'Archivo', sans-serif", fontSize: 20, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
        {mod.label}
      </h1>
    </div>
  )
}

function ModuleRenderer({ mod, lectureSeule }) {
  const Comp = mod.component
  return <Suspense fallback={<Spinner />}><Comp lectureSeule={lectureSeule} /></Suspense>
}

// ─── Photo de l'affaire ───────────────────────────────────────────────────────
// La photo de couverture (colonne `photo_url`, bucket `affaires-photos`) est
// déjà téléversée depuis le formulaire d'affaire et affichée sur le tableau de
// bord ; elle habille ici le fond de la vue d'ensemble.
//
// Fond lavé de la vue d'ensemble. Deux réglages, à ajuster ensemble : l'opacité
// de la photo et la force du voile qui la recouvre. Ce que l'on voit réellement
// de la photo à une hauteur donnée, c'est OPACITE × (1 − voile) — d'où un voile
// volontairement léger en haut, sinon la photo disparaît sur le beige.
const PHOTO_OPACITE = 0.5
const PHOTO_VOILE =
  'linear-gradient(180deg, rgba(245,241,233,0.44) 0%, rgba(245,241,233,0.68) 55%, rgba(245,241,233,0.90) 100%)'

// Le libellé de phase est le seul texte posé directement sur le fond. Avec la
// photo visible à 28 % en haut, le #5E5854 du reste de l'interface tomberait à
// 3,2:1 sur une zone sombre ; ce ton-ci tient 5,5:1 dans le même pire cas.
const COULEUR_LIBELLE_PHASE = '#3A342E'

function PhotoFond({ url }) {
  const ancre = useRef(null)
  const [hauteur, setHauteur] = useState(0)

  // Le calque doit couvrir exactement la zone visible du <main>. Une hauteur en
  // 100vh la dépasserait et compterait dans le débordement défilable : barre de
  // défilement fantôme et beige vide sous le contenu dès que la page est plus
  // courte que la fenêtre. D'où la mesure — clientHeight est la boîte de
  // padding, exactement ce que les décalages de -24 px recouvrent.
  useEffect(() => {
    const zone = ancre.current?.parentElement
    if (!zone) return
    const ro = new ResizeObserver(() => setHauteur(zone.clientHeight))
    ro.observe(zone)
    return () => ro.disconnect()
  }, [])

  const calque = {
    position: 'absolute', top: -24, left: -24, right: -24, height: hauteur,
    pointerEvents: 'none',
  }

  return (
    <div ref={ancre} aria-hidden="true" style={{ position: 'sticky', top: 0, height: 0, zIndex: 0 }}>
      {hauteur > 0 && (
        <>
          <div
            style={{
              ...calque,
              backgroundImage: `url(${JSON.stringify(url)})`,
              backgroundSize: 'cover', backgroundPosition: 'center 45%',
              opacity: PHOTO_OPACITE,
              filter: 'saturate(0.7) contrast(0.95)',
              animation: 'jga-fade 0.9s ease both',
            }}
          />
          {/* Voile dégradé : lisibilité en haut, fondu dans le beige en bas */}
          <div style={{ ...calque, background: PHOTO_VOILE }} />
        </>
      )}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
// ─── Phase de l'affaire, modifiable depuis l'en-tête ─────────────────────────
// Écrit le même champ que la fiche de l'affaire : les deux restent d'accord.
function ChoixPhase({ phase, canEdit, onChanger }) {
  const [ouvert, setOuvert] = useState(false)
  const groupes = [
    ['Étude', PHASES_AFFAIRE.filter((p) => periodeAffaire(p.value) === 'etude')],
    ['Chantier', PHASES_AFFAIRE.filter((p) => periodeAffaire(p.value) === 'chantier')],
  ]
  const etiquette = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 9px', borderRadius: 3, fontSize: 11, fontWeight: 600,
    color: 'var(--affaire-accent)', backgroundColor: 'var(--affaire-accent-clair)',
    border: '0.5px solid var(--affaire-accent-bord)',
  }
  if (!canEdit) return <span style={etiquette}>{libellePhase(phase)}</span>

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        title="Changer la phase de l'affaire"
        style={{ ...etiquette, cursor: 'pointer' }}
      >
        {libellePhase(phase)}
        <ChevronDown size={12} strokeWidth={1.5} />
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 31, width: 210,
            backgroundColor: 'white', border: '0.5px solid rgba(0,0,0,0.12)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.10)', padding: 4,
          }}>
            {groupes.map(([titre, phases]) => (
              <div key={titre}>
                <p style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: titre === 'Étude' ? 'var(--jga-orange)' : 'var(--jga-green)',
                  margin: 0, padding: '8px 10px 4px',
                }}>
                  {titre}
                </p>
                {phases.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setOuvert(false); if (p.value !== phase) onChanger(p.value) }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', minHeight: 32, padding: '6px 10px', textAlign: 'left',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#1F1B17', fontWeight: p.value === phase ? 600 : 400,
                    }}
                  >
                    {p.label}
                    {p.value === phase && <Check size={13} strokeWidth={2} color="var(--affaire-accent)" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AffaireHeader({ affaire, onEdit, onChangerPhase, collaborateurs, canEdit, collabLoading, isProprietaire, onCollabClick, onSelfAssign }) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      padding: '2px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
    }}>
      {/* Le titre de l'affaire est monté dans le bandeau du haut ; le retour
          vient ici, juste dessous : c'est là qu'on le cherche */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <RetourCourant />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <ChoixPhase phase={affaire.phase} canEdit={canEdit} onChanger={onChangerPhase} />

        {!collabLoading && collaborateurs.length > 0 && (
          <div
            onClick={onCollabClick}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            title="Gérer les collaborateurs"
          >
            {collaborateurs.slice(0, 5).map((c, i) => {
              const initiales = ((c.profiles?.prenom?.[0] ?? '') + (c.profiles?.nom?.[0] ?? '')).toUpperCase() || '?'
              return (
                <div key={c.user_id} style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: c.role === 'proprietaire' ? 'var(--affaire-accent)' : '#9C9591',
                  color: 'white', fontSize: 10, fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid white', marginLeft: i === 0 ? 0 : -8,
                  zIndex: 10 - i, position: 'relative',
                }}>
                  {initiales}
                </div>
              )
            })}
            {collaborateurs.length > 5 && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: '#FAF7F2', color: '#9C9591', fontSize: 10,
                border: '2px solid white', marginLeft: -8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                +{collaborateurs.length - 5}
              </div>
            )}
          </div>
        )}
        {!collabLoading && collaborateurs.length === 0 && !isProprietaire && (
          <button
            onClick={onSelfAssign}
            style={{
              fontSize: 11, color: 'var(--affaire-accent)',
              background: 'var(--affaire-accent-clair)',
              border: '0.5px solid var(--affaire-accent-bord)',
              borderRadius: 3, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            + M'assigner comme responsable
          </button>
        )}

        {canEdit && (
          <button
            onClick={onEdit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 3,
              border: '0.5px solid var(--affaire-accent)',
              backgroundColor: 'transparent', color: 'var(--affaire-accent)',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            <Pencil size={11} strokeWidth={1.25} />
            Modifier
          </button>
        )}
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
    montantsAffaire(affaire).enveloppe != null && `${formatEuro(montantsAffaire(affaire).enveloppe)} HT`,
    affaire.surface_plancher && `${affaire.surface_plancher} m² SP`,
    affaire.date_livraison && `Livraison ${fmtDate(affaire.date_livraison)}`,
  ].filter(Boolean)

  if (pills.length === 0) return null

  return (
    <div style={{
      backgroundColor: 'var(--jga-beige-light)',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      padding: '9px 24px',
      display: 'flex', alignItems: 'center', gap: 0,
      flexShrink: 0, flexWrap: 'wrap',
    }}>
      {pills.map((p, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#5E5854' }}>{p}</span>
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

  const hoverBg = phaseColor === '#2A8A4E' ? 'var(--jga-green-light)' : 'var(--jga-orange-light)'
  const activeColor = phaseColor === '#2A8A4E' ? 'var(--jga-green)' : 'var(--jga-orange)'
  const activeShadow = phaseColor === '#2A8A4E'
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
        borderRadius: 2,
        fontSize: 12,
        backgroundColor: show ? hoverBg : 'transparent',
        boxShadow: isActive && !disabled ? activeShadow : 'none',
        color: show ? activeColor : '#5E5854',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {Icon && <Icon size={22} strokeWidth={1.25} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{mod.label}</span>
    </button>
  )
}

function ModulesSidebar({ affaireId, moduleId }) {
  const { estAgence } = useAuth()
  const phasesVues = phasesPour(estAgence)
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(`sidebar-collapsed-${affaireId}`)
      return saved ? JSON.parse(saved) : { etude: false, chantier: false }
    } catch { return { etude: false, chantier: false } }
  })

  const toggleSection = (id) => {
    setCollapsed(c => {
      const next = { ...c, [id]: !c[id] }
      try { localStorage.setItem(`sidebar-collapsed-${affaireId}`, JSON.stringify(next)) } catch {}
      return next
    })
  }

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
      {/* Tableau de bord : le point de retour de l'affaire, il se distingue des
          modules par un fond — plein quand on y est, teinté sinon */}
      <button
        onClick={() => navigate(`/affaires/${affaireId}`)}
        aria-current={!moduleId ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '9px 12px', borderRadius: 3,
          border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          backgroundColor: !moduleId ? 'var(--affaire-accent)' : 'var(--affaire-accent-clair)',
          color: !moduleId ? 'white' : 'var(--affaire-accent)',
          transition: 'background-color 0.15s, color 0.15s', marginBottom: 4,
        }}
        onMouseEnter={e => { if (moduleId) e.currentTarget.style.backgroundColor = 'var(--affaire-accent-survol)' }}
        onMouseLeave={e => { if (moduleId) e.currentTarget.style.backgroundColor = 'var(--affaire-accent-clair)' }}
      >
        <IconeTableauDeBord size={22} />
        Tableau de bord
      </button>

      <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '4px 0 8px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {phasesVues.map((phase, pi) => {
          const isCollapsed = collapsed[phase.id] ?? false
          return (
            <div key={phase.id}>
              {/* Phase header — cliquable */}
              <div
                onClick={() => toggleSection(phase.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 12px', cursor: 'pointer', userSelect: 'none',
                  borderRadius: 3,
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: phase.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {phase.label}
                  </span>
                </div>
                <ChevronDown
                  size={12}
                  strokeWidth={1.25}
                  color="#9C9591"
                  style={{ transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0 }}
                />
              </div>

              {/* Module items */}
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 4 }}>
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
              )}

              {pi < phasesVues.length - 1 && (
                <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '4px 0' }} />
              )}
            </div>
          )
        })}
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
        padding: '7px 12px', borderRadius: 2,
        fontSize: 12, color: '#5E5854',
        opacity: 0.4, cursor: 'default',
      }}>
        <IconeDocuments size={22} />
        <span>Documents · bientôt</span>
      </div>
    </aside>
  )
}

// ─── Entrées échelonnées ──────────────────────────────────────────────────────
// Le design fixe les décalages en dur pour ses 6 tuiles ; ici le nombre de
// modules par phase vient du manifeste, d'où la suite : chaque tuile part
// 0,07 s après la précédente, et le libellé de phase juste avant sa première.
const delaiCarte = (rang) => `${(0.10 + 0.07 * rang).toFixed(2)}s`
const delaiLibelle = (rangPremiereCarte) => `${Math.max(0.04, 0.04 + 0.07 * rangPremiereCarte).toFixed(2)}s`

// ─── Tuile module ─────────────────────────────────────────────────────────────
function ModuleTile({ icon: Icon, label, phaseColor, active, children, onClick, delai }) {
  const [hovered, setHovered] = useState(false)

  const hoverBorder = phaseColor === '#2A8A4E' ? 'var(--jga-green)' : 'var(--jga-orange-mid)'
  const iconColor = active
    ? (phaseColor === '#2A8A4E' ? 'var(--jga-green)' : 'var(--jga-orange)')
    : '#9C9591'

  return (
    // L'entrée est portée par l'enveloppe et non par la tuile : l'animation
    // finit sur opacity 1 et, prioritaire sur le style inline, elle effacerait
    // l'atténuation des tuiles « Bientôt ».
    <div className="jga-entree-carte" style={{ display: 'flex', animationDelay: delai }}>
      <div
        onClick={active ? onClick : undefined}
        onMouseEnter={() => active && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          backgroundColor: 'white',
          borderRadius: 0,
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
            backgroundColor: '#F1EFE8', color: '#9C9591',
            borderRadius: 3, padding: '2px 7px',
          }}>
            Bientôt
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={28} strokeWidth={1.25} style={{ color: iconColor }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: active ? '#1F1B17' : '#9C9591' }}>
              {label}
            </span>
          </div>
          {active && <ChevronRight size={14} strokeWidth={1.25} style={{ color: "var(--jga-beige)" }} />}
        </div>

        {children}
      </div>
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
      <p style={{ fontSize: 13, fontWeight: 500, color: value ? '#1F1B17' : 'var(--jga-beige)' }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function PhaseSection({ phase, affaire, stats, affaireId, navigate, rangBase }) {
  const isEtude = phase.id === 'etude'
  const isChantier = phase.id === 'chantier'

  return (
    <div>
      {/* Phase label */}
      <div
        className="jga-entree-libelle"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          animationDelay: delaiLibelle(rangBase),
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: phase.color }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: COULEUR_LIBELLE_PHASE, fontFamily: "'Archivo', sans-serif" }}>{phase.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {phase.modules.map((mod, i) => {
          const Icon = ICON_MAP[mod.icon]
          if (!Icon) return null

          return (
            <ModuleTile
              key={mod.id}
              icon={Icon}
              label={mod.label}
              phaseColor={phase.color}
              active={mod.enabled}
              delai={delaiCarte(rangBase + i)}
              onClick={() => navigate(`/affaires/${affaireId}/${mod.path}`)}
            >
              {isChantier && mod.id === 'lots-entreprises' && mod.enabled && (
                stats.lots === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucun lot — configurer les entreprises</p>
                ) : (
                  <>
                    <p style={{ fontSize: 22, fontWeight: 500, color: '#1F1B17', marginBottom: 2 }}>
                      {stats.lotsAttributed}/{stats.lots}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                      lots attribués{stats.lotsTotalHt > 0 ? ` · ${formatEuro(stats.lotsTotalHt)} HT` : ''}
                    </p>
                  </>
                )
              )}

              {isChantier && mod.id === 'comptes-rendus' && (
                stats.crTotal === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Commencer le suivi de chantier</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1F1B17' }}>{stats.crEmis}</p>
                      <span style={{ fontSize: 12, color: '#5E5854' }}>/ {stats.crTotal} émis</span>
                    </div>
                    {stats.crDernierDate && (
                      <p style={{ fontSize: 11, color: 'var(--jga-beige)', marginBottom: stats.crProchaineReunion ? 2 : 0 }}>
                        Dernier : {fmtDate(stats.crDernierDate)}
                      </p>
                    )}
                    {stats.crProchaineReunion && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: 'rgba(42,138,78,0.12)', borderRadius: 3, padding: '2px 7px' }}>
                        <span style={{ fontSize: 11, color: '#2A8A4E' }}>Prochain {fmtDate(stats.crProchaineReunion)}</span>
                      </div>
                    )}
                    {stats.remarquesAFaire > 0 && (
                      <p style={{ fontSize: 11, color: '#E8602C', marginTop: 4 }}>
                        {stats.remarquesAFaire} remarque{stats.remarquesAFaire > 1 ? 's' : ''} à traiter
                      </p>
                    )}
                  </>
                )
              )}

              {isChantier && mod.id === 'financier-chantier' && mod.enabled && (
                stats.lotsAttributed === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Configurer les lots et marchés</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1F1B17' }}>
                        {formatEuro(stats.lotsTotalHt + stats.financierSupplementsHt)}
                      </p>
                      <span style={{ fontSize: 12, color: '#5E5854' }}>HT</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stats.financierAleasPct > 5 ? 8 : 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
                        Marchés {formatEuro(stats.lotsTotalHt)} HT
                      </p>
                      {stats.financierSupplementsHt !== 0 && (
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: stats.financierSupplementsHt >= 0 ? '#2A8A4E' : '#B8412C',
                        }}>
                          {stats.financierSupplementsHt > 0 ? '+' : ''}{formatEuro(stats.financierSupplementsHt)}
                        </span>
                      )}
                    </div>
                    {stats.financierAleasPct > 5 && (
                      <div style={{
                        backgroundColor: '#FEF3C7', borderRadius: 3, padding: '4px 8px',
                        fontSize: 11, color: '#92400E',
                      }}>
                        Aléas {stats.financierAleasPct.toFixed(1)}% du marché
                      </div>
                    )}
                    {/* Les FTM n'ont plus de tuile : elles vivent dans le suivi financier */}
                    {stats.ftmTotal > 0 && (
                      <p style={{ fontSize: 11, color: '#5E5854', marginTop: 6 }}>
                        {stats.ftmTotal} FTM · {stats.ftmEnAttente} en attente
                      </p>
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
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1F1B17' }}>{stats.etudeTotal}</p>
                      <span style={{ fontSize: 12, color: '#5E5854' }}>phase{stats.etudeTotal > 1 ? 's' : ''}</span>
                    </div>
                    {stats.prochainJalonEtude && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stats.prochainJalonEtude.couleur, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#5E5854' }}>
                          {stats.prochainJalonEtude.label} · S{stats.prochainJalonEtude.semaine} {stats.prochainJalonEtude.annee}
                        </span>
                      </div>
                    )}
                  </>
                )
              )}

              {isEtude && mod.id === 'financier-etude' && mod.enabled && (
                montantsAffaire(affaire).enveloppe != null ? (
                  <>
                    <div style={{ marginBottom: 4 }}>
                      <MontantHT ht={montantsAffaire(affaire).enveloppe} tva={tvaAffaire(affaire)} taille={19} />
                    </div>
                    {stats.financierEtudeDernierePhase ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#9C9591' }}>Dernière phase :</span>
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: '#E8602C',
                          backgroundColor: 'rgba(232,96,44,0.10)',
                          borderRadius: 3, padding: '2px 8px',
                        }}>
                          {stats.financierEtudeDernierePhase}
                        </span>
                        {(() => {
                          const actuelle = stats.financierEtudeEnvActuelle && htDe(stats.financierEtudeEnvActuelle.ht, stats.financierEtudeEnvActuelle.ttc, tvaAffaire(affaire))
                          const initiale = montantsAffaire(affaire).enveloppe
                          if (actuelle == null || actuelle === initiale) return null
                          return (
                            <span style={{ fontSize: 11, fontWeight: 500, color: actuelle > initiale ? '#B8412C' : '#2A8A4E' }}>
                              → {formatEuro(actuelle)} HT
                            </span>
                          )
                        })()}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: '#9C9591' }}>Aucune phase renseignée</p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Enveloppe non renseignée</p>
                )
              )}

              {isEtude && mod.id === 'financier-etude' && !mod.enabled && (
                montantsAffaire(affaire).enveloppe != null ? (
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#9C9591' }}>
                    {formatEuro(montantsAffaire(affaire).enveloppe)} HT
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
                      <p style={{ fontSize: 22, fontWeight: 500, color: '#1F1B17' }}>{stats.planningTaches}</p>
                      <span style={{ fontSize: 12, color: '#5E5854' }}>tâche{stats.planningTaches > 1 ? 's' : ''}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--jga-beige)', marginBottom: stats.planningDateFin ? 6 : 0 }}>
                      Avancement moyen : {stats.planningAvancement} %
                    </p>
                    {stats.planningDateFin && (
                      <div style={{
                        backgroundColor: '#F0F7E8', borderRadius: 3, padding: '3px 8px',
                        fontSize: 11, color: '#3a6011', display: 'inline-block',
                      }}>
                        Fin estimée {stats.planningDateFin.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                      </div>
                    )}
                    {stats.prochainJalon && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stats.prochainJalon.couleur, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#5E5854' }}>
                          {stats.prochainJalon.label} · {new Date(stats.prochainJalon.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    )}
                  </>
                )
              )}

              {!['lots-entreprises', 'comptes-rendus', 'financier-chantier', 'planning-chantier', 'planning-etude', 'financier-etude', 'todo'].includes(mod.id) && !mod.enabled && (
                <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>En cours de développement</p>
              )}
            </ModuleTile>
          )
        })}
      </div>
    </div>
  )
}

function AffaireOverview({ affaire, stats, affaireId, onEdit, onGererContacts, versionContacts, canEdit }) {
  const navigate = useNavigate()
  const { estAgence } = useAuth()
  // Seulement la phase en cours : la colonne de gauche garde tous les modules
  const phasesVues = phasesDuTableau(phasesPour(estAgence), affaire?.phase)

  // Rang de départ de chaque phase dans la suite des décalages d'entrée, pour
  // qu'ils courent d'une section à l'autre au lieu de redémarrer à chaque phase.
  const rangs = phasesVues.reduce(
    (acc, phase) => [...acc, acc[acc.length - 1] + phase.modules.length],
    [0]
  )

  return (
    <div style={{
      // z-index 1 : le conteneur du fond est positionné, il passerait sinon
      // au-dessus de ce contenu qui, lui, ne l'est pas
      position: 'relative', zIndex: 1,
      display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900,
    }}>
      {/* Accès direct à la visite : c'est le geste du chantier, il passe avant
          les tuiles de modules. */}
      {affaire?.phase === 'chantier' && (
        <BandeauVisite affaireId={affaireId} lectureSeule={!canEdit} />
      )}

      {/* Phase sections */}
      {phasesVues.map((phase, i) => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          affaire={affaire}
          stats={stats}
          affaireId={affaireId}
          navigate={navigate}
          rangBase={rangs[i]}
        />
      ))}

      {/* Infos affaire */}
      <div className="jga-entree-carte" style={{
        backgroundColor: 'white',
        borderRadius: 0,
        border: '0.5px solid rgba(0,0,0,0.08)',
        padding: 20,
        animationDelay: delaiCarte(rangs[rangs.length - 1]),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>Informations de l'affaire</span>
          {canEdit && (
            <button
              onClick={onEdit}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--affaire-accent)',
              }}
            >
              Modifier <ChevronRight size={12} strokeWidth={1.25} />
            </button>
          )}
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
          <InfoField label="Enveloppe globale initiale" value={montantsAffaire(affaire).enveloppe != null
            ? <MontantHT ht={montantsAffaire(affaire).enveloppe} tva={tvaAffaire(affaire)} taille={13} enLigne /> : null} />
          <InfoField label="Surface plancher" value={affaire.surface_plancher ? `${affaire.surface_plancher} m²` : null} />
          <InfoField label="Date de livraison" value={fmtDate(affaire.date_livraison)} />
        </div>
      </div>

      {/* Coordonnées : réservées à l'agence, comme le carnet d'adresses */}
      {estAgence && (
        <ContactsAffaire
          key={versionContacts}
          affaire={affaire}
          affaireId={affaireId}
          canEdit={canEdit}
          onGerer={onGererContacts}
          style={{ animationDelay: delaiCarte(rangs[rangs.length - 1] + 1) }}
        />
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export function AffairePage() {
  const { affaireId, moduleId } = useParams()
  const { affaire: rawAffaire, loading, updateAffaire } = useAffaire(affaireId)
  const [affaire, setAffaire] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  // Section de la fiche à montrer à l'ouverture (« Gérer les interlocuteurs »)
  const [sectionEdition, setSectionEdition] = useState(null)
  // Les interlocuteurs s'enregistrent depuis la fiche : la carte des contacts
  // se recharge à sa fermeture
  const [versionContacts, setVersionContacts] = useState(0)
  const [showCollabModal, setShowCollabModal] = useState(false)
  const stats = useAffaireStats(affaireId)

  const {
    collaborateurs, loading: collabLoading,
    canEdit, isProprietaire,
    addCollaborateur, removeCollaborateur,
    refetch: refetchCollabs,
  } = useAffaireCollaborateurs(affaireId)

  // Lecture seule : on se promène, on ne modifie rien. Un intervenant
  // extérieur n'est pas visé — il écrit ses propres observations, ses droits
  // sont tenus par la base (migration 052).
  const { estAgence: compteAgence } = useAuth()
  const verrouillee = !collabLoading && !canEdit && compteAgence
  useEffect(() => {
    if (!verrouillee) return undefined
    verrouillerEcritures('Lecture seule : vous ne faites pas partie des collaborateurs de cette affaire.')
    return () => deverrouillerEcritures()
  }, [verrouillee])

  // Un clic qui aurait modifié l'affaire le dit. Seulement juste après un
  // geste : une écriture automatique au chargement (recalage des jalons…)
  // est refusée sans bruit.
  const [refusVisible, setRefusVisible] = useState(false)
  useEffect(() => {
    if (!verrouillee) return undefined
    let dernierGeste = 0
    const geste = () => { dernierGeste = Date.now() }
    window.addEventListener('pointerdown', geste, true)
    window.addEventListener('keydown', geste, true)
    let minuterie = null
    const desabonner = surEcritureRefusee(() => {
      if (Date.now() - dernierGeste > 3000) return
      setRefusVisible(true)
      clearTimeout(minuterie)
      minuterie = setTimeout(() => setRefusVisible(false), 4000)
    })
    return () => {
      desabonner()
      clearTimeout(minuterie)
      window.removeEventListener('pointerdown', geste, true)
      window.removeEventListener('keydown', geste, true)
    }
  }, [verrouillee])

  const handleSelfAssign = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('affaire_collaborateurs').upsert(
      [{ affaire_id: affaireId, user_id: user.id, role: 'proprietaire' }],
      { onConflict: 'affaire_id,user_id' }
    )
    refetchCollabs()
  }, [affaireId, refetchCollabs])

  useEffect(() => {
    if (rawAffaire) setAffaire(rawAffaire)
  }, [rawAffaire])

  const activeModule = getAllModules().find(m => m.path === moduleId) ?? null
  useTitreBandeau(affaire ? {
    code: affaire.code_affaire, nom: affaire.nom, detail: affaire.moa_nom,
    couleur: variablesPhase(affaire.phase)['--affaire-accent'],
  } : null)

  const fermerEdition = () => {
    setEditOpen(false)
    setSectionEdition(null)
    setVersionContacts((v) => v + 1)
  }

  const [erreurPhase, setErreurPhase] = useState(null)
  // Affichée tout de suite, enregistrée ensuite ; un refus la remet en place
  const changerPhase = async (phase) => {
    const avant = affaire.phase
    setErreurPhase(null)
    setAffaire((a) => ({ ...a, phase }))
    const { error } = await updateAffaire({ phase })
    if (error) {
      setAffaire((a) => ({ ...a, phase: avant }))
      setErreurPhase(`La phase n'a pas pu être enregistrée (${error.message}).`)
    }
  }

  const handleSave = async (data) => {
    await updateAffaire(data)
    fermerEdition()
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
      {/* La couleur de la phase habille tout le cadre de l'affaire */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', ...variablesPhase(affaire.phase) }}>
        <AffaireHeader
          affaire={affaire}
          onEdit={() => setEditOpen(true)}
          onChangerPhase={changerPhase}
          collaborateurs={collaborateurs}
          canEdit={canEdit}
          collabLoading={collabLoading}
          isProprietaire={isProprietaire}
          onCollabClick={() => setShowCollabModal(true)}
          onSelfAssign={handleSelfAssign}
        />
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
            {/* Le fond photo n'habille que la vue d'ensemble, pas les modules —
                et seule la vue d'ensemble applique le padding de 24 px que les
                décalages du calque annulent. */}
            {!activeModule && affaire.photo_url && <PhotoFond url={affaire.photo_url} />}

            {activeModule && <TitreModule mod={activeModule} pleinePage={activeModule.layout === 'fullbleed'} />}

            {!collabLoading && !canEdit && (
              <div style={{
                background: '#FEF3C7', border: '0.5px solid #D97706',
                borderRadius: 2, padding: '8px 14px', fontSize: 12, color: '#92400E',
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                position: 'relative', zIndex: 1,
              }}>
                <Eye size={14} strokeWidth={1.25} />
                Vous consultez cette affaire en lecture seule. Contactez le responsable pour obtenir les droits de modification.
              </div>
            )}
            {erreurPhase && (
              <div role="alert" style={{
                background: '#FEF2F2', border: '0.5px solid #B8412C', borderRadius: 2,
                padding: '8px 14px', fontSize: 12, color: '#B8412C', marginBottom: 16,
                position: 'relative', zIndex: 1,
              }}>
                {erreurPhase}
              </div>
            )}
            {activeModule
              // Sous le titre, le module garde toute la hauteur restante : un
              // module plein écran (planning, suivi financier) remplit sa boîte
              ? <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ModuleRenderer mod={activeModule} lectureSeule={!collabLoading && !canEdit} />
                </div>
              : <AffaireOverview
                  affaire={affaire} stats={stats} affaireId={affaireId} canEdit={canEdit}
                  onEdit={() => setEditOpen(true)}
                  onGererContacts={() => { setSectionEdition('interlocuteurs'); setEditOpen(true) }}
                  versionContacts={versionContacts}
                />
            }
          </main>
        </div>
      </div>
      {refusVisible && (
        <div role="alert" style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 500,
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 32px)',
          background: '#1F1B17', color: 'white', fontSize: 13, padding: '10px 16px', borderRadius: 3,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <Lock size={14} /> Lecture seule : vous ne faites pas partie des collaborateurs de cette affaire. Rien n’a été modifié.
        </div>
      )}

      {editOpen && (
        <AffaireFormModal
          affaire={affaire}
          onSave={handleSave}
          onClose={fermerEdition}
          scrollToSection={sectionEdition}
        />
      )}

      {showCollabModal && (
        <CollabModal
          collaborateurs={collaborateurs}
          isProprietaire={isProprietaire}
          addCollaborateur={addCollaborateur}
          removeCollaborateur={removeCollaborateur}
          onClose={() => setShowCollabModal(false)}
        />
      )}
    </>
  )
}
