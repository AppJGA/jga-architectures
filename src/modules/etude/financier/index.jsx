import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { useSuiviFinancierEtude } from '../../../shared/hooks/useSuiviFinancierEtude'

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES = [
  { id: 'esq',      label: 'ESQ',      full: 'Esquisse',                 color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'avp',      label: 'AVP',      full: 'Avant-Projet',             color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'pro',      label: 'PRO',      full: 'Projet',                   color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'dce',      label: 'DCE',      full: 'Dossier de Consultation',  color: '#E8602C', bg: 'rgba(232,96,44,0.10)' },
  { id: 'chantier', label: 'Chantier', full: 'Chantier',                 color: '#2A8A4E', bg: 'rgba(42,138,78,0.12)' },
]

const PHASES_EST = PHASES.filter(p => p.id !== 'chantier')

const SHOW_EST_FOR = ['avp', 'pro', 'dce', 'chantier']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function euro(v) {
  if (v == null || v === '') return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v)
}

function fmtPhase(id) {
  return PHASES.find(p => p.id === id) ?? { label: id?.toUpperCase() ?? '?', full: id, color: '#9C9591', bg: '#FAF7F2' }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#9C9591', marginBottom: 4,
}

const INPUT = {
  width: '100%', height: 38, padding: '0 12px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

const TEXTAREA = {
  width: '100%', padding: '10px 12px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17', resize: 'vertical', minHeight: 72,
}

function focusOn(e) {
  e.target.style.borderColor = '#E8602C'
  e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.07)'
}
function focusOff(e) {
  e.target.style.borderColor = 'rgba(0,0,0,0.12)'
  e.target.style.boxShadow = 'none'
}

// ─── PhaseFormModal ───────────────────────────────────────────────────────────

