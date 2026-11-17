import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, AlertTriangle, Check, Sparkles } from 'lucide-react'
import { preparerFichier, changerUnite, importer } from './importerPlans'

// ─── Importer les plans de l'existant ────────────────────────────────────────
//
// Même fenêtre que l'import des pièces écrites : déposer les DWG ou DXF (un
// DWG est converti en DXF sur l'appareil), relire ce qui a été lu (étages,
// pièces, zones englobantes écartées), puis importer. Un PDF est refusé avec
// ce qu'il faut faire à la place. La
// fenêtre ne se ferme qu'au ✕, par Annuler ou Échap, jamais pendant l'import.

const UNITES = [{ valeur: 1, libelle: 'mètre' }, { valeur: 100, libelle: 'centimètre' }, { valeur: 1000, libelle: 'millimètre' }]

const champ = { height: 34, minHeight: 0, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', boxSizing: 'border-box' }
const boutonSecondaire = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 3, fontSize: 13, color: '#1F1B17', cursor: 'pointer' }
const boutonPrincipal = { minHeight: 40, padding: '0 18px', borderRadius: 3, border: 'none', background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const boutonIcone = { background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4, display: 'inline-flex' }

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

function resumeNiveau(n) {
  if (!n.pieces.length) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} /> aucune pièce dessinée : Claude les proposera</span>
  }
  return (
    <>
      {pluriel(n.pieces.length, 'pièce')} lue{n.pieces.length > 1 ? 's' : ''} dans le plan
      {n.ecartees > 0 && ` · ${pluriel(n.ecartees, 'zone')} qui en recouvrai${n.ecartees > 1 ? 'en' : ''}t d’autres écartée${n.ecartees > 1 ? 's' : ''}`}
    </>
  )
}

function Fichier({ prep, verrouille, onChange, onRetirer }) {
  const majNiveau = (k, changement) => onChange({ ...prep, niveaux: prep.niveaux.map((m, j) => (j === k ? { ...m, ...changement } : m)) })
  return (
    <li style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.nom}</p>
        {!verrouille && <button type="button" onClick={onRetirer} aria-label="Retirer ce fichier" style={boutonIcone}><X size={15} /></button>}
      </div>

      {prep.refus && (
        <p role="alert" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '6px 0 0', fontSize: 12, color: '#B8412C' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {prep.refus}
        </p>
      )}

      {prep.niveaux && (
        <>
          <p style={{ margin: '4px 0 8px', fontSize: 12, color: '#5E5854' }}>
            {prep.converti && 'DWG converti en DXF sur cet appareil · '}
            {pluriel(prep.niveaux.length, 'étage')} lu{prep.niveaux.length > 1 ? 's' : ''} dans le plan
          </p>
          {!prep.uniteLue && (
            <div style={{ margin: '0 0 8px', padding: 10, background: '#FFFBEB', border: '0.5px solid #F59E0B', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 260px', fontSize: 12, color: '#92400E' }}>
                L’unité du dessin n’a pas pu être lue (aucune surface écrite dans les pièces) : vérifiez-la.
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Unité
                <select value={prep.unitesParMetre} disabled={verrouille} onChange={(e) => onChange(changerUnite(prep, Number(e.target.value)))} style={champ}>
                  {UNITES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}
                </select>
              </label>
            </div>
          )}
          <fieldset disabled={verrouille} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prep.niveaux.map((n, k) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 44 }}>
                <input type="checkbox" checked={n.garde} aria-label={`Importer l’étage ${n.nom}`}
                  onChange={(e) => majNiveau(k, { garde: e.target.checked })} style={{ width: 18, height: 18, margin: 0 }} />
                <input type="text" value={n.nom} aria-label="Nom de l’étage"
                  onChange={(e) => majNiveau(k, { nom: e.target.value })} style={{ ...champ, flex: '0 1 220px', minWidth: 0 }} />
                <span style={{ flex: '1 1 220px', fontSize: 12, color: n.garde ? '#5E5854' : '#9C9591' }}>{resumeNiveau(n)}</span>
              </div>
            ))}
          </fieldset>
        </>
      )}
    </li>
  )
}

