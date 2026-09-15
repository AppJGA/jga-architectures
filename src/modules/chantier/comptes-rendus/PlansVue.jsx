import { useState, useEffect } from 'react'
import { Upload, Pencil, RefreshCw, ArrowRight, X, Map as IconePlan } from 'lucide-react'
import { useCr } from './CrContexte'
import { BoutonSupprimer } from './BoutonSupprimer'
import { ImportPlan } from './ImportPlan'
import { VisionneusePlan } from './VisionneusePlan'
import { versionCourante, indiceSuivant } from './plansLogique'
import { infosStatut } from './crLogique'

// ─── Tuile « Plans » du compte rendu ─────────────────────────────────────────
// Plans de l'affaire (import, version, renommer, supprimer) et, pour chacun,
// les pastilles de la visite.

function fmtJour(iso) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : ''
}

function CartePlan({ plan, version, nbPastilles, liens, peutGerer, onOuvrir, onVersion, onRenommer, onSupprimer }) {
  const [renommage, setRenommage] = useState(null)
  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
      <button type="button" onClick={onOuvrir} style={{ padding: 0, border: 'none', background: '#F1EFE8', cursor: 'pointer', aspectRatio: '4 / 3', overflow: 'hidden' }}>
        {version && liens.get(version.chemin_apercu)
          ? <img src={liens.get(version.chemin_apercu)} alt={plan.nom} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'white' }} />
          : <IconePlan size={28} color="#C9C4C0" />}
      </button>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {renommage !== null ? (
          <form onSubmit={e => { e.preventDefault(); if (renommage.trim()) onRenommer(renommage.trim()); setRenommage(null) }} style={{ display: 'flex', gap: 4 }}>
            <input autoFocus value={renommage} onChange={e => setRenommage(e.target.value)} aria-label="Nom du plan"
              style={{ flex: 1, minWidth: 0, height: 30, padding: '0 8px', fontSize: 13, border: '0.5px solid #E8602C', borderRadius: 2 }} />
            <button type="submit" style={{ padding: '0 10px', fontSize: 12, border: 'none', background: '#E8602C', color: 'white', borderRadius: 2, cursor: 'pointer' }}>OK</button>
          </form>
        ) : (
          <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{plan.nom}</p>
        )}
        <p style={{ fontSize: 11, color: '#9C9591' }}>
          {version ? `Indice ${version.indice} · ${fmtJour(version.created_at)}` : 'Version introuvable'}
          {nbPastilles > 0 && ` · ${nbPastilles} pastille${nbPastilles > 1 ? 's' : ''}`}
        </p>
        {peutGerer && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={onVersion} title="Importer une nouvelle version" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)', background: 'white', cursor: 'pointer', borderRadius: 2 }}>
              <RefreshCw size={11} /> Nouvelle version
            </button>
            <button type="button" onClick={() => setRenommage(plan.nom)} title="Renommer" data-compact style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#9C9591' }}>
              <Pencil size={12} />
            </button>
            <BoutonSupprimer onConfirm={onSupprimer} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PlansVue({ plansCr, remarques, pastilles, peutGerer, onAllerRemarque }) {
  const { signalerErreur } = useCr()
  const { plans, versions, liens, obtenirLiens, disponible, charge } = plansCr
  const [import_, setImport] = useState(null) // { fichier, plan? }
  const [ouvert, setOuvert] = useState(null) // plan id
  const [selection, setSelection] = useState(null) // pastille id

  useEffect(() => {
    const chemins = plans.map(p => versionCourante(versions, p.id)?.chemin_apercu).filter(Boolean)
    if (chemins.length) obtenirLiens(chemins).catch(err => console.warn('Plans :', err))
  }, [plans, versions, obtenirLiens])

  if (!disponible) {
    return <p style={{ fontSize: 13, color: '#5E5854' }}>Les plans demandent la migration 041 dans Supabase.</p>
  }

  const parRemarque = new Map(remarques.map(r => [r.id, r]))
  const planOuvert = plans.find(p => p.id === ouvert)
  const pastillesOuvertes = pastilles.filter(p => p.plan_id === ouvert)
  // Version affichée : celle des pastilles de la visite (CR émis), sinon la dernière
  const versionOuverte = planOuvert && (versions.find(v => v.id === pastillesOuvertes[0]?.version_id) ?? versionCourante(versions, ouvert))
  const choisie = pastilles.find(p => p.id === selection)
  const remarqueChoisie = choisie && parRemarque.get(choisie.remarque_id)

  const action = (fn) => async (...args) => {
    try { await fn(...args) } catch (err) { signalerErreur(err) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: '#5E5854' }}>
          Plans communs à toutes les visites de l’affaire. Posez une pastille depuis une remarque (bouton « Plan »).
        </p>
        {peutGerer && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500, background: '#2A8A4E', color: 'white', cursor: 'pointer' }}>
            <Upload size={13} /> Importer un plan
            <input type="file" accept="application/pdf,image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setImport({ fichier: f }) }} />
          </label>
        )}
      </div>

      {charge && plans.length === 0 && (
        <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '36px 20px', textAlign: 'center', fontSize: 13, color: '#5E5854' }}>
          Aucun plan pour cette affaire.{peutGerer && ' Importez un PDF ou une image pour commencer.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {plans.map(plan => (
          <CartePlan
            key={plan.id}
            plan={plan}
            version={versionCourante(versions, plan.id)}
            nbPastilles={pastilles.filter(p => p.plan_id === plan.id).length}
            liens={liens}
            peutGerer={peutGerer}
            onOuvrir={() => { setOuvert(plan.id); setSelection(null) }}
            onVersion={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'application/pdf,image/*'
              input.onchange = () => { const f = input.files?.[0]; if (f) setImport({ fichier: f, plan }) }
              input.click()
            }}
            onRenommer={action(nom => plansCr.renommer(plan.id, nom))}
            onSupprimer={action(() => plansCr.supprimer(plan))}
          />
        ))}
      </div>

      {planOuvert && versionOuverte && (
        <div role="dialog" aria-modal="true" aria-label={planOuvert.nom} style={{ position: 'fixed', inset: 0, zIndex: 370, background: '#FAF7F2', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
            <p style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1F1B17' }}>
              {planOuvert.nom} <span style={{ fontSize: 12, color: '#9C9591', fontWeight: 400 }}>· indice {versionOuverte.indice} · {pastillesOuvertes.length} pastille{pastillesOuvertes.length > 1 ? 's' : ''}</span>
            </p>
            <button type="button" onClick={() => setOuvert(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', minHeight: 40, borderRadius: 3, border: 'none', background: '#1F1B17', color: 'white', fontSize: 13, cursor: 'pointer' }}>
              <X size={15} /> Fermer
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <VisionneusePlan
              key={versionOuverte.id}
              version={versionOuverte}
              obtenirLiens={obtenirLiens}
              idActive={selection}
              pastilles={pastillesOuvertes.map(p => {
                const r = parRemarque.get(p.remarque_id)
                return { id: p.id, x: p.x, y: p.y, numero: r?.numero, couleur: r ? infosStatut(r).couleur : '#9C9591', titre: r?.description }
              })}
              onPastille={p => setSelection(p.id)}
            />
            {remarqueChoisie && (
              <div style={{ position: 'absolute', left: 12, bottom: 12, right: 72, maxWidth: 420, background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', boxShadow: '0 10px 24px -12px rgba(0,0,0,0.45)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {remarqueChoisie.numero != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8602C' }}>n°{remarqueChoisie.numero}</span>}
                  <span style={{ fontSize: 10, fontWeight: 500, color: infosStatut(remarqueChoisie).couleur, background: infosStatut(remarqueChoisie).fond, borderRadius: 3, padding: '2px 6px' }}>{infosStatut(remarqueChoisie).libelle}</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={() => setSelection(null)} aria-label="Fermer" data-compact style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 2 }}><X size={14} /></button>
                </div>
                <p style={{ fontSize: 13, color: '#1F1B17', marginBottom: 8 }}>{remarqueChoisie.description}</p>
                <button type="button" onClick={() => { setOuvert(null); onAllerRemarque(remarqueChoisie.id) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#2A8A4E' }}>
                  Aller à la remarque <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {import_ && (
        <ImportPlan
          fichier={import_.fichier}
          planExistant={import_.plan}
          indice={import_.plan ? indiceSuivant(versionCourante(versions, import_.plan.id)?.indice) : 'A'}
          onImporter={(options) => import_.plan ? plansCr.nouvelleVersion(import_.plan, options) : plansCr.importer(options)}
          onFermer={() => setImport(null)}
        />
      )}
    </div>
  )
}
