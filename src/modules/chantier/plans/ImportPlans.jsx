import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, Check } from 'lucide-react'
import { estPdf, ouvrirPdf, vignettePage, convertirPlan } from '../comptes-rendus/conversionPlan'
import { versionCourante, indiceSuivant } from '../comptes-rendus/plansLogique'
import {
  pagesProposees, renommerPage, forcerNouveau, cocherPage, problemesImport, pagesAEnvoyer, versionDe,
} from './importPlansLogique'

// ─── Importer un jeu de plans ────────────────────────────────────────────────
//
// Un ou plusieurs PDF (ou images) : toutes leurs pages sont proposées, chacune
// cochée avec un nom modifiable. Une page qui porte le nom d'un plan existant
// en devient la nouvelle version (sauf « en faire un nouveau plan »). Chaque
// page est convertie sur l'appareil puis envoyée, l'une après l'autre : une
// page en échec n'arrête pas les suivantes. Rien n'est envoyé avant
// « Importer ». Fermé par ✕, Annuler ou Échap (pas pendant l'envoi).

const VIGNETTES_MAX = 40 // par fichier : au-delà, la page est listée sans vignette

const MESSAGES = { vide: 'Donnez un nom à ce plan.', doublon: 'Même nom qu’une autre page de l’import.' }

