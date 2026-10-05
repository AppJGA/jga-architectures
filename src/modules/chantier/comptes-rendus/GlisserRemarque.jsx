import { GripVertical } from 'lucide-react'
import { ciblesDeDepot, destinataireDe } from './glisserLogique'

// ─── Poignée, bande de dépôt, carte qui suit le geste ────────────────────────

/** La poignée qui attrape la remarque : 44 px sur tablette, discrète au bureau. */
export function PoigneeGlisser({ rem, demarrer, petite = false }) {
  return (
    <button
      type="button"
      aria-label="Glisser vers un autre destinataire"
      title="Glisser vers un autre destinataire"
      onPointerDown={(e) => demarrer(e, rem)}
      style={{
        touchAction: 'none', cursor: 'grab', flexShrink: 0,
        width: petite ? 20 : 44, height: petite ? 22 : 44, margin: petite ? 0 : '-10px 0 -10px -10px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', color: '#9C9591', padding: 0, minHeight: 0,
      }}
    >
      <GripVertical size={petite ? 14 : 20} />
    </button>
  )
}

function Puce({ cible, survolee, actuelle }) {
  return (
    <div
      data-cible-depot={actuelle ? undefined : cible.cle}
      style={{
        minHeight: 44, padding: '6px 12px', borderRadius: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        border: `1.5px ${actuelle ? 'dashed' : 'solid'} ${survolee ? '#2A8A4E' : 'rgba(0,0,0,0.15)'}`,
        background: survolee ? '#2A8A4E' : actuelle ? '#F5F1E9' : 'white',
        color: survolee ? 'white' : actuelle ? '#9C9591' : '#1F1B17',
        transform: survolee ? 'scale(1.04)' : 'none', transition: 'transform 0.1s, background 0.1s',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{cible.libelle}</span>
      {(cible.detail || actuelle) && (
        <span style={{ fontSize: 11, opacity: 0.8 }}>{actuelle ? 'destinataire actuel' : cible.detail}</span>
      )}
    </div>
  )
}

/**
 * Pendant le geste : tous les destinataires en haut de l'écran, et la
 * remarque qui suit le doigt. Rien n'est affiché hors du geste.
 */
export function BandeDepot({ geste, lots = [], interlocuteurs = [] }) {
  if (!geste) return null
  const { entreprises, equipe } = ciblesDeDepot({ lots, interlocuteurs })
  const actuel = destinataireDe(geste.rem)
  const groupe = (titre, cibles) => cibles.length > 0 && (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5E5854', margin: '0 0 6px' }}>{titre}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {cibles.map((c) => <Puce key={c.cle} cible={c} survolee={geste.cible === c.cle} actuelle={c.cle === actuel} />)}
      </div>
    </div>
  )
  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400,
        padding: 'calc(env(safe-area-inset-top) + 10px) 16px 12px',
        background: 'rgba(250,247,242,0.97)', borderBottom: '1px solid rgba(0,0,0,0.12)',
        boxShadow: '0 12px 30px -16px rgba(0,0,0,0.45)', maxHeight: '55vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10, userSelect: 'none',
      }}>
        <p style={{ fontSize: 13, color: '#1F1B17', margin: 0 }}>
          Lâchez la remarque sur son <strong>nouveau destinataire</strong> — ailleurs, rien ne change.
        </p>
        {groupe('Entreprises', entreprises)}
        {groupe('Équipe de maîtrise d’œuvre et maîtrise d’ouvrage', equipe)}
      </div>
      <div style={{
        position: 'fixed', left: geste.x + 14, top: geste.y + 14, zIndex: 401, pointerEvents: 'none',
        maxWidth: 280, padding: '8px 12px', background: 'white', borderLeft: '4px solid #2A8A4E',
        boxShadow: '0 12px 28px -10px rgba(0,0,0,0.45)', fontSize: 13, color: '#1F1B17',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {geste.rem.numero != null ? `n°${geste.rem.numero} · ` : ''}{geste.rem.description}
      </div>
    </>
  )
}
