import { ttcDe } from '../montants'

// ─── Un montant : le HT en avant, le TTC en petit ────────────────────────────
//
// C'est le HT qui prime dans les études de l'agence. `taille` : celle du HT ;
// le TTC suit en plus petit et plus pâle, à côté (`enLigne`) ou dessous.

const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function MontantHT({ ht, tva = 1.2, taille = 14, couleur = '#1F1B17', enLigne = false, poids = 500 }) {
  if (ht == null || ht === '' || !Number.isFinite(Number(ht))) return <span style={{ color: '#9C9591' }}>—</span>
  const ttc = ttcDe(ht, tva)
  return (
    <span style={{ display: 'inline-flex', flexDirection: enLigne ? 'row' : 'column', alignItems: enLigne ? 'baseline' : 'flex-start', gap: enLigne ? 6 : 0 }}>
      <span style={{ fontSize: taille, fontWeight: poids, color: couleur, whiteSpace: 'nowrap' }}>
        {euro(Number(ht))} <span style={{ fontSize: Math.max(10, Math.round(taille * 0.6)), fontWeight: 500, color: '#5E5854' }}>HT</span>
      </span>
      {ttc != null && (
        <span style={{ fontSize: Math.max(10, Math.round(taille * 0.6)), color: '#9C9591', whiteSpace: 'nowrap' }}>
          {euro(ttc)} TTC
        </span>
      )}
    </span>
  )
}
