import { useState, useMemo, useEffect } from 'react'
import { FileDown, X } from 'lucide-react'
import { addWeeks, weeksBetween, getCurrentWeek } from './types'
import { generatePlanningEtudePdf } from './generatePlanningEtudePdf'

const LABEL = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', display: 'block', marginBottom: 5,
}
const INPUT = {
  height: 34, padding: '0 10px', borderRadius: 3, fontSize: 12,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17', width: '100%',
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
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

function computeRange(taches) {
  if (!taches.length) {
    const cw = getCurrentWeek()
    const end = addWeeks(cw.semaine, cw.annee, 12)
    return { semDebut: cw.semaine, anneeDebut: cw.annee, semFin: end.semaine, anneeFin: end.annee }
  }
  let minS = taches[0].semaine_debut, minA = taches[0].annee_debut
  let maxEnd = addWeeks(taches[0].semaine_debut, taches[0].annee_debut, taches[0].duree_semaines)
  for (const t of taches) {
    if (weeksBetween(t.semaine_debut, t.annee_debut, minS, minA) > 0) { minS = t.semaine_debut; minA = t.annee_debut }
    const end = addWeeks(t.semaine_debut, t.annee_debut, t.duree_semaines)
    if (weeksBetween(maxEnd.semaine, maxEnd.annee, end.semaine, end.annee) > 0) maxEnd = end
  }
  const start = addWeeks(minS, minA, -1)
  const fin   = addWeeks(maxEnd.semaine, maxEnd.annee, 1)
  return { semDebut: start.semaine, anneeDebut: start.annee, semFin: fin.semaine, anneeFin: fin.annee }
}

export function ExportEtudeModal({ open, onClose, taches = [], jalons = [], affaire = {} }) {
  const computed = useMemo(() => computeRange(taches), [taches])

  const [semDebut,     setSemDebut]     = useState(computed.semDebut)
  const [anneeDebut,   setAnneeDebut]   = useState(computed.anneeDebut)
  const [semFin,       setSemFin]       = useState(computed.semFin)
  const [anneeFin,     setAnneeFin]     = useState(computed.anneeFin)
  const [formatTab,    setFormatTab]    = useState('standard')
  const [fmtIdx,       setFmtIdx]       = useState(3)   // A3 Paysage par défaut
  const [customW,      setCustomW]      = useState(420)
  const [customH,      setCustomH]      = useState(297)
  const [isLandscape,  setIsLandscape]  = useState(true)

  useEffect(() => {
    if (!open) return
    setSemDebut(computed.semDebut)
    setAnneeDebut(computed.anneeDebut)
    setSemFin(computed.semFin)
    setAnneeFin(computed.anneeFin)
  }, [open, computed])

  const periodSemaines = useMemo(() =>
    Math.max(0, weeksBetween(semDebut, anneeDebut, semFin, anneeFin)),
    [semDebut, anneeDebut, semFin, anneeFin]
  )

  const tachesInPeriod = useMemo(() =>
    taches.filter(t => {
      const end = addWeeks(t.semaine_debut, t.annee_debut, t.duree_semaines)
      return weeksBetween(t.semaine_debut, t.annee_debut, semFin, anneeFin) >= 0 &&
             weeksBetween(semDebut, anneeDebut, end.semaine, end.annee) >= 0
    }),
    [taches, semDebut, anneeDebut, semFin, anneeFin]
  )

  const jalonInPeriod = useMemo(() =>
    jalons.filter(j =>
      weeksBetween(j.semaine, j.annee, semFin, anneeFin) >= 0 &&
      weeksBetween(semDebut, anneeDebut, j.semaine, j.annee) >= 0
    ),
    [jalons, semDebut, anneeDebut, semFin, anneeFin]
  )

  const finalFormat = formatTab === 'standard'
    ? PAGE_FORMATS[fmtIdx]
    : { w: Math.max(100, Math.min(2000, customW)), h: Math.max(100, Math.min(2000, customH)) }

  const isValid = semDebut >= 1 && semDebut <= 53 && semFin >= 1 && semFin <= 53 && periodSemaines > 0

  const handleOrientationToggle = () => {
    setIsLandscape(v => !v)
    setCustomW(customH)
    setCustomH(customW)
  }

  const handleGenerate = () => {
    if (!isValid) return
    generatePlanningEtudePdf({
      phases: tachesInPeriod,
      jalons: jalonInPeriod,
      affaire,
      semaineDebut: semDebut,
      anneeDebut,
      semaineFin: semFin,
      anneeFin,
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
        style={{ backgroundColor: 'white', borderRadius: 0, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
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
                <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>De la semaine</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min={1} max={53} value={semDebut}
                    onChange={e => setSemDebut(Number(e.target.value))}
                    style={{ ...INPUT, width: 60 }}
                  />
                  <input type="number" min={2020} max={2040} value={anneeDebut}
                    onChange={e => setAnneeDebut(Number(e.target.value))}
                    style={{ ...INPUT, width: 80 }}
                  />
                </div>
              </div>
              <span style={{ fontSize: 13, color: '#9C9591', paddingBottom: 6 }}>→</span>
              <div>
                <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>à la semaine</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min={1} max={53} value={semFin}
                    onChange={e => setSemFin(Number(e.target.value))}
                    style={{ ...INPUT, width: 60 }}
                  />
                  <input type="number" min={2020} max={2040} value={anneeFin}
                    onChange={e => setAnneeFin(Number(e.target.value))}
                    style={{ ...INPUT, width: 80 }}
                  />
                </div>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#9C9591', marginTop: 6 }}>
              {periodSemaines > 0 ? `${periodSemaines} semaine${periodSemaines > 1 ? 's' : ''} sélectionnée${periodSemaines > 1 ? 's' : ''}` : 'Période invalide'}
            </p>
          </div>

          {/* ── B) FORMAT DE PAGE ── */}
          <div>
            <label style={LABEL}>Format de page</label>
            <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2, overflow: 'hidden' }}>
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
                      padding: '8px 6px', borderRadius: 3, cursor: 'pointer', textAlign: 'center',
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
          <div style={{ borderRadius: 2, backgroundColor: '#FAF7F2', border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: '#1F1B17', fontWeight: 500, marginBottom: 4 }}>Récapitulatif</p>
            <p style={{ fontSize: 11, color: '#5E5854', lineHeight: 1.7 }}>
              {tachesInPeriod.length} phase{tachesInPeriod.length > 1 ? 's' : ''} sur la période sélectionnée<br />
              Période : S{semDebut} {anneeDebut} → S{semFin} {anneeFin}<br />
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
