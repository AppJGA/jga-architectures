// Choix commun aux deux fenêtres d'export PDF des plannings : tout sur une
// feuille (réduit à l'échelle), ou à la suite sur plusieurs feuilles.

const OPTIONS = [
  { valeur: true, label: 'Une seule feuille' },
  { valeur: false, label: 'Plusieurs feuilles' },
]

export function ChoixFeuilles({ uneFeuille, onChange }) {
  return (
    <div>
      <label style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: '#9C9591', display: 'block', marginBottom: 5,
      }}>
        Mise en page
      </label>
      <div style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)', overflow: 'hidden' }}>
        {OPTIONS.map((opt, idx) => {
          const actif = uneFeuille === opt.valeur
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onChange(opt.valeur)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 12, border: 'none',
                borderRight: idx < OPTIONS.length - 1 ? '0.5px solid rgba(0,0,0,0.15)' : 'none',
                background: actif ? '#E8602C' : 'transparent',
                color: actif ? 'white' : '#5E5854',
                cursor: 'pointer', fontWeight: actif ? 500 : 400,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: '#9C9591', marginTop: 6, fontStyle: 'italic' }}>
        {uneFeuille
          ? 'Tout le planning est réduit à l’échelle pour tenir sur la feuille choisie, quel que soit son nombre de lignes.'
          : 'Les lignes continuent de feuille en feuille ; l’en-tête du tableau est répété en haut de chacune.'}
      </p>
    </div>
  )
}
