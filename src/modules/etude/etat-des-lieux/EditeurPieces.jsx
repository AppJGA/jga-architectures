import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, PenLine, Sparkles, X, Undo2 } from 'lucide-react'
import { VisionneusePlan } from '../../chantier/comptes-rendus/VisionneusePlan'
import {
  aire, pointDansPolygone, ecartSurface, SEUIL_ECART, versPixels, versMetres,
  deplacerSommet, insererSommet, retirerSommet, ecartEchelle, pieceChevauchee, retirerSuperpositions,
} from './geometrieEdl'
import { imageIaDepuisUrl } from './renduNiveau'
import { proposerPiecesIa } from './piecesIa'
import { versPiecesEdl } from './piecesIaLogique'
import { controlesAutomatiques, signalementsVisibles } from './relectureLogique'
import { relireNiveau } from './relectureIa'
import { PanneauRelecture } from './PanneauRelecture'

// ─── Corriger les pièces d'un étage ──────────────────────────────────────────
//
// Les contours en couleur sur le plan. Toucher une pièce la choisit : ses
// sommets se déplacent au doigt, un rond au milieu d'un côté ajoute un sommet.
// « Dessiner une pièce » : toucher les angles un à un, puis « Terminer ».
// Une pièce proposée par Claude reste « à vérifier » (bleu) tant qu'on ne l'a
// pas corrigée ou confirmée ; une surface dessinée qui s'écarte de la surface
// écrite est signalée. Deux pièces ne se superposent jamais : un geste qui en
// ferait chevaucher une autre n'est pas enregistré. « Annuler » (⌘Z / Ctrl+Z)
// défait les derniers gestes : contour modifié, pièce dessinée, pièce supprimée.

