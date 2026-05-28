import { useState, useMemo, useEffect } from 'react'
import { FileDown, Printer, X } from 'lucide-react'
import { addWeeks, weeksBetween, getCurrentWeek } from './types'

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

function computeRange(taches) {
  if (taches.length === 0) {
    const cw = getCurrentWeek()
    const end = addWeeks(cw.semaine, cw.annee, 12)
    return {
      semDebut: cw.semaine, anneeDebut: cw.annee,
      semFin: end.semaine, anneeFin: end.annee,
    }
  }
  let minSem = taches[0].semaine_debut, minAnn = taches[0].annee_debut
  let maxSem = taches[0].semaine_debut, maxAnn = taches[0].annee_debut
  for (const t of taches) {
    if (weeksBetween(t.semaine_debut, t.annee_debut, minSem, minAnn) > 0) {
      minSem = t.semaine_debut; minAnn = t.annee_debut
    }
    const end = addWeeks(t.semaine_debut, t.annee_debut, t.duree_semaines)
    if (weeksBetween(maxSem, maxAnn, end.semaine, end.annee) > 0) {
      maxSem = end.semaine; maxAnn = end.annee
    }
  }
  return { semDebut: minSem, anneeDebut: minAnn, semFin: maxSem, anneeFin: maxAnn }
}

export function ExportEtudeModal({ open, onClose, onPrint, taches, jalons, affaireNumero, affaireTitre }) {
  const computed = useMemo(() => computeRange(taches), [taches])

  const [semDebut, setSemDebut] = useState(computed.semDebut)
  const [anneeDebut, setAnneeDebut] = useState(computed.anneeDebut)
  const [semFin, setSemFin] = useState(computed.semFin)
  const [anneeFin, setAnneeFin] = useState(computed.anneeFin)

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
      const startOk = weeksBetween(t.semaine_debut, t.annee_debut, semFin, anneeFin) >= 0
      const endOk = weeksBetween(semDebut, anneeDebut, end.semaine, end.annee) >= 0
      return startOk && endOk
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

  const isValid = semDebut >= 1 && semDebut <= 53 && semFin >= 1 && semFin <= 53 && periodSemaines > 0

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 480,
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileDown size={16} style={{ color: '#E05A1E' }} />
              <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>Export PDF du planning</h2>
            </div>
            <p style={{ fontSize: 11, color: '#9B8F85', marginTop: 3 }}>
              Format A3 paysage · semaines ISO
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B8F85' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Période début */}
          <div>
            <label style={LABEL}>Période — début</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...LABEL, textTransform: 'none', fontSize: 11, fontWeight: 400 }}>Semaine</label>
                <input
                  type="number" min={1} max={53} value={semDebut}
                  onChange={e => setSemDebut(Number(e.target.value))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={{ ...LABEL, textTransform: 'none', fontSize: 11, fontWeight: 400 }}>Année</label>
                <input
                  type="number" min={2020} max={2040} value={anneeDebut}
                  onChange={e => setAnneeDebut(Number(e.target.value))}
                  style={INPUT}
                />
              </div>
            </div>
          </div>

          {/* Période fin */}
          <div>
            <label style={LABEL}>Période — fin</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...LABEL, textTransform: 'none', fontSize: 11, fontWeight: 400 }}>Semaine</label>
                <input
                  type="number" min={1} max={53} value={semFin}
                  onChange={e => setSemFin(Number(e.target.value))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={{ ...LABEL, textTransform: 'none', fontSize: 11, fontWeight: 400 }}>Année</label>
                <input
                  type="number" min={2020} max={2040} value={anneeFin}
                  onChange={e => setAnneeFin(Number(e.target.value))}
                  style={INPUT}
                />
              </div>
            </div>
          </div>

          {/* Résumé */}
          <div style={{
            borderRadius: 8, backgroundColor: '#F5F2F0', border: '0.5px solid rgba(0,0,0,0.08)',
            padding: '12px 16px', fontSize: 12, color: '#6b7280',
          }}>
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{tachesInPeriod.length}</span> tâche
            {tachesInPeriod.length !== 1 ? 's' : ''}{' '}·{' '}
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{jalonInPeriod.length}</span> jalon
            {jalonInPeriod.length !== 1 ? 's' : ''}{' '}·{' '}
            <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{periodSemaines}</span> semaine
            {periodSemaines !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <button style={BTN} onClick={onClose}>
            <X size={13} /> Annuler
          </button>
          <button
            style={{ ...BTN_PRIMARY, opacity: isValid ? 1 : 0.5 }}
            onClick={() => isValid && onPrint({ semDebut, anneeDebut, semFin, anneeFin })}
            disabled={!isValid}
          >
            <Printer size={13} /> Imprimer / Exporter PDF
          </button>
        </div>
      </div>
    </div>
  )
}
