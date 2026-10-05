import { Square, RotateCcw } from 'lucide-react'
import { IconeRobot } from '../../../../shared/icones/IconesAffaire'
import { dureeLisible } from './enregistrementLogique'

// ─── Robot de la barre du mode Visite ────────────────────────────────────────
//
// Compact : on continue de saisir ses remarques pendant qu'il enregistre.
// Le point rouge qui bat et la barre de niveau disent d'un coup d'œil que le
// micro capte ; un appui sur l'indicateur ouvre le panneau des
// enregistrements, le carré arrête. À l'arrêt, le bouton ouvre ce même
// panneau, qui porte le rappel et « Commencer ».

const base = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
}

export function BoutonRobot({ robot, onOuvrirPanneau }) {
  const { etat, niveau, duree_s, attente } = robot

  if (etat === 'enregistre' || etat === 'coupe') {
    const coupe = etat === 'coupe'
    return (
      <div style={{ display: 'inline-flex', alignItems: 'stretch', border: `1px solid ${coupe ? '#F59E0B' : 'rgba(184,65,44,0.35)'}`, borderRadius: 3, overflow: 'hidden' }}>
        <button type="button" onClick={onOuvrirPanneau} aria-label="Enregistrement en cours — ouvrir le panneau"
          style={{ ...base, borderRadius: 0, border: 'none', background: coupe ? '#FFFBEB' : '#FDF2F0', color: coupe ? '#B45309' : '#B8412C', fontWeight: 600 }}>
          {coupe ? (
            <><RotateCcw size={16} /> Micro coupé</>
          ) : (
            <>
              <span className="jga-enregistre" style={{ width: 10, height: 10, borderRadius: '50%', background: '#B8412C' }} />
              {dureeLisible(duree_s)}
              <span aria-hidden="true" style={{ width: 36, height: 6, background: 'rgba(184,65,44,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round(niveau * 100)}%`, background: '#B8412C', transition: 'width 0.1s linear' }} />
              </span>
            </>
          )}
        </button>
        {coupe ? (
          <button type="button" onClick={robot.reprendre} style={{ ...base, borderRadius: 0, border: 'none', background: '#F59E0B', color: 'white', fontWeight: 600 }}>Reprendre</button>
        ) : (
          <button type="button" onClick={robot.arreter} aria-label="Arrêter l’enregistrement" title="Arrêter l’enregistrement"
            style={{ ...base, borderRadius: 0, border: 'none', background: '#B8412C', color: 'white', padding: '0 12px' }}>
            <Square size={16} />
          </button>
        )}
      </div>
    )
  }

  return (
    <button type="button" onClick={onOuvrirPanneau} title="Enregistrer la réunion"
      style={{ ...base, border: '1px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }}>
      <IconeRobot size={22} /> Enregistrer
      {robot.erreur && (
        <span title={robot.erreur} style={{ fontSize: 11, fontWeight: 700, color: 'white', background: '#B8412C', borderRadius: 10, padding: '1px 7px' }}>!</span>
      )}
      {attente.enAttente > 0 && (
        <span title="Morceaux en attente de transcription" style={{ fontSize: 11, fontWeight: 600, color: 'white', background: '#9C9591', borderRadius: 10, padding: '1px 7px' }}>
          {attente.enAttente}
        </span>
      )}
    </button>
  )
}
