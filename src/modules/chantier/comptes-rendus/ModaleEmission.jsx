import { useEffect, useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import { supabase } from '../../../core/supabase/client'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { controlesEmission, libelleEmission } from './controleEmissionLogique'

// ─── Émettre le CR : confirmation avec liste de contrôle ─────────────────────
//
// Ce qui est fait apparaît en vert, case cochée ; ce qui manque, en rouge,
// avec de quoi y aller. L'émission reste possible (« Émettre quand même »),
// sauf s'il reste des propositions de l'IA : la base la refuserait, le bouton
// mène alors aux propositions.

const VERT = '#2A8A4E'
const ROUGE = '#B8412C'

function Ligne({ controle, onAller }) {
  const couleur = controle.ok ? VERT : ROUGE
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
      <span aria-hidden="true" style={{
        width: 18, height: 18, flexShrink: 0, marginTop: 1, borderRadius: 3,
        border: `1.5px solid ${couleur}`, background: controle.ok ? couleur : 'white',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {controle.ok && <Check size={13} color="white" strokeWidth={3} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: couleur }}>
          {controle.libelle}
          {/* La couleur ne suffit pas à un lecteur d'écran */}
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{controle.ok ? ' : fait' : ' : à faire'}</span>
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: controle.ok ? '#5E5854' : ROUGE }}>{controle.detail}</p>
      </div>
      {!controle.ok && onAller && (
        <button type="button" onClick={() => onAller(controle.vue)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, background: 'none', border: 'none', padding: '2px 0', fontSize: 12, color: ROUGE, cursor: 'pointer', textDecoration: 'underline' }}>
          Ouvrir <ArrowRight size={12} />
        </button>
      )}
    </li>
  )
}

export function ModaleEmission({ cr, presences, avancement, nbPropositions, onConfirmer, onAnnuler, onAller, onVoirPropositions }) {
  // L'avancement figé par le CR précédent, pour savoir si le planning a bougé
  const [precedent, setPrecedent] = useState(undefined) // undefined = en cours de lecture
  useEffect(() => {
    let annule = false
    supabase.from('comptes_rendus').select('numero, avancement_lots')
      .eq('affaire_id', cr.affaire_id).lt('numero', cr.numero)
      .order('numero', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (!annule) setPrecedent(data ?? null) })
    return () => { annule = true }
  }, [cr.affaire_id, cr.numero])

  const controles = controlesEmission({ cr, presences, avancement, precedent: precedent ?? null, nbPropositions })
  const bloque = controles.some((c) => c.bloquant)

  return (
    <ModaleConfirmation
      titre={`Émettre le compte rendu n°${cr.numero} ?`}
      texte="Une fois émis, le compte rendu est verrouillé : présences, sections et remarques ne sont plus modifiables. Vous pourrez le rouvrir si une correction s’impose."
      details={
        <ul style={{ listStyle: 'none', margin: '-8px 0', padding: 0 }}>
          {controles.map((c) => <Ligne key={c.id} controle={c} onAller={onAller} />)}
        </ul>
      }
      libelle={bloque ? 'Voir les propositions' : libelleEmission(controles)}
      couleur={bloque ? '#1D4570' : VERT}
      onConfirmer={bloque ? onVoirPropositions : onConfirmer}
      onAnnuler={onAnnuler}
    />
  )
}