export function ImportEdl({ affaireId, onTermine, onFermer }) {
  const champFichiers = useRef(null)
  const identifiant = useRef(0)
  const [preparations, setPreparations] = useState([])
  const [lecture, setLecture] = useState(null) // texte affiché pendant la lecture
  const [etape, setEtape] = useState(null) // texte affiché pendant l'import
  const [erreur, setErreur] = useState(null)
  const [avertissements, setAvertissements] = useState(null)
  const occupe = lecture || !!etape

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !occupe) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, occupe])

  const ajouter = async (fichiers) => {
    const liste = [...fichiers]
    if (!liste.length) return
    setErreur(null)
    setLecture('Lecture du plan…')
    for (const f of liste) {
      const id = ++identifiant.current
      // Un fichier illisible ne fait pas perdre les autres
      let prep
      try {
        prep = await preparerFichier(f, { surConversion: (nom) => setLecture(`Conversion de « ${nom} » en DXF…`) })
      } catch (err) {
        prep = { nom: f.name, refus: `Fichier illisible : ${err?.message ?? String(err)}` }
      }
      setPreparations((ps) => [...ps, { ...prep, id }])
      setLecture('Lecture du plan…')
    }
    setLecture(null)
  }

  const modifier = (id, prep) => setPreparations((ps) => ps.map((p) => (p.id === id ? prep : p)))
  const aImporter = preparations.filter((p) => !p.refus && p.niveaux.some((n) => n.garde))
  const nbEtages = aImporter.reduce((s, p) => s + p.niveaux.filter((n) => n.garde).length, 0)

  const lancer = async () => {
    setErreur(null)
    setEtape('Préparation…')
    try {
      const { avertissements: a } = await importer(affaireId, aImporter, setEtape)
      if (a.length) setAvertissements(a)
      else onTermine()
    } catch (err) {
      setErreur(`Import interrompu, rien n’a été gardé : ${err?.message ?? String(err)}`)
    } finally {
      setEtape(null)
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(32px + env(safe-area-inset-top)) 16px 32px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Importer les plans de l’existant"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 720, borderTop: '3px solid var(--affaire-accent, #E8602C)', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Importer les plans de l’existant</h2>
          <button type="button" onClick={onFermer} disabled={occupe} aria-label="Fermer" style={boutonIcone}><X size={18} /></button>
        </div>

        {avertissements ? (
          <>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 13, color: '#2A8A4E' }}><Check size={15} /> Plans importés.</p>
              <div style={{ padding: 10, background: '#FFFBEB', border: '0.5px solid #F59E0B' }}>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#92400E', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {avertissements.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 20px 18px' }}>
              <button type="button" onClick={onTermine} style={boutonPrincipal}>Terminer</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (!occupe) ajouter(e.dataTransfer.files) }}
                style={{ border: '1px dashed rgba(0,0,0,0.25)', background: 'white', padding: '18px 16px', textAlign: 'center' }}
              >
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5E5854' }}>
                  Déposez ici les plans en DWG ou en DXF — un fichier par étage, ou un seul pour tout le bâtiment — ou
                </p>
                <button type="button" onClick={() => champFichiers.current?.click()} disabled={occupe} style={boutonSecondaire}>
                  <Upload size={15} /> Choisir des fichiers
                </button>
                <input ref={champFichiers} type="file" multiple accept=".dwg,.dxf" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files; ajouter(f); e.target.value = '' }} />
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9C9591' }}>
                  Le plan est lu sur cet appareil, rien n’est envoyé pour la conversion d’un DWG. Les PDF ne sont pas acceptés.
                </p>
              </div>

              {preparations.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {preparations.map((p) => (
                    <Fichier key={p.id} prep={p} verrouille={occupe}
                      onChange={(prep) => modifier(p.id, prep)}
                      onRetirer={() => setPreparations((ps) => ps.filter((x) => x.id !== p.id))} />
                  ))}
                </ul>
              )}
              {lecture && <p style={{ margin: 0, fontSize: 12, color: '#9C9591' }}>{lecture}</p>}
              {etape && <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>{etape}</p>}
              {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button type="button" onClick={onFermer} disabled={occupe} style={boutonSecondaire}>Annuler</button>
              <button type="button" onClick={lancer} disabled={occupe || nbEtages === 0}
                style={{ ...boutonPrincipal, opacity: occupe || nbEtages === 0 ? 0.5 : 1 }}>
                {etape ? 'Import…' : `Importer${nbEtages ? ` ${pluriel(nbEtages, 'étage')}` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
