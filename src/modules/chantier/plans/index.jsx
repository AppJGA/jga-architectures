import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { usePlans } from '../comptes-rendus/usePlans'
import { CartePlan } from '../comptes-rendus/PlansVue'
import { ImportPlan } from '../comptes-rendus/ImportPlan'
import { PlanPleinEcran } from '../comptes-rendus/PlanPleinEcran'
import { versionCourante, indiceSuivant, cheminsAGarder } from '../comptes-rendus/plansLogique'
import { garderImages } from '../comptes-rendus/horsLigne/images'
import { ImportPlans } from './ImportPlans'

// ─── Plans de l'affaire ──────────────────────────────────────────────────────
//
// Les plans du projet, à ranger et à consulter en réunion de chantier
// (conception : docs/superpowers/specs/2026-10-21-module-plans-design.md).
// Ce sont les mêmes plans que la tuile « Plans » des comptes rendus (tables
// de la migration 041) : rien n'est en double. Ouvert avec du réseau, le
// module recopie les images de tous les plans sur l'appareil ; sans réseau,
// il les relit de là (`useLiensSignes` bascule tout seul sur les copies).

const fmtJour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')

export default function PlansModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const plansCr = usePlans(affaireId)
  const { plans, versions, liens, obtenirLiens, disponible, charge } = plansCr
  const [ouvert, setOuvert] = useState(null) // id du plan
  const [jeu, setJeu] = useState(null) // fichiers d'un import de plusieurs pages
  const [version, setVersion] = useState(null) // { fichier, plan } : nouvelle version d'un plan
  const [erreur, setErreur] = useState(null)
  const [copie, setCopie] = useState(null) // { gardees, total }
  const champFichiers = useRef(null)

  useEffect(() => {
    const chemins = plans.map((p) => versionCourante(versions, p.id)?.chemin_apercu).filter(Boolean)
    if (chemins.length) obtenirLiens(chemins).catch((err) => console.warn('Plans :', err))
  }, [plans, versions, obtenirLiens])

  // Copie sur l'appareil pour la réunion sans réseau
  useEffect(() => {
    if (!charge || !navigator.onLine) return
    const chemins = cheminsAGarder(plans, versions)
    if (!chemins.length) return
    let abandon = false
    garderImages(chemins, obtenirLiens)
      .then(({ gardees }) => { if (!abandon) setCopie({ gardees, total: chemins.length }) })
      .catch(() => {})
    return () => { abandon = true }
  }, [charge, plans, versions, obtenirLiens])

  const action = (fn) => async (...args) => {
    setErreur(null)
    try { await fn(...args) } catch (err) { setErreur(err?.message ?? String(err)) }
  }

  if (!disponible) {
    return <p style={{ fontSize: 13, color: '#5E5854' }}>Les plans demandent la migration 041 dans Supabase.</p>
  }

  const planOuvert = plans.find((p) => p.id === ouvert)
  const versionOuverte = planOuvert && versionCourante(versions, planOuvert.id)
  const horsLigne = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ flex: 1, margin: 0, fontSize: 12, color: '#9C9591' }}>
          {!charge ? 'Chargement…' : `${plans.length} plan${plans.length > 1 ? 's' : ''} · communs à toutes les visites de l’affaire`}
          {horsLigne
            ? ' · sans réseau : plans lus sur cet appareil'
            : copie && (copie.gardees >= copie.total
              ? ' · tous gardés sur cet appareil pour la visite sans réseau'
              : ' · copie partielle sur cet appareil (mémoire réservée aux visites pleine)')}
        </p>
        {!lectureSeule && (
          <>
            <button type="button" onClick={() => champFichiers.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #2A8A4E)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Upload size={15} /> Importer des plans
            </button>
            <input ref={champFichiers} type="file" accept="application/pdf,image/*" multiple hidden
              onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) setJeu(f) }} />
          </>
        )}
      </div>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C' }}>{erreur}</p>}

      {charge && plans.length === 0 && (
        <div style={{ background: 'white', border: '0.5px dashed rgba(0,0,0,0.15)', padding: '36px 20px', textAlign: 'center', fontSize: 13, color: '#5E5854' }}>
          Aucun plan pour cette affaire.{!lectureSeule && ' Importez le jeu de plans en PDF : chaque page devient un plan, consultable en visite de chantier.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {plans.map((plan) => (
          <CartePlan
            key={plan.id}
            plan={plan}
            version={versionCourante(versions, plan.id)}
            nbPastilles={0}
            liens={liens}
            peutGerer={!lectureSeule}
            onOuvrir={() => setOuvert(plan.id)}
            onVersion={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'application/pdf,image/*'
              input.onchange = () => { const f = input.files?.[0]; if (f) setVersion({ fichier: f, plan }) }
              input.click()
            }}
            onRenommer={action((nom) => plansCr.renommer(plan.id, nom))}
            onSupprimer={action(() => plansCr.supprimer(plan))}
          />
        ))}
      </div>

      {planOuvert && (
        <PlanPleinEcran
          titre={planOuvert.nom}
          sousTitre={versionOuverte ? `Indice ${versionOuverte.indice} · ${fmtJour(versionOuverte.created_at)}` : null}
          version={versionOuverte}
          obtenirLiens={obtenirLiens}
          onFermer={() => setOuvert(null)}
        />
      )}

      {jeu && <ImportPlans fichiers={jeu} plansCr={plansCr} onFermer={() => setJeu(null)} />}

      {version && (
        <ImportPlan
          fichier={version.fichier}
          planExistant={version.plan}
          indice={indiceSuivant(versionCourante(versions, version.plan.id)?.indice)}
          onImporter={(options) => plansCr.nouvelleVersion(version.plan, options)}
          onFermer={() => setVersion(null)}
        />
      )}
    </div>
  )
}
