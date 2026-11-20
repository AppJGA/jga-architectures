import { useMemo, useState } from 'react'
import { ChevronRight, Expand, Spline, X } from 'lucide-react'
import { EditeurPieces } from './EditeurPieces'
import { useRevuePiece } from './analyse/useRevuePiece'
import { RevuePiece } from './analyse/RevuePiece'
import { SonRefuse } from './analyse/RelectureEdl'
import { piecesARelire, libellePointRelecture } from './analyse/relectureAnalyseLogique'
import { dessinPointRelecture, pxParMetreEcran } from './analyse/symbolesRelectureLogique'
import { TracePlan, PointPlan, ECART_COTE_PX, RAYON_TOUCHER_PX } from './visite/DessinsPlanEdl'
import { debutRelier, toucherRelier, consigneMode, COULEUR_COMMANDE } from './visite/tracesVisiteLogique'
import { piecesVisitees } from './visite/visiteLogique'
import {
  resoudreToucher, choixPiece, ouvrirPiece, voirEtage, cadreAffiche, opacitePoint, traceDeLaPiece, pieceSuivante, pieceDeLiaison,
  CONSIGNE_PLACEMENT,
} from './plansEdlLogique'

// ─── Onglet « Plans » : un seul plan par étage ───────────────────────────────
//
// Demande de l'agence (2026-11-20) : « un seul visionnage de plans avec
// toutes les options ». L'éditeur des pièces (contours, nom, numéro, dessin,
// suppression, ⌘Z) et, dès qu'une visite a eu lieu (`releve`), les relevés
// dessinés comme sur les planches : symbole sur un disque de sa famille,
// pastille numérotée pour un point sans type, liaisons et cotes, propositions
// en bleu. Un appui choisit un point (même d'une autre pièce, pâlie : sa
// pièce est choisie avec lui), sinon une trace, sinon la pièce
// (`resoudreToucher`). Point choisi : panneau ancré en haut du plan, avec
// « Relier » (mêmes règles que la visite, même écriture qu'« Ajouter une
// liaison »). Pièce choisie : nom et numéro, puis sa revue (`RevuePiece`).
// La pièce choisie et la pièce agrandie sont dans l'adresse (`adresse`,
// `onAdresse`, plansEdlLogique.js) : un rechargement y ramène.
// « Ajouter un élément » (panneau de la pièce) : le toucher suivant dans la
// pièce pose le point de l'élément (`revue.placer`), bandeau et Annuler en
// haut du plan ; changer de pièce annule l'ajout (le point posé est retiré).

const ROUGE = '#B8412C'
const petitBouton = { minHeight: 40, padding: '0 14px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }
const position = (p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y)) && p?.x != null && p?.y != null

