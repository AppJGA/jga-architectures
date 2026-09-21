import { EditeurTexte } from './EditeurTexte'

const LABEL = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', display: 'block', marginBottom: 5,
}

// Section « Textes du PDF » des modales d'export de planning.
// `initiaux` : textes lus à l'ouverture ; `onChange({ entete, pied })`.
export function SectionTextesPdf({ initiaux, textes, onChange }) {
  return (
    <div>
      <label style={LABEL}>Textes du PDF</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>En-tête, entre le logo et le titre</span>
          <EditeurTexte
            valeurInitiale={initiaux.entete}
            onChange={(entete) => onChange({ ...textes, entete })}
            placeholder="Ex. : Planning contractuel — version du 12 septembre"
          />
        </div>
        <div>
          <span style={{ fontSize: 11, color: '#9C9591', display: 'block', marginBottom: 4 }}>Sous le planning</span>
          <EditeurTexte
            valeurInitiale={initiaux.pied}
            onChange={(pied) => onChange({ ...textes, pied })}
            placeholder="Ex. : Dates données sous réserve des intempéries"
          />
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#9C9591', marginTop: 6, fontStyle: 'italic' }}>
        Mémorisés pour cette affaire.
      </p>
    </div>
  )
}
