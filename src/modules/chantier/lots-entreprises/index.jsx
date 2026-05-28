import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  Building2, Plus, MoreHorizontal, Phone, Mail,
  Pencil, Trash2, X, Check, Search,
} from 'lucide-react'
import { useLotsEntreprises, useEntreprises } from '../../../shared/hooks/useLotsEntreprises'
import { supabase } from '../../../core/supabase/client'

const LOT_SUGGESTIONS = [
  'Gros œuvre', 'Charpente - Couverture', 'Étanchéité', 'Façades',
  'Menuiseries extérieures', 'Cloisons - Doublages', 'Plomberie - Sanitaires',
  'Électricité CFO/CFA', 'Chauffage - Ventilation', 'Menuiseries intérieures',
  'Revêtements de sols', 'Peinture', 'VRD',
]

const FONCTION_SUGGESTIONS = [
  'Gérant', 'Conducteur de travaux', 'Chef de chantier',
  'Chargé d\'affaires', 'Commercial', 'Assistante',
]

function formatEuro(v) {
  if (!v && v !== 0) return null
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getInitials(prenom, nom) {
  return [(prenom ?? '')[0], (nom ?? '')[0]].filter(Boolean).join('').toUpperCase()
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const INPUT = {
  width: '100%', height: 38,
  padding: '0 12px',
  border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8,
  fontSize: 13, color: '#1a1a1a', backgroundColor: '#FAFAF9',
  outline: 'none', boxSizing: 'border-box',
}

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--jga-beige)', letterSpacing: '0.05em',
  textTransform: 'uppercase', marginBottom: 4,
}

const BTN_CANCEL = {
  padding: '8px 14px', borderRadius: 8,
  border: '0.5px solid rgba(0,0,0,0.15)', background: 'none',
  fontSize: 12, cursor: 'pointer', color: '#6b7280',
}

const BTN_GREEN = {
  padding: '8px 16px', borderRadius: 8,
  border: 'none', backgroundColor: '#639922', color: 'white',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
}

function Overlay({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      {children}
    </div>
  )
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>{title}</h2>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jga-beige)', padding: 2 }}>
        <X size={18} />
      </button>
    </div>
  )
}

