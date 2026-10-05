import { useState } from 'react'
import { Check, Pencil, X, ChevronDown } from 'lucide-react'
import { IconeRobot } from '../../../../shared/icones/IconesAffaire'
import { validerProposition, ecarterProposition } from './propositions'
import { COULEUR_IA } from './styleProposition'

// ─── Remarque proposée par l'IA ──────────────────────────────────────────────
//
// Mise en surbrillance, pas surlignée (choix de l'agence) : c'est toute la
// carte qui ressort, d'une couleur réservée à l'IA — le jaune « surligné »
// reste celui de la mise en forme d'une remarque (migration 056).

export function EtiquetteProposition({ petite = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: petite ? 11 : 12, fontWeight: 600,
      color: 'white', background: COULEUR_IA, borderRadius: 3, padding: petite ? '1px 6px' : '3px 9px', whiteSpace: 'nowrap',
    }}>
      <IconeRobot size={petite ? 14 : 16} /> Proposée — à valider
    </span>
  )
}

export function ExtraitProposition({ rem, petit = false }) {
  if (!rem.ia_extrait) return null
  return (
    <p style={{ fontSize: petit ? 11 : 13, color: '#4B5D73', fontStyle: 'italic', margin: '6px 0 0', lineHeight: 1.45 }}>
      Entendu : « {rem.ia_extrait} »
    </p>
  )
}

/**
 * Valider / Modifier / Écarter. Valider une remarque sans destinataire ouvre
 * la modification : une remarque de l'agence a toujours un destinataire.
 */
export function BoutonsProposition({ rem, ops, onModifier, sectionType, petit = false, signalerErreur }) {
  const [occupe, setOccupe] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const suite = !!rem.parent_id
  const sansDestinataire = !suite && !rem.lot_id && !rem.interlocuteur_id && sectionType !== 'intervenants'

  const style = (fond, couleur, bord = 'rgba(0,0,0,0.15)') => ({
    minHeight: petit ? 28 : 44, padding: petit ? '0 10px' : '0 14px', borderRadius: 3, fontSize: petit ? 12 : 14,
    fontWeight: fond === COULEUR_IA ? 600 : 500, cursor: occupe ? 'wait' : 'pointer',
    border: fond === 'white' ? `1px solid ${bord}` : 'none', background: fond, color: couleur,
    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  })

  const agir = async (action) => {
    setOccupe(true)
    try { await action() } catch (err) { signalerErreur?.(err) } finally { setOccupe(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: petit ? 6 : 8, flexWrap: 'wrap' }}>
      {sansDestinataire && (
        <span style={{ fontSize: petit ? 11 : 13, fontWeight: 600, color: '#B45309' }}>Destinataire à choisir</span>
      )}
      <button type="button" disabled={occupe} style={style(COULEUR_IA, 'white')}
        onClick={() => agir(async () => {
          const fait = await validerProposition(rem, ops, { sectionType })
          if (!fait) onModifier?.(rem)
        })}>
        <Check size={petit ? 13 : 17} /> {sansDestinataire ? 'Choisir et valider' : 'Valider'}
      </button>
      {onModifier && !suite && (
        <button type="button" disabled={occupe} onClick={() => onModifier(rem)} style={style('white', '#1F1B17')}>
          <Pencil size={petit ? 12 : 16} /> Modifier
        </button>
      )}
      {!confirmer ? (
        <button type="button" disabled={occupe} onClick={() => setConfirmer(true)} style={style('white', '#B8412C', 'rgba(184,65,44,0.35)')}>
          <X size={petit ? 13 : 17} /> Écarter
        </button>
      ) : (
        <>
          <button type="button" onClick={() => setConfirmer(false)} style={style('white', '#1F1B17')}>Garder</button>
          <button type="button" disabled={occupe} onClick={() => agir(() => ecarterProposition(rem, ops))} style={style('#B8412C', 'white')}>Écarter</button>
        </>
      )}
    </div>
  )
}

/** En tête du CR : combien de propositions restent, et la suivante en un geste. */
export function BandeauPropositions({ nombre, onSuivante, petit = false }) {
  if (nombre === 0) return null
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: '#EEF4FB', border: `1px solid ${COULEUR_IA}`, color: '#1D4570',
      padding: petit ? '8px 12px' : '10px 14px', fontSize: petit ? 13 : 14,
    }}>
      <IconeRobot size={20} color={COULEUR_IA} />
      <span style={{ flex: '1 1 220px' }}>
        <strong>{nombre} remarque{nombre > 1 ? 's' : ''} proposée{nombre > 1 ? 's' : ''}</strong> par l’IA à valider, modifier ou écarter
        {' '}— le compte rendu ne peut pas être émis avant.
      </span>
      <button type="button" onClick={onSuivante} style={{
        minHeight: petit ? 32 : 44, padding: '0 14px', borderRadius: 3, border: 'none', cursor: 'pointer',
        background: COULEUR_IA, color: 'white', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <ChevronDown size={16} /> Aller à la suivante
      </button>
    </div>
  )
}
