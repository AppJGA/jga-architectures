import { useMemo, useRef, useState } from 'react'
import { Trash2, PenLine, Sparkles, X } from 'lucide-react'
import { VisionneusePlan } from '../../chantier/comptes-rendus/VisionneusePlan'
import {
  aire, pointDansPolygone, ecartSurface, SEUIL_ECART, versPixels, versMetres,
  deplacerSommet, insererSommet, retirerSommet,
} from './geometrieEdl'
import { imageIaDepuisUrl } from './renduNiveau'
import { proposerPiecesIa } from './piecesIa'
import { versPiecesEdl } from './piecesIaLogique'

// ─── Corriger les pièces d'un étage ──────────────────────────────────────────
//
// Les contours en couleur sur le plan. Toucher une pièce la choisit : ses
// sommets se déplacent au doigt, un rond au milieu d'un côté ajoute un sommet.
// « Dessiner une pièce » : toucher les angles un à un, puis « Terminer ».
// Une pièce proposée par Claude reste « à vérifier » (bleu) tant qu'on ne l'a
// pas corrigée ou confirmée ; une surface dessinée qui s'écarte de la surface
// écrite est signalée.

const COULEUR = 'var(--affaire-accent, #E8602C)'
const champ = { minHeight: 36, padding: '0 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 14, width: '100%', boxSizing: 'border-box' }
const petitBouton = { minHeight: 36, padding: '0 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.2)', background: 'white', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }

const fmtM2 = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`

export function EditeurPieces({ niveau, pieces, obtenirLiens, lectureSeule, onModifier, onAjouter, onSupprimer, onAjouterPlusieurs }) {
  const [choisie, setChoisie] = useState(null)
  const [sommet, setSommet] = useState(null) // dernier sommet touché de la pièce choisie
  const [trace, setTrace] = useState(null) // contour en cours de dessin (mètres)
  const [glisse, setGlisse] = useState(null) // { id, contour, index } pendant un déplacement
  const [attente, setAttente] = useState(null)
  const [erreur, setErreur] = useState(null)
  const svg = useRef(null)
  const c = niveau.cadrage

  const version = useMemo(() => ({ id: niveau.id, chemin: niveau.chemin, chemin_apercu: niveau.chemin_apercu, largeur: niveau.largeur, hauteur: niveau.hauteur }), [niveau])
  const tries = useMemo(() => [...pieces].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { numeric: true })), [pieces])
  const piece = pieces.find((p) => p.id === choisie)
  const contourDe = (p) => (glisse?.id === p.id ? glisse.contour : p.contour)

  const versCalque = (largeur, hauteur) => (p) => {
    const [x, y] = versPixels(c, p)
    return [(x / niveau.largeur) * largeur, (y / niveau.hauteur) * hauteur]
  }
  const depuisEvenement = (e) => {
    const r = svg.current.getBoundingClientRect()
    return versMetres(c, [((e.clientX - r.left) / r.width) * niveau.largeur, ((e.clientY - r.top) / r.height) * niveau.hauteur])
  }

  const choisir = (id) => { setChoisie(id); setSommet(null) }

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
    setGlisse({ id: p.id, contour, index })
    setSommet(index)
  }
  const pendantGlisse = (e) => {
    if (!glisse) return
    e.stopPropagation()
    setGlisse((g) => ({ ...g, contour: deplacerSommet(g.contour, g.index, depuisEvenement(e)) }))
  }
  const finGlisse = (e) => {
    if (!glisse) return
    e.stopPropagation()
    const g = glisse
    setGlisse(null)
    // Un deuxième doigt (pincement) annule le geste : rien d'enregistré
    if (e.type === 'pointercancel') return
    onModifier(g.id, { contour: g.contour, a_verifier: false })
  }

  const terminerTrace = async () => {
    if (trace.length < 3) return
    const ligne = await onAjouter(niveau.id, { nom: 'Nouvelle pièce', numero: null, contour: trace, surfaceLue: null, hspLue: null, origine: 'main', aVerifier: false })
    setTrace(null)
    if (ligne) choisir(ligne.id)
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
      const nouvelles = versPiecesEdl(proposition.pieces, ([x, y]) => versMetres(c, [(x / ia.largeur) * niveau.largeur, (y / ia.hauteur) * niveau.hauteur]))
      await onAjouterPlusieurs(niveau.id, nouvelles)
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setAttente(null)
    }
  }

  const calque = ({ largeur, hauteur, zoom }) => {
    const enCalque = versCalque(largeur, hauteur)
    const rayon = 9 / zoom
    const poignee = { touchAction: 'none', pointerEvents: 'auto' }
    return (
      <svg ref={svg} width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {pieces.map((p) => (
          <polygon
            key={p.id} points={contourDe(p).map(enCalque).map((q) => q.join(',')).join(' ')}
            style={{
              fill: p.a_verifier ? 'rgba(46,111,219,0.16)' : 'rgba(232,96,44,0.12)',
              stroke: p.a_verifier ? '#2E6FDB' : COULEUR, strokeWidth: (p.id === choisie ? 3 : 1.5) / zoom,
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
                return (
                  <circle
                    key={`m${i}`} cx={(q[0] + suivant[0]) / 2} cy={(q[1] + suivant[1]) / 2} r={rayon * 0.7}
                    onPointerDown={debutGlisse({ ...piece, contour }, i, true)} {...gestes}
                    style={{ ...poignee, fill: 'white', stroke: COULEUR, strokeWidth: 1.5 / zoom, cursor: 'copy' }}
                  />
                )
              })}
              {pts.map((q, i) => (
                <circle
                  key={`s${i}`} cx={q[0]} cy={q[1]} r={rayon}
                  onPointerDown={debutGlisse({ ...piece, contour }, i, false)} {...gestes}
                  style={{ ...poignee, fill: i === sommet ? '#1F1B17' : COULEUR, stroke: 'white', strokeWidth: 2 / zoom, cursor: 'move' }}
                />
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
  const enregistrerChamp = (champNom) => (e) => {
    const valeur = e.target.value.trim()
    if (valeur !== (piece[champNom] ?? '')) onModifier(piece.id, { [champNom]: valeur || (champNom === 'nom' ? '' : null), a_verifier: false })
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 520px', minHeight: 420, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
        <VisionneusePlan version={version} obtenirLiens={obtenirLiens} onToucher={toucher} calque={calque} />
        {trace && (
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 4px 12px -6px rgba(0,0,0,0.35)' }}>
            <span style={{ fontSize: 13, alignSelf: 'center' }}>Touchez les angles de la pièce ({trace.length})</span>
            <button type="button" style={petitBouton} disabled={trace.length < 3} onClick={terminerTrace}>Terminer</button>
            <button type="button" style={petitBouton} onClick={() => setTrace(null)}><X size={14} />Annuler</button>
          </div>
        )}
      </div>

      <div style={{ flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
        {!lectureSeule && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={petitBouton} disabled={!!trace} onClick={() => { choisir(null); setTrace([]) }}><PenLine size={14} />Dessiner une pièce</button>
            {pieces.length === 0 && <button type="button" style={petitBouton} disabled={!!attente} onClick={fairePropose}><Sparkles size={14} />Faire proposer par Claude</button>}
          </div>
        )}
        {attente && <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>{attente}</p>}
        {erreur && <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{erreur}</p>}

        {piece && (
          <div style={{ background: 'white', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input key={`${piece.id}-nom`} style={champ} disabled={lectureSeule} defaultValue={piece.nom} placeholder="Nom de la pièce" onBlur={enregistrerChamp('nom')} />
            <input key={`${piece.id}-numero`} style={champ} disabled={lectureSeule} defaultValue={piece.numero ?? ''} placeholder="Numéro" onBlur={enregistrerChamp('numero')} />
            <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>
              Dessinée : {fmtM2(aire(piece.contour))}{piece.surface_lue ? ` · écrite : ${fmtM2(Number(piece.surface_lue))}` : ''}
              {piece.hsp_lue ? ` · HSP ${Number(piece.hsp_lue).toLocaleString('fr-FR')} m` : ''}
            </p>
            {ecart != null && Math.abs(ecart) > SEUIL_ECART && (
              <p style={{ margin: 0, fontSize: 13, color: '#B54708' }}>La surface dessinée s’écarte de {Math.round(Math.abs(ecart) * 100)} % de la surface écrite : contour à vérifier.</p>
            )}
            {piece.a_verifier && <p style={{ margin: 0, fontSize: 13, color: '#2E6FDB' }}>Proposée par Claude : à vérifier.</p>}
            {!lectureSeule && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {piece.a_verifier && <button type="button" style={petitBouton} onClick={() => onModifier(piece.id, { a_verifier: false })}>Contour juste</button>}
                <button
                  type="button" style={petitBouton} disabled={sommet == null || piece.contour.length <= 3}
                  onClick={() => { onModifier(piece.id, { contour: retirerSommet(piece.contour, sommet) }); setSommet(null) }}
                >Retirer le sommet</button>
                <button type="button" style={{ ...petitBouton, color: '#B42318' }} onClick={() => { onSupprimer(piece.id); choisir(null) }}><Trash2 size={14} />Supprimer</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tries.map((p) => {
            const e = ecartSurface(p.contour, Number(p.surface_lue))
            const alerte = p.a_verifier || (e != null && Math.abs(e) > SEUIL_ECART)
            return (
              <button
                key={p.id} type="button" onClick={() => choisir(p.id)}
                style={{ textAlign: 'left', minHeight: 40, padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: p.id === choisie ? 'var(--affaire-accent-light, #FCEEE7)' : 'transparent', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <span>{p.numero ? `${p.numero} · ` : ''}{p.nom || 'Sans nom'}</span>
                <span style={{ color: alerte ? '#B54708' : '#9C9591' }}>{alerte ? 'à vérifier' : fmtM2(aire(p.contour))}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
