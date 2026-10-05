import { useState, useEffect, useRef } from 'react'
import { Bot, Square, RotateCcw, Camera, Copy, Trash2, Download } from 'lucide-react'
import { enregistrementPossible, demarrerEnregistreur } from '../../modules/chantier/comptes-rendus/enregistrement/enregistreur'
import { rangerMorceau, rangerTranche, lireMorceaux, recupererMorceaux, dernierEnregistrement, effacerEnregistrement } from '../../modules/chantier/comptes-rendus/enregistrement/audioLocal'
import { dureeLisible, bilanEssai, extensionDe } from '../../modules/chantier/comptes-rendus/enregistrement/enregistrementLogique'

// ─── Essai d'enregistrement (visite enregistrée, lot 0) ──────────────────────
//
// Avant de construire le robot du mode Visite, on vérifie sur le terrain ce
// que Safari et Chrome tiennent : une heure, écran verrouillé, photo prise,
// app installée. Rien ne quitte l'appareil ; le bilan se copie dans la
// conversation.

// Le journal survit à un rechargement : si Safari ferme la page, c'est lui
// qui dira ce qui s'est passé juste avant
const CLE_JOURNAL = 'jga-essai-enregistrement'
function lireJournal() {
  try { return JSON.parse(localStorage.getItem(CLE_JOURNAL)) } catch { return null }
}

const DUREES = [{ ms: 60_000, libelle: '1 min (essai rapide)' }, { ms: 300_000, libelle: '5 min (comme en vrai)' }]

function navigateurLisible() {
  const ua = navigator.userAgent
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const appareil = ipad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'appareil'
  const nav = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Safari/.test(ua) ? 'Safari' : 'navigateur'
  return `${nav} ${appareil}`
}
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

const bouton = (fond, texte, bord = 'none') => ({
  minHeight: 44, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 8,
  border: bord, borderRadius: 3, background: fond, color: texte, fontSize: 13, cursor: 'pointer',
})

