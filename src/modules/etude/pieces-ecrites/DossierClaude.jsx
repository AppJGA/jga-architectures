import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, Check, Copy, ExternalLink, AlertTriangle, FileText } from 'lucide-react'
import consignes from './consignesConformite.md?raw'
import { lirePlan, fabriquerDossier, telecharger } from './fabricationDossier'
import { estPdf } from './lecturePdf'
import {
  ordonnerPieces, libellePiece, lotsSansCctp, ordonnerPlans, messageClaude,
  PROJET_CLAUDE_CONFORMITE, VERSION_CONSIGNES, LIMITE_PDF_CLAUDE,
} from './dossierClaudeLogique'

// ─── Préparer le dossier pour Claude ─────────────────────────────────────────
//
// Les CCTP de l'affaire + les plans déposés ici → un ZIP à glisser dans le
// projet claude.ai de l'agence, où se fait l'analyse de conformité. Les plans
// sont lus sur l'appareil et ne sont gardés nulle part.

const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 3, fontSize: 13, cursor: 'pointer' }
const boutonPrincipal = { ...bouton, border: 'none', background: '#E8602C', color: 'white', fontWeight: 600 }
const mo = (octets) => `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`

function BoutonCopier({ texte, libelle }) {
  const [etat, setEtat] = useState(null)
  return (
    <button type="button" style={bouton} onClick={async () => {
      try { await navigator.clipboard.writeText(texte); setEtat('ok') } catch { setEtat('echec') }
    }}>
      {etat === 'ok' ? <Check size={15} color="#2A8A4E" /> : <Copy size={15} />}
      {etat === 'ok' ? 'Copié' : etat === 'echec' ? 'Copie impossible : sélectionnez le texte' : libelle}
    </button>
  )
}

