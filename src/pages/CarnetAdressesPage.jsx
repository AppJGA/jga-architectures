import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Phone, Mail, Pencil, ExternalLink, X, Trash2, LayoutGrid, List } from 'lucide-react'
import { supabase } from '../core/supabase/client'

const INPUT = {
  width: '100%', height: 36, padding: '0 12px',
  border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2,
  fontSize: 13, backgroundColor: 'white', outline: 'none', boxSizing: 'border-box', color: '#1F1B17',
}
const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#9C9591',
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4,
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#2A8A4E', color: 'white', border: 'none', fontWeight: 500,
}

function getInitials(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  return words.length === 1
    ? name.slice(0, 2).toUpperCase()
    : (words[0][0] + words[1][0]).toUpperCase()
}

function getUniqueAffaires(entreprise) {
  const seen = new Set()
  return (entreprise.lot_entreprises ?? [])
    .map(le => le.lots?.affaires)
    .filter(Boolean)
    .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
}

// ─── Carte entreprise (vue grille) ────────────────────────────────────────────

function EntrepriseCard({ entreprise, onEdit, onDelete }) {
  const navigate = useNavigate()
  const affaires = getUniqueAffaires(entreprise)
  const initials = getInitials(entreprise.raison_sociale)

  return (
    <div
      className="entreprise-card"
      style={{
        position: 'relative', backgroundColor: 'white', borderRadius: 0,
        border: '0.5px solid rgba(0,0,0,0.08)', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {/* Bouton supprimer */}
      <button
        className="delete-btn"
        onClick={e => { e.stopPropagation(); onDelete(entreprise) }}
        style={{
          position: 'absolute', top: 10, right: 10,
          width: 28, height: 28, borderRadius: 2,
          border: '0.5px solid rgba(220,38,38,0.3)',
          background: 'rgba(184,65,44,0.10)', color: '#B8412C',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s',
        }}
        title="Supprimer cette entreprise"
      >
        <Trash2 size={13} />
      </button>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          backgroundColor: '#E8602C', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 28 }}>
          <p style={{
            fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entreprise.raison_sociale}
          </p>
          {(entreprise.ville || entreprise.code_postal) && (
            <p style={{ fontSize: 11, color: '#9C9591' }}>
              {[entreprise.ville, entreprise.code_postal].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }} />

      {/* Infos contact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entreprise.telephone && (
          <a href={`tel:${entreprise.telephone}`} style={{ fontSize: 11, color: '#374151', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={11} style={{ color: '#9C9591', flexShrink: 0 }} />
            {entreprise.telephone}
          </a>
        )}
        {entreprise.email && (
          <a href={`mailto:${entreprise.email}`} style={{ fontSize: 11, color: '#374151', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={11} style={{ color: '#9C9591', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entreprise.email}</span>
          </a>
        )}
        {entreprise.siret && (
          <p style={{ fontSize: 11, color: '#9C9591' }}>SIRET : {entreprise.siret}</p>
        )}
        {!entreprise.telephone && !entreprise.email && !entreprise.siret && (
          <p style={{ fontSize: 11, color: '#C5BEB9', fontStyle: 'italic' }}>Aucune coordonnée renseignée</p>
        )}
      </div>

      {/* Interlocuteurs */}
      {(entreprise.interlocuteurs?.length ?? 0) > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
            Contacts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {entreprise.interlocuteurs.slice(0, 3).map(i => (
              <p key={i.id} style={{ fontSize: 11, color: '#4b5563' }}>
                {[i.prenom, i.nom].filter(Boolean).join(' ')}
                {i.fonction ? <span style={{ color: '#9C9591' }}> · {i.fonction}</span> : null}
              </p>
            ))}
            {entreprise.interlocuteurs.length > 3 && (
              <p style={{ fontSize: 11, color: '#9C9591' }}>+{entreprise.interlocuteurs.length - 3} contact(s)</p>
            )}
          </div>
        </div>
      )}

      {/* Badges affaires */}
      {affaires.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
            Affaires
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {affaires.slice(0, 3).map(a => (
              <span
                key={a.id}
                onClick={() => navigate(`/affaires/${a.id}`)}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 3,
                  backgroundColor: 'rgba(232,96,44,0.10)', color: '#E8602C', cursor: 'pointer',
                  border: '0.5px solid rgba(224,90,30,0.2)', whiteSpace: 'nowrap',
                }}
              >
                {a.code_affaire ?? a.nom}
              </span>
            ))}
            {affaires.length > 3 && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, backgroundColor: '#FAF7F2', color: '#9C9591' }}>
                +{affaires.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button onClick={() => onEdit(entreprise)} style={{ ...BTN, flex: 1, justifyContent: 'center' }}>
          <Pencil size={11} /> Éditer
        </button>
        {affaires.length > 0 && (
          <button onClick={() => navigate(`/affaires/${affaires[0].id}`)} style={{ ...BTN, flex: 1, justifyContent: 'center' }}>
            <ExternalLink size={11} /> Voir affaire
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Ligne entreprise (vue liste) ─────────────────────────────────────────────

function EntrepriseRow({ entreprise, onEdit, onDelete }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const affaires = getUniqueAffaires(entreprise)
  const initials = getInitials(entreprise.raison_sociale)
  const principal = entreprise.interlocuteurs?.find(i => i.est_principal) ?? entreprise.interlocuteurs?.[0] ?? null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        borderBottom: '0.5px solid rgba(0,0,0,0.06)',
        padding: '0 16px', height: 48,
        backgroundColor: hovered ? '#FAFAF9' : 'white',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Entreprise */}
      <div style={{ flex: 3, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingRight: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          backgroundColor: '#E8602C', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>
          {initials}
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entreprise.raison_sociale}
        </span>
      </div>

      {/* Ville */}
      <div style={{ flex: 1, fontSize: 12, color: '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
        {entreprise.ville ?? '—'}
      </div>

      {/* Téléphone */}
      <div style={{ flex: 1.5, fontSize: 12, paddingRight: 12 }}>
        {entreprise.telephone
          ? <a href={`tel:${entreprise.telephone}`} style={{ color: '#374151', textDecoration: 'none' }}>{entreprise.telephone}</a>
          : <span style={{ color: '#C5BEB9' }}>—</span>
        }
      </div>

      {/* Email */}
      <div style={{ flex: 2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
        {entreprise.email
          ? <a href={`mailto:${entreprise.email}`} style={{ color: '#374151', textDecoration: 'none' }}>{entreprise.email}</a>
          : <span style={{ color: '#C5BEB9' }}>—</span>
        }
      </div>

      {/* Interlocuteur principal */}
      <div style={{ flex: 2, fontSize: 12, color: '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
        {principal
          ? `${[principal.prenom, principal.nom].filter(Boolean).join(' ')}${principal.fonction ? ` · ${principal.fonction}` : ''}`
          : '—'
        }
      </div>

      {/* Affaires */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', paddingRight: 12 }}>
        {affaires.length > 0
          ? <span
              onClick={() => navigate(`/affaires/${affaires[0].id}`)}
              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, backgroundColor: 'rgba(232,96,44,0.10)', color: '#E8602C', border: '0.5px solid rgba(224,90,30,0.2)', cursor: 'pointer' }}
            >
              {affaires.length}
            </span>
          : <span style={{ fontSize: 12, color: '#C5BEB9' }}>—</span>
        }
      </div>

      {/* Actions */}
      <div style={{ width: 64, display: 'flex', gap: 4, justifyContent: 'flex-end', opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
        <button
          onClick={() => onEdit(entreprise)}
          style={{ width: 28, height: 28, borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          title="Éditer"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(entreprise) }}
          style={{ width: 28, height: 28, borderRadius: 3, border: '0.5px solid rgba(220,38,38,0.3)', backgroundColor: 'rgba(184,65,44,0.10)', color: '#B8412C', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          title="Supprimer"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Modale édition entreprise ────────────────────────────────────────────────

function EntrepriseEditModal({ entreprise, onSave, onClose }) {
  const isNew = !entreprise.id
  const [form, setForm] = useState({
    raison_sociale: entreprise.raison_sociale ?? '',
    adresse: entreprise.adresse ?? '',
    code_postal: entreprise.code_postal ?? '',
    ville: entreprise.ville ?? '',
    telephone: entreprise.telephone ?? '',
    email: entreprise.email ?? '',
    siret: entreprise.siret ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.raison_sociale.trim()) return
    setSaving(true)
    await onSave({ ...form, raison_sociale: form.raison_sociale.trim() })
    setSaving(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 0, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>
            {isNew ? 'Nouvelle entreprise' : "Modifier l'entreprise"}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={LABEL}>Raison sociale *</label>
            <input value={form.raison_sociale} onChange={set('raison_sociale')} style={INPUT} autoFocus />
          </div>
          <div>
            <label style={LABEL}>Adresse</label>
            <input value={form.adresse} onChange={set('adresse')} style={INPUT} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label style={LABEL}>Code postal</label>
              <input value={form.code_postal} onChange={set('code_postal')} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Ville</label>
              <input value={form.ville} onChange={set('ville')} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={LABEL}>Téléphone</label>
            <input type="tel" value={form.telephone} onChange={set('telephone')} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={set('email')} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>SIRET</label>
            <input value={form.siret} onChange={set('siret')} style={INPUT} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <button style={BTN} onClick={onClose}><X size={13} /> Annuler</button>
          <button
            style={{ ...BTN_PRIMARY, opacity: form.raison_sociale.trim() && !saving ? 1 : 0.5 }}
            onClick={handleSubmit}
            disabled={!form.raison_sociale.trim() || saving}
          >
            {saving ? 'Enregistrement…' : isNew ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export default function CarnetAdressesPage() {
  const [entreprises, setEntreprises] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [deletingEntreprise, setDeletingEntreprise] = useState(null)
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('carnet-view-mode') ?? 'grid'
  )

  useEffect(() => {
    localStorage.setItem('carnet-view-mode', viewMode)
  }, [viewMode])

  const fetchEntreprises = useCallback(async () => {
    const { data } = await supabase
      .from('entreprises')
      .select(`
        *,
        interlocuteurs(id, prenom, nom, fonction, est_principal),
        lot_entreprises(
          id,
          lots(id, nom, affaires(id, nom, code_affaire, phase))
        )
      `)
      .order('raison_sociale')
    setEntreprises(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEntreprises() }, [fetchEntreprises])

  const handleSave = async (data) => {
    if (editing?.id) {
      await supabase.from('entreprises').update(data).eq('id', editing.id)
    } else {
      await supabase.from('entreprises').insert(data)
    }
    await fetchEntreprises()
    setEditing(null)
  }

  const handleDelete = async (id) => {
    await supabase.from('interlocuteurs').delete().eq('entreprise_id', id)
    await supabase.from('lot_entreprises').delete().eq('entreprise_id', id)
    const { error } = await supabase.from('entreprises').delete().eq('id', id)
    if (error) { console.error('Suppression:', error.message); return }
    setDeletingEntreprise(null)
    setEntreprises(prev => prev.filter(e => e.id !== id))
  }

  const filtered = entreprises.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      e.raison_sociale?.toLowerCase().includes(q) ||
      e.ville?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      (e.siret ?? '').includes(q)
    if (!matchSearch) return false
    const affCount = getUniqueAffaires(e).length
    if (filter === 'avec-affaire') return affCount > 0
    if (filter === 'sans-affaire') return affCount === 0
    return true
  })

  const toggleBtnStyle = (active) => ({
    width: 32, height: 32, borderRadius: 2,
    border: '0.5px solid rgba(0,0,0,0.12)',
    background: active ? 'var(--jga-orange-light)' : 'transparent',
    color: active ? 'var(--jga-orange)' : '#9C9591',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: '28px 32px', backgroundColor: '#FAFAF9', minHeight: 'calc(100vh - 52px)' }}>
      <style>{`.entreprise-card:hover .delete-btn { opacity: 1 !important; }`}</style>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif", marginBottom: 3 }}>Carnet d'adresses</h1>
          <p style={{ fontSize: 12, color: '#9C9591' }}>
            {entreprises.length} entreprise{entreprises.length > 1 ? 's' : ''} enregistrée{entreprises.length > 1 ? 's' : ''}
          </p>
        </div>
        <button style={BTN_PRIMARY} onClick={() => setEditing({})}>
          <Plus size={13} /> Nouvelle entreprise
        </button>
      </div>

      {/* Recherche + filtres + toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9C9591', pointerEvents: 'none' }} />
          <input
            placeholder="Rechercher par nom, ville, email, SIRET…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT, paddingLeft: 32 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'all', label: 'Toutes' },
            { key: 'avec-affaire', label: 'Avec affaire' },
            { key: 'sans-affaire', label: 'Sans affaire' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 14px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
                border: filter === f.key ? '0.5px solid #E8602C' : '0.5px solid rgba(0,0,0,0.12)',
                backgroundColor: filter === f.key ? 'rgba(232,96,44,0.10)' : 'white',
                color: filter === f.key ? '#E8602C' : '#5E5854',
                fontWeight: filter === f.key ? 500 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setViewMode('grid')} style={toggleBtnStyle(viewMode === 'grid')} title="Vue grille">
            <LayoutGrid size={15} />
          </button>
          <button onClick={() => setViewMode('list')} style={toggleBtnStyle(viewMode === 'list')} title="Vue liste">
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid #E8602C', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9C9591', fontSize: 13 }}>
          {search || filter !== 'all' ? 'Aucun résultat' : 'Aucune entreprise enregistrée'}
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(e => (
            <EntrepriseCard key={e.id} entreprise={e} onEdit={setEditing} onDelete={setDeletingEntreprise} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 2, overflow: 'hidden', border: '0.5px solid rgba(0,0,0,0.08)' }}>
          {/* Header liste */}
          <div style={{
            display: 'flex', alignItems: 'center',
            backgroundColor: '#FAF7F2', padding: '8px 16px',
            fontSize: 10, fontWeight: 600, color: '#9C9591',
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            <div style={{ flex: 3 }}>Entreprise</div>
            <div style={{ flex: 1 }}>Ville</div>
            <div style={{ flex: 1.5 }}>Téléphone</div>
            <div style={{ flex: 2 }}>Email</div>
            <div style={{ flex: 2 }}>Interlocuteur</div>
            <div style={{ flex: 1, textAlign: 'center' }}>Affaires</div>
            <div style={{ width: 64 }} />
          </div>
          {filtered.map(e => (
            <EntrepriseRow key={e.id} entreprise={e} onEdit={setEditing} onDelete={setDeletingEntreprise} />
          ))}
        </div>
      )}

      {/* Modale édition */}
      {editing !== null && (
        <EntrepriseEditModal
          entreprise={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Modale confirmation suppression */}
      {deletingEntreprise && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
          onClick={() => setDeletingEntreprise(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 0, padding: '28px 32px', maxWidth: 420, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 2, background: 'rgba(184,65,44,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={18} color="#B8412C" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>Supprimer l'entreprise ?</p>
                <p style={{ fontSize: 12, color: '#9C9591' }}>{deletingEntreprise.raison_sociale}</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 24 }}>
              Cette action est <strong>irréversible</strong>. L'entreprise sera supprimée du carnet d'adresses, retirée de tous les lots auxquels elle est assignée, et tous ses interlocuteurs seront supprimés.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingEntreprise(null)}
                style={{ padding: '8px 16px', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.15)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deletingEntreprise.id)}
                style={{ padding: '8px 16px', borderRadius: 2, border: 'none', background: '#B8412C', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
