import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ─── Sélecteur de date avec numéros de semaine ISO ────────────────────────────
//
// `<input type="date">` natif n'affiche pas les numéros de semaine et ne permet
// pas de les ajouter (rendu interne du navigateur, hors de portée du CSS). Ce
// composant reproduit un calendrier minimal avec une colonne « S » à gauche.
//
// Le calendrier est rendu dans un portail : les modales du planning ont un
// contenu scrollable (overflow:auto), qui rognerait un dropdown positionné en
// absolu à l'intérieur.

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const PANEL_WIDTH = 260

// Parsing/formatage locaux — `new Date('YYYY-MM-DD')` est interprété en UTC et
// `toISOString()` reconvertit en UTC : les deux décalent la date d'un jour selon
// le fuseau. Tout passe donc par ces deux fonctions.
function parseLocal(value) {
  if (!value) return null
  if (value instanceof Date) return new Date(value)
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
  )
}

// Semaines (lundi → dimanche) couvrant le mois affiché
function buildCalendar(viewDate) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const cur = new Date(year, month, 1)
  const dow = cur.getDay()
  cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1))

  const weeks = []
  for (let w = 0; w < 6; w++) {
    const week = { num: getISOWeek(cur), days: [] }
    for (let d = 0; d < 7; d++) {
      week.days.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
    // Le mois est entièrement couvert dès que la semaine suivante déborde
    if (cur.getMonth() !== month && w >= 3) break
  }
  return weeks
}

export function DatePickerISO({
  value, onChange, min, placeholder = 'JJ/MM/AAAA', style, required = false, disabled = false,
}) {
  const [panelPos, setPanelPos] = useState(null)
  const [viewDate, setViewDate] = useState(() => parseLocal(value) ?? new Date())
  const inputRef = useRef(null)

  // Se replacer sur le mois de la valeur quand elle change depuis l'extérieur
  useEffect(() => {
    const d = parseLocal(value)
    if (d) setViewDate(d)
  }, [value])

  // Repositionner/fermer le panneau si la page défile ou change de taille
  useEffect(() => {
    if (!panelPos) return
    const close = () => setPanelPos(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [panelPos])

  const openPanel = () => {
    if (disabled) return
    if (panelPos) { setPanelPos(null); return }
    const rect = inputRef.current.getBoundingClientRect()
    // Ouvrir vers le haut si le panneau déborderait en bas de l'écran
    const versLeHaut = rect.bottom + 300 > window.innerHeight && rect.top > 300
    setPanelPos({
      top: versLeHaut ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8),
      versLeHaut,
    })
  }

  const selected = parseLocal(value)
  const minDate = parseLocal(min)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks = buildCalendar(viewDate)

  const decalerMois = (delta) =>
    setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1))

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        readOnly
        required={required}
        disabled={disabled}
        value={selected ? selected.toLocaleDateString('fr-FR') : ''}
        placeholder={placeholder}
        onClick={openPanel}
        style={{ cursor: disabled ? 'default' : 'pointer', ...style }}
      />

      {panelPos && createPortal(
        <>
          <div
            onClick={() => setPanelPos(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 300 }}
          />
          <div style={{
            position: 'fixed',
            top: panelPos.versLeHaut ? undefined : panelPos.top,
            bottom: panelPos.versLeHaut ? window.innerHeight - panelPos.top : undefined,
            left: panelPos.left,
            width: PANEL_WIDTH,
            background: 'white',
            border: '0.5px solid #E9E2D6',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            zIndex: 301,
          }}>
            {/* Navigation mois */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderBottom: '0.5px solid #E9E2D6',
            }}>
              <button
                type="button"
                onClick={() => decalerMois(-1)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#5E5854', lineHeight: 1 }}
              >
                ‹
              </button>
              <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'capitalize', color: '#1F1B17' }}>
                {viewDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => decalerMois(1)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#5E5854', lineHeight: 1 }}
              >
                ›
              </button>
            </div>

            <div style={{ padding: 8 }}>
              {/* En-tête : colonne semaine + jours */}
              <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(7, 1fr)', marginBottom: 4 }}>
                <div style={{ fontSize: 9, color: '#9C9591', textAlign: 'center' }}>S</div>
                {JOURS.map((j, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#9C9591', textAlign: 'center', fontWeight: 500 }}>
                    {j}
                  </div>
                ))}
              </div>

              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: '28px repeat(7, 1fr)', marginBottom: 2 }}>
                  <div style={{
                    fontSize: 9, color: '#9C9591', textAlign: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {week.num}
                  </div>

                  {week.days.map((day, di) => {
                    const isSelected = selected && day.toDateString() === selected.toDateString()
                    const isToday = day.toDateString() === today.toDateString()
                    const isCurrentMonth = day.getMonth() === viewDate.getMonth()
                    const isWeekend = di >= 5
                    const isDisabled = minDate && day < minDate

                    return (
                      <div
                        key={di}
                        onClick={() => {
                          if (isDisabled) return
                          onChange(formatLocal(day))
                          setPanelPos(null)
                        }}
                        style={{
                          height: 28,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, borderRadius: 2,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          background: isSelected ? '#E8602C' : isToday ? '#FAF0EB' : 'transparent',
                          color: isSelected
                            ? 'white'
                            : isDisabled || !isCurrentMonth
                              ? '#C9C4C0'
                              : isWeekend ? '#9C9591' : '#1F1B17',
                          fontWeight: isToday || isSelected ? 500 : 400,
                        }}
                      >
                        {day.getDate()}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

export default DatePickerISO
