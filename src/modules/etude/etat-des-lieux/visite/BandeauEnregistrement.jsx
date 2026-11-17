import { Pause, Mic, AlertTriangle } from 'lucide-react'
import { dureeLisible, enregistrementActif } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'
import { messageArret } from './visiteLogique'

// ─── Bandeau de l'enregistrement ─────────────────────────────────────────────
//
// Impossible à manquer, à la demande de l'agence : rouge avec le point qui
// bat, la durée et la jauge du micro tant qu'on enregistre ; sinon une bande
// sombre qui dit pourquoi rien n'est enregistré, avec « Reprendre ».

const boutonBandeau = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.7)', background: 'transparent',
  color: 'white', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap',
}

export function BandeauEnregistrement({ etat, duree_s, niveau, enAttente, onPause, onReprendre }) {
  const attente = enAttente > 0 && (
    <span style={{ fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap' }}>
      {enAttente} morceau{enAttente > 1 ? 'x' : ''} gardé{enAttente > 1 ? 's' : ''} sur la tablette
    </span>
  )
  if (enregistrementActif(etat)) {
    return (
      <div style={{ background: '#B8412C', color: 'white', padding: '0 16px', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="jga-enregistre" style={{ width: 12, height: 12, borderRadius: '50%', background: 'white', flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>Enregistrement · {dureeLisible(duree_s)}</span>
        <span role="meter" aria-label="Niveau du micro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(niveau * 100)} style={{ width: 90, height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <span style={{ display: 'block', height: '100%', width: `${Math.round(niveau * 100)}%`, background: 'white', transition: 'width 0.1s linear' }} />
        </span>
        <span style={{ flex: 1 }} />
        {attente}
        <button type="button" onClick={onPause} style={boutonBandeau}><Pause size={16} /> Pause</button>
      </div>
    )
  }
  return (
    <div role="alert" style={{ background: '#3C3834', color: 'white', padding: '0 16px', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>{messageArret(etat)} — rien n’est enregistré</span>
      <span style={{ flex: 1 }} />
      {attente}
      <button type="button" onClick={onReprendre} style={{ ...boutonBandeau, border: 'none', background: '#B8412C' }}><Mic size={16} /> Reprendre</button>
    </div>
  )
}
