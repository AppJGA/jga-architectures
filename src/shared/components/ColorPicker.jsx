import { useState, useEffect } from 'react'
import { COULEURS_PRESET, estHexValide } from './couleursPreset'

// Sélecteur complet : pastilles preset, saisie hex libre avec prévisualisation,
// et pipette native. La saisie garde un brouillon local et n'est appliquée que
// lorsqu'elle forme un hex complet — sans quoi le texte « sauterait » à chaque
// caractère tapé, la valeur remontée étant aussitôt réinjectée.
export function ColorPickerField({
  value,
  onChange,
  columns = 5,
  swatchSize = 24,
  ronde = true,
}) {
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const apercu = estHexValide(draft) ? draft : value

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, ${swatchSize}px)`,
        gap: 6, marginBottom: 10,
      }}>
        {COULEURS_PRESET.map((couleur) => (
          <div
            key={couleur}
            onClick={() => onChange(couleur)}
            title={couleur}
            style={{
              width: swatchSize, height: swatchSize, background: couleur, cursor: 'pointer',
              borderRadius: ronde ? '50%' : 0,
              border: (value ?? '').toLowerCase() === couleur.toLowerCase()
                ? '2px solid #1F1B17' : '2px solid transparent',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Prévisualisation de la saisie en cours */}
        <div style={{
          width: 28, height: 28, background: apercu,
          border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0,
        }} />

        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (estHexValide(e.target.value)) onChange(e.target.value)
          }}
          placeholder="#E8602C"
          maxLength={7}
          style={{
            width: 90, padding: '4px 8px', fontSize: 12, borderRadius: 2,
            border: '0.5px solid rgba(0,0,0,0.12)', fontVariantNumeric: 'tabular-nums',
          }}
        />

        <input
          type="color"
          value={estHexValide(apercu) ? apercu : '#9C9591'}
          onChange={(e) => onChange(e.target.value)}
          title="Choisir une couleur"
          style={{ width: 32, height: 28, border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
        />
      </div>
    </>
  )
}
