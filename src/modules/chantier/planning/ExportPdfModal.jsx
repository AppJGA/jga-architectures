import { useState, useMemo, useEffect } from 'react'
import { FileDown, Printer, X, Check } from 'lucide-react'
import { parseDate, formatDateISO, addWorkingDays } from './types'

const LABEL = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9B8F85', display: 'block', marginBottom: 6,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1a1a1a',
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#639922', color: 'white', border: 'none', fontWeight: 500,
}

export function ExportPdfModal({ open, onClose, onPrint, lots, tasks, affaireNumero, affaireTitre }) {
  const [selectedLotIds, setSelectedLotIds] = useState(() => new Set(lots.map((l) => l.id)))
  const [orientation, setOrientation] = useState('paysage')

  const computedStart = useMemo(() => {
    const dates = tasks.map((t) => parseDate(t.debut).getTime())
    if (dates.length === 0) return formatDateISO(new Date())
    return formatDateISO(new Date(Math.min(...dates)))
  }, [tasks])

  const computedEnd = useMemo(() => {
    const ends = tasks.map((t) => {
      const d = parseDate(t.debut)
      return addWorkingDays(d, t.duree).getTime()
    })
    if (ends.length === 0) {
      const d = new Date(); d.setMonth(d.getMonth() + 3); return formatDateISO(d)
    }
    return formatDateISO(new Date(Math.max(...ends)))
  }, [tasks])

  const [dateDebut, setDateDebut] = useState(computedStart)
  const [dateFin, setDateFin] = useState(computedEnd)

  useEffect(() => {
    if (!open) return
    setDateDebut(computedStart)
    setDateFin(computedEnd)
    setSelectedLotIds(new Set(lots.map((l) => l.id)))
  }, [open, computedStart, computedEnd, lots])

  const toggleLot = (id) => {
    setSelectedLotIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedLotIds(
      selectedLotIds.size === lots.length
        ? new Set()
        : new Set(lots.map((l) => l.id))
    )
  }

  const filteredTaskCount = useMemo(() => {
    const start = parseDate(dateDebut).getTime()
    const end = parseDate(dateFin).getTime()
    return tasks.filter((t) => {
      if (!selectedLotIds.has(t.lot_id)) return false
      const tStart = parseDate(t.debut).getTime()
      const tEnd = addWorkingDays(parseDate(t.debut), t.duree).getTime()
      return tStart <= end && tEnd >= start
    }).length
  }, [tasks, selectedLotIds, dateDebut, dateFin])

  const handlePrint = () => {
    onPrint({ selectedLotIds: Array.from(selectedLotIds), dateDebut, dateFin, orientation })
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 540,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileDown size={16} style={{ color: '#E05A1E' }} />
              <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>Export PDF du planning</h2>
            </div>
            <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 3 }}>
              Définissez les lots et la période à inclure dans l'export.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B8F85' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 16 }}>

          {/* Lots */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={LABEL}>Lots à inclure</label>
              <button type="button" onClick={toggleAll}
                style={{ fontSize: 11, color: '#E05A1E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                {selectedLotIds.size === lots.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 192, overflowY: 'auto' }}>
              {lots.map((lot) => {
                const isSelected = selectedLotIds.has(lot.id)
                const lotTaskCount = tasks.filter((t) => t.lot_id === lot.id).length
                return (
                  <button
                    key={lot.id} type="button" onClick={() => toggleLot(lot.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      padding: '8px 12px', borderRadius: 8, transition: 'all 0.1s', cursor: 'pointer',
                      border: `0.5px solid ${isSelected ? 'rgba(224,90,30,0.3)' : 'rgba(0,0,0,0.08)'}`,
                      backgroundColor: isSelected ? 'rgba(224,90,30,0.04)' : 'rgba(155,143,133,0.08)',
                      opacity: isSelected ? 1 : 0.55,
                    }}
                  >
                    <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, backgroundColor: lot.couleur }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a' }}>
                        {lot.num_lot} – {lot.nom}
                      </span>
                      <span style={{ fontSize: 11, color: '#9B8F85', marginLeft: 8 }}>
                        ({lotTaskCount} tâche{lotTaskCount > 1 ? 's' : ''})
                      </span>
                    </div>
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSelected ? '#639922' : 'transparent',
                      border: `2px solid ${isSelected ? '#639922' : 'rgba(0,0,0,0.2)'}`,
                    }}>
                      {isSelected && <Check size={10} style={{ color: 'white' }} strokeWidth={3} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Période */}
          <div>
            <label style={LABEL}>Période</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...LABEL, textTransform: 'none', fontSize: 11, fontWeight: 400, color: '#9B8F85' }}>Du</label>
                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#E05A1E' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)' }} />
              </div>
              <div>
                <label style={{ ...LABEL, textTransform: 'none', fontSize: 11, fontWeight: 400, color: '#9B8F85' }}>Au</label>
                <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={INPUT}
                  onFocus={e => { e.target.style.borderColor = '#E05A1E' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)' }} />
              </div>
            </div>
          </div>

          {/* Orientation */}
          <div>
            <label style={LABEL}>Orientation</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['paysage', 'portrait'].map((o) => (
                <button
                  key={o} type="button" onClick={() => setOrientation(o)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: `1.5px solid ${orientation === o ? '#E05A1E' : 'rgba(0,0,0,0.12)'}`,
                    backgroundColor: orientation === o ? 'rgba(224,90,30,0.05)' : 'white',
                    color: orientation === o ? '#E05A1E' : '#6b7280',
                  }}
                >
                  <div style={{
                    border: `2px solid currentColor`, borderRadius: 2, flexShrink: 0,
                    width: o === 'paysage' ? 24 : 16, height: o === 'paysage' ? 16 : 24,
                  }} />
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Résumé */}
          <div style={{
            borderRadius: 8, backgroundColor: '#F5F2F0', border: '0.5px solid rgba(0,0,0,0.08)',
            padding: '12px 16px', fontSize: 12, color: '#6b7280',
          }}>
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{filteredTaskCount}</span> tâche
            {filteredTaskCount > 1 ? 's' : ''} sur{' '}
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{selectedLotIds.size}</span>{' '}
            lot{selectedLotIds.size > 1 ? 's' : ''} · période sélectionnée
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <button style={BTN} onClick={onClose}>
            <X size={13} /> Annuler
          </button>
          <button
            style={{ ...BTN_PRIMARY, opacity: selectedLotIds.size === 0 || !dateDebut || !dateFin ? 0.5 : 1 }}
            onClick={handlePrint}
            disabled={selectedLotIds.size === 0 || !dateDebut || !dateFin}
          >
            <Printer size={13} /> Imprimer / Exporter PDF
          </button>
        </div>
      </div>
    </div>
  )
}
