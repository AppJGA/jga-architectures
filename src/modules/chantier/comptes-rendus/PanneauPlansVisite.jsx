import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { IconePlans } from '../../../shared/icones/IconesAffaire'
import { Panneau } from './PanneauxVisite'
import { PlanPleinEcran } from './PlanPleinEcran'
import { usePlansCr } from './PlansContexte'
import { versionCourante } from './plansLogique'
import { infosStatut } from './crLogique'

// ─── Bouton « Plans » du mode Visite ─────────────────────────────────────────
//
// Les plans de l'affaire, sans quitter la visite : la liste, puis le plan en
// plein écran avec les pastilles des remarques de cette visite. Images lues
// comme le reste de la visite (copies emportées sur l'appareil sans réseau).

export function PanneauPlansVisite({ onFermer }) {
  const { plans, versions, pastilles, remarques, liens, obtenirLiens } = usePlansCr()
  const [ouvert, setOuvert] = useState(null)
  const [selection, setSelection] = useState(null)

  useEffect(() => {
    const chemins = plans.map((p) => versionCourante(versions, p.id)?.chemin_apercu).filter(Boolean)
    if (chemins.length) obtenirLiens(chemins).catch(() => {})
  }, [plans, versions, obtenirLiens])

  const plan = plans.find((p) => p.id === ouvert)
  if (plan) {
    const siennes = pastilles.filter((p) => p.plan_id === plan.id)
    // Version des pastilles de la visite (CR émis), sinon la dernière
    const version = versions.find((v) => v.id === siennes[0]?.version_id) ?? versionCourante(versions, plan.id)
    const parRemarque = new Map(remarques.map((r) => [r.id, r]))
    const choisie = siennes.find((p) => p.id === selection)
    const remarque = choisie && parRemarque.get(choisie.remarque_id)
    return (
      <PlanPleinEcran
        titre={plan.nom}
        sousTitre={`${version ? `Indice ${version.indice} · ` : ''}${siennes.length} pastille${siennes.length > 1 ? 's' : ''} de la visite`}
        version={version}
        obtenirLiens={obtenirLiens}
        idActive={selection}
        pastilles={siennes.map((p) => {
          const r = parRemarque.get(p.remarque_id)
          return { id: p.id, x: p.x, y: p.y, numero: r?.numero, couleur: r ? infosStatut(r).couleur : '#9C9591', titre: r?.description }
        })}
        onPastille={(p) => setSelection(p.id)}
        onFermer={() => { setOuvert(null); setSelection(null) }}
        enfants={remarque && (
          <div style={{ position: 'absolute', left: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', right: 72, maxWidth: 460, background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', boxShadow: '0 10px 24px -12px rgba(0,0,0,0.45)', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {remarque.numero != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#2A8A4E' }}>n°{remarque.numero}</span>}
              <span style={{ fontSize: 11, fontWeight: 500, color: infosStatut(remarque).couleur, background: infosStatut(remarque).fond, borderRadius: 3, padding: '2px 6px' }}>{infosStatut(remarque).libelle}</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setSelection(null)} aria-label="Fermer la remarque"
                style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#1F1B17' }}>{remarque.description}</p>
          </div>
        )}
      />
    )
  }

  return (
    <Panneau titre="Plans de l’affaire" onFermer={onFermer}>
      {plans.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#5E5854' }}>Aucun plan pour cette affaire : ils s’importent dans le module « Plans ».</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {plans.map((p) => {
            const version = versionCourante(versions, p.id)
            const nb = pastilles.filter((x) => x.plan_id === p.id).length
            const apercu = version && liens.get(version.chemin_apercu)
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setOuvert(p.id)}
                  style={{ width: '100%', padding: 0, border: '0.5px solid rgba(0,0,0,0.12)', background: 'white', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '4 / 3', background: '#F1EFE8', overflow: 'hidden' }}>
                    {apercu
                      ? <img src={apercu} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'white' }} />
                      : <IconePlans size={28} color="#C9C4C0" />}
                  </span>
                  <span style={{ padding: '10px 12px', minHeight: 44 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>{p.nom}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#9C9591' }}>
                      {version ? `Indice ${version.indice}` : ''}{nb ? ` · ${nb} pastille${nb > 1 ? 's' : ''}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panneau>
  )
}
