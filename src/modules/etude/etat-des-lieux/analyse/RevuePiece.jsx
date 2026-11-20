import { useMemo } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { validerElement, ecarterElement, ajouterElement, modifierFiche, validerTrace, ecarterTrace, MESSAGE_ANALYSE_INDISPONIBLE } from './analyseDonnees'
import { useRevuePiece } from './useRevuePiece'
import { FicheRelecture } from './FicheRelecture'
import { ElementsRelecture } from './ElementsRelecture'
import { TracesRelecture } from './TracesRelecture'
import { ConfirmationEdl } from './ConfirmationEdl'

// ─── Revue d'une pièce : fiche, éléments, liaisons et cotes ──────────────────
//
// Le bloc commun aux deux endroits où l'on relit une pièce : l'onglet
// « État des lieux » (RelectureEdl, à côté du plan de la pièce) et le
// panneau de la pièce choisie dans « Fond de plans » (demande de l'agence,
// 2026-11-20 : retrouver la pièce dans l'autre onglet était fastidieux).
// Un seul état (`useRevuePiece.js`) et les mêmes écritures des deux côtés.

const AMBRE = { fond: '#FFFBEB', trait: '#F59E0B', texte: '#92400E' }
const ROUGE = '#B8412C'
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }
const noteAmbre = { margin: 0, fontSize: 13, color: AMBRE.texte, background: AMBRE.fond, border: `0.5px solid ${AMBRE.trait}`, padding: '10px 14px' }
const alerteRouge = { margin: 0, fontSize: 13, color: ROUGE, background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }
const discret = { margin: 0, fontSize: 13, color: '#9C9591' }
const enLigne = () => typeof navigator === 'undefined' || navigator.onLine !== false

/** « Analyse en cours… » ou « Relancer l'analyse » (confirmée : elle se paie). */
export function EtatAnalyseRevue({ revue, lectureSeule }) {
  const { piece, enAnalyse, visitee } = revue
  if (enAnalyse) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 12, color: COULEUR_IA }}>
        <Sparkles size={14} /> Analyse en cours…
      </span>
    )
  }
  if (lectureSeule || !visitee || piece.analyse_erreur) return null
  return <button type="button" onClick={() => revue.setConfirmerRelance(true)} style={bouton}><RefreshCw size={14} /> Relancer l’analyse</button>
}

