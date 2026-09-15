import { useState } from 'react'
import { X, Check, MapPinOff } from 'lucide-react'
import { useCr } from './CrContexte'
import { VisionneusePlan } from './VisionneusePlan'
import { versionCourante } from './plansLogique'
import { infosStatut } from './crLogique'

// ─── Placer la pastille d'une remarque ───────────────────────────────────────

// `couleurDe` : couleur de la pastille (statut de remarque par défaut ; les
// réserves d'OPR ont leurs propres statuts)
export function PlacementPlan({ remarque, remarques, plans, versions, pastilles, obtenirLiens, onPoser, onRetirer, onFermer, couleurDe = (r) => infosStatut(r).couleur }) {
  const { lectureSeule } = useCr()
  const existante = pastilles.find(p => p.remarque_id === remarque.id)
  const [planId, setPlanId] = useState(existante?.plan_id ?? plans[0]?.id ?? null)
  const [position, setPosition] = useState(existante ? { x: existante.x, y: existante.y } : null)
  const [enCours, setEnCours] = useState(false)

  const plan = plans.find(p => p.id === planId)
  // Pastille déjà posée sur ce plan : sa version (celle d'un CR émis reste figée)
  const version = existante?.plan_id === planId
    ? versions.find(v => v.id === existante.version_id) ?? versionCourante(versions, planId)
    : versionCourante(versions, planId)
  const deplacee = position && (!existante || existante.plan_id !== planId || existante.x !== position.x || existante.y !== position.y)

  const parId = new Map(remarques.map(r => [r.id, r]))
  const autres = pastilles
    .filter(p => p.plan_id === planId && p.remarque_id !== remarque.id)
    .map(p => ({ id: p.id, x: p.x, y: p.y, numero: parId.get(p.remarque_id)?.numero, couleur: '#9C9591', attenuee: true }))
  const moi = position && { id: 'moi', ...position, numero: remarque.numero, couleur: couleurDe(remarque) }

  const executer = async (action) => {
    setEnCours(true)
    try {
      await action()
      onFermer()
    } catch { /* signalé dans le bandeau du compte rendu */ }
    setEnCours(false)
  }

  const bouton = (fond, couleur = 'white') => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', minHeight: 40, borderRadius: 3,
    border: 'none', background: fond, color: couleur, fontSize: 13, cursor: 'pointer',
  })

  return (
    <div role="dialog" aria-modal="true" aria-label="Pastille sur plan" style={{ position: 'fixed', inset: 0, zIndex: 380, background: '#FAF7F2', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {remarque.numero != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8602C' }}>n°{remarque.numero} · </span>}
            {remarque.description}
          </p>
          <p style={{ fontSize: 11, color: '#9C9591', marginTop: 2 }}>
            {lectureSeule ? 'Position de la remarque sur le plan' : 'Touchez le plan à l’endroit de la remarque'}
          </p>
        </div>
        {plans.length > 1 && (
          <select
            value={planId ?? ''} onChange={e => { setPlanId(e.target.value); if (!lectureSeule) setPosition(null) }}
            disabled={lectureSeule} aria-label="Plan"
            style={{ height: 40, padding: '0 10px', fontSize: 13, borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white' }}
          >
            {plans.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        )}
        {plans.length === 1 && plan && <span style={{ fontSize: 13, color: '#374151' }}>{plan.nom}</span>}
        {!lectureSeule && existante && (
          <button type="button" disabled={enCours} onClick={() => executer(() => onRetirer(remarque.id))} style={bouton('white', '#B8412C')}>
            <MapPinOff size={15} /> Retirer
          </button>
        )}
        <button type="button" onClick={onFermer} style={bouton('#1F1B17')}><X size={15} /> Fermer</button>
        {!lectureSeule && (
          <button
            type="button" disabled={!deplacee || enCours || !version}
            onClick={() => executer(() => onPoser(remarque.id, { planId, versionId: version.id, ...position }))}
            style={{ ...bouton('#2A8A4E'), fontWeight: 600, opacity: !deplacee || enCours ? 0.5 : 1 }}
          >
            <Check size={15} /> {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {version ? (
          <VisionneusePlan
            key={version.id}
            version={version}
            obtenirLiens={obtenirLiens}
            pastilles={moi ? [...autres, moi] : autres}
            idActive="moi"
            onToucher={lectureSeule ? undefined : setPosition}
          />
        ) : (
          <p style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#5E5854' }}>
            Aucun plan pour cette affaire. Importez-en un depuis la tuile « Plans » du compte rendu.
          </p>
        )}
      </div>
    </div>
  )
}
