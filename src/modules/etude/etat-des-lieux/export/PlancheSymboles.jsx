import { CALQUES_DE_POINT } from '../calquesEdl'
import { SYMBOLES, libelleTailleSymbole } from './symbolesEdl'
import { SymboleEdl } from './SymboleEdl'

// ─── Planche des symboles ────────────────────────────────────────────────────
//
// Tous les symboles de l'export, rangés par calque avec leur nom et leur
// taille : le jeu est relu par l'agence avant de partir dans les DXF
// (conception § 3). Chaque symbole est agrandi à la même case pour se lire ;
// la taille écrite dessous dit ce qu'il mesure sur le plan.

const ACCENT = 'var(--affaire-accent, #E8602C)'
const ENCRE = '#1F1B17'
const GRIS = '#5E5854'

export function PlancheSymboles() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, color: ENCRE }}>
      <p style={{ margin: 0, fontSize: 13, color: GRIS, lineHeight: 1.5 }}>
        Symboles dessinés dans l’export de l’état des lieux. Les appareils de plomberie et de chauffage sont à leur
        taille réelle, vus de dessus ; les autres symboles ont une taille fixe, lisible au 1/100 et au 1/50.
      </p>
      {CALQUES_DE_POINT.map((calque) => (
        <section key={calque.code} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0, paddingBottom: 4, fontSize: 13, fontWeight: 600, color: ACCENT, borderBottom: `0.5px solid ${ACCENT}` }}>
            {calque.nom}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {calque.types.map((type) => (
              <figure
                key={type.code}
                style={{
                  margin: 0, padding: '12px 8px 10px', borderRadius: 2, background: 'white',
                  border: '0.5px solid rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                <div style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {SYMBOLES[type.code] ? <SymboleEdl code={type.code} taille={80} couleur={ENCRE} titre={type.libelle} /> : null}
                </div>
                <figcaption style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{type.libelle}</span>
                  <span style={{ fontSize: 11, color: GRIS }}>{libelleTailleSymbole(type.code) || 'Sans symbole'}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default PlancheSymboles