/** Échec de l'analyse (avec « Réessayer »), message d'un lancement, erreur d'écriture. */
export function AvisRevue({ revue, lectureSeule }) {
  const { piece, message, erreur, enAnalyse } = revue
  return (
    <>
      {piece.analyse_erreur && (
        <p role="alert" style={alerteRouge}>
          <span style={{ flex: '1 1 160px' }}>L’analyse de cette pièce a échoué : {piece.analyse_erreur}</span>
          {!lectureSeule && (
            <button type="button" disabled={enAnalyse} onClick={() => revue.lancer(revue.analyse.reessayer)}
              style={{ ...bouton, border: 'none', background: 'none', color: ROUGE, fontWeight: 600 }}>
              <RefreshCw size={14} /> Réessayer
            </button>
          )}
        </p>
      )}
      {message && (
        <p role="status" style={{ ...noteAmbre, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 160px' }}>{message}</span>
          <button type="button" onClick={() => revue.setMessage(null)} style={{ ...bouton, border: 'none', background: 'none', color: AMBRE.texte }}>Fermer</button>
        </p>
      )}
      {erreur && (
        <p role="alert" style={alerteRouge}>
          <span style={{ flex: '1 1 160px' }}>{erreur}</span>
          <button type="button" onClick={() => revue.setErreur(null)} style={{ ...bouton, border: 'none', background: 'none', color: ROUGE }}>Fermer</button>
        </p>
      )}
    </>
  )
}

/** Fiche, éléments (et points sans élément), liaisons et cotes. */
export function ContenuRevue({ revue, lectureSeule }) {
  const { piece, visitee, enAnalyse, analyse } = revue
  return (
    <>
      {!visitee && !piece.analyse_le && (
        <p style={discret}>Cette pièce n’a pas encore été visitée.</p>
      )}
      {visitee && !piece.analyse_le && !piece.analyse_erreur && !enAnalyse && (
        <p style={discret}>
          La pièce n’a pas encore été analysée : l’analyse part d’elle-même une fois la visite de la pièce envoyée et transcrite.
        </p>
      )}
      <FicheRelecture
        key={piece.id}
        piece={piece} lectureSeule={lectureSeule}
        onEnregistrer={(fiche) => revue.ecrire(() => modifierFiche(piece.id, fiche, { valider: true }))}
      />
      <ElementsRelecture
        piece={piece} elements={revue.elements} points={revue.points} lectureSeule={lectureSeule}
        elementChoisi={revue.elementChoisi} pointChoisi={revue.pointChoisi}
        onSurvol={revue.setSurvol}
        onChoisir={revue.choisirElement}
        onValider={(id, champs) => revue.ecrire(() => validerElement(id, champs))}
        onEcarter={(id, suite) => revue.ecrire(async () => {
          const r = await ecarterElement(id)
          if (!r?.indisponible && suite) await revue.retirerPoint(suite.pointId, { siSansElement: true })
          return r
        })}
        suiteEcart={revue.suiteEcart} pointsSeuls={revue.pointsSeuls}
        onSupprimerPoint={(suppression) => revue.ecrire(() => revue.retirerPoint(suppression.pointId))}
        onAjouter={(champs) => revue.ecrire(() => ajouterElement({ ...champs, affaire_id: revue.affaireId, niveau_id: revue.niveauId, piece_id: piece.id }))}
      />
      {analyse.tracesDisponibles && (
        <TracesRelecture
          traces={revue.traces} points={revue.pointsTypes} lectureSeule={lectureSeule} traceChoisie={revue.traceChoisie}
          onChoisir={revue.choisirTrace}
          onValider={(trace, champs) => revue.ecrire(() => validerTrace(trace, champs))}
          onEcarter={(trace) => revue.ecrire(() => ecarterTrace(trace))}
          choix={revue.choixLiaison}
          onRelier={revue.relier}
        />
      )}
    </>
  )
}

/** Fenêtre de confirmation de « Relancer l'analyse ». */
export function ConfirmationRelance({ revue }) {
  if (!revue.confirmerRelance) return null
  return (
    <ConfirmationEdl
      titre="Relancer l’analyse de la pièce ?"
      texte="Claude relit tout ce qui a été dit et fait dans la pièce, toutes visites confondues. Les éléments, liaisons et cotes déjà validés ou ajoutés à la main sont gardés, et Claude repart de la fiche telle que vous l’avez corrigée ; les propositions encore à valider sont remplacées par les nouvelles."
      libelle="Relancer l’analyse" libelleEnCours="Analyse en cours…"
      onAnnuler={() => revue.setConfirmerRelance(false)}
      onConfirmer={() => { revue.setConfirmerRelance(false); return revue.lancer(revue.analyse.relancer) }}
    />
  )
}

/**
 * La revue d'une pièce dans le panneau de « Fond de plans » : `piece` est
 * la pièce de l'éditeur, les champs de l'analyse sont posés par-dessus ici.
 * Une pièce qui n'a encore rien à relire (`pieceSansRevue`) se réduit à
 * « Pas encore visitée » ; sans la migration 082, le même message que
 * l'onglet « État des lieux ».
 */
export function RevuePiece({ affaireId, niveau, piece: brute, visite, analyse, lectureSeule }) {
  const a = analyse.pieces.get(brute.id)
  const piece = useMemo(() => (a ? { ...brute, ...a } : brute), [brute, a])
  const revue = useRevuePiece({ affaireId, niveau, piece, visite, analyse })

  let contenu
  if (analyse.indisponible) contenu = <p style={noteAmbre}>{MESSAGE_ANALYSE_INDISPONIBLE}</p>
  else if (!analyse.charge) contenu = <p style={discret}>{enLigne() ? 'Lecture de l’analyse…' : 'Sans réseau, l’analyse n’a pas pu être lue.'}</p>
  else if (revue.sansRevue && !revue.enAnalyse) contenu = <p style={discret}>Pas encore visitée.</p>
  else {
    contenu = (
      <>
        <AvisRevue revue={revue} lectureSeule={lectureSeule} />
        <ContenuRevue revue={revue} lectureSeule={lectureSeule} />
        <ConfirmationRelance revue={revue} />
      </>
    )
  }
  const pret = analyse.charge && !analyse.indisponible && (!revue.sansRevue || revue.enAnalyse)

  return (
    <section aria-label="État des lieux de la pièce" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '0.5px solid rgba(0,0,0,0.1)', paddingBottom: 6 }}>
        <h3 style={{ flex: '1 1 140px', margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--affaire-accent, #E8602C)' }}>
          État des lieux de la pièce
        </h3>
        {pret && <EtatAnalyseRevue revue={revue} lectureSeule={lectureSeule} />}
      </div>
      {contenu}
    </section>
  )
}