// ─── LotFormModal ─────────────────────────────────────────────────────────────
function LotFormModal({ lots, editingLot, onSave, onClose }) {
  const nextNumero = lots.length > 0 ? Math.max(...lots.map(l => l.numero)) + 1 : 1
  const [form, setForm] = useState({
    numero: editingLot?.numero ?? nextNumero,
    nom: editingLot?.nom ?? '',
  })
  const [saving, setSaving] = useState(false)
  const canSave = form.nom.trim() && form.numero

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave({ numero: Number(form.numero), nom: form.nom.trim() })
    setSaving(false)
  }

  return (
    <Overlay>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
        <ModalHeader title={editingLot ? 'Modifier le lot' : 'Nouveau lot'} onClose={onClose} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL}>Numéro de lot</label>
            <input
              type="number" min={1}
              value={form.numero}
              onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>Nom du lot</label>
            <input
              list="lot-suggestions"
              value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              placeholder="Ex : Gros œuvre"
              style={INPUT}
            />
            <datalist id="lot-suggestions">
              {LOT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={BTN_CANCEL}>Annuler</button>
          <button onClick={handleSubmit} disabled={!canSave || saving}
            style={{ ...BTN_GREEN, opacity: (!canSave || saving) ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── EntrepriseAssignModal ────────────────────────────────────────────────────
function EntrepriseAssignModal({ lot, entreprises, createEntreprise, onSave, onClose }) {
  const [tab, setTab] = useState('existing')
  const [search, setSearch] = useState('')
  const [selectedE, setSelectedE] = useState(
    lot.entreprise_id ? { id: lot.entreprise_id, raison_sociale: lot.raison_sociale } : null
  )
  const [newForm, setNewForm] = useState({
    raison_sociale: '', adresse: '', code_postal: '', ville: '', telephone: '', email: '', siret: '',
  })
  const [marche, setMarche] = useState({
    montant_marche_ht: lot.montant_marche_ht ?? '',
    montant_marche_ttc: lot.montant_marche_ttc ?? '',
    date_notification: lot.date_notification ?? '',
    observations: lot.observations ?? '',
  })
  const [saving, setSaving] = useState(false)

  const filtered = entreprises.filter(e =>
    !search ||
    e.raison_sociale?.toLowerCase().includes(search.toLowerCase()) ||
    e.ville?.toLowerCase().includes(search.toLowerCase())
  )

  const handleHtBlur = () => {
    if (marche.montant_marche_ht && !marche.montant_marche_ttc) {
      setMarche(f => ({ ...f, montant_marche_ttc: Math.round(Number(f.montant_marche_ht) * 1.20 * 100) / 100 }))
    }
  }

  const canSave = tab === 'existing' ? !!selectedE : !!newForm.raison_sociale.trim()

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    let entreprise_id = selectedE?.id ?? null
    if (tab === 'new') {
      const { data } = await createEntreprise({ ...newForm, raison_sociale: newForm.raison_sociale.trim() })
      entreprise_id = data?.id
    }
    if (!entreprise_id) { setSaving(false); return }
    await onSave({
      entreprise_id,
      interlocuteur_id: lot.interlocuteur_id ?? null,
      montant_marche_ht: marche.montant_marche_ht ? Number(marche.montant_marche_ht) : null,
      montant_marche_ttc: marche.montant_marche_ttc ? Number(marche.montant_marche_ttc) : null,
      date_notification: marche.date_notification || null,
      observations: marche.observations || null,
    })
    setSaving(false)
  }

  const tabBtn = (active) => ({
    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500,
    border: 'none', cursor: 'pointer', borderRadius: 6,
    backgroundColor: active ? '#639922' : 'transparent',
    color: active ? 'white' : 'var(--jga-beige)',
  })

  return (
    <Overlay>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <ModalHeader
          title={lot.entreprise_id ? "Changer l'entreprise" : 'Assigner une entreprise'}
          onClose={onClose}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: 4, backgroundColor: '#F5F2F0', borderRadius: 8, marginBottom: 16 }}>
          <button style={tabBtn(tab === 'existing')} onClick={() => setTab('existing')}>
            Entreprise existante
          </button>
          <button style={tabBtn(tab === 'new')} onClick={() => setTab('new')}>
            Nouvelle entreprise
          </button>
        </div>

        {tab === 'existing' ? (
          <div>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--jga-beige)', pointerEvents: 'none' }} />
              <input
                placeholder="Rechercher par nom ou ville…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...INPUT, paddingLeft: 30 }}
              />
            </div>
            <div style={{ maxHeight: 188, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {filtered.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--jga-beige)', textAlign: 'center', padding: '12px 0' }}>
                  Aucune entreprise — créez-en une dans l'onglet suivant
                </p>
              ) : filtered.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedE(e)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px',
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    backgroundColor: selectedE?.id === e.id ? '#EAF3DE' : '#FAFAF9',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{e.raison_sociale}</span>
                  {e.ville && <span style={{ fontSize: 11, color: 'var(--jga-beige)' }}>{e.ville}</span>}
                  {selectedE?.id === e.id && <Check size={14} style={{ color: '#639922', flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL}>Raison sociale *</label>
              <input value={newForm.raison_sociale} onChange={e => setNewForm(f => ({ ...f, raison_sociale: e.target.value }))}
                placeholder="Nom de l'entreprise" style={INPUT} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL}>Adresse</label>
              <input value={newForm.adresse} onChange={e => setNewForm(f => ({ ...f, adresse: e.target.value }))} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Code postal</label>
              <input value={newForm.code_postal} onChange={e => setNewForm(f => ({ ...f, code_postal: e.target.value }))} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Ville</label>
              <input value={newForm.ville} onChange={e => setNewForm(f => ({ ...f, ville: e.target.value }))} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Téléphone</label>
              <input value={newForm.telephone} onChange={e => setNewForm(f => ({ ...f, telephone: e.target.value }))} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Email</label>
              <input type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} style={INPUT} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL}>SIRET</label>
              <input value={newForm.siret} onChange={e => setNewForm(f => ({ ...f, siret: e.target.value }))} style={INPUT} />
            </div>
          </div>
        )}

        {/* Marché */}
        <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', margin: '16px 0' }} />
        <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Marché de base
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LABEL}>Montant HT (€)</label>
            <input type="number" value={marche.montant_marche_ht}
              onChange={e => setMarche(f => ({ ...f, montant_marche_ht: e.target.value }))}
              onBlur={handleHtBlur} placeholder="0" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Montant TTC (€)</label>
            <input type="number" value={marche.montant_marche_ttc}
              onChange={e => setMarche(f => ({ ...f, montant_marche_ttc: e.target.value }))}
              placeholder="Auto ×1,20" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Date notification</label>
            <input type="date" value={marche.date_notification}
              onChange={e => setMarche(f => ({ ...f, date_notification: e.target.value }))} style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Observations</label>
          <textarea value={marche.observations}
            onChange={e => setMarche(f => ({ ...f, observations: e.target.value }))}
            rows={2} style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={BTN_CANCEL}>Annuler</button>
          <button onClick={handleSubmit} disabled={!canSave || saving}
            style={{ ...BTN_GREEN, opacity: !canSave || saving ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : 'Assigner'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── InterlocuteurFormModal ───────────────────────────────────────────────────
function InterlocuteurFormModal({ lot, onSave, onClose }) {
  const isEdit = !!lot.interlocuteur_id
  const [form, setForm] = useState({
    prenom: lot.prenom ?? '',
    nom: lot.nom_contact ?? '',
    fonction: lot.fonction ?? '',
    telephone: lot.interlocuteur_tel ?? '',
    email: lot.interlocuteur_email ?? '',
  })
  const [saving, setSaving] = useState(false)
  const canSave = form.prenom.trim() && form.nom.trim()

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave(form, isEdit)
    setSaving(false)
  }

  return (
    <Overlay>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
        <ModalHeader
          title={isEdit ? "Modifier l'interlocuteur" : 'Ajouter un interlocuteur'}
          onClose={onClose}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Prénom *</label>
            <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Nom *</label>
            <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={INPUT} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL}>Fonction</label>
            <input list="fonction-suggestions" value={form.fonction}
              onChange={e => setForm(f => ({ ...f, fonction: e.target.value }))}
              placeholder="Ex : Conducteur de travaux" style={INPUT} />
            <datalist id="fonction-suggestions">
              {FONCTION_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label style={LABEL}>Téléphone</label>
            <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={INPUT} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={BTN_CANCEL}>Annuler</button>
          <button onClick={handleSubmit} disabled={!canSave || saving}
            style={{ ...BTN_GREEN, opacity: !canSave || saving ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── LotCard ──────────────────────────────────────────────────────────────────
function LotCard({ lot, isSelected, menuOpen, onSelect, onOpenMenu, onEdit, onDelete }) {
  return (
    <div
      onClick={onSelect}
      style={{
        position: 'relative',
        backgroundColor: isSelected ? '#EAF3DE' : 'white',
        borderRadius: 10,
        border: isSelected ? '1.5px solid #639922' : '0.5px solid rgba(0,0,0,0.08)',
        padding: '10px 12px', marginBottom: 6,
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(99,153,34,0.4)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.border = '0.5px solid rgba(0,0,0,0.08)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.06em' }}>
            Lot {lot.numero}
          </span>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.3, marginTop: 1 }}>{lot.nom}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onOpenMenu() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jga-beige)', padding: '2px 2px', flexShrink: 0, borderRadius: 4 }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        {lot.raison_sociale ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lot.raison_sociale}
            </span>
            {lot.montant_marche_ht && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#639922', flexShrink: 0 }}>
                {formatEuro(lot.montant_marche_ht)} HT
              </span>
            )}
          </div>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 500,
            backgroundColor: '#FEF3C7', color: '#92400E',
            borderRadius: 20, padding: '2px 8px', display: 'inline-block',
          }}>
            Non attribué
          </span>
        )}
      </div>

      {menuOpen && (
        <div
          style={{
            position: 'absolute', top: 34, right: 8, zIndex: 20,
            backgroundColor: 'white', borderRadius: 8,
            border: '0.5px solid rgba(0,0,0,0.12)', minWidth: 160, overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: 'Modifier le lot', color: '#1a1a1a', hoverBg: '#F5F2F0', action: onEdit },
            { label: 'Supprimer le lot', color: '#DC2626', hoverBg: '#FFF5F5', action: onDelete },
          ].map(({ label, color, hoverBg, action }) => (
            <button
              key={label}
              onClick={e => { e.stopPropagation(); action() }}
              style={{ width: '100%', padding: '8px 14px', fontSize: 12, color, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBg}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Colonne gauche ───────────────────────────────────────────────────────────
function LotsSidebar({ lots, selectedLotId, menuLotId, onSelect, onOpenMenu, onAddLot, onEditLot, onDeleteLot }) {
  const totalHt = lots.reduce((sum, l) => sum + (l.montant_marche_ht ?? 0), 0)

  return (
    <div style={{
      width: 300, minWidth: 300, backgroundColor: 'white',
      borderRight: '0.5px solid rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>Lots du chantier</span>
          <button
            onClick={onAddLot}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6,
              border: '0.5px solid #639922', backgroundColor: 'transparent',
              color: '#639922', fontSize: 11, cursor: 'pointer',
            }}
          >
            <Plus size={11} /> Ajouter
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {lots.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <Building2 size={28} style={{ color: '#D1C9C4', marginBottom: 8 }} />
            <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>Aucun lot créé</p>
            <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 3 }}>Ajoutez les lots du marché</p>
          </div>
        ) : lots.map(lot => (
          <LotCard
            key={lot.id}
            lot={lot}
            isSelected={selectedLotId === lot.id}
            menuOpen={menuLotId === lot.id}
            onSelect={() => onSelect(lot.id)}
            onOpenMenu={() => onOpenMenu(lot.id)}
            onEdit={() => onEditLot(lot)}
            onDelete={() => onDeleteLot(lot.id)}
          />
        ))}
      </div>

      {lots.length > 0 && totalHt > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(0,0,0,0.06)', backgroundColor: '#F9FBF6', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--jga-beige)' }}>Total marchés HT </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#639922' }}>{formatEuro(totalHt)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Colonne droite : détail ──────────────────────────────────────────────────
function InfoRow({ label, value, href }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </p>
      {href ? (
        <a href={href} style={{ fontSize: 13, color: '#1a1a1a', textDecoration: 'none' }}>{value ?? '—'}</a>
      ) : (
        <p style={{ fontSize: 13, fontWeight: value ? 500 : 400, color: value ? '#1a1a1a' : 'var(--jga-beige)' }}>{value ?? '—'}</p>
      )}
    </div>
  )
}

function LotDetail({ lot, onEditLot, onAssign, onEditInterlocuteur }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: '#F5F2F0' }}>
      {/* En-tête lot */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Lot {lot.numero}
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: '#1a1a1a' }}>{lot.nom}</h2>
          </div>
          <button
            onClick={onEditLot}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6,
              border: '0.5px solid #639922', backgroundColor: 'transparent',
              color: '#639922', fontSize: 11, cursor: 'pointer',
            }}
          >
            <Pencil size={10} /> Modifier
          </button>
        </div>
      </div>

      {/* Entreprise */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Entreprise attributaire
          </p>
          {lot.entreprise_id && (
            <button onClick={onAssign} style={{ fontSize: 11, color: '#639922', background: 'none', border: 'none', cursor: 'pointer' }}>
              Changer
            </button>
          )}
        </div>

        {!lot.entreprise_id ? (
          <div style={{
            border: '1px dashed rgba(99,153,34,0.3)', borderRadius: 10,
            padding: '28px 16px', textAlign: 'center', backgroundColor: '#F9FBF6',
          }}>
            <Building2 size={28} style={{ color: '#C5D9A8', marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>Aucune entreprise assignée à ce lot</p>
            <button
              onClick={onAssign}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                backgroundColor: '#639922', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Assigner une entreprise
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 16 }}>
              <InfoRow label="Raison sociale" value={lot.raison_sociale} />
              <InfoRow label="SIRET" value={lot.siret} />
              <InfoRow label="Adresse" value={[lot.adresse, lot.code_postal, lot.ville].filter(Boolean).join(', ') || null} />
              <InfoRow label="Téléphone" value={lot.entreprise_tel} href={lot.entreprise_tel ? `tel:${lot.entreprise_tel}` : null} />
              <InfoRow label="Email" value={lot.entreprise_email} href={lot.entreprise_email ? `mailto:${lot.entreprise_email}` : null} />
            </div>

            <div style={{ height: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)', marginBottom: 14 }} />
            <p style={{ fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Marché de base
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 16px', marginBottom: lot.observations ? 12 : 0 }}>
              <div>
                <p style={{ fontSize: 10, color: 'var(--jga-beige)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Montant HT</p>
                <p style={{ fontSize: 18, fontWeight: 500, color: lot.montant_marche_ht ? '#639922' : 'var(--jga-beige)' }}>
                  {formatEuro(lot.montant_marche_ht) ?? '—'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 10, color: 'var(--jga-beige)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Montant TTC</p>
                <p style={{ fontSize: 14, color: '#6b7280' }}>{formatEuro(lot.montant_marche_ttc) ?? '—'}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, color: 'var(--jga-beige)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Date notification</p>
                <p style={{ fontSize: 13, color: '#6b7280' }}>{fmtDate(lot.date_notification) ?? '—'}</p>
              </div>
            </div>
            {lot.observations && (
              <p style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {lot.observations}
              </p>
            )}
          </>
        )}
      </div>

      {/* Interlocuteur */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Interlocuteur
          </p>
          {lot.interlocuteur_id && (
            <button onClick={onEditInterlocuteur} style={{ fontSize: 11, color: '#639922', background: 'none', border: 'none', cursor: 'pointer' }}>
              Modifier
            </button>
          )}
        </div>

        {!lot.entreprise_id ? (
          <p style={{ fontSize: 12, color: 'var(--jga-beige)', fontStyle: 'italic' }}>
            Assignez d'abord une entreprise
          </p>
        ) : !lot.interlocuteur_id ? (
          <div>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Aucun interlocuteur renseigné</p>
            <button
              onClick={onEditInterlocuteur}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 7,
                border: '0.5px solid #639922', backgroundColor: 'transparent',
                color: '#639922', fontSize: 11, cursor: 'pointer',
              }}
            >
              <Plus size={11} /> Ajouter un interlocuteur
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              backgroundColor: '#EAF3DE', color: '#639922',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 500, flexShrink: 0,
            }}>
              {getInitials(lot.prenom, lot.nom_contact)}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', marginBottom: 1 }}>
                {lot.prenom} {lot.nom_contact}
              </p>
              {lot.fonction && (
                <p style={{ fontSize: 12, color: '#9B8F85', marginBottom: 6 }}>{lot.fonction}</p>
              )}
              {lot.interlocuteur_tel && (
                <a href={`tel:${lot.interlocuteur_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280', textDecoration: 'none', marginBottom: 2 }}>
                  <Phone size={12} style={{ color: 'var(--jga-beige)' }} /> {lot.interlocuteur_tel}
                </a>
              )}
              {lot.interlocuteur_email && (
                <a href={`mailto:${lot.interlocuteur_email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
                  <Mail size={12} style={{ color: 'var(--jga-beige)' }} /> {lot.interlocuteur_email}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Module principal ─────────────────────────────────────────────────────────
export default function LotsEntreprisesModule() {
  const { affaireId } = useParams()
  const { lots, loading, createLot, updateLot, deleteLot, assignerEntreprise, refetch } = useLotsEntreprises(affaireId)
  const { entreprises, createEntreprise } = useEntreprises()

  const [selectedLotId, setSelectedLotId] = useState(null)
  const [lotFormOpen, setLotFormOpen] = useState(false)
  const [editingLot, setEditingLot] = useState(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [interlocuteurModalOpen, setInterlocuteurModalOpen] = useState(false)
  const [menuLotId, setMenuLotId] = useState(null)

  useEffect(() => {
    if (!menuLotId) return
    const close = () => setMenuLotId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuLotId])

  const selectedLot = lots.find(l => l.id === selectedLotId) ?? null

  const handleEditLot = (lot) => { setEditingLot(lot); setLotFormOpen(true); setMenuLotId(null) }

  const handleDeleteLot = async (lotId) => {
    setMenuLotId(null)
    if (!window.confirm('Supprimer ce lot ? Cette action est irréversible.')) return
    if (lotId === selectedLotId) setSelectedLotId(null)
    await deleteLot(lotId)
  }

  const handleLotSave = async (data) => {
    if (editingLot) await updateLot(editingLot.id, data)
    else await createLot(data)
    setLotFormOpen(false)
    setEditingLot(null)
  }

  const handleAssignSave = async (data) => {
    await assignerEntreprise(selectedLotId, data)
    setAssignModalOpen(false)
  }

  const handleInterlocuteurSave = async (formData, isEdit) => {
    if (isEdit) {
      await supabase.from('interlocuteurs').update({
        prenom: formData.prenom, nom: formData.nom,
        fonction: formData.fonction, telephone: formData.telephone, email: formData.email,
      }).eq('id', selectedLot.interlocuteur_id)
    } else {
      const { data: newI } = await supabase.from('interlocuteurs').insert({
        entreprise_id: selectedLot.entreprise_id,
        prenom: formData.prenom, nom: formData.nom,
        fonction: formData.fonction, telephone: formData.telephone, email: formData.email,
      }).select().single()
      if (newI) {
        await assignerEntreprise(selectedLotId, {
          entreprise_id: selectedLot.entreprise_id,
          interlocuteur_id: newI.id,
          montant_marche_ht: selectedLot.montant_marche_ht,
          montant_marche_ttc: selectedLot.montant_marche_ttc,
          date_notification: selectedLot.date_notification,
          observations: selectedLot.observations,
        })
      }
    }
    await refetch()
    setInterlocuteurModalOpen(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--jga-green-light)', borderTopColor: 'var(--jga-green)' }} />
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        <LotsSidebar
          lots={lots}
          selectedLotId={selectedLotId}
          menuLotId={menuLotId}
          onSelect={setSelectedLotId}
          onOpenMenu={setMenuLotId}
          onAddLot={() => { setEditingLot(null); setLotFormOpen(true) }}
          onEditLot={handleEditLot}
          onDeleteLot={handleDeleteLot}
        />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {!selectedLot ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#F5F2F0', color: '#9B8F85',
            }}>
              <Building2 size={48} style={{ marginBottom: 12, opacity: 0.25 }} />
              <p style={{ fontSize: 13 }}>Sélectionnez un lot pour voir son détail</p>
            </div>
          ) : (
            <LotDetail
              lot={selectedLot}
              onEditLot={() => handleEditLot(selectedLot)}
              onAssign={() => setAssignModalOpen(true)}
              onEditInterlocuteur={() => setInterlocuteurModalOpen(true)}
            />
          )}
        </div>
      </div>

      {lotFormOpen && (
        <LotFormModal
          lots={lots}
          editingLot={editingLot}
          onSave={handleLotSave}
          onClose={() => { setLotFormOpen(false); setEditingLot(null) }}
        />
      )}

      {assignModalOpen && selectedLot && (
        <EntrepriseAssignModal
          lot={selectedLot}
          entreprises={entreprises}
          createEntreprise={createEntreprise}
          onSave={handleAssignSave}
          onClose={() => setAssignModalOpen(false)}
        />
      )}

      {interlocuteurModalOpen && selectedLot && (
        <InterlocuteurFormModal
          lot={selectedLot}
          onSave={handleInterlocuteurSave}
          onClose={() => setInterlocuteurModalOpen(false)}
        />
      )}
    </>
  )
}
