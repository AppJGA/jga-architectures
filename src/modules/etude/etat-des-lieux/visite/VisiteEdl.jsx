import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Undo2, Mic, ChevronLeft, Square, ListChecks, Ruler, Spline, Trash2, Pencil } from 'lucide-react'
import { useEnregistrementEdl } from './useEnregistrementEdl'
import { enregistrementActif } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'
import {
  pieceSous, piecesVisitees, visiteEnCours, evenementPourEtat, messageArret, designationPiece, arrondirMetre,
  etatPieceVisite,
} from './visiteLogique'
import { apresSortieDePiece } from '../analyse/analyseEdl'
import { typeEdl } from '../calquesEdl'
import { aire } from '../geometrieEdl'
import { PlanVisite } from './PlanVisite'
import { BandeauEnregistrement } from './BandeauEnregistrement'
import { PanneauPoint } from './PanneauPoint'
import { AideMemoireEdl } from './AideMemoireEdl'
import { aideMemoire, memoriserOuverture, ouvrirAChaqueEntree } from './aideMemoireLogique'
import {
  debutRelier, toucherRelier, libelleTrace, gesteSuppressionPoint, toucherAngle, detailMurTouche, texteAide,
  COULEUR_COMMANDE, COULEUR_COTE, DUREE_MUR_ALLUME_MS, DUREE_AIDE_MS,
} from './tracesVisiteLogique'
import { valeurCote, texteValeur, typeEffectif } from '../tracesEdl'

// ─── Visite d'un état des lieux, sur la tablette ─────────────────────────────
//
// Conception § 5. « Démarrer la visite » ouvre le micro (dans le geste :
// Safari n'ouvre l'écoute du niveau que là) et l'enregistrement court jusqu'à
// « Terminer la visite ». Toucher une pièce l'agrandit ; tout point posé lui
// appartient, même sur une cloison ; « Sortir de la pièce » ramène à l'étage.
// Chaque entrée et sortie coupe le morceau audio en cours. Dès que rien n'est
// enregistré (pause, micro coupé, échec), le plan est grisé et les gestes
// bloqués, sauf « Reprendre l'enregistrement ». Chaque geste est noté au
// journal avec l'heure de l'appareil.
//
// Lot 3 : chaque sortie de pièce (et la fin de la visite) fait partir, avec
// du réseau et sans attendre, les gestes, le son puis l'analyse des pièces
// prêtes ; les pièces prennent la couleur de leur analyse et le pense-bête
// se coche d'après la fiche. Sans réseau, rien ne change : tout part au
// retour du réseau (moteur de synchro de l'app).
//
// Liaisons et cotes (migration 084, masquées sans elle) : « Relier » depuis
// le panneau d'un interrupteur ou d'un luminaire ; pendant ce mode, la barre
// de la pièce dit quoi toucher (et pourquoi un toucher n'a rien donné) ;
// Annuler ou Échap le quittent. Plus de bouton « Coter » (agence,
// 2026-11-20) : toucher pile un angle de la pièce l'allume (~20 s), un
// second angle crée la cote aussitôt et ouvre le champ de sa valeur ; tout
// autre toucher éteint le premier angle. Toucher pile un mur l'allume
// quelques secondes et, avec la 085, le note (`mur-touche`) : la finition
// dite autour est lue à l'analyse, rien n'est créé ici. Tout toucher d'un
// point existant est noté au journal (`point-touche`), chaque angle de cote
// aussi (`angle-touche`) : l'analyse les rapproche de ce qui est dit. Une
// trace créée, modifiée ou supprimée s'annule comme un point.
//
// Textes d'aide (`texteAide`, validés par l'agence) : un bandeau discret en
// haut du plan, qui ne capte pas le doigt et s'efface seul (celui du premier
// angle tant qu'il est allumé) ; jamais par-dessus le voile gris ni les
// bandeaux d'alerte.
//
// Barre de la pièce et panneau du point restent toujours montés, à hauteur
// fixe, et les messages s'affichent par-dessus le plan : la visionneuse ne
// change jamais de taille, une pièce agrandie ou un pincement ne sont pas
// défaits.

