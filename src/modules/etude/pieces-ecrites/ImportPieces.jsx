import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, AlertTriangle, Check } from 'lucide-react'
import { lirePdf, estPdf } from './lecturePdf'
import { lireTableur, estTableur } from './lectureTableur'
import { proposerLot, creationProposee, numeroLibre, titrePiece } from './piecesLogique'
import { lireDpgfExcel, lirePdfPieces, formatQuantite } from './dpgfLogique'
import { numeroLot, lireNumeroSaisi } from '../../../shared/lots/numeroLot'
import { enregistrerPiece, creerLot } from './piecesDonnees'

// ─── Importer des CCTP et des DPGF ───────────────────────────────────────────
//
// PDF ou Excel, plusieurs à la fois ; chacun est lu sur l'appareil. Un PDF
// peut donner un CCTP, un DPGF ou les deux (pages de texte, pages à
// tableau) ; un Excel donne un DPGF. Pour chaque fichier : le lot lu, un
// aperçu, une case par pièce trouvée, et la proposition de lot — rattacher au
// lot existant de même nom, ou créer le lot lu. Rien n'est créé avant
// « Importer ». Une pièce remplace celle du même type déjà rattachée au lot.
// Le DPGF d'un PDF s'efface devant l'Excel du même lot, plus fiable.

