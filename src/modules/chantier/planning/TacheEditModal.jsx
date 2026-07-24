import { useState, useEffect, useRef } from 'react'
import { Trash2, Save, X, Plus, Minimize2, Maximize2 } from 'lucide-react'
import { parseDate, formatDateISO, computeLag, addWorkingDays } from './types'

const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#2A8A4E', color: 'white', border: 'none', fontWeight: 500,
}
const BTN_DANGER = {
  ...BTN, color: '#B8412C', borderColor: 'rgba(220,38,38,0.3)',
}

const MODAL_WIDTH = 460
const MODAL_MINIMIZED_HEIGHT = 44

function emptyForm(lots, defaultDebut, lastUsedLotId) {
  const validLastUsed = lastUsedLotId && lots.some((l) => l.id === lastUsedLotId) ? lastUsedLotId : null
  return {
    num_tache: '',
    nom: '',
    debut: defaultDebut ?? formatDateISO(new Date()),
    duree: 5,
    avancement: 0,
    lot_id: validLastUsed ?? (lots.length > 0 ? lots[0].id : null),
    zone_id: null,
    depends_on: null,
    lag_days: null,
    appro_actif: false,
    appro_duree: null,
    appro_materiau: null,
  }
}

// Prochain numéro disponible pour un lot donné (ex : "01" → "02")
function getNextNumero(lotId, tasks) {
  const tasksDuLot = tasks.filter((t) => t.lot_id === lotId)
  if (tasksDuLot.length === 0) return '01'
  const maxNum = Math.max(...tasksDuLot.map((t) => parseInt(t.num_tache, 10) || 0))
  return String(maxNum + 1).padStart(2, '0')
}

