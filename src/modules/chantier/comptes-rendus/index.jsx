import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2, Users, LayoutList, LayoutGrid, CalendarPlus, ArrowRight } from 'lucide-react'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { useComptesRendus } from '../../../shared/hooks/useComptesRendus'
import { InterlocuteursModal } from './InterlocuteursModal'
import { CrDetail } from './CrDetail'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function StatutBadge({ statut }) {
  const isEmis = statut === 'emis'
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, borderRadius: 3, padding: '2px 9px',
      backgroundColor: isEmis ? 'rgba(42,138,78,0.12)' : '#F3F4F6',
      color: isEmis ? '#2A8A4E' : '#5E5854',
    }}>
      {isEmis ? 'Émis' : 'Brouillon'}
    </span>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(232,96,44,0.10)', borderTopColor: '#E8602C', animation: 'jga-spin 0.7s linear infinite' }} />
    </div>
  )
}

// ─── Vue liste ────────────────────────────────────────────────────────────────

function CrRow({ cr, onOpen, onDelete }) {
  const redacteurName = cr.profiles
    ? [cr.profiles.prenom, cr.profiles.nom].filter(Boolean).join(' ')
    : '—'

  return (
    <tr
      onClick={() => onOpen(cr.id)}
      style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'background 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FFF8F5' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#1F1B17', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.02em' }}>
        {String(cr.numero).padStart(2, '0')}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
        {fmtDate(cr.date_reunion)}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#5E5854' }}>
        {cr.pointsEnCours > 0 ? `${cr.pointsEnCours} en cours` : '—'}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#5E5854' }}>{redacteurName}</td>
      <td style={{ padding: '12px 16px' }}><StatutBadge statut={cr.statut} /></td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        <button
          onClick={e => { e.stopPropagation(); onDelete(cr) }}
          title="Supprimer"
          style={{ padding: '5px 8px', borderRadius: 2, fontSize: 11, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#9C9591' }}
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}

// ─── Vue bulles ───────────────────────────────────────────────────────────────

function CrBulle({ cr, onOpen, onDelete }) {
  const redacteur = cr.profiles
    ? [cr.profiles.prenom, cr.profiles.nom].filter(Boolean).join(' ')
    : null
  const initials = cr.profiles
    ? [(cr.profiles.prenom ?? '')[0], (cr.profiles.nom ?? '')[0]].filter(Boolean).join('').toUpperCase()
    : null

  return (
    <div
      onClick={() => onOpen(cr.id)}
      style={{
        backgroundColor: 'white', borderRadius: 0,
        border: '0.5px solid rgba(0,0,0,0.08)',
        padding: '20px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'border-color 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8602C' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)' }}
    >
      {/* Numero + statut */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 600, color: '#E8602C', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {String(cr.numero).padStart(2, '0')}
        </span>
        <StatutBadge statut={cr.statut} />
      </div>

      {/* Dates */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 2 }}>{fmtDate(cr.date_reunion)}</p>
        {cr.date_prochaine_reunion && (
          <p style={{ fontSize: 11, color: '#9C9591' }}>
            Proch.&nbsp;{fmtDateShort(cr.date_prochaine_reunion)}
            {cr.heure_prochaine_reunion && ` · ${cr.heure_prochaine_reunion.slice(0, 5)}`}
          </p>
        )}
      </div>

      {/* Rédacteur + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {initials ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#1F1B17', color: 'white', fontSize: 9, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials}
            </div>
            <span style={{ fontSize: 11, color: '#5E5854' }}>{redacteur}</span>
          </div>
        ) : <span />}
        <button
          onClick={e => { e.stopPropagation(); onDelete(cr) }}
          title="Supprimer"
          style={{ padding: '4px 6px', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.10)', backgroundColor: 'transparent', color: '#C9C4C0', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#B8412C' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#C9C4C0' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Modal de suppression ─────────────────────────────────────────────────────

function DeleteConfirmModal({ cr, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: 0, padding: '28px 32px',
        maxWidth: 420, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 2, background: 'rgba(184,65,44,0.10)',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trash2 size={18} color="#B8412C" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>
              Supprimer le compte rendu ?
            </p>
            <p style={{ fontSize: 12, color: '#9C9591' }}>
              Réunion n°{cr.numero} — {new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 24 }}>
          Cette action est <strong>irréversible</strong>. Toutes les présences et remarques associées seront définitivement supprimées.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.15)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#374151' }}
          >
            Annuler
          </button>
          <button
            onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false) }}
            disabled={deleting}
            style={{ padding: '8px 16px', borderRadius: 2, border: 'none', background: '#B8412C', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  )
}

const TH = { padding: '10px 16px', fontSize: 10, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '0.5px solid rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }

// ─── Bouton « Nouvelle visite » ───────────────────────────────────────────────
// L'action principale de l'écran : plus grosse que les autres, ombre qui bat,
// et raccourci clavier N — le badge affiché n'est pas décoratif.

function BoutonNouvelleVisite({ onClick, disabled }) {
  const [survol, setSurvol] = useState(false)
  return (
    <button
      className="jga-respire"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '12px 22px 12px 14px', borderRadius: 3, border: 'none',
        backgroundColor: survol ? '#227341' : '#2A8A4E', color: 'white',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
        opacity: disabled ? 0.6 : 1,
        transform: survol && !disabled ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), background 0.18s ease',
      }}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
    >
      <span style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Plus size={16} strokeWidth={2.2} />
      </span>
      Nouvelle visite
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500,
        letterSpacing: '0.06em', color: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(255,255,255,0.35)', borderRadius: 3, padding: '1px 5px',
      }}>
        N
      </span>
    </button>
  )
}

// ─── Bandeau « prochaine réunion » ────────────────────────────────────────────
// Le dernier CR porte la date de la prochaine réunion ; tant qu'aucun CR ne
// suit, c'est qu'il reste à créer. Le bandeau le rappelle et le crée d'un clic.

function BandeauProchaineReunion({ dernier, onCreer }) {
  const [survol, setSurvol] = useState(false)
  const reprises = dernier.pointsEnCours ?? 0

  return (
    <div
      onClick={onCreer}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: survol
          ? 'linear-gradient(90deg, rgba(42,138,78,0.16) 0%, rgba(42,138,78,0.05) 60%, rgba(42,138,78,0) 100%)'
          : 'linear-gradient(90deg, rgba(42,138,78,0.10) 0%, rgba(42,138,78,0.03) 60%, rgba(42,138,78,0) 100%)',
        border: '0.5px solid rgba(42,138,78,0.35)',
        borderLeft: '3px solid #2A8A4E',
        padding: '14px 18px', marginBottom: 14, cursor: 'pointer',
        transition: 'background 0.18s ease',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(42,138,78,0.16)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CalendarPlus size={17} color="#2A8A4E" strokeWidth={1.6} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>
          Prochaine réunion le {fmtDate(dernier.date_prochaine_reunion)}
          {dernier.heure_prochaine_reunion && ` à ${dernier.heure_prochaine_reunion.slice(0, 5)}`}
          {' '}— le CR n°{dernier.numero + 1} n'est pas encore créé
        </p>
        {reprises > 0 && (
          <p style={{ fontSize: 11, color: '#5E5854', marginTop: 2 }}>
            La nouvelle visite reprendra automatiquement {reprises === 1 ? 'la remarque non close' : `les ${reprises} remarques non closes`} du CR n°{dernier.numero}.
          </p>
        )}
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        fontSize: 12, fontWeight: 500, color: '#2A8A4E',
      }}>
        Créer la visite
        <ArrowRight size={14} strokeWidth={1.8} />
      </span>
    </div>
  )
}

// ─── Module principal ─────────────────────────────────────────────────────────

export default function ComptesRendusModule() {
  const { affaireId } = useParams()
  const { affaire } = useAffaire(affaireId)
  const { comptesRendus, loading, createCR, deleteCR } = useComptesRendus(affaireId)
  const [selectedCrId, setSelectedCrId] = useState(null)
  const [interloOpen, setInterloOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingCr, setDeletingCr] = useState(null)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('jga-cr-viewmode') || 'liste')

  const setView = (mode) => {
    setViewMode(mode)
    localStorage.setItem('jga-cr-viewmode', mode)
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const cr = await createCR()
      setSelectedCrId(cr.id)
    } catch (err) { console.error(err) }
    setCreating(false)
  }

  // Raccourci N, annoncé par le badge du bouton. Ignoré dès qu'on saisit du
  // texte, qu'un modificateur est enfoncé, ou qu'on n'est plus sur la liste.
  useEffect(() => {
    if (selectedCrId || interloOpen || deletingCr) return
    const onKeyDown = (e) => {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const cible = e.target
      if (cible?.isContentEditable) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName)) return
      e.preventDefault()
      handleCreate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }) // sans tableau de dépendances : handleCreate est recréé à chaque rendu

  if (selectedCrId) {
    return (
      <>
        <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>
        <CrDetail
          crId={selectedCrId}
          affaire={affaire}
          onBack={() => setSelectedCrId(null)}
        />
      </>
    )
  }

  const emis = comptesRendus.filter(cr => cr.statut === 'emis').length
  const brouillons = comptesRendus.length - emis
  // Trié par numéro décroissant : le premier est le dernier CR de l'affaire.
  const dernier = comptesRendus[0]

  return (
    <div className="jga-entree-vue">
      <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontFamily: "'Archivo', sans-serif", fontSize: 19, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
            Visites de chantier
          </h2>
          <p style={{ fontSize: 12, color: '#9C9591', marginTop: 3 }}>
            {comptesRendus.length} compte{comptesRendus.length > 1 ? 's' : ''} rendu{comptesRendus.length > 1 ? 's' : ''}
            {' · '}{emis} émis
            {brouillons > 0 && ` · ${brouillons} brouillon${brouillons > 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Toggle vue */}
          <div style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2, overflow: 'hidden' }}>
            {[
              { mode: 'liste', Icon: LayoutList, title: 'Vue liste' },
              { mode: 'bulles', Icon: LayoutGrid, title: 'Vue bulles' },
            ].map(({ mode, Icon, title }) => {
              const active = viewMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  title={title}
                  style={{
                    padding: '6px 10px', border: 'none', cursor: 'pointer',
                    backgroundColor: active ? '#1F1B17' : 'white',
                    color: active ? 'white' : '#9C9591',
                    transition: 'all 0.12s',
                  }}
                >
                  <Icon size={14} />
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setInterloOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}
          >
            <Users size={13} /> Interlocuteurs
          </button>
          <BoutonNouvelleVisite onClick={handleCreate} disabled={creating} />
        </div>
      </div>

      {/* Rappel de la prochaine réunion, tant que son CR n'existe pas */}
      {!loading && dernier?.date_prochaine_reunion && (
        <BandeauProchaineReunion dernier={dernier} onCreer={handleCreate} />
      )}

      {/* Contenu */}
      {loading ? (
        <Spinner />
      ) : comptesRendus.length === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#5E5854', marginBottom: 6 }}>Aucun compte rendu</p>
          <p style={{ fontSize: 12, color: '#9C9591' }}>Commencez par créer le premier CR de cette affaire.</p>
        </div>
      ) : viewMode === 'liste' ? (
        <div style={{ backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#FAFAF9' }}>
                <th style={TH}>N°</th>
                <th style={TH}>Date réunion</th>
                <th style={TH}>Points en cours</th>
                <th style={TH}>Rédacteur</th>
                <th style={TH}>Statut</th>
                <th style={{ ...TH, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {comptesRendus.map(cr => (
                <CrRow
                  key={cr.id}
                  cr={cr}
                  onOpen={setSelectedCrId}
                  onDelete={setDeletingCr}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {comptesRendus.map(cr => (
            <CrBulle
              key={cr.id}
              cr={cr}
              onOpen={setSelectedCrId}
              onDelete={setDeletingCr}
            />
          ))}
        </div>
      )}

      {interloOpen && (
        <InterlocuteursModal affaireId={affaireId} onClose={() => setInterloOpen(false)} />
      )}

      {deletingCr && (
        <DeleteConfirmModal
          cr={deletingCr}
          onConfirm={async () => { await deleteCR(deletingCr.id); setDeletingCr(null) }}
          onCancel={() => setDeletingCr(null)}
        />
      )}
    </div>
  )
}
