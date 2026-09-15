import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { estPdf, ouvrirPdf, vignettePage, convertirPlan } from './conversionPlan'
import { formatOctets } from './photosLogique'

// ─── Importer un plan ou une nouvelle version ────────────────────────────────
//
// Fichier choisi → page du PDF (s'il en a plusieurs) → nom → conversion sur
// l'appareil → envoi.

const PAGES_MAX_AFFICHEES = 40

export function ImportPlan({ fichier, planExistant, indice, onImporter, onFermer }) {
  const [doc, setDoc] = useState(null)
  const [vignettes, setVignettes] = useState([])
  const [page, setPage] = useState(null)
  const [nom, setNom] = useState(planExistant?.nom ?? fichier.name.replace(/\.[^.]+$/, ''))
  const [etape, setEtape] = useState(estPdf(fichier) ? 'ouverture' : 'nom') // ouverture | page | nom | conversion | envoi
  const [erreur, setErreur] = useState(null)
  const [poids, setPoids] = useState(null)

  useEffect(() => {
    if (!estPdf(fichier)) return
    let abandon = false
    ouvrirPdf(fichier).then(async d => {
      if (abandon) return
      setDoc(d)
      if (d.numPages === 1) { setPage(1); setEtape('nom'); return }
      setEtape('page')
      for (let n = 1; n <= Math.min(d.numPages, PAGES_MAX_AFFICHEES); n++) {
        const url = await vignettePage(d, n)
        if (abandon) return
        setVignettes(v => [...v, { numero: n, url }])
      }
    }).catch(e => { if (!abandon) setErreur(e.message) })
    return () => { abandon = true }
  }, [fichier])

  const importer = async () => {
    if (!nom.trim()) return
    setErreur(null)
    try {
      setEtape('conversion')
      const rendu = await convertirPlan(doc ? { doc, page } : fichier)
      setPoids(rendu.plan.blob.size + rendu.apercu.blob.size)
      setEtape('envoi')
      await onImporter({ nom: nom.trim(), rendu, sourceNom: fichier.name, sourcePage: doc ? page : null })
      onFermer()
    } catch (e) {
      setErreur(e.message ?? String(e))
      setEtape('nom')
    }
  }

  const occupe = etape === 'conversion' || etape === 'envoi'

  return (
    <div onClick={occupe ? undefined : onFermer} style={{ position: 'fixed', inset: 0, zIndex: 390, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: 'white', width: '100%', maxWidth: etape === 'page' ? 760 : 460, padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
            {planExistant ? `Nouvelle version de « ${planExistant.nom} » (indice ${indice})` : 'Importer un plan'}
          </h3>
          {!occupe && <button type="button" onClick={onFermer} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>}
        </div>

        <p style={{ fontSize: 12, color: '#5E5854', marginBottom: 14 }}>{fichier.name} · {formatOctets(fichier.size)}</p>

        {etape === 'ouverture' && !erreur && <p style={{ fontSize: 13, color: '#5E5854' }}>Lecture du PDF…</p>}

        {etape === 'page' && (
          <>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
              Ce PDF compte {doc?.numPages} pages : choisissez celle du plan.
              {doc?.numPages > PAGES_MAX_AFFICHEES && ` (${PAGES_MAX_AFFICHEES} premières affichées)`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {vignettes.map(v => (
                <button key={v.numero} type="button" onClick={() => { setPage(v.numero); setEtape('nom') }}
                  style={{ padding: 6, border: '0.5px solid rgba(0,0,0,0.15)', background: '#FAF7F2', cursor: 'pointer', textAlign: 'center' }}>
                  <img src={v.url} alt={`Page ${v.numero}`} style={{ width: '100%', display: 'block', background: 'white' }} />
                  <span style={{ fontSize: 11, color: '#5E5854' }}>Page {v.numero}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {(etape === 'nom' || occupe) && (
          <>
            {!planExistant && (
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 4 }}>Nom du plan</span>
                <input
                  autoFocus value={nom} disabled={occupe} onChange={e => setNom(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') importer() }}
                  placeholder="RDC, R+1, Façades…"
                  style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, boxSizing: 'border-box' }}
                />
              </label>
            )}
            {doc && page && <p style={{ fontSize: 12, color: '#5E5854', marginBottom: 14 }}>Page {page} du PDF</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {occupe && (
                <span style={{ fontSize: 12, color: '#5E5854', marginRight: 'auto' }}>
                  {etape === 'conversion' ? 'Conversion du plan sur l’appareil…' : `Envoi (${formatOctets(poids)})…`}
                </span>
              )}
              {!occupe && <button type="button" onClick={onFermer} style={{ padding: '8px 14px', borderRadius: 2, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', cursor: 'pointer' }}>Annuler</button>}
              <button type="button" onClick={importer} disabled={occupe || !nom.trim()}
                style={{ padding: '8px 16px', borderRadius: 2, fontSize: 13, fontWeight: 500, border: 'none', background: '#2A8A4E', color: 'white', cursor: 'pointer', opacity: occupe || !nom.trim() ? 0.6 : 1 }}>
                {occupe ? 'Patientez…' : 'Importer'}
              </button>
            </div>
          </>
        )}

        {erreur && <p role="alert" style={{ fontSize: 12, color: '#B8412C', marginTop: 12 }}>{erreur}</p>}
      </div>
    </div>
  )
}