const ACCENT = 'var(--affaire-accent, #E8602C)'
const bouton = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.18)', background: 'white',
  color: '#1F1B17', fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
}
const boutonPlein = { ...bouton, border: 'none', background: ACCENT, color: 'white', fontWeight: 600 }
const ligneAlerte = {
  margin: 0, fontSize: 13, color: '#B8412C', background: '#FDF2F0', borderBottom: '0.5px solid rgba(184,65,44,0.4)',
  padding: '0 16px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8,
}
const ligneAmbre = { ...ligneAlerte, color: '#92400E', background: '#FFFBEB', borderBottom: '0.5px solid #F59E0B' }
const HISTORIQUE_MAX = 50
const fmtM2 = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`
const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const texteErreur = (err) => err?.message ?? String(err)
// L'heure d'un geste, lue dans les gestionnaires (jamais pendant le rendu)
const maintenant = () => Date.now()

function ConfirmerFin({ onConfirmer, onAnnuler }) {
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler])
  // Aucun clic sur le fond : seuls ✕, « Continuer la visite » et Échap ferment
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(80px + env(safe-area-inset-top)) 16px 32px' }}>
      <div role="alertdialog" aria-modal="true" aria-label="Terminer la visite" style={{ background: '#FAF7F2', width: '100%', maxWidth: 440, borderTop: `3px solid ${ACCENT}`, boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Terminer la visite ?</h2>
          <button type="button" onClick={onAnnuler} aria-label="Fermer" style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </div>
        <p style={{ margin: 0, padding: '16px 20px', fontSize: 13, color: '#5E5854' }}>
          L’enregistrement s’arrête. Points, photos et enregistrement restent sur la tablette jusqu’à leur envoi ; une autre visite pourra compléter celle-ci.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onAnnuler} style={bouton}>Continuer la visite</button>
          <button type="button" onClick={onConfirmer} style={boutonPlein}><Square size={15} /> Terminer</button>
        </div>
      </div>
    </div>
  )
}

// Petits panneaux posés en haut à gauche du plan (le clavier de l'iPad couvre
// le bas ; l'aide-mémoire est à droite). Dans le flux de la colonne posée sur
// le plan, sous les bandeaux d'alerte et de refus : en position absolue, ils
// les recouvraient (et leurs boutons Réessayer / Abandonner). Ne se ferment
// que par leurs boutons ou Échap, jamais au toucher à côté.
const panneauPlan = {
  position: 'relative', margin: 8, alignSelf: 'flex-start', flexShrink: 0,
  zIndex: 6, width: 340, maxWidth: 'calc(100% - 16px)', boxSizing: 'border-box',
  pointerEvents: 'auto', background: 'white', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2,
  boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: '8px 8px 10px 14px', display: 'flex', flexDirection: 'column', gap: 8,
}

function SaisieCote({ saisie, aide = null, onTexte, onValider, onPlusTard }) {
  return (
    <section aria-label="Valeur de la cote" style={{ ...panneauPlan, borderTop: `3px solid ${COULEUR_COTE}` }}>
      <form onSubmit={(e) => { e.preventDefault(); onValider() }} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <label htmlFor="edl-cote" style={{ fontSize: 14, fontWeight: 600, color: '#1F1B17', whiteSpace: 'nowrap' }}>Cote (m)</label>
        <input
          id="edl-cote" autoFocus inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="3,45"
          value={saisie.texte} onChange={(e) => onTexte(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onPlusTard() } }}
          style={{ flex: 1, minWidth: 0, height: 44, minHeight: 0, boxSizing: 'border-box', padding: '0 10px', fontSize: 16, border: '0.5px solid rgba(0,0,0,0.25)', borderRadius: 2 }}
        />
        <button type="submit" style={{ ...boutonPlein, background: COULEUR_COTE }}>Valider</button>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 12, color: saisie.erreur ? '#B8412C' : '#5E5854' }}>
          {saisie.erreur ?? aide ?? 'Ou dites-la : elle sera lue dans l’enregistrement.'}
        </p>
        <button type="button" style={bouton} onClick={onPlusTard}>Plus tard</button>
      </div>
    </section>
  )
}

function PanneauTrace({ titre, trace, confirmer, onModifier, onSupprimer, onConfirmer, onGarder, onFermer }) {
  const couleur = trace.sorte === 'commande' ? COULEUR_COMMANDE : COULEUR_COTE
  const quoi = trace.sorte === 'commande' ? 'cette liaison' : 'cette cote'
  return (
    <section aria-label={titre} style={{ ...panneauPlan, borderTop: `3px solid ${couleur}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {trace.sorte === 'commande' ? <Spline size={18} color={couleur} /> : <Ruler size={18} color={couleur} />}
        <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 14, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titre}{trace.a_valider ? ' · proposée' : ''}
        </p>
        <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer"
          style={{ width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#5E5854' }}>
          <X size={18} />
        </button>
      </div>
      {confirmer ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ flex: 1, margin: 0, fontSize: 13, color: '#B8412C' }}>Supprimer {quoi} ?</p>
          <button type="button" style={bouton} onClick={onGarder}>Garder</button>
          <button type="button" style={{ ...boutonPlein, background: '#B8412C' }} onClick={onConfirmer}><Trash2 size={15} /> Supprimer</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {trace.sorte === 'cote' && <button type="button" style={bouton} onClick={onModifier}><Pencil size={15} /> Modifier</button>}
          <button type="button" style={{ ...bouton, color: '#B8412C' }} onClick={onSupprimer}><Trash2 size={15} /> Supprimer</button>
        </div>
      )}
    </section>
  )
}

