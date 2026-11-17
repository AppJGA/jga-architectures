import { useState } from 'react'
import { Droplet, Zap, Flame, Wind, DoorOpen, Blinds, Gauge, ShieldAlert, TriangleAlert } from 'lucide-react'
import { CALQUES_DE_POINT, typeEdl } from '../calquesEdl'

// ─── Barre d'icônes des calques ──────────────────────────────────────────────
//
// Préciser le type d'un point est facultatif (spec § 2 : « toucher puis
// parler ») : une icône par calque, ses types en puces dessous. Les symboles
// définitifs des plans viennent au lot 4 ; ici des icônes reconnaissables.
// Hauteur fixe (52 + 6 + 44 px) : la rangée des types garde sa place même
// fermée, pour que le plan dessous ne change pas de taille.

const ACCENT = 'var(--affaire-accent, #E8602C)'
const ACCENT_CLAIR = 'var(--affaire-accent-clair, rgba(232,96,44,0.10))'

// Gardé dans ce fichier : un composant ne doit exporter que des composants
// (react-refresh/only-export-components)
const ICONES_CALQUES = {
  plomberie: Droplet, electricite: Zap, chauffage: Flame, ventilation: Wind, menuiseries: DoorOpen,
  occultations: Blinds, compteurs: Gauge, securite: ShieldAlert, desordres: TriangleAlert,
}

const puce = (actif) => ({
  minHeight: 44, padding: '0 14px', borderRadius: 2, flexShrink: 0, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
  border: `0.5px solid ${actif ? ACCENT : 'rgba(0,0,0,0.15)'}`, background: actif ? ACCENT : 'white', color: actif ? 'white' : '#1F1B17',
})

export function BarreCalques({ typeChoisi, inactif, onChoisir }) {
  const choisi = typeEdl(typeChoisi)
  const [ouvert, setOuvert] = useState(null)
  // 'ferme' : replié à la main, même avec un type choisi
  const codeOuvert = ouvert === 'ferme' ? null : (ouvert ?? choisi?.calque ?? null)
  const calque = CALQUES_DE_POINT.find((c) => c.code === codeOuvert) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: inactif ? 0.45 : 1 }}>
      <div role="toolbar" aria-label="Calques" style={{ height: 52, display: 'flex', gap: 4, overflowX: 'auto' }}>
        {CALQUES_DE_POINT.map((c) => {
          const Icone = ICONES_CALQUES[c.code]
          const actif = c.code === codeOuvert
          return (
            <button
              key={c.code} type="button" disabled={inactif} title={c.libelle} aria-pressed={actif}
              onClick={() => setOuvert(actif ? 'ferme' : c.code)}
              style={{
                minWidth: 72, minHeight: 52, padding: '4px 6px', borderRadius: 3, flexShrink: 0,
                border: `0.5px solid ${actif ? ACCENT : 'rgba(0,0,0,0.15)'}`, background: actif ? ACCENT_CLAIR : 'white',
                color: actif ? ACCENT : '#5E5854', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, fontSize: 11, cursor: inactif ? 'default' : 'pointer',
              }}
            >
              <Icone size={20} />
              {c.libelle}
            </button>
          )
        })}
      </div>
      <div style={{ height: 44, display: 'flex', gap: 6, overflowX: 'auto' }}>
        {calque && !inactif && calque.types.map((t) => (
          <button key={t.code} type="button" style={puce(t.code === choisi?.code)} onClick={() => onChoisir(t.code)}>{t.libelle}</button>
        ))}
        {calque && !inactif && choisi && <button type="button" style={{ ...puce(false), color: '#5E5854' }} onClick={() => onChoisir(null)}>Sans type</button>}
      </div>
    </div>
  )
}
