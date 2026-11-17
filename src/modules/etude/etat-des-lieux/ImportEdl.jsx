import { useRef, useState } from 'react'
import { Upload, FileWarning, Check } from 'lucide-react'
import { FORMATS_ACCEPTES } from './formatPlanEdl'
import { preparerFichier, changerUnite, importer } from './importerPlans'

// ─── Import des plans de l'existant ──────────────────────────────────────────
//
// Choisir les fichiers, relire ce qui a été lu (étages, nombre de pièces,
// échelle des PDF), puis importer. Les DWG et les PDF scannés sont refusés
// avec ce qu'il faut faire à la place.

const UNITES = [{ valeur: 1, libelle: 'mètre' }, { valeur: 100, libelle: 'centimètre' }, { valeur: 1000, libelle: 'millimètre' }]

const carte = { background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 16 }
const bouton = (principal) => ({
  minHeight: 44, padding: '0 18px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500,
  border: principal ? 'none' : '0.5px solid rgba(0,0,0,0.2)',
  background: principal ? 'var(--affaire-accent)' : 'white', color: principal ? 'white' : '#1F1B17',
})
const champ = { minHeight: 36, padding: '0 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 14 }

export function ImportEdl({ affaireId, onTermine, onAnnuler }) {
  const entree = useRef(null)
  const [preparations, setPreparations] = useState([])
  const [etape, setEtape] = useState(null) // texte affiché pendant un travail
  const [erreur, setErreur] = useState(null)
  const [avertissements, setAvertissements] = useState(null)

  const choisir = async (fichiers) => {
    setErreur(null)
    setEtape('Lecture des plans…')
    try {
      const lues = []
      for (const f of fichiers) lues.push(await preparerFichier(f))
      setPreparations(lues)
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setEtape(null)
    }
  }

  const modifier = (i, fn) => setPreparations((ps) => ps.map((p, k) => (k === i ? fn(p) : p)))
  const aImporter = preparations.filter((p) => !p.refus && ((p.niveaux ?? p.pages).some((x) => x.garde)))

  const lancer = async () => {
    setErreur(null)
    setEtape('Préparation…')
    try {
      const { avertissements: a } = await importer(affaireId, aImporter, setEtape)
      if (a.length) setAvertissements(a)
      else onTermine()
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setEtape(null)
    }
  }

  if (avertissements) {
    return (
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Plans importés, avec ces remarques :</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#5E5854' }}>{avertissements.map((a) => <li key={a}>{a}</li>)}</ul>
        <div><button type="button" style={bouton(true)} onClick={onTermine}>Continuer</button></div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          Plans de l’existant : <strong>{FORMATS_ACCEPTES}</strong> — un fichier par étage, ou un fichier pour tout le bâtiment.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>
          Les DWG ne sont pas acceptés : enregistrez-les en DXF dans AutoCAD ou ArchiCAD. Un DXF donne les pièces exactes ; avec un PDF, Claude les propose et vous les corrigez.
        </p>
        <input ref={entree} type="file" accept=".dxf,.pdf" multiple hidden onChange={(e) => { choisir([...e.target.files]); e.target.value = '' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={bouton(!preparations.length)} disabled={!!etape} onClick={() => entree.current?.click()}>
            <Upload size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Choisir les plans
          </button>
          {onAnnuler && <button type="button" style={bouton(false)} disabled={!!etape} onClick={onAnnuler}>Annuler</button>}
        </div>
      </div>

      {preparations.map((p, i) => (
        <div key={`${p.nom}-${i}`} style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{p.nom}</p>
          {p.refus && (
            <p style={{ margin: 0, fontSize: 13, color: '#B42318', display: 'flex', gap: 8 }}><FileWarning size={16} style={{ flexShrink: 0 }} />{p.refus}</p>
          )}
          {p.format === 'dxf' && (
            <>
              {!p.uniteLue && (
                <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                  Unité du dessin
                  <select style={champ} value={p.unitesParMetre} onChange={(e) => modifier(i, (x) => changerUnite(x, Number(e.target.value)))}>
                    {UNITES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}
                  </select>
                </label>
              )}
              {p.niveaux.map((n, k) => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="checkbox" checked={n.garde} onChange={(e) => modifier(i, (x) => ({ ...x, niveaux: x.niveaux.map((m, j) => (j === k ? { ...m, garde: e.target.checked } : m)) }))} />
                  <input style={champ} value={n.nom} onChange={(e) => modifier(i, (x) => ({ ...x, niveaux: x.niveaux.map((m, j) => (j === k ? { ...m, nom: e.target.value } : m)) }))} />
                  <span style={{ fontSize: 13, color: '#5E5854' }}>
                    {n.pieces.length ? <><Check size={14} style={{ verticalAlign: -2 }} /> {n.pieces.length} pièces lues dans le plan</> : 'Pièces proposées par Claude'}
                  </span>
                </div>
              ))}
            </>
          )}
          {p.format === 'pdf' && p.pages.map((pg, k) => (
            <div key={pg.numero} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <input type="checkbox" disabled={!pg.vectoriel} checked={pg.garde} onChange={(e) => modifier(i, (x) => ({ ...x, pages: x.pages.map((m, j) => (j === k ? { ...m, garde: e.target.checked } : m)) }))} />
              <span>Page {pg.numero}</span>
              {pg.vectoriel ? (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  échelle 1/
                  <input style={{ ...champ, width: 70 }} type="number" min="1" value={pg.echelle} onChange={(e) => modifier(i, (x) => ({ ...x, pages: x.pages.map((m, j) => (j === k ? { ...m, echelle: Number(e.target.value) || 100 } : m)) }))} />
                  {!pg.echelleLue && <span style={{ color: '#B54708' }}>non lue sur le plan : à vérifier</span>}
                </label>
              ) : <span style={{ color: '#B42318' }}>page scannée, ignorée</span>}
              <span style={{ color: '#5E5854' }}>étages et pièces proposés par Claude</span>
            </div>
          ))}
        </div>
      ))}

      {erreur && <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{erreur}</p>}
      {etape && <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>{etape}</p>}
      {aImporter.length > 0 && !etape && (
        <div><button type="button" style={bouton(true)} onClick={lancer}>Importer</button></div>
      )}
    </div>
  )
}
