import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, AlertTriangle, Check } from 'lucide-react'
import { lirePdf, estPdf } from './lecturePdf'
import { lirePiece, proposerLot, numeroLibre, titrePiece } from './piecesLogique'
import { enregistrerPiece, creerLot } from './piecesDonnees'

// ─── Importer des CCTP ───────────────────────────────────────────────────────
//
// Un ou plusieurs PDF ; chacun est lu sur l'appareil. Pour chacun : le lot lu
// sur la couverture, un aperçu des articles trouvés, et la proposition —
// rattacher au lot existant de même nom, ou créer le lot lu. Rien n'est créé
// avant « Importer ». Un CCTP rattaché à un lot qui en a déjà un le remplace.

const champ = { height: 34, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', boxSizing: 'border-box' }

function Fichier({ entree, lots, pieces, onChoix, onRetirer }) {
  const { fichier, etat, erreur, lu, choix } = entree
  const remplace = choix?.mode === 'rattacher' && pieces.find((p) => p.lot_id === choix.lotId)
  return (
    <li style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fichier.name}</p>
        {etat === 'importe' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2A8A4E' }}><Check size={14} /> Importé</span>}
        {etat !== 'importe' && etat !== 'envoi' && (
          <button type="button" onClick={onRetirer} aria-label="Retirer ce fichier" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={15} /></button>
        )}
      </div>
      {etat === 'lecture' && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9C9591' }}>Lecture du PDF…</p>}
      {erreur && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
      {lu && (
        <>
          <p style={{ margin: '4px 0 10px', fontSize: 12, color: '#5E5854' }}>
            {lu.articles.length} article{lu.articles.length > 1 ? 's' : ''} sur {lu.nbPages} pages
            {lu.indice ? ` · indice ${lu.indice}` : ''}
            {lu.articles[0]?.numero == null ? ' · numérotation non reconnue : découpé par page' : ''}
            {lu.lot ? ` · lu sur le document : ${titrePiece(lu.lot.numero, lu.lot.nom)}` : ' · aucun lot lu sur le document'}
          </p>
          <fieldset disabled={etat === 'envoi' || etat === 'importe'} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="radio" checked={choix.mode === 'rattacher'} disabled={lots.length === 0}
                onChange={() => onChoix({ mode: 'rattacher', lotId: choix.lotId ?? lots[0]?.id })} />
              Rattacher au lot
              <select value={choix.mode === 'rattacher' ? choix.lotId ?? '' : ''} disabled={lots.length === 0}
                onChange={(e) => onChoix({ mode: 'rattacher', lotId: e.target.value })} style={{ ...champ, flex: 1, minWidth: 0 }}>
                {choix.mode !== 'rattacher' && <option value="">—</option>}
                {lots.map((l) => <option key={l.id} value={l.id}>{titrePiece(l.numero, l.nom)}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
              <input type="radio" checked={choix.mode === 'creer'}
                onChange={() => onChoix({ mode: 'creer', numero: numeroLibre(lu.lot?.numero ?? 1, lots), nom: lu.lot?.nom ?? '' })} />
              Créer le lot n°
              <input type="number" min={1} value={choix.mode === 'creer' ? choix.numero : ''} aria-label="Numéro du lot"
                onChange={(e) => onChoix({ ...choix, mode: 'creer', numero: e.target.value })} style={{ ...champ, width: 70, minHeight: 0 }} />
              <input type="text" value={choix.mode === 'creer' ? choix.nom : ''} placeholder="Nom du lot" aria-label="Nom du lot"
                onChange={(e) => onChoix({ ...choix, mode: 'creer', nom: e.target.value })} style={{ ...champ, flex: '1 1 180px', minHeight: 0 }} />
            </label>
          </fieldset>
          {remplace && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0', fontSize: 12, color: '#92400E' }}>
              <AlertTriangle size={13} /> Ce lot a déjà un CCTP (importé le {new Date(remplace.importe_le).toLocaleDateString('fr-FR')}) : il sera remplacé.
            </p>
          )}
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 12, color: '#5E5854', cursor: 'pointer' }}>Aperçu des articles</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#1F1B17', maxHeight: 180, overflowY: 'auto' }}>
              {lu.articles.slice(0, 40).map((a) => <li key={a.ordre}>{a.numero ? `${a.numero} ` : ''}{a.titre}</li>)}
              {lu.articles.length > 40 && <li style={{ color: '#9C9591' }}>… et {lu.articles.length - 40} autres</li>}
            </ul>
          </details>
        </>
      )}
    </li>
  )
}

export function ImportPieces({ affaireId, lots, pieces, onTermine, onFermer }) {
  const [entrees, setEntrees] = useState([])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const champFichiers = useRef(null)
  const identifiant = useRef(0)

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, enCours])

  const majEntree = (id, changement) => setEntrees((liste) => liste.map((e) => (e.id === id ? { ...e, ...changement } : e)))

  const ajouter = async (fichiers) => {
    for (const fichier of [...fichiers].filter(estPdf)) {
      const id = ++identifiant.current
      setEntrees((liste) => [...liste, { id, fichier, etat: 'lecture' }])
      try {
        const { pages, nomFichier } = await lirePdf(fichier)
        const lu = lirePiece({ pages, nomFichier })
        majEntree(id, { etat: 'pret', lu, choix: proposerLot(lu.lot, lots) })
      } catch (err) {
        majEntree(id, { etat: 'erreur', erreur: err?.message ?? String(err) })
      }
    }
  }

  const prets = entrees.filter((e) => e.etat === 'pret')
  const choixValide = (c) => c && (c.mode === 'rattacher' ? !!c.lotId : Number(c.numero) > 0 && String(c.nom ?? '').trim())

  const importer = async () => {
    setEnCours(true)
    setErreur(null)
    let lotsConnus = [...lots]
    try {
      for (const e of prets) {
        majEntree(e.id, { etat: 'envoi' })
        let lotId = e.choix.lotId
        let numero
        let nom
        if (e.choix.mode === 'creer') {
          numero = numeroLibre(Number(e.choix.numero), lotsConnus)
          nom = String(e.choix.nom).trim()
          lotId = await creerLot(affaireId, { numero, nom })
          lotsConnus = [...lotsConnus, { id: lotId, numero, nom }]
        } else {
          const lot = lotsConnus.find((l) => l.id === lotId)
          numero = lot?.numero
          nom = lot?.nom
        }
        await enregistrerPiece({ affaireId, lotId, lu: e.lu, nomFichier: e.fichier.name, titre: titrePiece(numero, nom) })
        majEntree(e.id, { etat: 'importe' })
      }
      onTermine()
    } catch (err) {
      setErreur(`Import interrompu : ${err?.message ?? err}`)
      setEntrees((liste) => liste.map((x) => (x.etat === 'envoi' ? { ...x, etat: 'pret' } : x)))
    } finally {
      setEnCours(false)
    }
  }

  const tousImportes = entrees.length > 0 && entrees.every((e) => e.etat === 'importe' || e.etat === 'erreur')

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(32px + env(safe-area-inset-top)) 16px 32px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Importer des CCTP"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 720, borderTop: '3px solid #E8602C', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Importer des CCTP</h2>
          <button type="button" onClick={onFermer} disabled={enCours} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); ajouter(e.dataTransfer.files) }}
            style={{ border: '1px dashed rgba(0,0,0,0.25)', background: 'white', padding: '18px 16px', textAlign: 'center' }}
          >
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5E5854' }}>
              Déposez ici les CCTP en PDF (plusieurs à la fois), ou
            </p>
            <button type="button" onClick={() => champFichiers.current?.click()} disabled={enCours}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}>
              <Upload size={15} /> Choisir des fichiers
            </button>
            <input ref={champFichiers} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files; ajouter(f); e.target.value = '' }} />
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9C9591' }}>
              Le PDF est lu sur cet appareil ; seul son texte, découpé en articles, est enregistré.
            </p>
          </div>

          {entrees.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entrees.map((e) => (
                <Fichier key={e.id} entree={e} lots={lots} pieces={pieces}
                  onChoix={(choix) => majEntree(e.id, { choix })}
                  onRetirer={() => setEntrees((liste) => liste.filter((x) => x.id !== e.id))} />
              ))}
            </ul>
          )}
          {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onFermer} disabled={enCours}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', fontSize: 13, cursor: 'pointer' }}>
            {tousImportes ? 'Fermer' : 'Annuler'}
          </button>
          {!tousImportes && (
            <button type="button" onClick={importer} disabled={enCours || prets.length === 0 || !prets.every((e) => choixValide(e.choix))}
              style={{ minHeight: 40, padding: '0 18px', borderRadius: 3, border: 'none', background: '#E8602C', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: enCours || prets.length === 0 || !prets.every((e) => choixValide(e.choix)) ? 0.5 : 1 }}>
              {enCours ? 'Import…' : `Importer${prets.length > 1 ? ` les ${prets.length} CCTP` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
