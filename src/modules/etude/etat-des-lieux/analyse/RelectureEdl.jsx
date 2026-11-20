import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, RefreshCw, Sparkles, Spline, X } from 'lucide-react'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { morceauxEtatsDesLieux, remettreEnFile } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { ECHECS_MAX } from '../../../chantier/comptes-rendus/enregistrement/transcription'
import { PlanVisite } from '../visite/PlanVisite'
import { COULEURS_PIECE, designationPiece, etatPieceVisite, piecesVisitees } from '../visite/visiteLogique'
import { validerElement, ecarterElement, ajouterElement, modifierFiche, validerTrace, ecarterTrace, ajouterLiaison, supprimerPoint, MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonnees'
import { piecesARelire, messageLancement, tracesRelecture, choixLiaisonRelecture, suiteEcartElement, suppressionPoint, pointsSansElement, libellePointRelecture } from './relectureAnalyseLogique'
import { dessinPointRelecture } from './symbolesRelectureLogique'
import { debutRelier, toucherRelier, consigneMode, COULEUR_COMMANDE } from '../visite/tracesVisiteLogique'
import { avecTypeEffectif } from '../tracesEdl'
import { FicheRelecture } from './FicheRelecture'
import { ElementsRelecture } from './ElementsRelecture'
import { TracesRelecture } from './TracesRelecture'
import { ConfirmationEdl } from './ConfirmationEdl'
import { morceauxRefuses } from './transcriptionEdlLogique'
import { EVENEMENT_TRANSCRIPTION_EDL } from './transcriptionEdl'
import { transcrireEtAnalyser } from './analyseEdl'

// ─── Relecture au bureau des pièces analysées (lot 3) ────────────────────────
//
// Par étage, la liste des pièces : à valider d'abord, puis les incomplètes,
// puis le reste. Une pièce ouverte : son plan agrandi à gauche (points
// numérotés comme en visite, liaisons et cotes dessinées), sa fiche, ses
// éléments puis ses liaisons et cotes (migration 084) à droite.
// Chaque écriture est relue par le hook de l'analyse (`analyse.relire`) :
// rien n'est calculé dans un setState(prev => …), l'écran montre la base.
// Un refus (0 ligne) remonte « Lecture seule… » des fonctions de données.

const AMBRE = { fond: '#FFFBEB', trait: '#F59E0B', texte: '#92400E' }
const ROUGE = '#B8412C'
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }
const noteAmbre = { margin: 0, maxWidth: 760, fontSize: 13, color: AMBRE.texte, background: AMBRE.fond, border: `0.5px solid ${AMBRE.trait}`, padding: '10px 14px' }
const alerteRouge = { margin: 0, fontSize: 13, color: ROUGE, background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }

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
function SonRefuse({ affaireId, analyse }) {
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

export function RelectureEdl({ affaireId, niveau, pieces, visite, analyse, obtenirLiens, lectureSeule, pieceId, onOuvrirPiece }) {
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

  const piece = fusionnees.find((p) => p.id === pieceId) ?? null
  if (piece) {
    const rang = liste.findIndex((l) => l.piece.id === piece.id)
    const suivante = liste[rang + 1]?.piece ?? null
    return (
      <div style={colonne}>
        {!lectureSeule && <SonRefuse affaireId={affaireId} analyse={analyse} />}
        <div style={{ flex: 1, minHeight: 0 }}>
          <VuePiece
            key={piece.id}
            affaireId={affaireId} niveau={niveau} pieces={fusionnees} piece={piece} etats={etats} visitees={visitees}
            visite={visite} analyse={analyse} obtenirLiens={obtenirLiens} lectureSeule={lectureSeule}
            suivante={suivante} onOuvrirPiece={onOuvrirPiece}
          />
        </div>
      </div>
    )
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

function VuePiece({ affaireId, niveau, pieces, piece, etats, visitees, visite, analyse, obtenirLiens, lectureSeule, suivante, onOuvrirPiece }) {
  const donnees = visite.donnees
  const [survol, setSurvol] = useState(null) // point de l'élément sous la souris
  const [elementChoisi, setElementChoisi] = useState(null)
  const [pointChoisi, setPointChoisi] = useState(null) // touché sur le plan
  const [traceChoisie, setTraceChoisie] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [message, setMessage] = useState(null)
  const [lancement, setLancement] = useState(false)
  const [confirmerRelance, setConfirmerRelance] = useState(false)
  // Mode « Relier » (tracesVisiteLogique, le même que la visite) : ouvert
  // depuis le panneau du point choisi, fermé par Annuler ou la liaison posée
  const [relier, setRelier] = useState(null)

  const points = useMemo(() => (donnees?.points ?? []).filter((p) => p.niveau_id === niveau.id), [donnees?.points, niveau.id])
  const nbPhotos = useMemo(() => {
    const n = new Map()
    for (const ph of donnees?.photos ?? []) n.set(ph.point_id, (n.get(ph.point_id) ?? 0) + 1)
    return n
  }, [donnees?.photos])
  const elements = useMemo(() => analyse.elements.filter((e) => e.piece_id === piece.id), [analyse.elements, piece.id])
  // Liaisons et cotes lues avec l'analyse (la base, pas la copie de la visite)
  const tracesNiveau = useMemo(() => (analyse.tracesDisponibles ? (analyse.traces ?? []).filter((t) => t.niveau_id === niveau.id) : []),
    [analyse.tracesDisponibles, analyse.traces, niveau.id])
  const traces = useMemo(() => tracesRelecture(tracesNiveau, piece.id, points), [tracesNiveau, piece.id, points])
  // Un point posé sans type prend celui de son élément relevé : les liaisons
  // le nomment ainsi et « Ajouter une liaison » le propose
  const pointsTypes = useMemo(() => avecTypeEffectif(points, analyse.elements), [points, analyse.elements])
  const choixLiaison = useMemo(() => choixLiaisonRelecture({ points, elements: analyse.elements, pieceId: piece.id }),
    [points, analyse.elements, piece.id])
  const pointElement = elements.find((e) => e.id === elementChoisi)?.point_id ?? null
  // Le symbole de chaque point typé à la place de sa pastille
  const symboles = useMemo(() => {
    const parId = new Map(pieces.map((pc) => [pc.id, pc]))
    return new Map(points.map((p) => [p.id, dessinPointRelecture(p, { elements: analyse.elements, piece: parId.get(p.piece_id) ?? null })]))
  }, [points, pieces, analyse.elements])
  const pointPanneau = pointChoisi ? points.find((p) => p.id === pointChoisi) ?? null : null
  const peutRelier = (p) => !!p && analyse.tracesDisponibles && !lectureSeule && !!debutRelier(p, analyse.elements)

  // Toucher pendant « Relier » : le point compatible crée la liaison (même
  // écriture que « Ajouter une liaison ») ; ailleurs, rien, et le motif
  const relierA = (cible) => {
    if (!relier) return
    const r = toucherRelier(relier, cible, { points, traces: tracesNiveau, elements: analyse.elements })
    if (r.action === 'refus') { setRelier(r.mode); return }
    setRelier(null)
    setPointChoisi(cible.id)
    ecrire(() => ajouterLiaison({
      affaireId, niveauId: piece.niveau_id ?? niveau.id, pieceId: piece.id, interrupteurId: r.interrupteur.id, luminaireId: r.luminaire.id,
    }))
  }
  const choisirPoint = (id) => {
    if (relier) { relierA(points.find((p) => p.id === id) ?? null); return }
    setElementChoisi(null)
    setTraceChoisie(null)
    setPointChoisi(id)
  }
  // Écarter le dernier élément d'un point emporte le point (photos et
  // liaisons comprises) ; les points déjà sans élément se suppriment à la main
  const photos = donnees?.photos
  const suiteEcart = useCallback(
    (element) => suiteEcartElement(element, { elements: analyse.elements, points, photos, traces: tracesNiveau }),
    [analyse.elements, points, photos, tracesNiveau],
  )
  const pointsSeuls = useMemo(() => pointsSansElement(points, analyse.elements, piece.id)
    .map((p) => ({ point: p, suppression: suppressionPoint(p, { photos, traces: tracesNiveau }) })),
  [points, analyse.elements, piece.id, photos, tracesNiveau])
  const pointEnEvidence = survol ?? pointElement ?? pointChoisi

  const enAnalyse = analyse.enCours === piece.id || lancement
  const etat = etats.get(piece.id)
  const visitee = visitees.has(piece.id)

  // Écrire puis relire : l'écran suit toujours la base. Rend vrai si
  // l'écriture est passée ; sinon le motif s'affiche en rouge
  const ecrire = async (travail) => {
    setErreur(null)
    try {
      const r = await travail()
      if (r?.indisponible) { setErreur(MESSAGE_ANALYSE_INDISPONIBLE); return false }
      return true
    } catch (err) {
      setErreur(err?.message ?? String(err))
      return false
    } finally {
      await analyse.relire()
    }
  }

  // Le point part de la base ; la copie de la visite (relue en ligne,
  // instantané remplacé) suit, sans quoi la pastille resterait sur le plan
  const retirerPoint = async (pointId, options) => {
    try {
      return await supprimerPoint(pointId, options)
    } finally {
      if (pointChoisi === pointId) setPointChoisi(null)
      await visite.recharger?.()
    }
  }

  const lancer = async (action) => {
    setMessage(null)
    setLancement(true)
    try {
      setMessage(messageLancement(await action(piece.id)))
    } catch (err) {
      setMessage(err?.message ?? String(err))
    } finally {
      setLancement(false)
      await analyse.relire()
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onOuvrirPiece(null)} style={bouton}><ArrowLeft size={15} /> Pièces de l’étage</button>
        <Pastille etat={etat} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>{designationPiece(piece)}</h2>
        <span style={{ flex: 1 }} />
        {enAnalyse && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: COULEUR_IA }}>
            <Sparkles size={14} /> Analyse en cours…
          </span>
        )}
        {!lectureSeule && visitee && !enAnalyse && !piece.analyse_erreur && (
          <button type="button" onClick={() => setConfirmerRelance(true)} style={bouton}><RefreshCw size={14} /> Relancer l’analyse</button>
        )}
        {suivante && (
          <button type="button" onClick={() => onOuvrirPiece(suivante.id)} style={bouton}>Pièce suivante <ChevronRight size={15} /></button>
        )}
      </div>

      {piece.analyse_erreur && (
        <p role="alert" style={alerteRouge}>
          <span style={{ flex: 1 }}>L’analyse de cette pièce a échoué : {piece.analyse_erreur}</span>
          {!lectureSeule && (
            <button type="button" disabled={enAnalyse} onClick={() => lancer(analyse.reessayer)}
              style={{ ...bouton, border: 'none', background: 'none', color: ROUGE, fontWeight: 600 }}>
              <RefreshCw size={14} /> Réessayer
            </button>
          )}
        </p>
      )}
      {message && (
        <p role="status" style={{ ...noteAmbre, maxWidth: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>{message}</span>
          <button type="button" onClick={() => setMessage(null)} style={{ ...bouton, border: 'none', background: 'none', color: AMBRE.texte }}>Fermer</button>
        </p>
      )}
      {erreur && (
        <p role="alert" style={alerteRouge}>
          <span style={{ flex: 1 }}>{erreur}</span>
          <button type="button" onClick={() => setErreur(null)} style={{ ...bouton, border: 'none', background: 'none', color: ROUGE }}>Fermer</button>
        </p>
      )}

      {/* Pas de flex-wrap autour du plan : une longue liste d'éléments
          étirerait la rangée et le plan sortirait de l'écran */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 440px)', gap: 12 }}>
        <div style={{ minHeight: 0, position: 'relative', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 3, overflow: 'hidden' }}>
          <PlanVisite
            key={niveau.id}
            niveau={niveau} pieces={pieces} points={points} nbPhotos={nbPhotos} visitees={visitees} etats={etats}
            piece={piece} pointId={pointEnEvidence} obtenirLiens={obtenirLiens} consultation symboles={symboles}
            traces={tracesNiveau} traceId={traceChoisie} mode={relier}
            onChoisirPoint={choisirPoint}
            onToucher={relier ? () => relierA(null) : undefined}
            onChoisirTrace={(id) => { setElementChoisi(null); setPointChoisi(null); setTraceChoisie((c) => (c === id ? null : id)) }}
          />
          {(relier || pointPanneau) && (
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 0 12px',
              background: 'white', border: `0.5px solid ${relier ? COULEUR_COMMANDE : 'rgba(0,0,0,0.15)'}`, borderRadius: 3, boxShadow: '0 4px 14px -6px rgba(31,27,23,0.35)',
            }}>
              {relier ? (
                <>
                  <span role="status" style={{ flex: 1, minWidth: 0, fontSize: 13, color: relier.raison ? ROUGE : COULEUR_COMMANDE, fontWeight: 600 }}>{consigneMode(relier)}</span>
                  <button type="button" onClick={() => setRelier(null)} style={{ ...bouton, border: 'none' }}>Annuler</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {libellePointRelecture(pointPanneau, analyse.elements)}
                  </span>
                  {peutRelier(pointPanneau) && (
                    <button type="button" onClick={() => setRelier(debutRelier(pointPanneau, analyse.elements))}
                      title="Relier cet interrupteur au luminaire qu’il commande (ou l’inverse)"
                      style={{ ...bouton, color: COULEUR_COMMANDE }}>
                      <Spline size={15} /> Relier
                    </button>
                  )}
                  <button type="button" aria-label="Fermer" onClick={() => setPointChoisi(null)}
                    style={{ ...bouton, border: 'none', width: 44, padding: 0, justifyContent: 'center' }}>
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 2 }}>
          {!visitee && !piece.analyse_le && (
            <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Cette pièce n’a pas encore été visitée.</p>
          )}
          {visitee && !piece.analyse_le && !piece.analyse_erreur && !enAnalyse && (
            <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>
              La pièce n’a pas encore été analysée : l’analyse part d’elle-même une fois la visite de la pièce envoyée et transcrite.
            </p>
          )}
          <FicheRelecture
            key={piece.id}
            piece={piece} lectureSeule={lectureSeule}
            onEnregistrer={(fiche) => ecrire(() => modifierFiche(piece.id, fiche, { valider: true }))}
          />
          <ElementsRelecture
            piece={piece} elements={elements} points={points} lectureSeule={lectureSeule}
            elementChoisi={elementChoisi} pointChoisi={pointChoisi}
            onSurvol={setSurvol}
            onChoisir={(id) => { setPointChoisi(null); setTraceChoisie(null); setElementChoisi((c) => (c === id ? null : id)) }}
            onValider={(id, champs) => ecrire(() => validerElement(id, champs))}
            onEcarter={(id, suite) => ecrire(async () => {
              const r = await ecarterElement(id)
              if (!r?.indisponible && suite) await retirerPoint(suite.pointId, { siSansElement: true })
              return r
            })}
            suiteEcart={suiteEcart} pointsSeuls={pointsSeuls}
            onSupprimerPoint={(suppression) => ecrire(() => retirerPoint(suppression.pointId))}
            onAjouter={(champs) => ecrire(() => ajouterElement({ ...champs, affaire_id: affaireId, niveau_id: piece.niveau_id ?? niveau.id, piece_id: piece.id }))}
          />
          {analyse.tracesDisponibles && (
            <TracesRelecture
              traces={traces} points={pointsTypes} lectureSeule={lectureSeule} traceChoisie={traceChoisie}
              onChoisir={(id) => { setElementChoisi(null); setPointChoisi(null); setTraceChoisie((c) => (c === id ? null : id)) }}
              onValider={(trace, champs) => ecrire(() => validerTrace(trace, champs))}
              onEcarter={(trace) => ecrire(() => ecarterTrace(trace))}
              choix={choixLiaison}
              onRelier={(interrupteurId, luminaireId) => ecrire(() => ajouterLiaison({
                affaireId, niveauId: piece.niveau_id ?? niveau.id, pieceId: piece.id, interrupteurId, luminaireId,
              }))}
            />
          )}
        </div>
      </div>

      {confirmerRelance && (
        <ConfirmationEdl
          titre="Relancer l’analyse de la pièce ?"
          texte="Claude relit tout ce qui a été dit et fait dans la pièce, toutes visites confondues. Les éléments, liaisons et cotes déjà validés ou ajoutés à la main sont gardés, et Claude repart de la fiche telle que vous l’avez corrigée ; les propositions encore à valider sont remplacées par les nouvelles."
          libelle="Relancer l’analyse" libelleEnCours="Analyse en cours…"
          onAnnuler={() => setConfirmerRelance(false)}
          onConfirmer={() => { setConfirmerRelance(false); return lancer(analyse.relancer) }}
        />
      )}
    </div>
  )
}