export function TacheEditModal({
  open, onClose, task, tasks, lots, onSave, onRequestDelete, mode, zones = [], colorMode = 'lot', defaultDebut = null,
  lastUsedLotId = null,
  getSegmentsForTache, addSegment, updateSegment, deleteSegment,
}) {
  const [form, setForm] = useState(emptyForm(lots))
  const [saving, setSaving] = useState(false)

  // ── Modale flottante : position, minimisation, drag ────────────────────────────
  const [position, setPosition] = useState(() => ({
    x: window.innerWidth - MODAL_WIDTH - 24,
    y: window.innerHeight - 600 - 24,
  }))
  const [minimized, setMinimized] = useState(false)
  const [isDraggingModal, setIsDraggingModal] = useState(false)
  const dragStartRef = useRef(null)
  const modalRef = useRef(null)

  // Toujours repartir sur le formulaire visible quand on ouvre ou change de tâche
  useEffect(() => {
    if (open) setMinimized(false)
  }, [open, task?.id])

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        ...task,
        debut: typeof task.debut === 'string'
          ? task.debut.split('T')[0]
          : formatDateISO(parseDate(task.debut)),
      })
    } else {
      const base = emptyForm(lots, defaultDebut, lastUsedLotId)
      setForm({ ...base, num_tache: base.lot_id ? getNextNumero(base.lot_id, tasks) : '' })
    }
  }, [task, open, lots, defaultDebut, lastUsedLotId, tasks])

  // Si le dernier lot utilisé change pendant que la modale de création est déjà
  // ouverte, ne patcher que le champ lot (sans écraser le reste du formulaire).
  useEffect(() => {
    if (mode === 'create' && lastUsedLotId) {
      setForm((f) => ({ ...f, lot_id: lastUsedLotId }))
    }
  }, [lastUsedLotId, mode])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const segmentsDeTache = task?.id && getSegmentsForTache ? getSegmentsForTache(task.id) : []

  const handleAddSegment = async () => {
    if (!task?.id || !addSegment) return

    // Lendemain ouvré de la fin de la tâche principale
    let defaultDate = addWorkingDays(
      addWorkingDays(parseDate(form.debut), (form.duree ?? 5) - 1),
      1
    )

    if (segmentsDeTache.length > 0) {
      const last = segmentsDeTache[segmentsDeTache.length - 1]
      const lastNext = addWorkingDays(
        addWorkingDays(parseDate(last.date_debut), (last.duree_jours ?? 5) - 1),
        1
      )
      if (lastNext > defaultDate) defaultDate = lastNext
    }

    await addSegment(task.id, {
      date_debut: formatDateISO(defaultDate),
      duree_jours: form.duree ?? 5,
      zone_id: form.zone_id ?? null,
    })
  }

  const handleLotChange = (lotId) => {
    if (mode === 'create') {
      setForm((f) => ({ ...f, lot_id: lotId, num_tache: getNextNumero(lotId, tasks) }))
    } else {
      set('lot_id', lotId)
    }
  }

  const handleDependencyChange = (v) => {
    const newDependsOn = v === 'none' ? null : Number(v)
    if (newDependsOn == null) {
      setForm((f) => ({ ...f, depends_on: null, lag_days: null }))
      return
    }
    const parentTask = tasks.find((t) => t.id === newDependsOn)
    if (!parentTask || !form.debut) {
      setForm((f) => ({ ...f, depends_on: newDependsOn }))
      return
    }
    const lag = computeLag(
      parseDate(parentTask.debut),
      parentTask.duree,
      parseDate(form.debut)
    )
    setForm((f) => ({ ...f, depends_on: newDependsOn, lag_days: lag }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!task?.id || !onRequestDelete) return
    onRequestDelete(task)
  }

  // ── Drag de la modale (header) ──────────────────────────────────────────────────
  const handleModalDragStart = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
    setIsDraggingModal(true)
    dragStartRef.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      modalX: position.x, modalY: position.y,
    }
  }

  useEffect(() => {
    if (!isDraggingModal) return

    const handleMove = (e) => {
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - MODAL_WIDTH, dragStartRef.current.modalX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - MODAL_MINIMIZED_HEIGHT, dragStartRef.current.modalY + dy)),
      })
    }

    const handleUp = () => setIsDraggingModal(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDraggingModal])

  const dependencyOptions = tasks.filter((t) => t.id !== task?.id)

  if (!open) return null

  return (
    <div
      ref={modalRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: MODAL_WIDTH,
        height: minimized ? MODAL_MINIMIZED_HEIGHT : 'auto',
        maxHeight: minimized ? MODAL_MINIMIZED_HEIGHT : '80vh',
        overflow: minimized ? 'hidden' : 'auto',
        background: 'white',
        border: '0.5px solid #E9E2D6',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — déplaçable */}
      <div
        onMouseDown={handleModalDragStart}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: '#F5F2F0',
          borderBottom: minimized ? 'none' : '0.5px solid #E9E2D6',
          cursor: isDraggingModal ? 'grabbing' : 'grab',
          userSelect: 'none', flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 12, fontWeight: 500, color: '#1F1B17',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {mode === 'create' ? 'Nouvelle tâche' : task?.nom ?? 'Modifier la tâche'}
        </span>

        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMinimized((v) => !v)}
            style={{
              width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C9591',
            }}
            title={minimized ? 'Agrandir' : 'Réduire'}
          >
            {minimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            style={{
              width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C9591',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Contenu — masqué si minimisé */}
      {!minimized && (
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 14 }}>
            Les durées sont calculées en jours ouvrés (lun.–ven.).
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* N° + Nom */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>N°</label>
                <input
                  value={form.num_tache ?? ''} onChange={(e) => set('num_tache', e.target.value)}
                  placeholder="01" required style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label style={LABEL}>Nom de la tâche</label>
                <input
                  value={form.nom ?? ''} onChange={(e) => set('nom', e.target.value)}
                  placeholder="Terrassement général" required style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Début + Durée */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LABEL}>Date de début</label>
                <input type="date" value={form.debut ?? ''} onChange={(e) => set('debut', e.target.value)}
                  required style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <div>
                <label style={LABEL}>Durée (j. ouvrés)</label>
                <input type="number" min={1} value={form.duree ?? 1}
                  onChange={(e) => set('duree', Math.max(1, Number(e.target.value)))}
                  required style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Lot */}
            <div>
              <label style={LABEL}>Lot</label>
              <select
                value={form.lot_id != null ? String(form.lot_id) : 'none'}
                onChange={(e) => handleLotChange(e.target.value === 'none' ? null : e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}
                onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              >
                <option value="none">Sans lot</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={String(lot.id)}>
                    {lot.num_lot} – {lot.nom}
                  </option>
                ))}
              </select>
            </div>

            {/* Zone */}
            {colorMode === 'zone' && zones.length > 0 && (
              <div>
                <label style={LABEL}>Zone</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => set('zone_id', null)}
                    style={{
                      padding: '4px 10px', fontSize: 12,
                      border: '0.5px solid rgba(0,0,0,0.15)',
                      borderRadius: 2,
                      background: !form.zone_id ? '#1F1B17' : 'transparent',
                      color: !form.zone_id ? 'white' : '#5E5854',
                      cursor: 'pointer',
                    }}
                  >
                    Aucune
                  </button>
                  {zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => set('zone_id', zone.id)}
                      style={{
                        padding: '4px 10px', fontSize: 12,
                        border: `0.5px solid ${zone.couleur}`,
                        borderRadius: 2,
                        background: form.zone_id === zone.id ? zone.couleur : 'transparent',
                        color: form.zone_id === zone.id ? 'white' : zone.couleur,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {zone.nom}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dépendance */}
            <div>
              <label style={LABEL}>Dépend de (chemin critique)</label>
              <select
                value={form.depends_on != null ? String(form.depends_on) : 'none'}
                onChange={(e) => handleDependencyChange(e.target.value)}
                style={{ ...INPUT, cursor: 'pointer' }}
                onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              >
                <option value="none">Aucune dépendance</option>
                {dependencyOptions.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.num_tache} – {t.nom}
                  </option>
                ))}
              </select>
            </div>

            {/* Lag */}
            {form.depends_on != null && (
              <div>
                <label style={LABEL}>Délai après fin de la tâche précédente (j. ouvrés)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number" min={-30} value={form.lag_days ?? 0}
                    onChange={(e) => set('lag_days', Number(e.target.value))}
                    style={{ ...INPUT, width: 96, fontVariantNumeric: 'tabular-nums' }}
                    onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                  />
                  <span style={{ fontSize: 11, color: '#9C9591' }}>
                    {(form.lag_days ?? 0) === 0 && 'Collée (commence le jour même de la fin)'}
                    {(form.lag_days ?? 0) === 1 && 'Collée (commence le lendemain ouvré)'}
                    {(form.lag_days ?? 0) > 1 && `${(form.lag_days ?? 0) - 1} jour(s) de battement`}
                    {(form.lag_days ?? 0) < 0 && `Chevauchement de ${Math.abs(form.lag_days ?? 0)} jour(s)`}
                  </span>
                </div>
              </div>
            )}

            {/* Avancement */}
            <div>
              <label style={LABEL}>Avancement : {form.avancement ?? 0}%</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range" min={0} max={100} step={5} value={form.avancement ?? 0}
                  onChange={(e) => set('avancement', Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#2A8A4E' }}
                />
                <input
                  type="number" min={0} max={100} value={form.avancement ?? 0}
                  onChange={(e) => set('avancement', Math.max(0, Math.min(100, Number(e.target.value))))}
                  style={{ ...INPUT, width: 64, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                  onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Approvisionnement */}
            <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.appro_actif ? 12 : 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={!!form.appro_actif}
                    onChange={(e) => set('appro_actif', e.target.checked)}
                    style={{ accentColor: '#E8602C', width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9591' }}>
                    Délai d'approvisionnement
                  </span>
                </label>
              </div>
              {form.appro_actif && (
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={LABEL}>Durée (j. ouvrés)</label>
                    <input
                      type="number" min={1} value={form.appro_duree ?? ''}
                      onChange={(e) => set('appro_duree', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                      placeholder="10" style={INPUT}
                      onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                    />
                  </div>
                  <div>
                    <label style={LABEL}>Matériau / fourniture</label>
                    <input
                      value={form.appro_materiau ?? ''}
                      onChange={(e) => set('appro_materiau', e.target.value || null)}
                      placeholder="Charpente bois lamellé-collé" style={INPUT}
                      onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Segments supplémentaires */}
            {mode === 'edit' && task?.id && (
              <div style={{ marginTop: 6, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, color: '#9C9591',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    Segments supplémentaires
                    {segmentsDeTache.length > 0 && ` (${segmentsDeTache.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSegment}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                      fontSize: 11, borderRadius: 2,
                      border: '0.5px solid #E8602C',
                      background: 'transparent', color: '#E8602C', cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} />
                    Ajouter un segment
                  </button>
                </div>

                {segmentsDeTache.length === 0 && (
                  <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', padding: '8px 0' }}>
                    Ajoutez des segments pour représenter cette tâche à d'autres périodes ou zones
                    (ex : dallage Zone 1 puis Zone 2).
                  </p>
                )}

                {segmentsDeTache.map((seg, idx) => (
                  <div key={seg.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr auto 28px', gap: 8,
                    alignItems: 'center', padding: '8px 0',
                    borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                  }}>
                    {/* Date début */}
                    <div>
                      {idx === 0 && (
                        <label style={{ fontSize: 10, color: '#9C9591', display: 'block', marginBottom: 3 }}>
                          DÉBUT
                        </label>
                      )}
                      <input
                        type="date"
                        value={seg.date_debut}
                        onChange={(e) => updateSegment(seg.id, { date_debut: e.target.value })}
                        style={{
                          width: '100%', padding: '6px 8px', fontSize: 12,
                          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2,
                        }}
                      />
                    </div>

                    {/* Nom (optionnel — sinon nom de la tâche parente) */}
                    <div>
                      {idx === 0 && (
                        <label style={{ fontSize: 10, color: '#9C9591', display: 'block', marginBottom: 3 }}>
                          NOM (optionnel)
                        </label>
                      )}
                      <input
                        type="text"
                        value={seg.nom ?? ''}
                        onChange={(e) => updateSegment(seg.id, { nom: e.target.value || null })}
                        placeholder={task.nom}
                        style={{
                          width: '100%', padding: '6px 8px', fontSize: 12,
                          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2, color: '#1F1B17',
                        }}
                      />
                    </div>

                    {/* Durée */}
                    <div>
                      {idx === 0 && (
                        <label style={{ fontSize: 10, color: '#9C9591', display: 'block', marginBottom: 3 }}>
                          DURÉE (j)
                        </label>
                      )}
                      <input
                        type="number"
                        min={1}
                        value={seg.duree_jours}
                        onChange={(e) => updateSegment(seg.id, { duree_jours: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        style={{
                          width: '100%', padding: '6px 8px', fontSize: 12,
                          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2,
                        }}
                      />
                    </div>

                    {/* Zone */}
                    <div>
                      {idx === 0 && (
                        <label style={{ fontSize: 10, color: '#9C9591', display: 'block', marginBottom: 3 }}>
                          ZONE
                        </label>
                      )}
                      <select
                        value={seg.zone_id ?? ''}
                        onChange={(e) => updateSegment(seg.id, { zone_id: e.target.value || null })}
                        style={{
                          width: '100%', padding: '6px 8px', fontSize: 12,
                          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2,
                        }}
                      >
                        <option value="">— Même zone</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>{z.nom}</option>
                        ))}
                      </select>
                    </div>

                    {/* Afficher le nom */}
                    <label style={{
                      display: 'flex', alignItems: 'center',
                      gap: 6, fontSize: 11, color: '#5E5854',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      marginTop: idx === 0 ? 16 : 0,
                    }}>
                      <input
                        type="checkbox"
                        checked={seg.afficher_nom ?? false}
                        onChange={(e) => updateSegment(seg.id, { afficher_nom: e.target.checked })}
                        style={{ cursor: 'pointer' }}
                      />
                      Nom
                    </label>

                    {/* Supprimer */}
                    <button
                      type="button"
                      onClick={() => deleteSegment(seg.id)}
                      style={{
                        width: 28, height: 28,
                        border: '0.5px solid rgba(220,38,38,0.3)',
                        background: '#FEF2F2', color: '#DC2626', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginTop: idx === 0 ? 16 : 0,
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
              {mode === 'edit' && onRequestDelete && (
                <button type="button" style={{ ...BTN_DANGER, marginRight: 'auto' }}
                  onClick={handleDelete}>
                  <Trash2 size={13} />
                  Supprimer
                </button>
              )}
              <button type="button" style={BTN} onClick={onClose} disabled={saving}>
                <X size={13} /> Annuler
              </button>
              <button type="submit" style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }} disabled={saving}>
                <Save size={13} />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