export function PlansEdl({
  affaireId, niveau, pieces, visite, analyse, obtenirLiens, lectureSeule, releve,
  adresse, onAdresse, onModifier, onAjouter, onSupprimer, onAjouterPlusieurs, onRelecture,
}) {
  const fusionnees = useMemo(() => pieces.map((p) => {
    const a = analyse.pieces.get(p.id)
    return a ? { ...p, ...a } : p
  }), [pieces, analyse.pieces])
  const pieceChoisie = releve ? fusionnees.find((p) => p.id === adresse.pieceId) ?? null : null
  const revue = useRevuePiece({ affaireId, niveau, piece: pieceChoisie, visite, analyse })
  // Mode « Relier » (tracesVisiteLogique, le même que la visite) : ouvert
  // depuis le panneau du point choisi, fermé par Annuler ou la liaison posée
  const [relier, setRelier] = useState(null)

  // Le point posé pour un ajout se dessine avant que la copie de la visite ne soit relue
  const pointPose = revue.placement?.point ?? null
  const points = useMemo(() => {
    const liste = releve ? revue.points.filter(position) : []
    return pointPose && !liste.some((p) => p.id === pointPose.id) ? [...liste, pointPose] : liste
  }, [releve, revue.points, pointPose])
  const enPlacement = !!revue.placement && revue.placement.pieceId === adresse.pieceId
  const traces = releve ? revue.tracesNiveau : []
  const nbPhotos = useMemo(() => {
    const n = new Map()
    for (const ph of visite.donnees?.photos ?? []) n.set(ph.point_id, (n.get(ph.point_id) ?? 0) + 1)
    return n
  }, [visite.donnees?.photos])
  // Le symbole des planches de chaque point typé, à la place de sa pastille
  const symboles = useMemo(() => {
    const parId = new Map(pieces.map((pc) => [pc.id, pc]))
    return new Map(points.map((p) => [p.id, dessinPointRelecture(p, { elements: analyse.elements, piece: parId.get(p.piece_id) ?? null })]))
  }, [points, pieces, analyse.elements])
  const ordre = useMemo(() => {
    if (!releve) return []
    const visitees = piecesVisitees(visite.donnees?.entrees)
    return piecesARelire(fusionnees, analyse.elements, visitees, analyse.traces).map((l) => l.piece.id)
  }, [releve, fusionnees, analyse.elements, analyse.traces, visite.donnees?.entrees])
  const suivante = pieceSuivante(ordre, adresse.pieceId)
  const cadre = useMemo(() => cadreAffiche(adresse.cadreId, pieces, niveau), [adresse.cadreId, pieces, niveau])

  const pointPanneau = revue.pointChoisi ? points.find((p) => p.id === revue.pointChoisi) ?? null : null
  const peutRelier = (p) => !!p && analyse.tracesDisponibles && !lectureSeule && !!debutRelier(p, analyse.elements)

  // Un geste sur la pièce (liste, plan, « Dessiner une pièce ») : plus de
  // point, de trace ni de « Relier » en cours
  const oublierSelection = () => {
    if (revue.placement) revue.annulerAjout()
    setRelier(null)
    revue.setPointChoisi(null)
    revue.setTraceChoisie(null)
  }
  const choisirPiece = (id) => {
    oublierSelection()
    onAdresse(choixPiece(adresse, id), { replace: true })
  }
  const choisirAvecSaPiece = (pieceId) => {
    if (pieceId !== adresse.pieceId) onAdresse(choixPiece(adresse, pieceId), { replace: true })
  }

  // Toucher pendant « Relier » : le point compatible crée la liaison ;
  // ailleurs, rien, et le motif
  const relierA = (cible) => {
    if (!relier) return
    const r = toucherRelier(relier, cible, { points, traces, elements: analyse.elements })
    if (r.action === 'refus') { setRelier(r.mode); return }
    setRelier(null)
    revue.setPointChoisi(cible.id)
    revue.relier(r.interrupteur.id, r.luminaire.id, pieceDeLiaison(r, adresse.pieceId))
  }

  const toucher = (m, tolerance) => {
    // Ajout en cours : le toucher pose le point (une fois), rien d'autre
    if (revue.placement) { revue.placer(m, tolerance, pieces); return }
    const r = resoudreToucher({
      position: m, tolerance, points, traces, pieces, relier: !!relier,
      ecartCote: (tolerance * ECART_COTE_PX) / RAYON_TOUCHER_PX,
    })
    if (r.sorte === 'relier') { relierA(r.point); return }
    if (r.sorte === 'point') {
      choisirAvecSaPiece(r.pieceId)
      revue.setElementChoisi(null)
      revue.setTraceChoisie(null)
      revue.setPointChoisi(r.point.id)
      return
    }
    if (r.sorte === 'trace') {
      choisirAvecSaPiece(r.pieceId)
      revue.setElementChoisi(null)
      revue.setPointChoisi(null)
      revue.setTraceChoisie(r.trace.id)
      return
    }
    choisirPiece(r.pieceId)
  }

  const dessin = ({ enCalque, zoom }) => {
    const choisieId = adresse.pieceId
    const pxParMetre = pxParMetreEcran(enCalque)
    return (
      <>
        {traces.map((t) => (
          <TracePlan
            key={t.id} trace={t} points={points} enCalque={enCalque} zoom={zoom}
            contour={t.sorte === 'cote' ? pieces.find((pc) => pc.id === t.piece_id)?.contour : null}
            choisie={t.id === revue.traceChoisie} attenuee={!!choisieId && !traceDeLaPiece(t, choisieId, points)}
          />
        ))}
        {points.map((p) => {
          const [cx, cy] = enCalque([Number(p.x), Number(p.y)])
          return (
            <PointPlan
              key={p.id} point={p} cx={cx} cy={cy} zoom={zoom} dessin={symboles.get(p.id)} halo pxParMetre={pxParMetre}
              choisi={p.id === revue.pointEnEvidence} photos={nbPhotos.get(p.id) ?? 0} opacite={opacitePoint(p, choisieId)}
            />
          )
        })}
      </>
    )
  }

  const bandeauPlacement = enPlacement && (
    <div style={{
      position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 0 12px',
      background: 'white', border: '0.5px solid var(--affaire-accent, #E8602C)', borderRadius: 3, boxShadow: '0 4px 14px -6px rgba(31,27,23,0.35)',
    }}>
      <span role="status" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: revue.placement.raison ? ROUGE : 'var(--affaire-accent, #E8602C)' }}>
        {revue.placement.etape === 'formulaire'
          ? `Point P${revue.placement.point.numero} posé · complétez l’élément dans le panneau`
          : revue.placement.etape === 'pose' ? 'Point en cours d’enregistrement…' : (revue.placement.raison ?? CONSIGNE_PLACEMENT)}
      </span>
      <button type="button" onClick={() => revue.annulerAjout()} style={{ ...petitBouton, minHeight: 44, border: 'none' }}>Annuler</button>
    </div>
  )

  const bandeau = bandeauPlacement || ((relier || pointPanneau) && (
    <div style={{
      position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 0 12px',
      background: 'white', border: `0.5px solid ${relier ? COULEUR_COMMANDE : 'rgba(0,0,0,0.15)'}`, borderRadius: 3, boxShadow: '0 4px 14px -6px rgba(31,27,23,0.35)',
    }}>
      {relier ? (
        <>
          <span role="status" style={{ flex: 1, minWidth: 0, fontSize: 13, color: relier.raison ? ROUGE : COULEUR_COMMANDE, fontWeight: 600 }}>{consigneMode(relier)}</span>
          <button type="button" onClick={() => setRelier(null)} style={{ ...petitBouton, minHeight: 44, border: 'none' }}>Annuler</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {libellePointRelecture(pointPanneau, analyse.elements)}
          </span>
          {peutRelier(pointPanneau) && (
            <button type="button" onClick={() => setRelier(debutRelier(pointPanneau, analyse.elements))}
              title="Relier cet interrupteur au luminaire qu’il commande (ou l’inverse)"
              style={{ ...petitBouton, minHeight: 44, color: COULEUR_COMMANDE }}>
              <Spline size={15} /> Relier
            </button>
          )}
          <button type="button" aria-label="Fermer" onClick={() => revue.setPointChoisi(null)}
            style={{ ...petitBouton, minHeight: 44, border: 'none', width: 44, padding: 0, justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </>
      )}
    </div>
  ))

  const actions = (adresse.cadreId || suivante) ? (
    <>
      {adresse.cadreId && (
        <button type="button" style={petitBouton} onClick={() => onAdresse(voirEtage(adresse), { replace: true })}
          title="Revenir au plan de tout l’étage"><Expand size={14} />Voir tout l’étage</button>
      )}
      {suivante && (
        <button type="button" style={petitBouton} onClick={() => { oublierSelection(); onAdresse(ouvrirPiece(suivante), { replace: true }) }}
          title="La pièce suivante de la liste (à valider d’abord)">Pièce suivante <ChevronRight size={14} /></button>
      )}
    </>
  ) : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      {releve && !lectureSeule && <SonRefuse affaireId={affaireId} analyse={analyse} />}
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditeurPieces
          niveau={niveau} pieces={pieces} obtenirLiens={obtenirLiens} lectureSeule={lectureSeule}
          onModifier={onModifier} onAjouter={onAjouter} onSupprimer={onSupprimer}
          onAjouterPlusieurs={onAjouterPlusieurs} onRelecture={onRelecture}
          choisie={adresse.pieceId} onChoisir={choisirPiece} cadre={cadre} actions={actions}
          superposition={releve ? { dessin, toucher, bandeau, masquerPoignees: !!relier || !!revue.placement } : null}
          // Proposé dès qu'il y a des relevés, même sans pièce choisie : le
          // panneau garde sa largeur et le plan ne se recadre pas
          panneauPiece={releve ? () => (pieceChoisie ? <RevuePiece revue={revue} lectureSeule={lectureSeule} /> : null) : null}
        />
      </div>
    </div>
  )
}