export function DossierClaude({ affaire, pieces, articles, lots, onFermer }) {
  const [plans, setPlans] = useState([]) // { id, fichier, etat: 'lecture'|'pret'|'erreur', lu, erreur }
  const [fabrication, setFabrication] = useState(null) // null | { progression } | { fini: { nom, octetsPdf } }
  const [erreur, setErreur] = useState(null)
  const champFichiers = useRef(null)
  const identifiant = useRef(0)
  const enCours = fabrication && !fabrication.fini

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, enCours])

  const majPlan = (id, changement) => setPlans((liste) => liste.map((p) => (p.id === id ? { ...p, ...changement } : p)))

  const ajouter = async (fichiers) => {
    setFabrication(null)
    for (const fichier of [...fichiers].filter(estPdf)) {
      const id = ++identifiant.current
      setPlans((liste) => [...liste, { id, fichier, etat: 'lecture' }])
      try {
        majPlan(id, { etat: 'pret', lu: await lirePlan(fichier) })
      } catch (err) {
        majPlan(id, { etat: 'erreur', erreur: err?.message ?? String(err) })
      }
    }
  }

  const prets = ordonnerPlans(plans.filter((p) => p.etat === 'pret').map((p) => ({ ...p, nomFichier: p.fichier.name })))
  const lecture = plans.some((p) => p.etat === 'lecture')
  const sansCctp = lotsSansCctp(lots, pieces)

  const fabriquer = async () => {
    setErreur(null)
    setFabrication({ progression: 0 })
    try {
      const { blob, nom, octetsPdf } = await fabriquerDossier({
        affaire, pieces, articles, lots, plans: prets.map((p) => p.lu),
        surProgression: (progression) => setFabrication({ progression }),
      })
      telecharger(blob, nom)
      setFabrication({ fini: { nom, octetsPdf } })
    } catch (err) {
      setFabrication(null)
      setErreur(`Le dossier n’a pas pu être fabriqué : ${err?.message ?? err}`)
    }
  }

  const message = messageClaude(affaire ?? {})

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(32px + env(safe-area-inset-top)) 16px 32px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Préparer le dossier pour Claude"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 720, borderTop: '3px solid #E8602C', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Préparer le dossier pour Claude</h2>
          <button type="button" onClick={onFermer} disabled={enCours} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fabrication?.fini ? (
            <>
              <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#2A8A4E' }}>
                <Check size={18} /> Le dossier est prêt : {fabrication.fini.nom}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#1F1B17', lineHeight: 1.55 }}>
                Ouvrez le projet Claude, démarrez une nouvelle conversation, glissez-y les quatre fichiers du dossier (décompressé : double-cliquez sur le ZIP dans vos Téléchargements) et collez le message ci-dessous. Si Claude s’arrête en cours de route, écrivez « Continue ».
              </p>
              <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#1F1B17', userSelect: 'all' }}>{message}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <BoutonCopier texte={message} libelle="Copier le message" />
                <a href={PROJET_CLAUDE_CONFORMITE} target="_blank" rel="noreferrer" style={{ ...boutonPrincipal, textDecoration: 'none' }}>
                  <ExternalLink size={15} /> Ouvrir le projet Claude
                </a>
              </div>
              {fabrication.fini.octetsPdf > LIMITE_PDF_CLAUDE && (
                <p role="alert" style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12, color: '#92400E' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Les plans réunis pèsent {mo(fabrication.fini.octetsPdf)} : claude.ai refuse un fichier de plus de 30 Mo. Allégez les plans avec l’Aplatisseur de plan (« alléger en gardant le vectoriel »), ou déposez seulement les trois fichiers texte.
                </p>
              )}
            </>
          ) : (
            <>
              <section>
                <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>CCTP de l’affaire ({pieces.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5E5854' }}>
                  {ordonnerPieces(pieces, lots).map((p) => (
                    <li key={p.id}>{libellePiece(p, lots)} — {p.nb_articles} articles{p.indice ? ` · indice ${p.indice}` : ''}</li>
                  ))}
                </ul>
                {sansCctp.length > 0 && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#92400E' }}>
                    Lots sans CCTP : {sansCctp.map((l) => l.nom).join(', ')}. Importez-les d’abord si l’analyse doit les couvrir.
                  </p>
                )}
              </section>

              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); ajouter(e.dataTransfer.files) }}
                style={{ border: '1px dashed rgba(0,0,0,0.25)', background: 'white', padding: '18px 16px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5E5854' }}>
                  Déposez ici les plans en PDF (plusieurs à la fois), ou
                </p>
                <button type="button" onClick={() => champFichiers.current?.click()} disabled={enCours} style={bouton}>
                  <Upload size={15} /> Choisir des fichiers
                </button>
                <input ref={champFichiers} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }}
                  onChange={(e) => { ajouter(e.target.files); e.target.value = '' }} />
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9C9591' }}>
                  Les plans sont lus sur cet ordinateur et ne sont gardés nulle part. Nommez-les par leur numéro (« 40 RDC.pdf ») : ils sont rangés dans cet ordre.
                </p>
              </div>

              {plans.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ordonnerPlans(plans.map((p) => ({ ...p, nomFichier: p.fichier.name }))).map((p) => (
                    <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '6px 10px', fontSize: 12 }}>
                      <FileText size={14} color="#9C9591" />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fichier.name}</span>
                      {p.etat === 'lecture' && <span style={{ color: '#9C9591' }}>Lecture…</span>}
                      {p.etat === 'pret' && <span style={{ color: p.lu.sansTexte ? '#92400E' : '#2A8A4E' }}>{p.lu.sansTexte ? 'Aucun texte lisible (scan ?)' : `${p.lu.nbPages} p.`}</span>}
                      {p.etat === 'erreur' && <span role="alert" style={{ color: '#B8412C' }}>{p.erreur}</span>}
                      {!enCours && (
                        <button type="button" onClick={() => setPlans((liste) => liste.filter((x) => x.id !== p.id))} aria-label={`Retirer ${p.fichier.name}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 2 }}><X size={14} /></button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {enCours && <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>Fabrication du dossier… {Math.round(fabrication.progression * 100)} %</p>}
            </>
          )}
          {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>{erreur}</p>}

          <details style={{ fontSize: 12, color: '#5E5854' }}>
            <summary style={{ cursor: 'pointer' }}>Consignes du projet Claude (version {VERSION_CONSIGNES})</summary>
            <p style={{ margin: '8px 0' }}>À coller une fois dans les instructions du projet, et de nouveau quand la version change (Claude le signale).</p>
            <BoutonCopier texte={consignes} libelle="Copier les consignes" />
            <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', padding: 10, fontSize: 11 }}>{consignes}</pre>
          </details>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={bouton}>{fabrication?.fini ? 'Fermer' : 'Annuler'}</button>
          {!fabrication?.fini && (
            <button type="button" onClick={fabriquer} disabled={enCours || lecture || prets.length === 0}
              style={{ ...boutonPrincipal, opacity: enCours || lecture || prets.length === 0 ? 0.5 : 1 }}>
              {enCours ? 'Fabrication…' : 'Fabriquer le dossier'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