export function EssaiEnregistrement() {
  const [dureeMorceau, setDureeMorceau] = useState(DUREES[0].ms)
  const [etat, setEtat] = useState('pret') // pret | enregistre | coupe | arrete
  const [niveau, setNiveau] = useState(0)
  const [maintenant, setMaintenant] = useState(0)
  const [morceaux, setMorceaux] = useState([]) // chacun porte son `url` de lecture
  const [evenements, setEvenements] = useState([])
  const [erreur, setErreur] = useState(null)
  const [copie, setCopie] = useState(null)
  const [session, setSession] = useState(null) // { id, debut, fin, format, verrouEcran }
  // Hors de l'affichage : le moteur en marche, et les liens à libérer
  const moteur = useRef(null)
  const urls = useRef([])

  const avecUrl = (m) => {
    const url = URL.createObjectURL(m.blob)
    urls.current.push(url)
    return { ...m, url }
  }

  const ajouterEvenement = (e) => setEvenements((liste) => [...liste, e])

  // Un essai interrompu par un rechargement se relit : c'est ce qu'on teste
  useEffect(() => {
    let annule = false
    dernierEnregistrement().then(async (id) => {
      if (!id || annule) return
      // Page fermée en plein enregistrement : le morceau en cours se recolle
      const recuperes = await recupererMorceaux(id)
      const lus = await lireMorceaux(id)
      if (annule || lus.length === 0) return
      const journal = lireJournal()
      const memorisee = journal?.session?.id === id ? journal.session : null
      setSession({
        ...memorisee, id, debut: memorisee?.debut ?? lus[0].debut,
        fin: memorisee?.fin ?? lus.at(-1).debut + lus.at(-1).duree_s * 1000, format: lus[0].type,
      })
      const retour = [
        { t: Date.now(), type: 'page-rechargee' },
        ...recuperes.map((m) => ({ t: Date.now(), type: 'morceau-recupere', detail: `n° ${m.rang}, ${Math.round(m.duree_s)} s` })),
      ]
      setEvenements([...(memorisee ? journal.evenements ?? [] : []), ...retour])
      setMorceaux(lus.map(avecUrl))
      setEtat('arrete')
    }).catch((err) => setErreur(`Lecture des essais précédents impossible : ${err?.message ?? err}`))
    return () => { annule = true }
  }, [])

  useEffect(() => {
    // Pas d'effacement ici : au premier affichage la session est encore vide,
    // le journal n'a pas été relu
    if (!session) return
    try { localStorage.setItem(CLE_JOURNAL, JSON.stringify({ session, evenements })) } catch { /* stockage indisponible : le journal reste à l'écran */ }
  }, [session, evenements])

  useEffect(() => {
    if (etat !== 'enregistre') return undefined
    const minuterie = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(minuterie)
  }, [etat])

  useEffect(() => () => {
    moteur.current?.arreter()
    for (const u of urls.current) URL.revokeObjectURL(u)
  }, [])

  const lancer = async (reprise = false) => {
    setErreur(null)
    const s = reprise && session ? session : { id: crypto.randomUUID(), debut: Date.now() }
    if (!reprise) {
      setMorceaux([])
      setEvenements([])
    }
    setMaintenant(Date.now())
    try {
      const m = await demarrerEnregistreur({
        dureeMorceauMs: dureeMorceau,
        rangDepart: (morceaux.at(-1)?.rang ?? 0) + 1,
        onNiveau: setNiveau,
        onEvenement: (e) => {
          ajouterEvenement(e)
          if (e.type === 'piste-terminee') setEtat('coupe')
        },
        onTranche: (tranche) => {
          rangerTranche({ ...tranche, id: `${s.id}:${tranche.rang}:${tranche.index}`, enregistrementId: s.id }).catch(() => {})
        },
        onMorceau: async (brut) => {
          const morceau = { ...brut, id: crypto.randomUUID(), enregistrementId: s.id }
          setMorceaux((liste) => [...liste, avecUrl(morceau)])
          try { await rangerMorceau(morceau) } catch (err) {
            ajouterEvenement({ t: Date.now(), type: 'erreur', detail: `rangement : ${err?.message ?? err}` })
          }
        },
      })
      moteur.current = m
      setSession({ ...s, fin: null, format: m.format, verrouEcran: m.verrouEcran })
      if (reprise) ajouterEvenement({ t: Date.now(), type: 'reprise' })
      setEtat('enregistre')
    } catch (err) {
      setErreur(err?.name === 'NotAllowedError'
        ? 'Micro refusé : autorisez-le pour ce site dans les réglages du navigateur.'
        : `Impossible de démarrer : ${err?.message ?? err}`)
    }
  }

  const arreter = async () => {
    await moteur.current?.arreter()
    moteur.current = null
    setSession((x) => (x ? { ...x, fin: Date.now() } : x))
    setNiveau(0)
    setEtat('arrete')
  }

  const effacer = async () => {
    if (session?.id) await effacerEnregistrement(session.id)
    for (const u of urls.current) URL.revokeObjectURL(u)
    urls.current = []
    try { localStorage.removeItem(CLE_JOURNAL) } catch { /* rien à effacer */ }
    setSession(null)
    setMorceaux([])
    setEvenements([])
    setCopie(null)
    setEtat('pret')
  }

  const s = session
  const bilan = s ? bilanEssai({
    debut: s.debut, fin: s.fin ?? maintenant, morceaux, evenements,
    environnement: { navigateur: navigateurLisible(), installee: estInstallee(), verrouEcran: s.verrouEcran ?? 'inconnu', format: s.format },
  }) : null

  const copier = async () => {
    try { await navigator.clipboard.writeText(bilan.texte); setCopie('copié') } catch { setCopie('manuel') }
  }

  if (!enregistrementPossible()) {
    return <p style={{ fontSize: 13, color: '#B8412C' }}>Ce navigateur ne sait pas enregistrer le son.</p>
  }

  const enCours = etat === 'enregistre'
  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 4px', color: '#1F1B17' }}>Essai d’enregistrement</h1>
        <p style={{ fontSize: 12, color: '#7A736E', margin: 0, lineHeight: 1.5 }}>
          Lancez l’enregistrement, puis vivez la visite normalement : verrouillez l’écran, prenez une photo, passez à une autre
          app, revenez. À la fin, arrêtez et copiez le bilan. Rien ne quitte cet appareil.
        </p>
      </div>

      {etat === 'pret' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DUREES.map((d) => (
            <button key={d.ms} type="button" onClick={() => setDureeMorceau(d.ms)}
              style={bouton(dureeMorceau === d.ms ? 'var(--jga-green-light)' : 'white', '#1F1B17', `0.5px solid ${dureeMorceau === d.ms ? 'var(--jga-green)' : 'rgba(0,0,0,0.15)'}`)}>
              Morceaux de {d.libelle}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: 16, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <button type="button" onClick={enCours ? arreter : () => lancer(false)}
          aria-label={enCours ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement'}
          style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer', background: enCours ? '#B8412C' : 'var(--jga-green)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {enCours ? <Square size={24} /> : <Bot size={30} />}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          {enCours ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500, color: '#B8412C' }}>
                <span className="jga-enregistre" style={{ width: 10, height: 10, borderRadius: '50%', background: '#B8412C' }} />
                Enregistrement · {dureeLisible((maintenant - s.debut) / 1000)}
              </span>
              <span aria-label="Niveau du son" style={{ width: 180, height: 6, background: '#EEE9E4', borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round(niveau * 100)}%`, background: 'var(--jga-green)', transition: 'width 0.1s linear' }} />
              </span>
            </>
          ) : (
            <span style={{ fontSize: 14, color: '#5E5854' }}>
              {etat === 'coupe' ? 'Le micro a été coupé.' : etat === 'arrete' ? 'Enregistrement arrêté.' : 'Prêt.'}
            </span>
          )}
        </div>
        {etat === 'coupe' && (
          <button type="button" onClick={() => lancer(true)} style={bouton('#F59E0B', 'white')}><RotateCcw size={16} /> Reprendre</button>
        )}
        <label style={{ ...bouton('white', '#1F1B17', '0.5px solid rgba(0,0,0,0.15)'), marginLeft: 'auto' }}>
          <Camera size={16} /> Prendre une photo
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={(e) => { ajouterEvenement({ t: Date.now(), type: 'photo', detail: e.target.files?.length ? 'prise' : 'annulée' }); e.target.value = '' }} />
        </label>
      </div>

      {erreur && <p role="alert" style={{ fontSize: 13, color: '#B8412C', margin: 0 }}>{erreur}</p>}

      {morceaux.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 10px' }}>Morceaux enregistrés</p>
          {morceaux.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 12, width: 150 }}>n° {m.rang} · {dureeLisible(m.duree_s)} · {Math.round(m.taille / 1000)} Ko</span>
              <audio controls preload="none" src={m.url} style={{ height: 32, maxWidth: '100%' }} />
              <a href={m.url} download={`essai-${m.rang}.${extensionDe(m.type)}`} style={{ ...bouton('white', '#1F1B17', '0.5px solid rgba(0,0,0,0.15)'), textDecoration: 'none' }}>
                <Download size={14} /> Télécharger
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Pendant l'enregistrement, le morceau en cours compterait comme perdu */}
      {bilan && !enCours && (
        <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copier} disabled={enCours} style={bouton('var(--jga-green)', 'white')}><Copy size={16} /> Copier le bilan</button>
            <button type="button" onClick={effacer} disabled={enCours} style={bouton('white', '#B8412C', '0.5px solid rgba(184,65,44,0.4)')}><Trash2 size={16} /> Effacer l’essai</button>
            {copie === 'copié' && <span style={{ fontSize: 12, color: 'var(--jga-green)', alignSelf: 'center' }}>Copié : collez-le dans la conversation.</span>}
            {copie === 'manuel' && <span style={{ fontSize: 12, color: '#7A736E', alignSelf: 'center' }}>Sélectionnez le texte ci-dessous et copiez-le.</span>}
          </div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0, padding: 10, background: '#FAF7F2', userSelect: 'text' }}>{bilan.texte}</pre>
        </div>
      )}
    </div>
  )
}