function PhaseFormModal({ open, onClose, existing, affaire, onSave, onDelete }) {
  const tva = affaire?.taux_tva ?? 1.20
  const tvaPct = Math.round((tva - 1) * 100)
  const defaultPhase = PHASES.some(p => p.id === affaire?.phase) ? affaire.phase : 'esq'

  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    if (existing) {
      setForm({
        phase:           existing.phase,
        enveloppe_ttc:   existing.enveloppe_ttc  ?? '',
        enveloppe_ht:    existing.enveloppe_ht   ?? '',
        honoraires_ttc:  existing.honoraires_ttc ?? '',
        honoraires_ht:   existing.honoraires_ht  ?? '',
        motif_evolution: existing.motif_evolution ?? '',
        notes:           existing.notes ?? '',
      })
    } else {
      setForm({
        phase: defaultPhase,
        enveloppe_ttc: '', enveloppe_ht: '',
        honoraires_ttc: '', honoraires_ht: '',
        motif_evolution: '', notes: '',
      })
    }
  }, [open, existing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !form) return null

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleEnvTtc = (v) => {
    set('enveloppe_ttc', v)
    set('enveloppe_ht', v !== '' ? (Number(v) / tva).toFixed(2) : '')
  }

  const handleHonTtc = (v) => {
    set('honoraires_ttc', v)
    set('honoraires_ht', v !== '' ? (Number(v) / tva).toFixed(2) : '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        phase:          form.phase,
        enveloppe_ttc:  form.enveloppe_ttc  !== '' ? Number(form.enveloppe_ttc)  : null,
        enveloppe_ht:   form.enveloppe_ht   !== '' ? Number(form.enveloppe_ht)   : null,
        honoraires_ttc: form.honoraires_ttc !== '' ? Number(form.honoraires_ttc) : null,
        honoraires_ht:  form.honoraires_ht  !== '' ? Number(form.honoraires_ht)  : null,
        motif_evolution: form.motif_evolution || null,
        notes:           form.notes || null,
      })
      onClose()
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try { await onDelete(existing.phase) } catch (err) { console.error(err) }
    setSaving(false)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 0, padding: '28px 32px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
            {existing ? 'Modifier la phase' : 'Renseigner une phase'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Phase */}
            <div>
              <label style={LABEL}>Phase</label>
              <select
                value={form.phase}
                onChange={e => set('phase', e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}
                onFocus={focusOn} onBlur={focusOff}
              >
                {PHASES.map(p => (
                  <option key={p.id} value={p.id}>{p.label} — {p.full}</option>
                ))}
              </select>
            </div>

            {/* Enveloppe TTC */}
            <div>
              <label style={LABEL}>Enveloppe TTC</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" min={0} step="100"
                  value={form.enveloppe_ttc}
                  onChange={e => handleEnvTtc(e.target.value)}
                  placeholder="0"
                  style={{ ...INPUT, paddingRight: 32 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9C9591', pointerEvents: 'none' }}>€</span>
              </div>
              {form.enveloppe_ht !== '' && (
                <p style={{ fontSize: 11, color: '#9C9591', marginTop: 4 }}>
                  ≈ {euro(Number(form.enveloppe_ht))} HT (TVA {tvaPct} %)
                </p>
              )}
            </div>

            {/* Honoraires TTC */}
            <div>
              <label style={LABEL}>Honoraires TTC</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" min={0} step="100"
                  value={form.honoraires_ttc}
                  onChange={e => handleHonTtc(e.target.value)}
                  placeholder="0"
                  style={{ ...INPUT, paddingRight: 32 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9C9591', pointerEvents: 'none' }}>€</span>
              </div>
              {form.honoraires_ht !== '' && (
                <p style={{ fontSize: 11, color: '#9C9591', marginTop: 4 }}>
                  ≈ {euro(Number(form.honoraires_ht))} HT
                </p>
              )}
            </div>

            {/* Motif d'évolution */}
            <div>
              <label style={LABEL}>Motif d'évolution</label>
              <textarea
                value={form.motif_evolution}
                onChange={e => set('motif_evolution', e.target.value)}
                placeholder="Renseignez si l'enveloppe a évolué depuis la phase précédente"
                style={TEXTAREA}
                rows={3}
                onFocus={focusOn} onBlur={focusOff}
              />
            </div>

            {/* Notes */}
            <div>
              <label style={LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Notes libres…"
                style={TEXTAREA}
                rows={2}
                onFocus={focusOn} onBlur={focusOff}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, alignItems: 'center' }}>
            {existing && (
              <button
                type="button" onClick={handleDelete} disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
                  border: `0.5px solid ${confirmDelete ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
                  backgroundColor: confirmDelete ? 'rgba(184,65,44,0.10)' : 'white',
                  color: confirmDelete ? '#B8412C' : '#9C9591', marginRight: 'auto',
                }}
              >
                <Trash2 size={13} />
                {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            )}
            <button
              type="button" onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}
            >
              Annuler
            </button>
            <button
              type="submit" disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── EstimationFormModal ──────────────────────────────────────────────────────

function EstimationFormModal({ open, onClose, existing, affaire, lotsExistants, onSave, onDelete }) {
  const tva = affaire?.taux_tva ?? 1.20

  const defaultEstPhase = () => {
    const ap = affaire?.phase
    return PHASES_EST.some(p => p.id === ap) ? ap : 'avp'
  }

  const [form, setForm] = useState(null)
  const [lotMode, setLotMode] = useState('select')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    if (existing) {
      const inList = lotsExistants.some(l => l.id === existing.lot_id)
      setLotMode(inList ? 'select' : 'libre')
      setForm({
        lot_id:             existing.lot_id ?? '',
        nom_lot:            existing.nom_lot ?? '',
        numero_lot:         existing.numero_lot ?? '',
        phase:              existing.phase ?? 'avp',
        montant_estime_ht:  existing.montant_estime_ht  ?? '',
        montant_estime_ttc: existing.montant_estime_ttc ?? '',
        notes:              existing.notes ?? '',
      })
    } else {
      setLotMode(lotsExistants.length > 0 ? 'select' : 'libre')
      setForm({
        lot_id: '', nom_lot: '', numero_lot: '',
        phase: defaultEstPhase(),
        montant_estime_ht: '', montant_estime_ttc: '',
        notes: '',
      })
    }
  }, [open, existing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !form) return null

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleLotSelect = (lotId) => {
    set('lot_id', lotId)
    const lot = lotsExistants.find(l => l.id === lotId)
    if (lot) {
      set('nom_lot', lot.nom)
      set('numero_lot', lot.numero ?? '')
    } else {
      set('nom_lot', '')
      set('numero_lot', '')
    }
  }

  const handleHtChange = (v) => {
    set('montant_estime_ht', v)
    set('montant_estime_ttc', v !== '' ? (Number(v) * tva).toFixed(2) : '')
  }

  const nomLotValid = lotMode === 'select' ? !!form.lot_id : form.nom_lot.trim() !== ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nomLotValid) return
    setSaving(true)
    try {
      await onSave({
        ...(existing?.id ? { id: existing.id } : {}),
        lot_id:             form.lot_id || null,
        nom_lot:            form.nom_lot,
        numero_lot:         form.numero_lot !== '' ? Number(form.numero_lot) : null,
        phase:              form.phase,
        montant_estime_ht:  form.montant_estime_ht  !== '' ? Number(form.montant_estime_ht)  : null,
        montant_estime_ttc: form.montant_estime_ttc !== '' ? Number(form.montant_estime_ttc) : null,
        notes:              form.notes || null,
      })
      onClose()
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try { await onDelete(existing.id) } catch (err) { console.error(err) }
    setSaving(false)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 0, padding: '28px 32px', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
            {existing ? "Modifier l'estimation" : 'Ajouter une estimation'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Lot */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ ...LABEL, marginBottom: 0 }}>Lot</label>
                {lotsExistants.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLotMode(m => m === 'select' ? 'libre' : 'select')}
                    style={{ fontSize: 11, color: '#E8602C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {lotMode === 'select' ? 'Saisie libre' : 'Depuis la liste'}
                  </button>
                )}
              </div>

              {lotMode === 'select' ? (
                <select
                  value={form.lot_id}
                  onChange={e => handleLotSelect(e.target.value)}
                  style={{ ...INPUT, cursor: 'pointer' }}
                  onFocus={focusOn} onBlur={focusOff}
                >
                  <option value="">— Sélectionner un lot —</option>
                  {lotsExistants.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.numero ? `Lot ${l.numero} — ` : ''}{l.nom}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.nom_lot}
                  onChange={e => set('nom_lot', e.target.value)}
                  placeholder="Nom du lot"
                  style={INPUT}
                  onFocus={focusOn} onBlur={focusOff}
                />
              )}
            </div>

            {/* Phase estimation */}
            <div>
              <label style={LABEL}>Phase de l'estimation</label>
              <select
                value={form.phase}
                onChange={e => set('phase', e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}
                onFocus={focusOn} onBlur={focusOff}
              >
                {PHASES_EST.map(p => (
                  <option key={p.id} value={p.id}>{p.label} — {p.full}</option>
                ))}
              </select>
            </div>

            {/* Montant estimé HT */}
            <div>
              <label style={LABEL}>Montant estimé HT</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" min={0} step="100"
                  value={form.montant_estime_ht}
                  onChange={e => handleHtChange(e.target.value)}
                  placeholder="0"
                  style={{ ...INPUT, paddingRight: 32 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9C9591', pointerEvents: 'none' }}>€</span>
              </div>
              {form.montant_estime_ttc !== '' && (
                <p style={{ fontSize: 11, color: '#9C9591', marginTop: 4 }}>
                  ≈ {euro(Number(form.montant_estime_ttc))} TTC
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label style={LABEL}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Notes libres…"
                style={TEXTAREA}
                rows={2}
                onFocus={focusOn} onBlur={focusOff}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, alignItems: 'center' }}>
            {existing && (
              <button
                type="button" onClick={handleDelete} disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
                  border: `0.5px solid ${confirmDelete ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
                  backgroundColor: confirmDelete ? 'rgba(184,65,44,0.10)' : 'white',
                  color: confirmDelete ? '#B8412C' : '#9C9591', marginRight: 'auto',
                }}
              >
                <Trash2 size={13} />
                {confirmDelete ? 'Confirmer' : 'Supprimer'}
              </button>
            )}
            <button
              type="button" onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}
            >
              Annuler
            </button>
            <button
              type="submit" disabled={saving || !nomLotValid}
              style={{ padding: '8px 16px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer', opacity: (saving || !nomLotValid) ? 0.6 : 1 }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Bandeau enveloppe ────────────────────────────────────────────────────────

function EnveloppeBandeau({ affaire, suiviParPhase }) {
  const navigate = useNavigate()
  const { affaireId } = useParams()

  const enveloppeInitiale = affaire?.enveloppe_ttc ?? null
  const derniere = suiviParPhase.length > 0 ? suiviParPhase[suiviParPhase.length - 1] : null
  const enveloppeActuelle = derniere?.enveloppe_ttc ?? enveloppeInitiale
  const evolution = enveloppeInitiale != null && enveloppeActuelle != null
    ? enveloppeActuelle - enveloppeInitiale
    : null
  const evolutionPct = enveloppeInitiale && evolution !== null
    ? (evolution / enveloppeInitiale) * 100
    : null

  const cells = [
    {
      label: 'Enveloppe initiale',
      value: enveloppeInitiale ? euro(enveloppeInitiale) : null,
      sub: enveloppeInitiale ? 'TTC' : null,
      empty: !enveloppeInitiale,
    },
    {
      label: 'Enveloppe actuelle',
      value: enveloppeActuelle ? euro(enveloppeActuelle) : null,
      sub: derniere ? `Phase ${fmtPhase(derniere.phase).label}` : (enveloppeInitiale ? 'Pas de suivi renseigné' : null),
    },
    {
      label: 'Évolution',
      value: evolution !== null
        ? (evolution === 0 ? 'Stable' : `${evolution > 0 ? '+' : ''}${euro(evolution)}`)
        : null,
      sub: evolutionPct !== null && evolution !== 0
        ? `${evolutionPct > 0 ? '+' : ''}${evolutionPct.toFixed(1)} %`
        : null,
      color: evolution != null
        ? (evolution > 0 ? '#B8412C' : evolution < 0 ? '#2A8A4E' : '#5E5854')
        : null,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
      {cells.map((cell, i) => (
        <div key={i} style={{
          backgroundColor: 'white', borderRadius: 0,
          border: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 20px',
        }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {cell.label}
          </p>
          {cell.value ? (
            <>
              <p style={{ fontSize: 19, fontWeight: 500, color: cell.color ?? '#1F1B17', marginBottom: cell.sub ? 4 : 0 }}>
                {cell.value}
              </p>
              {cell.sub && <p style={{ fontSize: 11, color: '#9C9591' }}>{cell.sub}</p>}
            </>
          ) : cell.empty ? (
            <button
              onClick={() => navigate(`/affaires/${affaireId}`)}
              style={{ fontSize: 12, color: '#E8602C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Renseigner →
            </button>
          ) : (
            <p style={{ fontSize: 13, color: '#9C9591' }}>—</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Phase badge ──────────────────────────────────────────────────────────────

function PhaseBadge({ phaseId }) {
  const p = fmtPhase(phaseId)
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, color: p.color,
      backgroundColor: p.bg, borderRadius: 3,
      padding: '3px 10px', letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {p.label}
    </span>
  )
}

// ─── Evolution badge ──────────────────────────────────────────────────────────

function EvoBadge({ current, reference }) {
  if (!current || !reference || current === reference) return null
  const delta = current - reference
  const pct = (delta / reference) * 100
  const isUp = delta > 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 500,
      color: isUp ? '#B8412C' : '#2A8A4E',
      backgroundColor: isUp ? 'rgba(184,65,44,0.10)' : 'rgba(42,138,78,0.12)',
      borderRadius: 3, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      {isUp ? '+' : ''}{euro(delta)} ({isUp ? '+' : ''}{pct.toFixed(1)} %)
    </span>
  )
}

// ─── Phase card (renseignée) ──────────────────────────────────────────────────

function PhaseCard({ phase, entry, prevEnveloppe, enveloppeInitiale, onEdit }) {
  const ref = prevEnveloppe ?? enveloppeInitiale

  const fields = [
    { label: 'Enveloppe TTC', value: entry.enveloppe_ttc },
    { label: 'Enveloppe HT',  value: entry.enveloppe_ht },
    { label: 'Honoraires TTC', value: entry.honoraires_ttc },
    { label: 'Honoraires HT',  value: entry.honoraires_ht },
  ].filter(f => f.value)

  return (
    <div style={{
      backgroundColor: 'white', borderRadius: 0,
      border: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: fields.length > 0 ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <PhaseBadge phaseId={phase.id} />
          <EvoBadge current={entry.enveloppe_ttc} reference={ref} />
        </div>
        <button
          onClick={() => onEdit(entry)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 3, fontSize: 11,
            border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white',
            color: '#5E5854', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Pencil size={11} /> Modifier
        </button>
      </div>

      {fields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fields.length, 4)}, 1fr)`, gap: '8px 16px', marginBottom: entry.motif_evolution || entry.notes ? 12 : 0 }}>
          {fields.map(f => (
            <div key={f.label}>
              <p style={{ fontSize: 10, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                {f.label}
              </p>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#1F1B17' }}>{euro(f.value)}</p>
            </div>
          ))}
        </div>
      )}

      {entry.motif_evolution && (
        <div style={{ backgroundColor: 'rgba(232,96,44,0.10)', borderRadius: 2, padding: '8px 12px', marginBottom: entry.notes ? 8 : 0 }}>
          <p style={{ fontSize: 10, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
            Motif d'évolution
          </p>
          <p style={{ fontSize: 12, color: '#1F1B17' }}>{entry.motif_evolution}</p>
        </div>
      )}

      {entry.notes && (
        <p style={{ fontSize: 12, color: '#5E5854' }}>{entry.notes}</p>
      )}
    </div>
  )
}

// ─── Empty phase row ──────────────────────────────────────────────────────────

function EmptyPhaseRow({ phase, onAdd }) {
  const p = fmtPhase(phase.id)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', borderRadius: 2,
      border: `0.5px dashed rgba(0,0,0,0.15)`,
      backgroundColor: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          border: `1.5px solid ${p.color}`, display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: p.color }}>{p.label}</span>
        <span style={{ fontSize: 12, color: '#9C9591' }}>— Non renseignée</span>
      </div>
      <button
        onClick={onAdd}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 3, fontSize: 11,
          border: `0.5px solid ${p.color}`, backgroundColor: p.bg,
          color: p.color, cursor: 'pointer',
        }}
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

// ─── Phase timeline ───────────────────────────────────────────────────────────

function PhaseTimeline({ suiviParPhase, enveloppeInitiale, onAdd, onEdit }) {
  const entriesMap = Object.fromEntries(suiviParPhase.map(e => [e.phase, e]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PHASES.map((phase, i) => {
        const entry = entriesMap[phase.id]
        if (entry) {
          const prevEntry = suiviParPhase
            .filter(e => PHASES.findIndex(p => p.id === e.phase) < i)
            .sort((a, b) => PHASES.findIndex(p => p.id === b.phase) - PHASES.findIndex(p => p.id === a.phase))[0]

          return (
            <PhaseCard
              key={phase.id}
              phase={phase}
              entry={entry}
              prevEnveloppe={prevEntry?.enveloppe_ttc ?? null}
              enveloppeInitiale={enveloppeInitiale}
              onEdit={onEdit}
            />
          )
        }
        return (
          <EmptyPhaseRow
            key={phase.id}
            phase={phase}
            onAdd={() => onAdd(phase.id)}
          />
        )
      })}
    </div>
  )
}

// ─── Estimations table ────────────────────────────────────────────────────────

function EstimationsTable({ estimationsLots, marchesLots, onEdit, onAdd }) {
  const marchesMap = Object.fromEntries(
    marchesLots.map(m => [m.lot_id, m.montant_marche_ht])
  )

  const rows = estimationsLots.map(est => {
    const marcheHt = est.lot_id ? (marchesMap[est.lot_id] ?? null) : null
    const ecart = marcheHt != null && est.montant_estime_ht != null
      ? marcheHt - est.montant_estime_ht
      : null
    return { ...est, marcheHt, ecart }
  })

  const totalEstime = rows.reduce((s, r) => s + (r.montant_estime_ht ?? 0), 0)
  const totalMarche = rows.filter(r => r.marcheHt != null).reduce((s, r) => s + r.marcheHt, 0)
  const totalEcart  = rows.filter(r => r.ecart != null).reduce((s, r) => s + r.ecart, 0)
  const hasMarche   = rows.some(r => r.marcheHt != null)

  const COL = { lot: 3, phase: 1, est: 1.5, marche: 1.5, ecart: 1.5, act: 0.5 }
  const totalFlex = Object.values(COL).reduce((s, v) => s + v, 0)
  const col = (k) => `${(COL[k] / totalFlex * 100).toFixed(1)}%`

  const theadCell = (label, k, align = 'left') => (
    <div style={{ flex: `0 0 ${col(k)}`, width: col(k), fontSize: 10, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: align }}>
      {label}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 8px', gap: 8 }}>
        {theadCell('Lot', 'lot')}
        {theadCell('Phase', 'phase')}
        {theadCell('Estimé HT', 'est', 'right')}
        {theadCell('Marché HT', 'marche', 'right')}
        {theadCell('Écart', 'ecart', 'right')}
        <div style={{ flex: `0 0 ${col('act')}`, width: col('act') }} />
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: 2,
          border: '0.5px solid rgba(0,0,0,0.08)', padding: '20px 16px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#9C9591' }}>Aucune estimation renseignée</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map(row => (
            <div key={row.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: 'white', borderRadius: 2,
              border: '0.5px solid rgba(0,0,0,0.08)', padding: '10px 16px',
            }}>
              {/* Lot */}
              <div style={{ flex: `0 0 ${col('lot')}`, width: col('lot'), minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.numero_lot ? `Lot ${row.numero_lot} — ` : ''}{row.nom_lot}
                </p>
              </div>
              {/* Phase */}
              <div style={{ flex: `0 0 ${col('phase')}`, width: col('phase') }}>
                <PhaseBadge phaseId={row.phase} />
              </div>
              {/* Estimé HT */}
              <div style={{ flex: `0 0 ${col('est')}`, width: col('est'), textAlign: 'right' }}>
                <p style={{ fontSize: 12, color: '#1F1B17' }}>{euro(row.montant_estime_ht)}</p>
              </div>
              {/* Marché HT */}
              <div style={{ flex: `0 0 ${col('marche')}`, width: col('marche'), textAlign: 'right' }}>
                <p style={{ fontSize: 12, color: row.marcheHt != null ? '#1F1B17' : '#9C9591' }}>
                  {row.marcheHt != null ? euro(row.marcheHt) : '—'}
                </p>
              </div>
              {/* Écart */}
              <div style={{ flex: `0 0 ${col('ecart')}`, width: col('ecart'), textAlign: 'right' }}>
                {row.ecart != null ? (
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    color: row.ecart <= 0 ? '#2A8A4E' : '#B8412C',
                  }}>
                    {row.ecart > 0 ? '+' : ''}{euro(row.ecart)}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: '#9C9591' }}>—</span>
                )}
              </div>
              {/* Actions */}
              <div style={{ flex: `0 0 ${col('act')}`, width: col('act'), display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => onEdit(row)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}
                  title="Modifier"
                >
                  <Pencil size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer totaux */}
      {rows.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          borderTop: '0.5px solid rgba(0,0,0,0.08)', marginTop: 4,
        }}>
          <div style={{ flex: `0 0 ${col('lot')}`, width: col('lot') }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totaux</p>
          </div>
          <div style={{ flex: `0 0 ${col('phase')}`, width: col('phase') }} />
          <div style={{ flex: `0 0 ${col('est')}`, width: col('est'), textAlign: 'right' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>{euro(totalEstime)}</p>
          </div>
          <div style={{ flex: `0 0 ${col('marche')}`, width: col('marche'), textAlign: 'right' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: hasMarche ? '#1F1B17' : '#9C9591' }}>
              {hasMarche ? euro(totalMarche) : '—'}
            </p>
          </div>
          <div style={{ flex: `0 0 ${col('ecart')}`, width: col('ecart'), textAlign: 'right' }}>
            {hasMarche ? (
              <span style={{ fontSize: 12, fontWeight: 500, color: totalEcart <= 0 ? '#2A8A4E' : '#B8412C' }}>
                {totalEcart > 0 ? '+' : ''}{euro(totalEcart)}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#9C9591' }}>—</span>
            )}
          </div>
          <div style={{ flex: `0 0 ${col('act')}`, width: col('act') }} />
        </div>
      )}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', margin: 0 }}>{title}</h2>
      {action}
    </div>
  )
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

// ─── Module principal ─────────────────────────────────────────────────────────

export default function FinancierEtudeModule() {
  const { affaireId } = useParams()
  const { affaire, loading: affaireLoading } = useAffaire(affaireId)

  const {
    enveloppeInitiale,
    suiviParPhase,
    estimationsLots,
    lotsExistants,
    marchesLots,
    loading,
    upsertPhase,
    deletePhase,
    upsertEstimation,
    deleteEstimation,
  } = useSuiviFinancierEtude(affaireId, affaire)

  const [phaseModal, setPhaseModal] = useState({ open: false, existing: null, defaultPhase: null })
  const [estModal, setEstModal] = useState({ open: false, existing: null })

  const openAddPhase = (defaultPhaseId) => {
    setPhaseModal({ open: true, existing: null, defaultPhase: defaultPhaseId })
  }

  const openEditPhase = (entry) => {
    setPhaseModal({ open: true, existing: entry, defaultPhase: null })
  }

  const openAddEst = () => setEstModal({ open: true, existing: null })
  const openEditEst = (row) => setEstModal({ open: true, existing: row })

  const showEstimations = SHOW_EST_FOR.includes(affaire?.phase)

  if (loading || affaireLoading) {
    return (
      <>
        <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>
        <Spinner />
      </>
    )
  }

  // Affaire with optional defaultPhase override for modal
  const affaireForModal = phaseModal.defaultPhase
    ? { ...affaire, phase: phaseModal.defaultPhase }
    : affaire

  return (
    <>
      <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Bandeau enveloppe ── */}
      <EnveloppeBandeau
        affaire={affaire}
        suiviParPhase={suiviParPhase}
        enveloppeInitiale={enveloppeInitiale}
      />

      {/* ── Timeline des phases ── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader
          title="Historique des phases"
          action={
            <button
              onClick={() => openAddPhase(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 2, fontSize: 12,
                border: '0.5px solid #E8602C', backgroundColor: 'var(--jga-orange-light)',
                color: '#E8602C', cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              Renseigner une phase
            </button>
          }
        />
        <PhaseTimeline
          suiviParPhase={suiviParPhase}
          enveloppeInitiale={enveloppeInitiale}
          onAdd={openAddPhase}
          onEdit={openEditPhase}
        />
      </div>

      {/* ── Estimations par lot ── */}
      {showEstimations && (
        <div>
          <SectionHeader
            title="Estimations par lot"
            action={
              <button
                onClick={openAddEst}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 2, fontSize: 12,
                  border: '0.5px solid #E8602C', backgroundColor: 'var(--jga-orange-light)',
                  color: '#E8602C', cursor: 'pointer',
                }}
              >
                <Plus size={13} />
                Ajouter une estimation
              </button>
            }
          />
          <div style={{
            backgroundColor: '#FAF7F2', borderRadius: 0,
            border: '0.5px solid rgba(0,0,0,0.06)', padding: 4,
          }}>
            <EstimationsTable
              estimationsLots={estimationsLots}
              marchesLots={marchesLots}
              onEdit={openEditEst}
              onAdd={openAddEst}
            />
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <PhaseFormModal
        open={phaseModal.open}
        onClose={() => setPhaseModal(s => ({ ...s, open: false }))}
        existing={phaseModal.existing}
        affaire={affaireForModal}
        onSave={upsertPhase}
        onDelete={deletePhase}
      />

      <EstimationFormModal
        open={estModal.open}
        onClose={() => setEstModal(s => ({ ...s, open: false }))}
        existing={estModal.existing}
        affaire={affaire}
        lotsExistants={lotsExistants}
        onSave={upsertEstimation}
        onDelete={deleteEstimation}
      />
    </>
  )
}