const champ = { height: 34, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', boxSizing: 'border-box' }
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const lettre = (x) => (x < 26 ? LETTRES[x] : `${LETTRES[Math.floor(x / 26) - 1]}${LETTRES[x % 26]}`)
const APERCU = 12

// Le lot visé par un choix, pour reconnaître deux fichiers du même lot
const cleChoix = (c) => (c?.mode === 'rattacher' ? `L:${c.lotId}` : `N:${lireNumeroSaisi(c?.numero ?? '')?.numero ?? ''}`)

function ApercuDpgf({ lignes }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#1F1B17' }}>
      <tbody>
        {lignes.slice(0, APERCU).map((l) => (
          <tr key={l.ordre} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
            <td style={{ padding: '3px 6px 3px 0', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", color: '#9C9591' }}>{l.numero ?? ''}</td>
            <td style={{ padding: '3px 6px', fontWeight: l.titre ? 600 : 400 }}>{l.designation}</td>
            <td style={{ padding: '3px 6px', whiteSpace: 'nowrap' }}>{l.unite ?? ''}</td>
            <td style={{ padding: '3px 0 3px 6px', whiteSpace: 'nowrap', textAlign: 'right' }}>{formatQuantite(l)}</td>
          </tr>
        ))}
      </tbody>
      {lignes.length > APERCU && <caption style={{ captionSide: 'bottom', textAlign: 'left', paddingTop: 4, color: '#9C9591' }}>… et {lignes.length - APERCU} autres lignes</caption>}
    </table>
  )
}

// Colonnes d'un Excel que la lecture n'a pas reconnues : on les désigne
function ChoixColonnes({ feuilles, choix, onChoix }) {
  const feuille = feuilles.find((f) => f.nom === choix.feuille) ?? feuilles[0]
  const largeur = Math.max(1, ...(feuille?.grille ?? []).map((l) => l.reduce((n, c, x) => (c ? x + 1 : n), 0)))
  const apercu = (feuille?.grille ?? []).filter((l) => l.some(Boolean)).slice(0, 10)
  const menu = (cle, libelle, facultatif) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      {libelle}
      <select value={choix.colonnes[cle] ?? ''} aria-label={libelle}
        onChange={(e) => onChoix({ ...choix, colonnes: { ...choix.colonnes, [cle]: e.target.value === '' ? null : Number(e.target.value) } })}
        style={{ ...champ, height: 30, minHeight: 0 }}>
        {facultatif ? <option value="">aucune</option> : <option value="" disabled>—</option>}
        {Array.from({ length: largeur }, (_, x) => <option key={x} value={x}>{lettre(x)}</option>)}
      </select>
    </label>
  )
  return (
    <div style={{ marginTop: 8, padding: 10, background: '#FFFBEB', border: '0.5px solid #F59E0B' }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#92400E' }}>
        Les colonnes de ce tableau n’ont pas été reconnues : indiquez où se trouvent la désignation, l’unité et la quantité.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        {feuilles.length > 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            Feuille
            <select value={feuille?.nom ?? ''} onChange={(e) => onChoix({ ...choix, feuille: e.target.value })} style={{ ...champ, height: 30, minHeight: 0 }}>
              {feuilles.map((f) => <option key={f.nom} value={f.nom}>{f.nom}</option>)}
            </select>
          </label>
        )}
        {menu('numero', 'Numéro', true)}
        {menu('designation', 'Désignation')}
        {menu('unite', 'Unité')}
        {menu('quantite', 'Quantité')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#1F1B17', background: 'white' }}>
          <thead>
            <tr>{Array.from({ length: largeur }, (_, x) => <th key={x} style={{ padding: '2px 6px', color: '#9C9591', fontWeight: 600 }}>{lettre(x)}</th>)}</tr>
          </thead>
          <tbody>
            {apercu.map((l, r) => (
              <tr key={r}>
                {Array.from({ length: largeur }, (_, x) => (
                  <td key={x} style={{ padding: '2px 6px', border: '0.5px solid rgba(0,0,0,0.08)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l[x]?.texte ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Fichier({ entree, lots, pieces, dpgfDisponible, ecarte, onChange, onRetirer }) {
  const { fichier, etat, erreur, lu, cctp, dpgf, choix, garder, feuilles, colonnes } = entree
  const verrouille = etat === 'envoi' || etat === 'importe'
  const lotVise = choix?.mode === 'rattacher' ? choix.lotId : null
  const remplace = (type) => lotVise && pieces.find((p) => p.lot_id === lotVise && (p.type ?? 'cctp') === type)
  const caseType = (type, libelle, desactive, raison) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: desactive ? '#9C9591' : '#1F1B17' }}>
      <input type="checkbox" checked={!desactive && garder[type]} disabled={desactive || verrouille}
        onChange={(e) => onChange({ garder: { ...garder, [type]: e.target.checked } })} />
      {libelle}
      {raison && <span style={{ fontSize: 12, color: '#92400E' }}>— {raison}</span>}
    </label>
  )
  return (
    <li style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fichier.name}</p>
        {etat === 'importe' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2A8A4E' }}><Check size={14} /> Importé</span>}
        {!verrouille && (
          <button type="button" onClick={onRetirer} aria-label="Retirer ce fichier" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={15} /></button>
        )}
      </div>
      {etat === 'lecture' && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9C9591' }}>Lecture du fichier…</p>}
      {erreur && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
      {lu && (
        <>
          <p style={{ margin: '4px 0 8px', fontSize: 12, color: '#5E5854' }}>
            {lu.nbPages ? `${lu.nbPages} pages` : 'Tableau Excel'}
            {lu.indice ? ` · indice ${lu.indice}` : ''}
            {lu.lot ? ` · lu sur le document : ${titrePiece(lu.lot.numeroTexte ?? lu.lot.numero, lu.lot.nom)}` : ' · aucun lot lu sur le document'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {cctp && caseType('cctp', `CCTP · ${cctp.articles.length} article${cctp.articles.length > 1 ? 's' : ''}${cctp.articles[0]?.numero == null ? ' (numérotation non reconnue : découpé par page)' : ''}`)}
            {dpgf && caseType('dpgf', `DPGF · ${dpgf.lignes.length} ligne${dpgf.lignes.length > 1 ? 's' : ''}`,
              !dpgfDisponible || ecarte,
              !dpgfDisponible ? 'la migration 073 doit d’abord être passée dans Supabase' : ecarte ? 'l’Excel de ce DPGF est importé, plus fiable' : null)}
            {!cctp && !dpgf && !feuilles && <p style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>Ni article de CCTP ni tableau de DPGF trouvé dans ce fichier.</p>}
          </div>

          {feuilles && colonnes && (
            <ChoixColonnes feuilles={feuilles} choix={colonnes} onChoix={(c) => onChange({ colonnes: c })} />
          )}

          <fieldset disabled={verrouille} style={{ border: 'none', margin: '8px 0 0', padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="radio" checked={choix.mode === 'rattacher'} disabled={lots.length === 0}
                onChange={() => onChange({ choix: { mode: 'rattacher', lotId: choix.lotId ?? lots[0]?.id } })} />
              Rattacher au lot
              <select value={choix.mode === 'rattacher' ? choix.lotId ?? '' : ''} disabled={lots.length === 0}
                onChange={(e) => onChange({ choix: { mode: 'rattacher', lotId: e.target.value } })} style={{ ...champ, flex: 1, minWidth: 0 }}>
                {choix.mode !== 'rattacher' && <option value="">—</option>}
                {lots.map((l) => <option key={l.id} value={l.id}>{titrePiece(numeroLot(l), l.nom)}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
              <input type="radio" checked={choix.mode === 'creer'}
                onChange={() => onChange({ choix: creationProposee(lu.lot, lots) })} />
              Créer le lot n°
              <input type="text" inputMode="numeric" value={choix.mode === 'creer' ? choix.numero : ''} aria-label="Numéro du lot"
                onChange={(e) => onChange({ choix: { ...choix, mode: 'creer', numero: e.target.value.replace(/\D/g, '').slice(0, 4) } })} style={{ ...champ, width: 70, minHeight: 0 }} />
              <input type="text" value={choix.mode === 'creer' ? choix.nom : ''} placeholder="Nom du lot" aria-label="Nom du lot"
                onChange={(e) => onChange({ choix: { ...choix, mode: 'creer', nom: e.target.value } })} style={{ ...champ, flex: '1 1 180px', minHeight: 0 }} />
            </label>
          </fieldset>
          {['cctp', 'dpgf'].map((type) => {
            const ancienne = garder[type] && (type === 'cctp' ? cctp : dpgf && dpgfDisponible && !ecarte) && remplace(type)
            return ancienne && (
              <p key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0', fontSize: 12, color: '#92400E' }}>
                <AlertTriangle size={13} /> Ce lot a déjà un {type.toUpperCase()} (importé le {new Date(ancienne.importe_le).toLocaleDateString('fr-FR')}) : il sera remplacé.
              </p>
            )
          })}
          {cctp && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: '#5E5854', cursor: 'pointer' }}>Aperçu des articles du CCTP</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#1F1B17', maxHeight: 180, overflowY: 'auto' }}>
                {cctp.articles.slice(0, 40).map((a) => <li key={a.ordre}>{a.numero ? `${a.numero} ` : ''}{a.titre}</li>)}
                {cctp.articles.length > 40 && <li style={{ color: '#9C9591' }}>… et {cctp.articles.length - 40} autres</li>}
              </ul>
            </details>
          )}
          {dpgf && (
            <details style={{ marginTop: 8 }} open={!!feuilles && !!colonnes}>
              <summary style={{ fontSize: 12, color: '#5E5854', cursor: 'pointer' }}>Aperçu des lignes du DPGF</summary>
              <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}><ApercuDpgf lignes={dpgf.lignes} /></div>
            </details>
          )}
        </>
      )}
    </li>
  )
}

export function ImportPieces({ affaireId, lots, pieces, dpgfDisponible = true, onTermine, onFermer }) {
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

  const majEntree = (id, changement) => setEntrees((liste) => liste.map((e) => {
    if (e.id !== id) return e
    const suivante = { ...e, ...changement }
    // Colonnes désignées à la main : le tableau est relu aussitôt
    if (changement.colonnes && e.feuilles) {
      const choix = changement.colonnes
      const { designation, unite, quantite } = choix.colonnes
      const pret = designation != null && unite != null && quantite != null
      const lignes = pret ? lireDpgfExcel({ feuilles: e.feuilles, nomFichier: e.fichier.name, choix }).lignes : []
      suivante.dpgf = lignes.length ? { lignes } : null
    }
    return suivante
  }))

  const ajouter = async (fichiers) => {
    for (const fichier of [...fichiers].filter((f) => estPdf(f) || estTableur(f))) {
      const id = ++identifiant.current
      setEntrees((liste) => [...liste, { id, fichier, etat: 'lecture', garder: { cctp: true, dpgf: true } }])
      try {
        if (estTableur(fichier)) {
          const { feuilles, nomFichier } = await lireTableur(fichier)
          const lu = lireDpgfExcel({ feuilles, nomFichier })
          const reconnu = lu.lignes.length > 0
          majEntree(id, {
            etat: 'pret', nature: 'excel', lu: { lot: lu.lot, indice: lu.indice, nbPages: 0 },
            cctp: null, dpgf: reconnu ? { lignes: lu.lignes } : null,
            // Repli : désigner les colonnes, la première feuille non vide proposée
            feuilles: reconnu ? null : feuilles,
            colonnes: reconnu ? null : { feuille: feuilles.find((f) => f.grille.length)?.nom ?? feuilles[0]?.nom, colonnes: { numero: null, designation: null, unite: null, quantite: null } },
            choix: proposerLot(lu.lot, lots),
          })
        } else {
          const { pages, nomFichier } = await lirePdf(fichier)
          const lu = lirePdfPieces({ pages, nomFichier })
          majEntree(id, {
            etat: 'pret', nature: 'pdf', lu: { lot: lu.lot, indice: lu.indice, nbPages: lu.nbPages },
            cctp: lu.cctp ? { articles: lu.cctp.articles } : null,
            dpgf: lu.dpgf ? { lignes: lu.dpgf.lignes } : null,
            choix: proposerLot(lu.lot, lots),
          })
        }
      } catch (err) {
        majEntree(id, { etat: 'erreur', erreur: err?.message ?? String(err) })
      }
    }
  }

  // Le DPGF d'un PDF s'efface devant l'Excel du même lot
  const lotsExcel = new Set(entrees.filter((e) => e.nature === 'excel' && e.dpgf && e.garder.dpgf).map((e) => cleChoix(e.choix)))
  const ecarte = (e) => e.nature === 'pdf' && !!e.dpgf && lotsExcel.has(cleChoix(e.choix))
  const aImporter = (e) => [
    ...(e.cctp && e.garder.cctp ? ['cctp'] : []),
    ...(e.dpgf && e.garder.dpgf && dpgfDisponible && !ecarte(e) ? ['dpgf'] : []),
  ]

  const prets = entrees.filter((e) => e.etat === 'pret' && aImporter(e).length > 0)
  const choixValide = (c) => c && (c.mode === 'rattacher' ? !!c.lotId : !!lireNumeroSaisi(c.numero) && String(c.nom ?? '').trim())
  const nbPieces = prets.reduce((n, e) => n + aImporter(e).length, 0)

  const importer = async () => {
    setEnCours(true)
    setErreur(null)
    let lotsConnus = [...lots]
    // Deux fichiers qui créent le même lot n'en créent qu'un
    const crees = new Map()
    try {
      for (const e of prets) {
        majEntree(e.id, { etat: 'envoi' })
        let lotId = e.choix.lotId
        let numero
        let nom
        if (e.choix.mode === 'creer') {
          const saisi = lireNumeroSaisi(e.choix.numero)
          const deja = crees.get(saisi.numero)
          if (deja) {
            ({ lotId, numero, nom } = deja)
          } else {
            const libre = numeroLibre(saisi.numero, lotsConnus)
            // Le numéro saisi garde son zéro, sauf s'il a fallu en prendre un autre
            const numeroAffiche = libre === saisi.numero ? saisi.numero_affiche : null
            nom = String(e.choix.nom).trim()
            lotId = await creerLot(affaireId, { numero: libre, numero_affiche: numeroAffiche, nom })
            lotsConnus = [...lotsConnus, { id: lotId, numero: libre, numero_affiche: numeroAffiche, nom }]
            numero = numeroLot({ numero: libre, numero_affiche: numeroAffiche })
            crees.set(saisi.numero, { lotId, numero, nom })
          }
        } else {
          const lot = lotsConnus.find((l) => l.id === lotId)
          numero = numeroLot(lot)
          nom = lot?.nom
        }
        const commun = { affaireId, lotId, nomFichier: e.fichier.name, titre: titrePiece(numero, nom) }
        for (const type of aImporter(e)) {
          const lu = type === 'cctp'
            ? { ...e.lu, articles: e.cctp.articles }
            : { ...e.lu, lignes: e.dpgf.lignes }
          await enregistrerPiece({ ...commun, type, lu })
        }
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

  const tousImportes = entrees.length > 0 && entrees.every((e) => e.etat === 'importe' || e.etat === 'erreur' || (e.etat === 'pret' && aImporter(e).length === 0))
  const peutImporter = !enCours && prets.length > 0 && prets.every((e) => choixValide(e.choix))

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(32px + env(safe-area-inset-top)) 16px 32px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Importer des CCTP et DPGF"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 720, borderTop: '3px solid var(--affaire-accent, #E8602C)', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Importer des CCTP et DPGF</h2>
          <button type="button" onClick={onFermer} disabled={enCours} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); ajouter(e.dataTransfer.files) }}
            style={{ border: '1px dashed rgba(0,0,0,0.25)', background: 'white', padding: '18px 16px', textAlign: 'center' }}
          >
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5E5854' }}>
              Déposez ici les CCTP et DPGF, en PDF ou en Excel (plusieurs à la fois), ou
            </p>
            <button type="button" onClick={() => champFichiers.current?.click()} disabled={enCours}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 3, fontSize: 13, cursor: 'pointer' }}>
              <Upload size={15} /> Choisir des fichiers
            </button>
            <input ref={champFichiers} type="file" multiple style={{ display: 'none' }}
              accept="application/pdf,.pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { const f = e.target.files; ajouter(f); e.target.value = '' }} />
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9C9591' }}>
              Le fichier est lu sur cet appareil ; seuls son texte (CCTP) ou ses lignes, unités et quantités (DPGF) sont enregistrés — jamais les prix.
            </p>
          </div>

          {entrees.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entrees.map((e) => (
                <Fichier key={e.id} entree={e} lots={lots} pieces={pieces} dpgfDisponible={dpgfDisponible} ecarte={ecarte(e)}
                  onChange={(changement) => majEntree(e.id, changement)}
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
            <button type="button" onClick={importer} disabled={!peutImporter}
              style={{ minHeight: 40, padding: '0 18px', borderRadius: 3, border: 'none', background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: peutImporter ? 1 : 0.5 }}>
              {enCours ? 'Import…' : `Importer${nbPieces > 1 ? ` les ${nbPieces} pièces` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
