import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { morceauxEtatsDesLieux, remettreEnFile } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { ECHECS_MAX } from '../../../chantier/comptes-rendus/enregistrement/transcription'
import { COULEURS_PIECE, designationPiece, etatPieceVisite, piecesVisitees } from '../visite/visiteLogique'
import { MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonnees'
import { piecesARelire } from './relectureAnalyseLogique'
import { morceauxRefuses } from './transcriptionEdlLogique'
import { EVENEMENT_TRANSCRIPTION_EDL } from './transcriptionEdl'
import { transcrireEtAnalyser } from './analyseEdl'

// ─── Onglet « État des lieux » : la liste des pièces de l'étage (lot 3) ──────
//
// À valider d'abord, puis les incomplètes, puis le reste, chacune avec son
// état et ce qu'elle attend. Toucher une pièce ouvre l'onglet « Plans » sur
// elle (choisie et cadrée, `onOuvrirPiece`) : il n'y a plus qu'un plan, où
// se relisent fiche, éléments, liaisons et cotes (demande de l'agence,
// 2026-11-20).

const AMBRE = { fond: '#FFFBEB', trait: '#F59E0B', texte: '#92400E' }
const ROUGE = '#B8412C'
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }
const noteAmbre = { margin: 0, maxWidth: 760, fontSize: 13, color: AMBRE.texte, background: AMBRE.fond, border: `0.5px solid ${AMBRE.trait}`, padding: '10px 14px' }

const colonne = { height: '100%', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }
const enLigne = () => typeof navigator === 'undefined' || navigator.onLine !== false

// Ce que dit la ligne d'une pièce, d'après son état et ce qu'elle attend
function statutPiece({ resume, etat }) {
  if (resume.aValider > 0) return { texte: `${resume.aValider} à valider`, couleur: COULEUR_IA, gras: true }
  if (etat === 'echec') return { texte: 'analyse en échec', couleur: ROUGE }
  if (etat === 'attente') return { texte: 'analyse en attente', couleur: '#9C9591' }
  if (etat === 'incomplete') return { texte: 'fiche incomplète', couleur: AMBRE.texte }
  if (etat === 'complete') return { texte: 'relue', couleur: '#2A8A4E' }
  if (etat === 'non-visitee') return { texte: 'non visitée', couleur: '#9C9591' }
  return { texte: '', couleur: '#9C9591' }
}

// Son de l'affaire mis de côté sur cet appareil (refusé ECHECS_MAX fois) :
// il n'est plus retenté de lui-même et sa parole manque à l'analyse. Seul
// ce geste le reprend : échecs remis à zéro, transcription, puis analyse.
export function SonRefuse({ affaireId, analyse }) {
  const [refuses, setRefuses] = useState({ affaireId: null, ids: [] })
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState(null)
  const compter = useCallback(async () => {
    try {
      const ids = morceauxRefuses(await morceauxEtatsDesLieux(), affaireId, ECHECS_MAX).map((m) => m.id)
      setRefuses({ affaireId, ids })
    } catch { /* base de l'appareil illisible : rien à proposer */ }
  }, [affaireId])
  useEffect(() => {
    let vivant = true
    Promise.resolve().then(() => { if (vivant) compter() })
    window.addEventListener(EVENEMENT_TRANSCRIPTION_EDL, compter)
    return () => { vivant = false; window.removeEventListener(EVENEMENT_TRANSCRIPTION_EDL, compter) }
  }, [compter])

  const ids = refuses.affaireId === affaireId ? refuses.ids : []
  if (!ids.length && !message) return null
  const reessayer = async () => {
    setEnCours(true)
    setMessage(null)
    try {
      await remettreEnFile(ids)
      if (!enLigne()) setMessage('Pas de réseau : le son partira au retour du réseau.')
      else await transcrireEtAnalyser(affaireId)
    } catch (err) {
      setMessage(err?.message ?? String(err))
    } finally {
      setEnCours(false)
      await compter()
      await analyse.relire()
    }
  }
  const n = ids.length
  return (
    <p role="status" style={{ ...noteAmbre, maxWidth: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1 }}>
        {n > 0
          ? `${n} morceau${n > 1 ? 'x' : ''} de son refusé${n > 1 ? 's' : ''} par la transcription sur cet appareil : ce qui y a été dit manque à l’analyse.`
          : message}
        {n > 0 && message ? ` ${message}` : ''}
      </span>
      {n > 0 && (
        <button type="button" disabled={enCours} onClick={reessayer} style={{ ...bouton, color: AMBRE.texte, borderColor: AMBRE.trait, opacity: enCours ? 0.6 : 1 }}>
          <RefreshCw size={14} /> {enCours ? 'Envoi…' : 'Réessayer le son refusé'}
        </button>
      )}
      {n === 0 && (
        <button type="button" onClick={() => setMessage(null)} style={{ ...bouton, border: 'none', background: 'none', color: AMBRE.texte }}>Fermer</button>
      )}
    </p>
  )
}

const Pastille = ({ etat }) => (
  <span aria-hidden="true" style={{
    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
    background: (COULEURS_PIECE[etat] ?? COULEURS_PIECE.visitee).trait,
  }} />
)

export function RelectureEdl({ affaireId, pieces, visite, analyse, lectureSeule, onOuvrirPiece }) {
  const donnees = visite.donnees
  const visitees = useMemo(() => piecesVisitees(donnees?.entrees), [donnees?.entrees])
  // L'état de l'analyse lu en ligne posé sur les pièces du plan
  const fusionnees = useMemo(() => (pieces ?? []).map((p) => {
    const a = analyse.pieces.get(p.id)
    return a ? { ...p, ...a } : p
  }), [pieces, analyse.pieces])
  const etats = useMemo(() => new Map(fusionnees.map((p) => [
    p.id, etatPieceVisite(p, { visitees, entrees: donnees?.entrees, enCours: analyse.enCours }),
  ])), [fusionnees, visitees, donnees?.entrees, analyse.enCours])
  const liste = useMemo(() => piecesARelire(fusionnees, analyse.elements, visitees, analyse.traces), [fusionnees, analyse.elements, visitees, analyse.traces])

  if (analyse.indisponible) return <p style={noteAmbre}>{MESSAGE_ANALYSE_INDISPONIBLE}</p>
  if (!analyse.charge) {
    return <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>{enLigne() ? 'Lecture de l’analyse…' : 'Sans réseau, l’analyse n’a pas pu être lue.'}</p>
  }

  if (!liste.length) return <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Aucune pièce sur cet étage.</p>
  return (
    <div style={colonne}>
      {!lectureSeule && <SonRefuse affaireId={affaireId} analyse={analyse} />}
      <ul aria-label="Pièces de l’étage" style={{ margin: 0, padding: 0, flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, alignContent: 'start' }}>
        {liste.map(({ piece: p, resume, visitee }) => {
          const etat = etats.get(p.id)
          const statut = statutPiece({ resume, etat })
          return (
            <li key={p.id} style={{ listStyle: 'none' }}>
              <button type="button" onClick={() => onOuvrirPiece(p.id)}
                style={{
                  width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left',
                  background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 3, cursor: 'pointer', opacity: visitee ? 1 : 0.6,
                  ...(resume.aValider > 0 ? { borderLeft: `3px solid ${COULEUR_IA}` } : null),
                }}>
                <Pastille etat={etat} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {designationPiece(p)}
                </span>
                <span style={{ fontSize: 12, color: statut.couleur, fontWeight: statut.gras ? 600 : 400, whiteSpace: 'nowrap' }}>{statut.texte}</span>
                <ChevronRight size={15} color="#9C9591" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