const COULEUR = 'var(--affaire-accent, #E8602C)'
const champ = { height: 34, minHeight: 0, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', width: '100%', boxSizing: 'border-box' }
const petitBouton = { minHeight: 40, padding: '0 14px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }
const encadreAmbre = { margin: 0, fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '8px 10px' }
const BLEU_CLAUDE = '#2E6FDB'

// Zone sensible des poignées : 44 px de diamètre au doigt (règle tablette),
// le rond visible restant petit pour ne pas masquer le plan
const RAYON_TOUCHER = 22

const fmtM2 = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`
const HISTORIQUE_MAX = 50

const designation = (p) => [p.numero, p.nom].filter(Boolean).join(' · ') || 'une autre pièce'

export function EditeurPieces({ niveau, pieces, obtenirLiens, lectureSeule, onModifier, onAjouter, onSupprimer, onAjouterPlusieurs, onRelecture }) {
  const [choisie, setChoisie] = useState(null)
  const [sommet, setSommet] = useState(null) // dernier sommet touché de la pièce choisie
  const [trace, setTrace] = useState(null) // contour en cours de dessin (mètres)
  const [glisse, setGlisse] = useState(null) // { id, contour, index } pendant un déplacement
  // Le dernier déplacement peut arriver juste avant le lâcher, dans le même
  // rendu : la fin du geste enregistre depuis cette ref, pas depuis `glisse`
  const glisseCourant = useRef(null)
  const [attente, setAttente] = useState(null)
  const [erreur, setErreur] = useState(null)
  const svg = useRef(null)
  const brouillon = useRef({}) // saisie du nom / numéro pas encore enregistrée
  const termine = useRef(false) // garde contre un double appui sur « Terminer »
  // Gestes à défaire, du plus ancien au plus récent : { type: 'contour', id,
  // avant } | { type: 'ajout', id } | { type: 'suppression', piece }
  const [historique, setHistorique] = useState([])
  const annulation = useRef(false)
  const c = niveau.cadrage

  const version = useMemo(() => ({ id: niveau.id, chemin: niveau.chemin, chemin_apercu: niveau.chemin_apercu, largeur: niveau.largeur, hauteur: niveau.hauteur }), [niveau])
  const tries = useMemo(() => [...pieces].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { numeric: true })), [pieces])
  const piece = pieces.find((p) => p.id === choisie)
  const controles = useMemo(() => controlesAutomatiques(pieces, niveau.textes ?? []), [pieces, niveau.textes])
  const ecartes = niveau.relecture?.ecartes ?? []
  const aVerifier = signalementsVisibles([...(niveau.relecture?.signalements ?? []), ...controles], pieces, ecartes)
  const contourDe = (p) => (glisse?.id === p.id ? glisse.contour : p.contour)

  const versCalque = (largeur, hauteur) => (p) => {
    const [x, y] = versPixels(c, p)
    return [(x / niveau.largeur) * largeur, (y / niveau.hauteur) * hauteur]
  }
  const depuisEvenement = (e) => {
    const r = svg.current.getBoundingClientRect()
    return versMetres(c, [((e.clientX - r.left) / r.width) * niveau.largeur, ((e.clientY - r.top) / r.height) * niveau.hauteur])
  }

  // Une saisie en cours ne doit pas se perdre si on touche une autre pièce :
  // le blur n'arrive pas toujours avant le démontage du champ sur tablette.
  const enregistrerBrouillon = () => {
    const saisie = brouillon.current
    brouillon.current = {}
    if (!piece || lectureSeule) return
    const champs = {}
    for (const [nomChamp, brut] of Object.entries(saisie)) {
      const valeur = brut.trim()
      if (valeur !== (piece[nomChamp] ?? '')) champs[nomChamp] = valeur || (nomChamp === 'nom' ? '' : null)
    }
    if (Object.keys(champs).length) onModifier(piece.id, { ...champs, a_verifier: false })
  }
  const choisir = (id) => { enregistrerBrouillon(); setChoisie(id); setSommet(null) }

  // Règle de l'agence : jamais deux pièces superposées. Le geste refusé
  // n'écrit rien ; l'écran revient au contour enregistré.
  const chevauchement = (contour, idExclu) => {
    const autre = pieceChevauchee(contour, pieces.filter((q) => q.id !== idExclu))
    if (autre) setErreur(`Cette pièce chevaucherait « ${designation(autre)} » : rien n’a été enregistré.`)
    return !!autre
  }
  const noter = (geste) => setHistorique((h) => [...h.slice(-(HISTORIQUE_MAX - 1)), geste])

  const modifierContour = (id, contour) => {
    if (chevauchement(contour, id)) return
    setErreur(null)
    const avant = pieces.find((q) => q.id === id)?.contour
    if (avant) noter({ type: 'contour', id, avant })
    onModifier(id, { contour, a_verifier: false })
  }

  const supprimer = (p) => {
    brouillon.current = {}
    noter({ type: 'suppression', piece: p })
    onSupprimer(p.id)
    choisir(null)
  }

  // Le dernier geste est retiré de l'historique avant d'être défait : un
  // second appui pendant l'envoi défait le geste d'avant, pas le même
  const annuler = async () => {
    if (!historique.length || annulation.current || glisseCourant.current) return
    const geste = historique[historique.length - 1]
    const reste = historique.slice(0, -1)
    setHistorique(reste)
    setErreur(null)
    if (geste.type === 'contour') {
      if (pieces.some((q) => q.id === geste.id)) onModifier(geste.id, { contour: geste.avant })
      return
    }
    if (geste.type === 'ajout') {
      if (geste.id === choisie) choisir(null)
      onSupprimer(geste.id)
      return
    }
    annulation.current = true
    try {
      const p = geste.piece
      const ligne = await onAjouter(niveau.id, {
        nom: p.nom, numero: p.numero, contour: p.contour, surfaceLue: p.surface_lue, hspLue: p.hsp_lue,
        origine: p.origine, aVerifier: p.a_verifier,
      })
      if (!ligne) { setHistorique([...reste, geste]); return }
      // La pièce revient sous un nouvel identifiant : les gestes plus anciens
      // qui la visaient le suivent
      setHistorique((h) => h.map((g) => (g.id === p.id ? { ...g, id: ligne.id } : g)))
      choisir(ligne.id)
    } finally {
      annulation.current = false
    }
  }

  useEffect(() => {
    if (lectureSeule) return undefined
    const touche = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      // Dans un champ, ⌘Z reste celui du texte
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      // En dessin, ⌘Z retire le dernier angle touché
      if (trace) setTrace((t) => t.slice(0, -1))
      else annuler()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  // Appui bref sur le plan : un angle de plus en dessin, sinon la plus petite
  // pièce qui contient le point
  const toucher = ({ x, y }) => {
    const point = versMetres(c, [x * niveau.largeur, y * niveau.hauteur])
    if (trace) { setTrace((t) => [...t, point]); return }
    const sous = pieces.filter((p) => pointDansPolygone(point, p.contour))
    choisir(sous.length ? sous.reduce((a, b) => (aire(b.contour) < aire(a.contour) ? b : a)).id : null)
  }

  const debutGlisse = (p, i, insertion) => (e) => {
    if (lectureSeule) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const contour = insertion ? insererSommet(p.contour, i, depuisEvenement(e)) : p.contour
    const index = insertion ? i + 1 : i
    glisseCourant.current = { id: p.id, contour, index, insere: !!insertion }
    setGlisse(glisseCourant.current)
    setSommet(index)
  }
  const pendantGlisse = (e) => {
    const g = glisseCourant.current
    if (!g) return
    e.stopPropagation()
    glisseCourant.current = { ...g, contour: deplacerSommet(g.contour, g.index, depuisEvenement(e)) }
    setGlisse(glisseCourant.current)
  }
  const finGlisse = (e) => {
    const g = glisseCourant.current
    if (!g) return
    e.stopPropagation()
    glisseCourant.current = null
    setGlisse(null)
    // pointercancel (le navigateur reprend le geste, défilement ou
    // pincement) : rien d'enregistré
    if (e.type === 'pointercancel') return
    // Un simple appui sur une poignée n'écrit rien
    const avant = pieces.find((q) => q.id === g.id)?.contour
    if (g.insere || JSON.stringify(avant) !== JSON.stringify(g.contour)) modifierContour(g.id, g.contour)
  }

  const terminerTrace = async () => {
    if (trace.length < 3 || termine.current) return
    // Le tracé reste en place : on le reprend ou on l'annule
    if (chevauchement(trace, null)) return
    setErreur(null)
    termine.current = true
    let ligne
    try {
      ligne = await onAjouter(niveau.id, { nom: 'Nouvelle pièce', numero: null, contour: trace, surfaceLue: null, hspLue: null, origine: 'main', aVerifier: false })
    } finally {
      termine.current = false
    }
    // Échec d'enregistrement : le tracé reste, pour réessayer sans tout retoucher
    if (!ligne) return
    noter({ type: 'ajout', id: ligne.id })
    setTrace(null)
    choisir(ligne.id)
  }

  const fairePropose = async () => {
    setErreur(null)
    setAttente('Claude repère les pièces…')
    try {
      const liens = await obtenirLiens([niveau.chemin_apercu])
      const ia = await imageIaDepuisUrl(liens.get(niveau.chemin_apercu))
      const textes = (niveau.textes ?? []).map((t) => {
        const [x, y] = versPixels(c, t.pos)
        return { texte: t.texte, x: (x / niveau.largeur) * ia.largeur, y: (y / niveau.hauteur) * ia.hauteur }
      })
      const proposition = await proposerPiecesIa({ image: ia.image, largeur: ia.largeur, hauteur: ia.hauteur, textes, niveauUnique: true })
      const nouvelles = retirerSuperpositions(versPiecesEdl(proposition.pieces, ([x, y]) => versMetres(c, [(x / ia.largeur) * niveau.largeur, (y / ia.hauteur) * niveau.hauteur]))).gardees
      await onAjouterPlusieurs(niveau.id, nouvelles)
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setAttente(null)
    }
  }

  // Nouvelle relecture : les signalements de Claude sont remplacés, les
  // contrôles écartés à la main le restent
  const relire = async () => {
    setErreur(null)
    setAttente('Claude relit le découpage…')
    try {
      const liens = await obtenirLiens([niveau.chemin_apercu])
      const relecture = await relireNiveau({ niveau, pieces, source: liens.get(niveau.chemin_apercu) })
      await onRelecture({ ...relecture, ecartes: ecartes.filter((c) => c.startsWith('regle:')) })
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setAttente(null)
    }
  }
  const ecarter = (cle) => onRelecture({ ...(niveau.relecture ?? {}), ecartes: [...ecartes, cle] })

  const calque = ({ largeur, hauteur, zoom }) => {
    const enCalque = versCalque(largeur, hauteur)
    const rayon = 9 / zoom
    const zone = { touchAction: 'none', pointerEvents: 'auto', fill: 'transparent' }
    const visible = { pointerEvents: 'none' }
    return (
      <svg ref={svg} width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {pieces.map((p) => (
          <polygon
            key={p.id} points={contourDe(p).map(enCalque).map((q) => q.join(',')).join(' ')}
            style={{
              fill: p.a_verifier ? 'rgba(46,111,219,0.16)' : 'var(--affaire-accent-clair, rgba(232,96,44,0.10))',
              stroke: p.a_verifier ? BLEU_CLAUDE : COULEUR, strokeWidth: (p.id === choisie ? 3 : 1.5) / zoom,
            }}
          />
        ))}
        {piece && !lectureSeule && !trace && (() => {
          const contour = contourDe(piece)
          const pts = contour.map(enCalque)
          const gestes = { onPointerMove: pendantGlisse, onPointerUp: finGlisse, onPointerCancel: finGlisse }
          return (
            <g>
              {pts.map((q, i) => {
                const suivant = pts[(i + 1) % pts.length]
                const cx = (q[0] + suivant[0]) / 2
                const cy = (q[1] + suivant[1]) / 2
                return (
                  <g key={`m${i}`}>
                    <circle
                      cx={cx} cy={cy} r={RAYON_TOUCHER / zoom}
                      onPointerDown={debutGlisse({ ...piece, contour }, i, true)} {...gestes}
                      style={{ ...zone, cursor: 'copy' }}
                    />
                    <circle cx={cx} cy={cy} r={rayon * 0.7} style={{ ...visible, fill: 'white', stroke: COULEUR, strokeWidth: 1.5 / zoom }} />
                  </g>
                )
              })}
              {/* Sommets après les milieux : là où les zones se chevauchent, le sommet l'emporte */}
              {pts.map((q, i) => (
                <g key={`s${i}`}>
                  <circle
                    cx={q[0]} cy={q[1]} r={RAYON_TOUCHER / zoom}
                    onPointerDown={debutGlisse({ ...piece, contour }, i, false)} {...gestes}
                    style={{ ...zone, cursor: 'move' }}
                  />
                  <circle cx={q[0]} cy={q[1]} r={rayon} style={{ ...visible, fill: i === sommet ? '#1F1B17' : COULEUR, stroke: 'white', strokeWidth: 2 / zoom }} />
                </g>
              ))}
            </g>
          )
        })()}
        {trace && (
          <polyline points={trace.map(enCalque).map((q) => q.join(',')).join(' ')} style={{ fill: 'none', stroke: COULEUR, strokeWidth: 2 / zoom, strokeDasharray: `${6 / zoom}` }} />
        )}
      </svg>
    )
  }

  const ecart = piece ? ecartSurface(piece.contour, Number(piece.surface_lue)) : null
  const echelle = ecartEchelle(pieces)

  // Pas de retour à la ligne (flex-wrap) : une rangée qui passe à la ligne
  // prend la hauteur de son plus grand élément, et la liste de 200 pièces
  // étirait le plan sur 9 000 px — l'image, centrée, sortait de l'écran.
  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0 }}>
      <div style={{ flex: '1 1 520px', minWidth: 0, minHeight: 420, border: '0.5px solid rgba(0,0,0,0.1)', overflow: 'hidden', position: 'relative' }}>
        <VisionneusePlan version={version} obtenirLiens={obtenirLiens} onToucher={toucher} calque={calque} />
        {trace && (
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'white', padding: '8px 10px', borderTop: `3px solid ${COULEUR}`, boxShadow: '0 8px 24px -12px rgba(31,27,23,0.45)' }}>
            <span style={{ flex: 1, fontSize: 13, color: '#1F1B17' }}>Touchez les angles de la pièce, un à un <span style={{ color: '#9C9591' }}>({trace.length})</span></span>
            <button type="button" style={{ ...petitBouton, border: 'none', background: COULEUR, color: 'white', fontWeight: 600, opacity: trace.length < 3 ? 0.5 : 1 }} disabled={trace.length < 3} onClick={terminerTrace}>Terminer</button>
            <button type="button" style={{ ...petitBouton, opacity: trace.length ? 1 : 0.5 }} disabled={!trace.length} onClick={() => setTrace((t) => t.slice(0, -1))}
              title="Retirer le dernier angle (⌘Z / Ctrl+Z)"><Undo2 size={14} />Dernier angle</button>
            <button type="button" style={petitBouton} onClick={() => { setTrace(null); setErreur(null) }}><X size={14} />Abandonner</button>
          </div>
        )}
      </div>

      <div style={{ flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, maxHeight: '100%', overflow: 'auto' }}>
        {!lectureSeule && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={petitBouton} disabled={!!trace} onClick={() => { choisir(null); setTrace([]) }}><PenLine size={14} />Dessiner une pièce</button>
            <button type="button" style={{ ...petitBouton, opacity: historique.length && !trace ? 1 : 0.5 }} disabled={!historique.length || !!trace} onClick={annuler}
              title="Annuler le dernier geste (⌘Z / Ctrl+Z)" aria-label="Annuler le dernier geste"><Undo2 size={14} />Annuler{historique.length > 1 ? ` (${historique.length})` : ''}</button>
            {pieces.length === 0 && <button type="button" style={petitBouton} disabled={!!attente} onClick={fairePropose}><Sparkles size={14} />Faire proposer par Claude</button>}
          </div>
        )}
        {echelle != null && (
          <p role="status" style={encadreAmbre}>
            Échelle à vérifier : les surfaces dessinées valent environ ×{echelle.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} les surfaces écrites.
          </p>
        )}
        {pieces.length > 0 && (
          <PanneauRelecture
            signalements={aVerifier} pieces={pieces} relueLe={niveau.relecture?.le} lectureSeule={lectureSeule}
            enCours={!!attente} onRelire={relire} onChoisir={choisir} onEcarter={ecarter}
          />
        )}
        {attente && <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>{attente}</p>}
        {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C', background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 10px' }}>{erreur}</p>}

        {piece && (
          <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: `3px solid ${piece.a_verifier ? BLEU_CLAUDE : COULEUR}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input key={`${piece.id}-nom`} style={champ} disabled={lectureSeule} defaultValue={piece.nom} placeholder="Nom de la pièce" onChange={(e) => { brouillon.current.nom = e.target.value }} onBlur={enregistrerBrouillon} />
            <input key={`${piece.id}-numero`} style={champ} disabled={lectureSeule} defaultValue={piece.numero ?? ''} placeholder="Numéro" onChange={(e) => { brouillon.current.numero = e.target.value }} onBlur={enregistrerBrouillon} />
            <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>
              Dessinée : {fmtM2(aire(piece.contour))}{piece.surface_lue ? ` · écrite : ${fmtM2(Number(piece.surface_lue))}` : ''}
              {piece.hsp_lue ? ` · HSP ${Number(piece.hsp_lue).toLocaleString('fr-FR')} m` : ''}
            </p>
            {ecart != null && Math.abs(ecart) > SEUIL_ECART && (
              <p style={encadreAmbre}>La surface dessinée s’écarte de {Math.round(Math.abs(ecart) * 100)} % de la surface écrite : contour à vérifier.</p>
            )}
            {piece.a_verifier && <p style={{ margin: 0, fontSize: 12, color: BLEU_CLAUDE }}>Proposée par Claude : à vérifier.</p>}
            {!lectureSeule && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {piece.a_verifier && <button type="button" style={petitBouton} onClick={() => onModifier(piece.id, { a_verifier: false })}>Contour juste</button>}
                <button
                  type="button" style={petitBouton} disabled={sommet == null || piece.contour.length <= 3}
                  onClick={() => { modifierContour(piece.id, retirerSommet(piece.contour, sommet)); setSommet(null) }}
                >Retirer le sommet</button>
                <button type="button" style={{ ...petitBouton, color: '#B8412C' }} onClick={() => supprimer(piece)}><Trash2 size={14} />Supprimer</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#9C9591', paddingTop: 2 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#5E5854' }}>{pieces.length} pièce{pieces.length > 1 ? 's' : ''}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--affaire-accent-clair, rgba(232,96,44,0.10))', border: `1.5px solid ${COULEUR}` }} />lue dans le plan</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'rgba(46,111,219,0.16)', border: `1.5px solid ${BLEU_CLAUDE}` }} />Claude</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'white', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          {tries.map((p) => {
            const e = ecartSurface(p.contour, Number(p.surface_lue))
            const alerte = p.a_verifier || (e != null && Math.abs(e) > SEUIL_ECART)
            return (
              <button
                key={p.id} type="button" onClick={() => choisir(p.id)}
                style={{ textAlign: 'left', minHeight: 40, padding: '6px 10px', border: 'none', borderBottom: '0.5px solid rgba(0,0,0,0.06)', borderLeft: `3px solid ${p.id === choisie ? COULEUR : 'transparent'}`, cursor: 'pointer', background: p.id === choisie ? 'var(--affaire-accent-clair, rgba(232,96,44,0.10))' : 'transparent', fontSize: 13, color: '#1F1B17', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.numero && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9C9591', marginRight: 6 }}>{p.numero}</span>}
                  {p.nom || <span style={{ color: '#9C9591' }}>Sans nom</span>}
                </span>
                <span style={{ flexShrink: 0, fontSize: 12, color: alerte ? '#92400E' : '#9C9591' }}>{alerte ? 'à vérifier' : fmtM2(aire(p.contour))}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