export function ImportPlans({ fichiers, plansCr, onFermer }) {
  const [infos, setInfos] = useState(null) // Map id → { fichier, doc, nbPages }
  const [pages, setPages] = useState([])
  const [vignettes, setVignettes] = useState(() => new Map()) // cle → url
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(null) // { fait, total, echecs: [{ nom, message }], fini }
  const docs = useRef([])

  // Ouverture des fichiers, puis vignettes au fil de l'eau
  useEffect(() => {
    let abandon = false
    const ouverts = docs.current
    ;(async () => {
      const lus = new Map()
      const refus = []
      for (const [k, fichier] of fichiers.entries()) {
        const id = `f${k}`
        try {
          if (estPdf(fichier)) {
            const doc = await ouvrirPdf(fichier)
            ouverts.push(doc)
            lus.set(id, { fichier, doc, nbPages: doc.numPages })
          } else {
            lus.set(id, { fichier, doc: null, nbPages: 1 })
          }
        } catch (err) {
          refus.push(`${fichier.name} : ${err?.message ?? err}`)
        }
      }
      if (abandon) return
      setInfos(lus)
      if (refus.length) setErreur(refus.join(' — '))
      const proposees = pagesProposees([...lus].map(([id, i]) => ({ id, nom: i.fichier.name, nbPages: i.nbPages })), plansCr.plans)
      setPages(proposees)
      for (const p of proposees) {
        const info = lus.get(p.fichierId)
        if (p.page > VIGNETTES_MAX) continue
        try {
          const url = info.doc ? await vignettePage(info.doc, p.page, 160) : URL.createObjectURL(info.fichier)
          if (abandon) return
          setVignettes((v) => new Map(v).set(p.cle, url))
        } catch { /* vignette manquante : la page reste importable */ }
      }
    })()
    return () => {
      abandon = true
      for (const d of ouverts) d.destroy?.()
    }
  }, [fichiers]) // eslint-disable-line react-hooks/exhaustive-deps

  const enCours = envoi && !envoi.fini
  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer, enCours])

  const problemes = useMemo(() => problemesImport(pages), [pages])
  const aEnvoyer = useMemo(() => pagesAEnvoyer(pages), [pages])
  const planDe = (id) => plansCr.plans.find((p) => p.id === id)

  const importer = async () => {
    const liste = aEnvoyer
    const echecs = []
    setEnvoi({ fait: 0, total: liste.length, echecs, fini: false })
    for (const [k, p] of liste.entries()) {
      const info = infos.get(p.fichierId)
      try {
        const rendu = await convertirPlan(info.doc ? { doc: info.doc, page: p.page } : info.fichier)
        const options = { rendu, sourceNom: info.fichier.name, sourcePage: info.doc ? p.page : null }
        const cible = versionDe(p)
        if (cible && planDe(cible)) await plansCr.nouvelleVersion(planDe(cible), options)
        else await plansCr.importer({ ...options, nom: p.nom.trim() })
      } catch (err) {
        echecs.push({ nom: p.nom, message: err?.message ?? String(err) })
      }
      setEnvoi({ fait: k + 1, total: liste.length, echecs: [...echecs], fini: false })
    }
    setEnvoi({ fait: liste.length, total: liste.length, echecs, fini: true })
    if (echecs.length === 0) onFermer()
  }

  const champ = { height: 34, minHeight: 0, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', boxSizing: 'border-box' }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(32px + env(safe-area-inset-top)) 16px 32px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Importer des plans"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 820, borderTop: '3px solid var(--affaire-accent, #2A8A4E)', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Importer des plans</h2>
          <button type="button" onClick={onFermer} disabled={enCours} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {infos === null && <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>Lecture des fichiers…</p>}
          {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
          {infos && pages.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>
              Chaque page devient un plan de l’affaire, commun à toutes les visites. Une page qui porte le nom d’un plan existant en devient la nouvelle version.
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pages.map((p) => {
              const probleme = problemes.get(p.cle)
              const cible = p.cible && planDe(p.cible)
              const indice = cible && indiceSuivant(versionCourante(plansCr.versions, cible.id)?.indice)
              return (
                <li key={p.cle} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8, background: 'white', border: `0.5px solid ${probleme ? '#B8412C' : 'rgba(0,0,0,0.1)'}`, opacity: p.coche ? 1 : 0.55 }}>
                  <input type="checkbox" checked={p.coche} disabled={!!envoi} aria-label={`Importer ${p.nom}`}
                    onChange={(e) => setPages((liste) => cocherPage(liste, p.cle, e.target.checked))}
                    style={{ width: 20, height: 20, minHeight: 0, flexShrink: 0 }} />
                  <div style={{ width: 96, height: 68, flexShrink: 0, background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {vignettes.get(p.cle)
                      ? <img src={vignettes.get(p.cle)} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: 'white' }} />
                      : <span style={{ fontSize: 10, color: '#9C9591' }}>p. {p.page}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input type="text" value={p.nom} disabled={!!envoi || !p.coche} aria-label="Nom du plan"
                      onChange={(e) => setPages((liste) => renommerPage(liste, p.cle, e.target.value, plansCr.plans))}
                      style={{ ...champ, width: '100%' }} />
                    {probleme ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#B8412C' }}><AlertTriangle size={12} /> {MESSAGES[probleme]}</span>
                    ) : cible ? (
                      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 10px', fontSize: 12, color: p.nouveau ? '#5E5854' : '#2A8A4E' }}>
                        {p.nouveau ? 'Nouveau plan (un plan porte déjà ce nom)' : `Nouvelle version de « ${cible.nom} » (indice ${indice})`}
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#5E5854' }}>
                          <input type="checkbox" checked={p.nouveau} disabled={!!envoi} onChange={(e) => setPages((liste) => forcerNouveau(liste, p.cle, e.target.checked))} style={{ minHeight: 0 }} />
                          en faire un nouveau plan
                        </label>
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#5E5854' }}>Nouveau plan</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {envoi && (
            <div style={{ fontSize: 13, color: '#1F1B17' }}>
              <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {envoi.fini ? <Check size={14} color="#2A8A4E" /> : null}
                {envoi.fini ? `${envoi.total - envoi.echecs.length} plan${envoi.total - envoi.echecs.length > 1 ? 's' : ''} importé${envoi.total - envoi.echecs.length > 1 ? 's' : ''}` : `Conversion et envoi… ${envoi.fait} / ${envoi.total}`}
              </p>
              {envoi.echecs.map((e) => (
                <p key={e.nom} role="alert" style={{ margin: '4px 0 0', fontSize: 12, color: '#B8412C' }}>« {e.nom} » non importé : {e.message}</p>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onFermer} disabled={enCours}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', fontSize: 13, cursor: 'pointer' }}>
            {envoi?.fini ? 'Fermer' : 'Annuler'}
          </button>
          {!envoi && (
            <button type="button" onClick={importer} disabled={aEnvoyer.length === 0}
              style={{ minHeight: 40, padding: '0 18px', borderRadius: 3, border: 'none', background: 'var(--affaire-accent, #2A8A4E)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: aEnvoyer.length ? 1 : 0.5 }}>
              Importer {aEnvoyer.length} plan{aEnvoyer.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