export function VisiteEdl({ affaireId, visite, analyse = null, obtenirLiens, onFermer }) {
  const { donnees, recharger } = visite
  const [visiteId, setVisiteId] = useState(null)
  const [niveauId, setNiveauId] = useState(null)
  const [pieceId, setPieceId] = useState(null)
  const [pointId, setPointId] = useState(null)
  // Aide-mémoire : ouvert à chaque entrée dans une pièce, sauf si le
  // collaborateur l'a coupé sur cet appareil
  const [aideOuverte, setAideOuverte] = useState(false)
  const [aideAuto, setAideAuto] = useState(() => ouvrirAChaqueEntree())
  const [historique, setHistorique] = useState([])
  const [message, setMessage] = useState(null)
  const [confirmerFin, setConfirmerFin] = useState(false)
  // Micro en train de s'ouvrir : un second appui ne relance rien
  const [demarrage, setDemarrage] = useState(false)
  // « Terminer » en cours : ni l'écran d'accueil ni un plan qui paraîtrait
  // actif ne doivent réapparaître entre l'arrêt du micro et la fermeture
  const [fermeture, setFermeture] = useState(false)
  const annulation = useRef(false)
  const contexte = useRef({ visiteId: null, niveauId: null, pieceId: null })
  // Mode « Relier » : lu par les touchers depuis la référence, tenue à jour
  // en même temps que l'état (deux touchers rapides ne doivent pas voir le
  // même mode)
  const [mode, setMode] = useState(null)
  const modeCourant = useRef(null)
  const changerMode = (m) => { modeCourant.current = m; setMode(m) }
  // Premier angle d'une cote, allumé : { angle, traceId, jusqua } — même
  // règle que le mode (référence lue par les touchers)
  const [premierAngle, setPremierAngle] = useState(null)
  const premierCourant = useRef(null)
  const changerPremier = (p) => { premierCourant.current = p; setPremierAngle(p) }
  // Mur touché, en surbrillance : { a, b, jusqua }
  const [murAllume, setMurAllume] = useState(null)
  // Texte d'aide du bandeau : { texte, jusqua }
  const [aide, setAide] = useState(null)
  const montrerAide = (evenement, jusqua = maintenant() + DUREE_AIDE_MS) => {
    const texte = texteAide(evenement)
    setAide(texte ? { texte, jusqua } : null)
  }
  const [traceId, setTraceId] = useState(null)
  const [confirmerSuppressionTrace, setConfirmerSuppressionTrace] = useState(false)
  // Valeur d'une cote à taper : { traceId, texte, erreur }
  const [saisieCote, setSaisieCote] = useState(null)

  const niveaux = useMemo(() => donnees?.niveaux ?? [], [donnees?.niveaux])
  const niveau = niveaux.find((n) => n.id === niveauId) ?? niveaux[0] ?? null
  // L'état de l'analyse lu en ligne passe par-dessus celui de l'instantané
  // (emporté pour la visite sans réseau)
  const analysePieces = analyse?.pieces
  const pieces = useMemo(() => (donnees?.pieces ?? [])
    .filter((p) => p.niveau_id === niveau?.id)
    .map((p) => {
      const a = analysePieces?.get(p.id)
      return a ? { ...p, ...a } : p
    }), [donnees?.pieces, niveau?.id, analysePieces])
  const piece = pieces.find((p) => p.id === pieceId) ?? null
  const points = useMemo(() => (donnees?.points ?? []).filter((p) => p.niveau_id === niveau?.id), [donnees?.points, niveau?.id])
  const point = (donnees?.points ?? []).find((p) => p.id === pointId) ?? null
  const photosDuPoint = (donnees?.photos ?? []).filter((ph) => ph.point_id === pointId)
  const nbPhotos = useMemo(() => {
    const n = new Map()
    for (const ph of donnees?.photos ?? []) n.set(ph.point_id, (n.get(ph.point_id) ?? 0) + 1)
    return n
  }, [donnees?.photos])
  // Sans la 084, rien à dessiner ni à toucher
  const tracesOk = visite.tracesDisponibles
  // Sans la 085, un mur touché n'est que mis en surbrillance
  const finitionsOk = visite.finitionsDisponibles
  const toutesTraces = useMemo(() => (tracesOk ? donnees?.traces ?? [] : []), [tracesOk, donnees?.traces])
  const niveauAffiche = niveau?.id ?? null
  const traces = useMemo(() => toutesTraces.filter((t) => t.niveau_id === niveauAffiche), [toutesTraces, niveauAffiche])
  const trace = traceId ? traces.find((t) => t.id === traceId) ?? null : null
  const traceSaisie = saisieCote ? traces.find((t) => t.id === saisieCote.traceId) ?? null : null
  const visitees = useMemo(() => piecesVisitees(donnees?.entrees), [donnees?.entrees])
  const pieceEnAnalyse = analyse?.enCours ?? null
  const etats = useMemo(() => new Map(pieces.map((p) => [
    p.id, etatPieceVisite(p, { visitees, entrees: donnees?.entrees, enCours: pieceEnAnalyse }),
  ])), [pieces, visitees, donnees?.entrees, pieceEnAnalyse])
  const ancienne = visiteEnCours(donnees?.visites)

  useEffect(() => { contexte.current = { visiteId, niveauId: niveau?.id ?? null, pieceId: piece?.id ?? null } })
  const elementsAnalyse = analyse?.elements
  const memoire = useMemo(
    () => aideMemoire(piece, { points, elements: elementsAnalyse ?? [], traces: toutesTraces, tracesDisponibles: tracesOk, finitionsDisponibles: finitionsOk }),
    [piece, points, elementsAnalyse, toutesTraces, tracesOk, finitionsOk],
  )
  const changerAideAuto = (oui) => { setAideAuto(oui); memoriserOuverture(oui) }

  // Premier angle, mur allumé et texte d'aide s'éteignent seuls à leur heure
  // (un plus récent les a peut-être déjà remplacés : rien n'est alors touché)
  useEffect(() => {
    if (!premierAngle) return undefined
    const id = setTimeout(() => { if (premierCourant.current === premierAngle) changerPremier(null) }, Math.max(0, premierAngle.jusqua - Date.now()))
    return () => clearTimeout(id)
  }, [premierAngle])
  useEffect(() => {
    if (!murAllume) return undefined
    const id = setTimeout(() => setMurAllume((m) => (m === murAllume ? null : m)), Math.max(0, murAllume.jusqua - Date.now()))
    return () => clearTimeout(id)
  }, [murAllume])
  useEffect(() => {
    if (!aide) return undefined
    const id = setTimeout(() => setAide((a) => (a === aide ? null : a)), Math.max(0, aide.jusqua - Date.now()))
    return () => clearTimeout(id)
  }, [aide])

  // Pause, coupure, reprise : notées au journal avec la pièce où l'on est
  const surEtat = useCallback((nouveau, ancien) => {
    const type = evenementPourEtat(ancien, nouveau)
    if (type && contexte.current.visiteId) {
      visite.noter(type, contexte.current, type === 'coupure' ? { cause: nouveau } : {}).catch(() => {})
    }
  }, [visite])
  const rec = useEnregistrementEdl({ visiteId, affaireId, surEtat })
  const enCours = rec.etat !== 'pret'
  const actif = enregistrementActif(rec.etat)

  // Relue à l'ouverture : les pièces ont pu être corrigées au bureau
  // (asynchrone : pas de mise à jour d'état pendant l'effet)
  useEffect(() => {
    let vivant = true
    Promise.resolve().then(() => { if (vivant) recharger() })
    return () => { vivant = false }
  }, [recharger])

  // Ouverture de la visite avec du réseau : les pièces des visites
  // précédentes qui attendent partent (un seul déclenchement par ouverture)
  const lancerAnalyse = analyse?.lancer
  useEffect(() => {
    let vivant = true
    Promise.resolve().then(() => { if (vivant) lancerAnalyse?.() })
    return () => { vivant = false }
  }, [lancerAnalyse])

  // Sans attendre et avec du réseau seulement : la visite continue pendant
  // l'envoi, la transcription et l'analyse
  const analyserApres = (edlVisiteId) => {
    if (!edlVisiteId || navigator.onLine === false) return
    apresSortieDePiece(affaireId, edlVisiteId).catch((err) => console.warn('Analyse après la sortie :', err))
  }

  // La page derrière ne défile plus tant que la visite est ouverte
  useEffect(() => {
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = avant }
  }, [])

  const echouer = (err) => setMessage(texteErreur(err))
  const noterGeste = (geste) => setHistorique((h) => [...h.slice(-(HISTORIQUE_MAX - 1)), geste])

  const demarrer = async (reprendreCelle) => {
    if (demarrage) return
    setMessage(null)
    setDemarrage(true)
    const id = reprendreCelle?.id ?? crypto.randomUUID()
    navigator.storage?.persist?.().catch(() => {})
    try {
      // Le micro d'abord, dans le geste ; la visite s'écrit ensuite
      if (!(await rec.demarrer(id))) return
      const ctx = { visiteId: id, niveauId: niveau?.id ?? null, pieceId: null }
      try {
        if (reprendreCelle) {
          await visite.noter('reprise', ctx, { apresInterruption: true })
        } else {
          if (ancienne) await visite.terminer(ancienne.id, { ...ctx, visiteId: ancienne.id })
          // Refusé si l'état des lieux n'est pas chargé : sans visite écrite,
          // l'enregistrement ne se rattacherait à rien, on l'arrête
          await visite.commencer(id, ctx)
        }
        setVisiteId(id)
      } catch (err) {
        await rec.arreter().catch(() => {})
        echouer(err)
      }
    } finally {
      setDemarrage(false)
    }
  }

  // Entrée dans une pièce : coupe le morceau audio en cours et le note au
  // journal ; `choisir` = point à choisir aussitôt (appui sur un point de la
  // pièce depuis le plan de l'étage)
  const entrer = async (p, choisir = null) => {
    const ctx = contexte.current
    const dedans = { visiteId, niveauId: niveau.id, pieceId: p.id }
    // Tout de suite, pas au rendu : un second toucher rapide sur une autre
    // pièce doit noter la sortie de celle-ci
    contexte.current = dedans
    if (ctx.pieceId !== p.id) setAideOuverte(aideAuto)
    setPieceId(p.id)
    setPointId(choisir)
    oublierTraces()
    if (!choisir) montrerAide({ sorte: 'entree', piece: designationPiece(p), angles: tracesOk })
    try {
      const notes = [rec.couper()]
      // Passage direct d'une pièce à une autre : la sortie de la première d'abord
      const quitte = ctx.pieceId && ctx.pieceId !== p.id
      if (quitte) notes.push(visite.noter('sortie', ctx))
      notes.push(visite.noter('entree', dedans))
      await Promise.all(notes)
      if (quitte) analyserApres(ctx.visiteId)
    } catch (err) { echouer(err) }
  }

  const sortir = async () => {
    if (!actif) return
    // Le contexte plutôt que l'état : une entrée toute récente n'est peut-être
    // pas encore rendue
    const ctx = contexte.current
    if (!ctx.pieceId) return // second appui rapide : déjà sorti
    contexte.current = { ...ctx, pieceId: null }
    setPieceId(null)
    setPointId(null)
    setAideOuverte(false)
    oublierTraces()
    setAide(null)
    try {
      await Promise.all([rec.couper(), visite.noter('sortie', ctx)])
      analyserApres(ctx.visiteId)
    } catch (err) { echouer(err) }
  }

  const toucher = async (m) => {
    if (!actif || !visiteId || !niveau) return
    const md = modeCourant.current
    // « Relier » : un toucher hors des points ne pose rien (pas même un point)
    if (md?.sorte === 'relier') { relierA(null); return }
    if (md) return
    setTraceId(null)
    // Tout toucher hors d'un angle éteint le premier angle d'une cote
    changerPremier(null)
    setMurAllume(null)
    if (!piece) {
      const sous = pieceSous(pieces, m)
      if (sous) { entrer(sous); return }
    }
    try {
      const nouveau = await visite.poserPoint({
        visiteId, niveauId: niveau.id, pieceId: piece?.id ?? null, x: arrondirMetre(m[0]), y: arrondirMetre(m[1]),
      })
      setPointId(nouveau.id)
      noterGeste({ type: 'pose', point: nouveau })
      montrerAide(piece ? { sorte: 'point-pose', point: nouveau } : { sorte: 'hors-piece' })
    } catch (err) { echouer(err) }
  }

  // Un point d'une autre pièce (touché depuis le plan de l'étage) ouvre sa
  // pièce, puis est choisi. Toucher le point déjà choisi le garde choisi.
  // Chaque toucher d'un point existant est noté (ignoré sans la 084) : c'est
  // ce que l'analyse rapproche de la phrase dite à ce moment
  const choisirPoint = (id) => {
    if (!actif || !visiteId) return
    const p = points.find((q) => q.id === id)
    if (!p) return
    if (modeCourant.current?.sorte === 'relier') { relierA(p); return }
    setTraceId(null)
    changerPremier(null)
    setMurAllume(null)
    const sienne = p.piece_id ? pieces.find((q) => q.id === p.piece_id) : null
    if (sienne && sienne.id !== piece?.id) entrer(sienne, id)
    else setPointId(id)
    noterTouche(p)
    const elements = elementsAnalyse ?? []
    montrerAide({ sorte: 'point-touche', point: { ...p, type: typeEffectif(p, elements) }, relier: tracesOk && !!debutRelier(p, elements) })
  }

  const noterTouche = (p) => {
    visite.noter('point-touche', { ...contexte.current, pieceId: p.piece_id ?? null, pointId: p.id }, { numero: p.numero, type: p.type ?? null })
      .catch(() => {})
  }

  // ─── Liaisons et cotes ─────────────────────────────────────────────────────
  const oublierTraces = () => {
    changerMode(null)
    changerPremier(null)
    setMurAllume(null)
    setTraceId(null)
    setConfirmerSuppressionTrace(false)
    setSaisieCote(null)
  }

  const commencerRelier = () => {
    const m = debutRelier(point, elementsAnalyse ?? [])
    if (!m) return
    // Second appui sur « Relier » : on quitte le mode
    if (modeCourant.current?.sorte === 'relier' && modeCourant.current.depuis === point.id) { changerMode(null); return }
    setTraceId(null)
    changerPremier(null)
    setMurAllume(null)
    // La consigne est dans la barre de la pièce, pas dans le bandeau
    setAide(null)
    changerMode(m)
  }

  // `cible` : le point touché, ou null (ailleurs sur le plan)
  const relierA = async (cible) => {
    const md = modeCourant.current
    if (!md || md.sorte !== 'relier') return
    if (cible) noterTouche(cible)
    const r = toucherRelier(md, cible, { points, traces: toutesTraces, elements: elementsAnalyse ?? [] })
    if (r.action === 'refus') { changerMode(r.mode); return }
    changerMode(null)
    setPointId(cible.id)
    try {
      const t = await visite.creerTrace({
        sorte: 'commande', visiteId, niveauId: niveau.id, pieceId: piece?.id ?? r.interrupteur.piece_id ?? null,
        interrupteur: r.interrupteur, luminaire: r.luminaire,
      }, contexte.current)
      noterGeste({ type: 'trace-creation', trace: t })
      montrerAide({ sorte: 'liaison', interrupteur: r.interrupteur, luminaire: r.luminaire })
    } catch (err) { echouer(err) }
  }

  // Angle touché pile (sans la 084, `PlanVisite` ne les propose pas) : le
  // premier s'allume, le second crée la cote et ouvre le champ de sa valeur
  const toucherUnAngle = async (angle) => {
    if (!actif || !visiteId || !piece || !tracesOk || modeCourant.current) return
    const r = toucherAngle(premierCourant.current, angle, { maintenant: maintenant() })
    setPointId(null)
    setTraceId(null)
    setMurAllume(null)
    setSaisieCote(null)
    if (r.action === 'meme') { changerPremier(r.premier); montrerAide({ sorte: 'angle' }, r.premier.jusqua); return }
    const traceDuGeste = r.action === 'creer' ? r.traceId : r.premier.traceId
    visite.noter('angle-touche', { ...contexte.current }, { x: angle[0], y: angle[1], traceId: traceDuGeste }).catch(() => {})
    if (r.action === 'premier') { changerPremier(r.premier); montrerAide({ sorte: 'angle' }, r.premier.jusqua); return }
    changerPremier(null)
    setAide(null)
    try {
      const t = await visite.creerTrace({
        id: r.traceId, sorte: 'cote', visiteId, niveauId: niveau.id, pieceId: piece.id, a: r.a, b: r.b,
      }, contexte.current)
      noterGeste({ type: 'trace-creation', trace: t })
      setTraceId(t.id)
      setSaisieCote({ traceId: t.id, texte: '', erreur: null, nouvelle: true })
    } catch (err) { echouer(err) }
  }

  // Mur touché pile : en surbrillance quelques secondes, noté avec la 085
  // seulement ; rien d'autre n'est créé (la finition dite est lue à l'analyse)
  const toucherUnMur = (mur) => {
    if (!actif || !visiteId || !piece || modeCourant.current) return
    changerPremier(null)
    setPointId(null)
    setTraceId(null)
    setMurAllume({ a: mur.a, b: mur.b, jusqua: maintenant() + DUREE_MUR_ALLUME_MS })
    if (!finitionsOk) { setAide(null); return }
    montrerAide({ sorte: 'mur' })
    visite.noter('mur-touche', { ...contexte.current }, detailMurTouche(mur)).catch(() => {})
  }

  const choisirTrace = (id) => {
    if (!actif || modeCourant.current) return
    changerPremier(null)
    setMurAllume(null)
    setAide(null)
    setPointId(null)
    setConfirmerSuppressionTrace(false)
    setTraceId(id)
  }

  // Valeur tapée : enregistrée telle qu'on l'écrit (« 3,45 m ») ; elle vaut
  // validation, l'analyse ne la remplacera pas
  const validerCote = async () => {
    const t = traceSaisie
    if (!t) { setSaisieCote(null); return }
    const v = valeurCote(saisieCote.texte)
    if (v === null) { setSaisieCote({ ...saisieCote, erreur: 'Valeur illisible : tapez par exemple 3,45' }); return }
    const avant = { valeur: t.valeur ?? null, a_valider: !!t.a_valider }
    setSaisieCote(null)
    try {
      await visite.modifierTrace(t, { valeur: texteValeur(v) }, contexte.current)
      noterGeste({ type: 'trace-modification', id: t.id, avant })
    } catch (err) { echouer(err) }
  }

  const modifierCote = () => {
    if (!trace || trace.sorte !== 'cote') return
    const v = valeurCote(trace.valeur)
    setSaisieCote({ traceId: trace.id, texte: v ? String(v).replace('.', ',') : '', erreur: null })
  }

  const supprimerTraceChoisie = async () => {
    const t = trace
    setConfirmerSuppressionTrace(false)
    setTraceId(null)
    if (!t || !actif) return
    try {
      await visite.supprimerTrace(t, contexte.current)
      noterGeste({ type: 'trace-suppression', trace: t })
    } catch (err) { echouer(err) }
  }

  const choisirType = async (code) => {
    if (!point || !actif) return
    const t = typeEdl(code)
    const avant = { type: point.type ?? null, calque: point.calque ?? null }
    // Une écriture ratée (elle lève une erreur) ne laisse rien à annuler
    try {
      await visite.modifierPoint(point, { type: t?.code ?? null, calque: t?.calque ?? null }, contexte.current)
      noterGeste({ type: 'modification', id: point.id, avant })
    } catch (err) { echouer(err) }
  }

  const deplacer = async (id, [x, y]) => {
    const p = (donnees?.points ?? []).find((q) => q.id === id)
    if (!p || !actif) return
    const avant = { x: p.x, y: p.y }
    try {
      await visite.modifierPoint(p, { x: arrondirMetre(x), y: arrondirMetre(y) }, contexte.current)
      noterGeste({ type: 'modification', id, avant })
    } catch (err) { echouer(err) }
  }

  const supprimer = async () => {
    if (!point || !actif) return
    // Ses liaisons partent avec lui (cascade) : le geste les garde pour « Annuler »
    const geste = gesteSuppressionPoint(point, { photos: donnees?.photos ?? [], traces: toutesTraces })
    if (modeCourant.current?.depuis === point.id) changerMode(null)
    setPointId(null)
    try {
      await visite.supprimerPoint(point, contexte.current)
      noterGeste(geste)
    } catch (err) { echouer(err) }
  }

  const photographier = async (fichier) => {
    if (!point) return
    try {
      await visite.ajouterPhoto(point, fichier, contexte.current)
    } catch (err) { echouer(err) }
  }

  // Une seule annulation à la fois : un second appui pendant l'écriture est
  // ignoré (`annulation`) ; le geste est retiré de l'historique avant d'être défait
  const annuler = async () => {
    if (!historique.length || annulation.current || !actif) return
    const geste = historique[historique.length - 1]
    setHistorique(historique.slice(0, -1))
    annulation.current = true
    try {
      await visite.annuler(geste, contexte.current)
    } catch (err) {
      echouer(err)
    } finally {
      annulation.current = false
    }
  }

  useEffect(() => {
    if (!enCours || confirmerFin) return undefined
    const touche = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      annuler()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  // Échap quitte le mode, puis la saisie de la cote, puis la trace choisie
  useEffect(() => {
    if (!enCours || confirmerFin || (!mode && !saisieCote && !traceId && !premierAngle)) return undefined
    const touche = (e) => {
      if (e.key !== 'Escape') return
      if (modeCourant.current) changerMode(null)
      else if (premierCourant.current) { changerPremier(null); setAide(null) }
      else if (saisieCote) setSaisieCote(null)
      else { setTraceId(null); setConfirmerSuppressionTrace(false) }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  const fermerConfirmation = useCallback(() => setConfirmerFin(false), [])

  const terminer = async () => {
    setConfirmerFin(false)
    setFermeture(true)
    const ctx = contexte.current
    try {
      if (ctx.pieceId) await visite.noter('sortie', ctx)
      await rec.arreter()
      if (ctx.visiteId) await visite.terminer(ctx.visiteId, ctx)
      // La fin ferme le passage en cours ; son dernier morceau, rangé juste
      // après, relance lui-même l'analyse une fois transcrit
      analyserApres(ctx.visiteId)
      onFermer()
    } catch (err) {
      setFermeture(false)
      echouer(err)
    }
  }

  const rejouer = (id) => { visite.rejouer(id).catch(echouer) }
  const abandonner = (id) => { visite.abandonner(id).catch(echouer) }

  const ecran = { position: 'fixed', inset: 0, zIndex: 300, background: '#F5F1E9', display: 'flex', flexDirection: 'column' }
  // App installée sur l'iPad : l'heure de la barre d'état s'écrit en blanc
  const bandeSure = <div style={{ height: 'env(safe-area-inset-top)', background: '#1F1B17', flexShrink: 0 }} />
  const alerte = message && (
    <p role="alert" style={ligneAlerte}>
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" onClick={() => setMessage(null)} style={{ ...bouton, border: 'none', background: 'none', color: '#B8412C', fontSize: 13 }}>Fermer</button>
    </p>
  )
  // Erreur de lecture de la visite : effacée d'elle-même à la relecture suivante réussie
  const erreurLecture = visite.erreur && (
    <p role="status" style={ligneAmbre}>
      <span style={{ flex: 1 }}>Lecture de la visite : {visite.erreur}. Ce qui est sur la tablette reste affiché.</span>
    </p>
  )

  if (fermeture) {
    return (
      <div style={ecran}>
        {bandeSure}
        <p style={{ margin: 0, padding: 24, fontSize: 14, color: '#5E5854' }}>Fin de la visite…</p>
      </div>
    )
  }

  // ─── Avant de démarrer ─────────────────────────────────────────────────────
  // Tant que la visite n'est pas écrite (micro ouvert, `commencer` en cours),
  // l'accueil reste : « Terminer » ne doit pas pouvoir partir avant elle
  if (!enCours || demarrage) {
    let contenu
    if (visite.sansMemoire) contenu = <p style={{ margin: 0 }}>Ce navigateur ne garde rien sur l’appareil (navigation privée ?) : la visite a besoin de sa mémoire pour ne rien perdre sans réseau.</p>
    else if (!visite.charge) contenu = <p style={{ margin: 0 }}>Chargement…</p>
    else if (visite.indisponible) contenu = <p style={{ margin: 0 }}>La visite demande la migration 079 dans Supabase.</p>
    else if (!donnees?.etat || !niveaux.length) contenu = <p style={{ margin: 0 }}>Cet état des lieux n’est pas sur cet appareil : ouvrez-le une fois avec du réseau.</p>
    else if (!rec.possible) contenu = <p style={{ margin: 0 }}>Ce navigateur ne sait pas enregistrer : la visite a besoin du micro.</p>
    else {
      const attente = demarrage ? { opacity: 0.6, cursor: 'default' } : {}
      contenu = (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Prévenez les personnes présentes que la visite est enregistrée.</li>
            <li>Ne verrouillez pas l’écran et ne changez pas d’application : le micro se couperait (le plan se grise, il suffit de reprendre).</li>
            <li>Touchez une pièce pour l’agrandir, puis touchez le plan à chaque élément que vous décrivez.</li>
            <li>L’enregistrement reste sur la tablette jusqu’à son analyse.</li>
          </ul>
          {rec.erreur && <p role="alert" style={{ margin: 0, color: '#B8412C' }}>{rec.erreur}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ancienne ? (
              <>
                <button type="button" disabled={demarrage} style={{ ...boutonPlein, minHeight: 52, fontSize: 15, ...attente }} onClick={() => demarrer(ancienne)}>
                  <Mic size={18} /> Reprendre la visite du {heure(ancienne.debut)}
                </button>
                <button type="button" disabled={demarrage} style={{ ...bouton, minHeight: 52, ...attente }} onClick={() => demarrer(null)}>La terminer et en commencer une nouvelle</button>
              </>
            ) : (
              <button type="button" disabled={demarrage} style={{ ...boutonPlein, minHeight: 52, fontSize: 15, ...attente }} onClick={() => demarrer(null)}>
                <Mic size={18} /> {demarrage ? 'Ouverture du micro…' : 'Démarrer la visite'}
              </button>
            )}
          </div>
        </>
      )
    }
    return (
      <div style={ecran}>
        {bandeSure}
        <header style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 600, color: '#1F1B17' }}>État des lieux · visite</p>
          {visite.resume.enAttente > 0 && <span style={{ fontSize: 12, color: '#9C9591', whiteSpace: 'nowrap' }}>{visite.resume.enAttente} à envoyer</span>}
          <button type="button" style={{ ...bouton, ...(demarrage ? { opacity: 0.45, cursor: 'default' } : {}) }} disabled={demarrage} onClick={onFermer}><X size={16} /> Fermer</button>
        </header>
        {alerte}
        {erreurLecture}
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center', overflowY: 'auto' }}>
          <div style={{ maxWidth: 620, width: '100%', background: 'white', borderTop: `3px solid ${ACCENT}`, padding: 20, fontSize: 14, color: '#5E5854', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {contenu}
          </div>
        </div>
      </div>
    )
  }

  // ─── Pendant la visite ─────────────────────────────────────────────────────
  const refus = visite.resume.premierEchec
  const messages = message || refus || visite.erreur
  return (
    <div style={ecran}>
      {bandeSure}
      <header style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div role="tablist" aria-label="Étages" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {niveaux.map((n) => {
            const choisi = n.id === niveau?.id
            const fige = !!piece || !actif
            return (
              <button
                key={n.id} type="button" role="tab" aria-selected={choisi} disabled={fige}
                title={piece ? 'Sortez de la pièce pour changer d’étage' : undefined}
                onClick={() => { setNiveauId(n.id); setPointId(null); oublierTraces() }}
                style={{
                  minHeight: 44, padding: '0 14px', border: 'none', borderBottom: `2px solid ${choisi ? ACCENT : 'transparent'}`,
                  background: 'none', fontSize: 14, fontWeight: choisi ? 600 : 400, color: choisi ? '#1F1B17' : '#5E5854',
                  cursor: fige ? 'default' : 'pointer', opacity: fige && !choisi ? 0.4 : 1, flexShrink: 0,
                }}
              >{n.nom}</button>
            )
          })}
        </div>
        {visite.resume.enAttente > 0 && <span style={{ fontSize: 12, color: '#9C9591', whiteSpace: 'nowrap' }}>{visite.resume.enAttente} à envoyer</span>}
        <button type="button" style={{ ...bouton, opacity: historique.length && actif ? 1 : 0.45 }} disabled={!historique.length || !actif} onClick={annuler}
          title="Annuler le dernier geste (⌘Z / Ctrl+Z)" aria-label="Annuler le dernier geste"><Undo2 size={16} /> Annuler</button>
        <button type="button" style={boutonPlein} onClick={() => setConfirmerFin(true)}><Square size={15} /> Terminer la visite</button>
      </header>
      <BandeauEnregistrement
        etat={rec.etat} duree_s={rec.duree_s} niveau={rec.niveau} enAttente={rec.enAttente}
        onPause={rec.pause} onReprendre={rec.reprendre}
      />
      {/* Barre de la pièce, toujours montée à hauteur fixe : le plan dessous ne change pas de taille */}
      <div style={{
        height: 56, boxSizing: 'border-box', flexShrink: 0, borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden',
        background: mode?.raison ? '#FFFBEB' : 'white',
      }}>
        {mode && (<>
          <Spline size={18} color={COULEUR_COMMANDE} style={{ flexShrink: 0 }} />
          <p role="status" style={{
            flex: 1, minWidth: 0, margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: mode.raison ? '#92400E' : COULEUR_COMMANDE,
          }}>{mode.raison ?? texteAide({ sorte: 'relier', attendu: mode.attendu })}</p>
          <button type="button" style={bouton} onClick={() => changerMode(null)}
            aria-label="Quitter « Relier »" title="Annuler (Échap)">
            <X size={16} /> Annuler
          </button>
        </>)}
        {!mode && !piece && (
          <p style={{ margin: 0, fontSize: 13, color: '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Touchez une pièce pour l’agrandir · hors des pièces, un point se rattache à l’étage
          </p>
        )}
        {!mode && piece && (<>
          <button type="button" style={{ ...bouton, opacity: actif ? 1 : 0.45 }} disabled={!actif} onClick={sortir}><ChevronLeft size={18} /> Sortir de la pièce</button>
          <div style={{ minWidth: 0, flexShrink: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{designationPiece(piece)}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9C9591' }}>{fmtM2(aire(piece.contour))}</p>
          </div>
          <button type="button" aria-pressed={aideOuverte} onClick={() => setAideOuverte((o) => !o)}
            style={{ ...bouton, marginLeft: 'auto', flexShrink: 0, ...(memoire.faites === memoire.total ? { color: '#2A8A4E', borderColor: '#2A8A4E' } : {}) }}>
            <ListChecks size={17} /> Aide-mémoire · {memoire.faites}/{memoire.total}
          </button>
        </>)}
      </div>
      <PanneauPoint
        point={point} photos={photosDuPoint} obtenirLiens={obtenirLiens} inactif={!actif}
        onType={choisirType} onPhoto={photographier} onSupprimer={supprimer} onFermer={() => setPointId(null)}
        onRelier={tracesOk && debutRelier(point, elementsAnalyse ?? []) ? commencerRelier : null}
        relierEnCours={mode?.sorte === 'relier' && mode.depuis === point?.id}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {niveau && (
          <PlanVisite
            key={niveau.id}
            niveau={niveau} pieces={pieces} points={points} nbPhotos={nbPhotos} visitees={visitees} etats={etats}
            piece={piece} pointId={pointId} obtenirLiens={obtenirLiens}
            onToucher={toucher} onChoisirPoint={choisirPoint} onDeplacerPoint={deplacer}
            traces={traces} traceId={traceId} mode={mode} onChoisirTrace={choisirTrace}
            anglesActifs={tracesOk} premierAngle={premierAngle?.angle ?? null} murAllume={murAllume}
            onToucherAngle={toucherUnAngle} onToucherMur={toucherUnMur}
          />
        )}
        {/* Par-dessus le plan, jamais au-dessus : sa taille ne bouge pas. Hors
            enregistrement, le voile gris arrête tout geste (toucher, glisser,
            pincement, molette) ; seuls « Reprendre », « Pause » et « Terminer » restent. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', pointerEvents: actif ? 'none' : 'auto', touchAction: actif ? undefined : 'none' }}>
          {messages && (
            <div style={{ pointerEvents: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {alerte}
              {refus && (
                <p role="alert" style={ligneAlerte}>
                  <span style={{ flex: 1 }}>Un geste a été refusé par la base ({refus.erreur}). Il reste affiché ici.</span>
                  <button type="button" style={bouton} onClick={() => rejouer(refus.id)}>Réessayer</button>
                  <button type="button" style={bouton} onClick={() => abandonner(refus.id)}>Abandonner</button>
                </p>
              )}
              {erreurLecture}
            </div>
          )}
          {/* Bandeau d'aide : sous les alertes, jamais sur le voile ; ne capte pas le doigt */}
          {actif && aide && (
            <p role="status" style={{
              position: 'relative', zIndex: 7, alignSelf: 'flex-start', flexShrink: 0, margin: '8px 8px 0', maxWidth: 'calc(100% - 16px)', boxSizing: 'border-box',
              pointerEvents: 'none', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#1F1B17',
              background: 'rgba(255,255,255,0.94)', borderLeft: `3px solid ${ACCENT}`, borderRadius: 2, boxShadow: '0 4px 14px -6px rgba(31,27,23,0.35)',
            }}>{aide.texte}</p>
          )}
          {actif && traceSaisie && (
            <SaisieCote
              saisie={saisieCote} aide={saisieCote.nouvelle ? texteAide({ sorte: 'cote' }) : null}
              onTexte={(texte) => setSaisieCote({ ...saisieCote, texte, erreur: null })}
              onValider={validerCote} onPlusTard={() => setSaisieCote(null)}
            />
          )}
          {actif && trace && !mode && !traceSaisie && (
            <PanneauTrace
              titre={libelleTrace(trace, points)} trace={trace} confirmer={confirmerSuppressionTrace}
              onModifier={modifierCote} onSupprimer={() => setConfirmerSuppressionTrace(true)}
              onConfirmer={supprimerTraceChoisie} onGarder={() => setConfirmerSuppressionTrace(false)}
              onFermer={() => { setTraceId(null); setConfirmerSuppressionTrace(false) }}
            />
          )}
          {piece && aideOuverte && actif && (
            <AideMemoireEdl titre={designationPiece(piece)} aide={memoire} ouvrirAuto={aideAuto} onOuvrirAuto={changerAideAuto} onFermer={() => setAideOuverte(false)} />
          )}
          {!actif && (
            <div style={{ flex: 1, minHeight: 0, background: 'rgba(60,56,52,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, paddingLeft: 16, paddingRight: 16, gap: 14, textAlign: 'center', overflowY: 'auto' }}>
              <p style={{ margin: 0, color: 'white', fontSize: 17, fontWeight: 600 }}>{messageArret(rec.etat)}</p>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>Aucun point ne se pose tant que rien n’est enregistré.</p>
              {rec.erreur && <p style={{ margin: 0, color: 'white', fontSize: 13 }}>{rec.erreur}</p>}
              <button type="button" onClick={() => { rec.reprendre() }} style={{ ...boutonPlein, background: '#B8412C', minHeight: 56, fontSize: 16, padding: '0 24px' }}>
                <Mic size={20} /> Reprendre l’enregistrement
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmerFin && <ConfirmerFin onConfirmer={terminer} onAnnuler={fermerConfirmation} />}
    </div>
  )
}
