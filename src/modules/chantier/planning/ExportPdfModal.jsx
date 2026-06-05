import { useState, useMemo, useEffect } from 'react'
import { FileDown, X } from 'lucide-react'
import { parseDate, formatDateISO, addWorkingDays } from './types'
import { generatePlanningChantierPdf } from './generatePlanningChantierPdf'

const LABEL = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', display: 'block', marginBottom: 5,
}
const INPUT = {
  height: 34, padding: '0 10px', borderRadius: 6, fontSize: 12,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17', width: '100%',
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = {
  ...BTN, backgroundColor: '#2A8A4E', color: 'white', border: 'none', fontWeight: 500,
}

const PAGE_FORMATS = [
  { label: 'A4 Portrait',  w: 210, h: 297 },
  { label: 'A4 Paysage',   w: 297, h: 210 },
  { label: 'A3 Portrait',  w: 297, h: 420 },
  { label: 'A3 Paysage',   w: 420, h: 297 },
  { label: 'A2 Paysage',   w: 594, h: 420 },
  { label: 'A1 Paysage',   w: 841, h: 594 },
]

function computeRange(tasks) {
  if (!tasks.length) {
    const d = new Date()
    const end = new Date(d)
    end.setMonth(end.getMonth() + 3)
    return { debut: formatDateISO(addWorkingDays(d, -5)), fin: formatDateISO(addWorkingDays(end, 5)) }
  }
  let minDate = parseDate(tasks[0].debut)
  let maxEnd = addWorkingDays(parseDate(tasks[0].debut), tasks[0].duree)
  for (const t of tasks) {
    const d = parseDate(t.debut)
    if (d < minDate) minDate = d
    const end = addWorkingDays(d, t.duree)
    if (end > maxEnd) maxEnd = end
    if (t.appro_actif && t.appro_duree) {
      const approStart = addWorkingDays(d, -t.appro_duree)
      if (approStart < minDate) minDate = approStart
    }
  }
  return {
    debut: formatDateISO(addWorkingDays(minDate, -5)),
    fin:   formatDateISO(addWorkingDays(maxEnd, 5)),
  }
}

export function ExportPdfModal({ open, onClose, lots = [], tasks = [], jalons = [], affaire = {} }) {
  const computed = useMemo(() => computeRange(tasks), [tasks])

  const [dateDebut,   setDateDebut]   = useState(computed.debut)
  const [dateFin,     setDateFin]     = useState(computed.fin)
  const [formatTab,   setFormatTab]   = useState('standard')
  const [fmtIdx,      setFmtIdx]      = useState(3)   // A3 Paysage par défaut
  const [customW,     setCustomW]     = useState(420)
  const [customH,     setCustomH]     = useState(297)
  const [isLandscape, setIsLandscape] = useState(true)

  useEffect(() => {
    if (!open) return
    setDateDebut(computed.debut)
    setDateFin(computed.fin)
  }, [open, computed])

  const { totalDays, totalWeeks } = useMemo(() => {
    if (!dateDebut || !dateFin) return { totalDays: 0, totalWeeks: 0 }
    const d1 = parseDate(dateDebut)
    const d2 = parseDate(dateFin)
    const days = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)) + 1)
    return { totalDays: days, totalWeeks: Math.round(days / 7) }
  }, [dateDebut, dateFin])

  const tachesInPeriod = useMemo(() => {
    if (!dateDebut || !dateFin) return []
    const start = parseDate(dateDebut).getTime()
    const end = parseDate(dateFin).getTime()
    return tasks.filter(t => {
      const tStart = parseDate(t.debut).getTime()
      const tEnd = addWorkingDays(parseDate(t.debut), t.duree).getTime()
      return tStart <= end && tEnd >= start
    })
  }, [tasks, dateDebut, dateFin])

  const finalFormat = formatTab === 'standard'
    ? PAGE_FORMATS[fmtIdx]
    : { w: Math.max(100, Math.min(2000, customW)), h: Math.max(100, Math.min(2000, customH)) }

  const isValid = !!dateDebut && !!dateFin && totalDays > 0

  const handleOrientationToggle = () => {
    setIsLandscape(v => !v)
    setCustomW(customH)
    setCustomH(customW)
  }

  const handleGenerate = () => {
    if (!isValid) return
    generatePlanningChantierPdf({
      tasks: tachesInPeriod,
      lots,
      jalons,
      affaire,
      dateDebut,
      dateFin,
      largeurMm: finalFormat.w,
      hauteurMm: finalFormat.h,
    })
    onClose()
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileDown size={16} style={{ color: '#E8602C' }} />
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>Export PDF du planning</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── A) PÉRIODE ── */}
          <div>
            <label style={LABEL}>Période d'export</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
              <div>
                <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>Du jour</span>
                <input
                  type="date" value={dateDebut}
                  onChange={e => setDateDebut(e.target.value)}
                  style={INPUT}
                />
              </div>
              <span style={{ fontSize: 13, color: '#9C9591', paddingBottom: 6 }}>→</span>
              <div>
                <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>au jour</span>
                <input
                  type="date" value={dateFin}
                  onChange={e => setDateFin(e.target.value)}
                  style={INPUT}
                />
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#9C9591', marginTop: 6 }}>
              {totalDays > 0
                ? `${totalDays} jour${totalDays > 1 ? 's' : ''} · ${totalWeeks} semaine${totalWeeks > 1 ? 's' : ''}`
                : 'Période invalide'}
            </p>
          </div>

          {/* ── B) FORMAT DE PAGE ── */}
          <div>
            <label style={LABEL}>Format de page</label>
            <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, overflow: 'hidden' }}>
              {['standard', 'custom'].map(tab => (
                <button key={tab} type="button"
                  onClick={() => setFormatTab(tab)}
                  style={{
                    flex: 1, padding: '7px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
                    backgroundColor: formatTab === tab ? '#FAF7F2' : 'white',
                    color: formatTab === tab ? '#1F1B17' : '#5E5854',
                    fontWeight: formatTab === tab ? 500 : 400,
                  }}
                >
                  {tab === 'standard' ? 'Format standard' : 'Dimensions personnalisées'}
                </button>
              ))}
            </div>

            {formatTab === 'standard' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {PAGE_FORMATS.map((f, i) => (
                  <button key={i} type="button"
                    onClick={() => setFmtIdx(i)}
                    style={{
                      padding: '8px 6px', borderRadius: 6, cursor: 'pointer', textAlign: 'center',
                      border: fmtIdx === i ? '1.5px solid #E8602C' : '0.5px solid rgba(0,0,0,0.12)',
                      backgroundColor: fmtIdx === i ? 'rgba(232,96,44,0.10)' : '#FAFAF9',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: fmtIdx === i ? 600 : 400, color: fmtIdx === i ? '#E8602C' : '#1F1B17' }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: '#9C9591', marginTop: 2 }}>{f.w} × {f.h} mm</div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>Largeur (mm)</span>
                    <input type="number" min={100} max={2000} value={customW}
                      onChange={e => setCustomW(Number(e.target.value))}
                      style={INPUT}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>Hauteur (mm)</span>
                    <input type="number" min={100} max={2000} value={customH}
                      onChange={e => setCustomH(Number(e.target.value))}
                      style={INPUT}
                    />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={isLandscape}
                    onChange={handleOrientationToggle}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#E8602C' }}
                  />
                  Orientation paysage
                </label>
              </div>
            )}
            <p style={{ fontSize: 11, color: '#9C9591', marginTop: 8 }}>
              Page : {finalFormat.w} mm × {finalFormat.h} mm
            </p>
          </div>

          {/* ── C) RÉSUMÉ ── */}
          <div style={{ borderRadius: 8, backgroundColor: '#FAF7F2', border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: '#1F1B17', fontWeight: 500, marginBottom: 4 }}>Récapitulatif</p>
            <p style={{ fontSize: 11, color: '#5E5854', lineHeight: 1.7 }}>
              {tachesInPeriod.length} tâche{tachesInPeriod.length > 1 ? 's' : ''} sur la période sélectionnée<br />
              Lots inclus : {lots.length > 0 ? lots.map(l => l.nom).join(', ') : '—'}<br />
              Format : {finalFormat.w} mm × {finalFormat.h} mm<br />
              <span style={{ color: '#9C9591', fontSize: 10 }}>Le tableau sera mis à l'échelle pour tenir sur une page.</span>
            </p>
          </div>

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <button style={BTN} onClick={onClose}><X size={13} /> Annuler</button>
          <button
            style={{ ...BTN_PRIMARY, opacity: isValid ? 1 : 0.5 }}
            onClick={handleGenerate}
            disabled={!isValid}
          >
            <FileDown size={13} /> Générer le PDF
          </button>
        </div>
      </div>
    </div>
  )
}
