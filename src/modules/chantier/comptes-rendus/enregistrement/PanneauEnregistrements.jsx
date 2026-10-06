import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, ChevronDown, ChevronUp, Mic, FileAudio, RefreshCw, BookOpen } from 'lucide-react'
import { dureeLisible } from './enregistrementLogique'
import { texteTranscription, resumeEnregistrement } from './transcriptionLogique'
import { listerEnregistrements, supprimerEnregistrement, importerFichier, messageTranscription } from './transcription'
import { messageAnalyse } from './propositions'
import { COULEUR_IA } from './styleProposition'
import { Panneau } from '../PanneauxVisite'
import { IconeRobot } from '../../../../shared/icones/IconesAffaire'
import { ModaleGuideRedaction } from './ModaleGuideRedaction'

// ─── Enregistrements d'un compte rendu ───────────────────────────────────────
//
// Ce qui a été enregistré et transcrit pour ce CR, avec la transcription à
// relire. Même contenu au mode Visite (panneau) et au bureau (vue du CR).

const TAILLE_IMPORT_MAX = 50 * 1024 * 1024

const bouton = (fond = 'white', couleur = '#1F1B17', bord = 'rgba(0,0,0,0.15)') => ({
  minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
  border: fond === 'white' ? `1px solid ${bord}` : 'none', background: fond, color: couleur,
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
})

const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Enregistrement({ enr, lectureSeule, onSupprimer }) {
  const [ouvert, setOuvert] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const texte = texteTranscription(enr.segments)
  const resume = resumeEnregistrement(enr.segments)
  return (
    <li style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {enr.origine === 'fichier' ? <FileAudio size={18} color="#5E5854" /> : <Mic size={18} color="#5E5854" />}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
            {enr.origine === 'fichier' ? 'Fichier importé' : 'Enregistrement'} · {heure(enr.debut)}
          </p>
          <p style={{ fontSize: 12, color: '#9C9591', margin: 0 }}>
            {dureeLisible(resume.duree_s)} transcrites · {resume.transcrits} morceau{resume.transcrits > 1 ? 'x' : ''}
            {enr.analyse_le && <span style={{ color: COULEUR_IA }}> · analysé à {new Date(enr.analyse_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        {texte && (
          <button type="button" onClick={() => setOuvert((o) => !o)} style={bouton()}>
            {ouvert ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {ouvert ? 'Masquer' : 'Lire la transcription'}
          </button>
        )}
        {!lectureSeule && !confirmer && (
          <button type="button" onClick={() => setConfirmer(true)} aria-label="Supprimer la transcription" title="Supprimer la transcription"
            style={{ ...bouton('white', '#B8412C', 'rgba(184,65,44,0.35)'), padding: '0 12px' }}>
            <Trash2 size={15} />
          </button>
        )}
        {confirmer && (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button type="button" onClick={() => setConfirmer(false)} style={bouton()}>Garder</button>
            <button type="button" onClick={() => onSupprimer(enr.id)} style={bouton('#B8412C', 'white')}>Supprimer</button>
          </span>
        )}
      </div>
      {ouvert && (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#3F3A36', whiteSpace: 'pre-wrap', background: '#FAF7F2', padding: '10px 12px', maxHeight: 360, overflowY: 'auto', userSelect: 'text' }}>
          {texte}
        </div>
      )}
      {!texte && <p style={{ fontSize: 12, color: '#9C9591', margin: 0 }}>Rien d’audible n’a été transcrit.</p>}
    </li>
  )
}

/** Contenu commun au panneau du mode Visite et à la vue du bureau. */
export function ListeEnregistrements({ crId, affaireId, vocabulaire = [], version = 0, attente = { enAttente: 0, refuses: 0 }, erreur = null, onTranscrire, onProposer, lectureSeule = false }) {
  const [liste, setListe] = useState(null)
  const [analyse, setAnalyse] = useState(null) // null | 'en-cours' | { message, ok }
  const [erreurLocale, setErreurLocale] = useState(null)
  const [import_, setImport] = useState(null) // null | 'envoi'
  const [rafraichir, setRafraichir] = useState(0)
  const [guideOuvert, setGuideOuvert] = useState(false)
  const champFichier = useRef(null)

  useEffect(() => {
    let annule = false
    listerEnregistrements(crId)
      .then((l) => { if (!annule) setListe(l) })
      .catch((err) => { if (!annule) { setListe([]); setErreurLocale(`Lecture impossible : ${err?.message ?? err}`) } })
    return () => { annule = true }
  }, [crId, version, rafraichir])

  const supprimer = async (id) => {
    try { await supprimerEnregistrement(id); setRafraichir((r) => r + 1) } catch (err) { setErreurLocale(`Suppression impossible : ${err?.message ?? err}`) }
  }

  const importer = async (fichier) => {
    if (!fichier) return
    setErreurLocale(null)
    if (fichier.size > TAILLE_IMPORT_MAX) {
      setErreurLocale('Fichier trop lourd (50 Mo au plus) : dans le Dictaphone, choisissez la qualité « Compressée ».')
      return
    }
    setImport('envoi')
    try {
      await importerFichier(fichier, { crId, affaireId, vocabulaire })
      setRafraichir((r) => r + 1)
    } catch (err) {
      setErreurLocale(err?.code ? messageTranscription(err) : `Import impossible : ${err?.message ?? err}`)
    } finally {
      setImport(null)
    }
  }

  const proposer = async () => {
    setAnalyse('en-cours')
    try {
      const { nombre, cout } = await onProposer()
      setAnalyse({
        ok: true,
        message: nombre === 0
          ? 'L’IA n’a trouvé aucune remarque nouvelle dans cet enregistrement.'
          : `${nombre} remarque${nombre > 1 ? 's' : ''} proposée${nombre > 1 ? 's' : ''}, en bleu dans le compte rendu (coût ≈ ${cout.toFixed(2).replace('.', ',')} $).`,
      })
      setRafraichir((r) => r + 1)
    } catch (err) {
      setAnalyse({ ok: false, message: messageAnalyse(err) })
    }
  }
  const aAnalyser = (liste ?? []).filter((e) => !e.analyse_le && texteTranscription(e.segments)).length

  const message = erreurLocale ?? erreur
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onProposer && !lectureSeule && (aAnalyser > 0 || analyse) && (
        <div style={{ background: '#EEF4FB', border: `1px solid ${COULEUR_IA}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 240px', fontSize: 13, color: '#1D4570' }}>
            {analyse === 'en-cours'
              ? 'L’IA lit la réunion et prépare les remarques… (une minute environ)'
              : analyse?.message ?? `${aAnalyser} enregistrement${aAnalyser > 1 ? 's' : ''} transcrit${aAnalyser > 1 ? 's' : ''} à analyser. Les remarques proposées apparaîtront en bleu, à valider une à une.`}
          </span>
          {aAnalyser > 0 && analyse !== 'en-cours' && (
            <button type="button" onClick={proposer} disabled={attente.enAttente > 0}
              title={attente.enAttente > 0 ? 'Des morceaux attendent encore leur transcription' : undefined}
              style={{ ...bouton(COULEUR_IA, 'white'), fontWeight: 600, opacity: attente.enAttente > 0 ? 0.5 : 1 }}>
              <IconeRobot size={20} /> Proposer les remarques
            </button>
          )}
        </div>
      )}
      {(attente.enAttente > 0 || attente.refuses > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 12px', fontSize: 13, color: '#92400E' }}>
          <span style={{ flex: '1 1 220px' }}>
            {attente.enAttente > 0 && `${attente.enAttente} morceau${attente.enAttente > 1 ? 'x' : ''} en attente de transcription sur cet appareil. `}
            {attente.refuses > 0 && `${attente.refuses} refusé${attente.refuses > 1 ? 's' : ''} par la transcription.`}
          </span>
          {attente.enAttente > 0 && onTranscrire && (
            <button type="button" onClick={onTranscrire} style={bouton()}><RefreshCw size={15} /> Transcrire maintenant</button>
          )}
        </div>
      )}
      {message && <p role="alert" style={{ fontSize: 13, color: '#B8412C', margin: 0 }}>{message}</p>}

      {liste === null && <p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>}
      {liste?.length === 0 && (
        <p style={{ fontSize: 14, color: '#5E5854', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconeRobot size={22} /> Aucun enregistrement transcrit pour ce compte rendu.
        </p>
      )}
      {liste?.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {liste.map((enr) => <Enregistrement key={enr.id} enr={enr} lectureSeule={lectureSeule} onSupprimer={supprimer} />)}
        </ul>
      )}

      {!lectureSeule && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
          <button type="button" onClick={() => champFichier.current?.click()} disabled={import_ !== null} style={bouton()}>
            <Upload size={15} /> {import_ ? 'Envoi et transcription…' : 'Importer un enregistrement'}
          </button>
          <span style={{ fontSize: 12, color: '#9C9591', flex: '1 1 200px' }}>
            Un fichier du Dictaphone (50 Mo au plus) : utile si l’iPad devait rester verrouillé pendant la réunion.
          </span>
          <input ref={champFichier} type="file" accept="audio/*,.m4a" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importer(f) }} />
        </div>
      )}
      {onProposer && !lectureSeule && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setGuideOuvert(true)} style={bouton('white', COULEUR_IA, COULEUR_IA)}>
            <BookOpen size={15} /> Guide de rédaction de l’IA
          </button>
          <span style={{ fontSize: 12, color: '#9C9591', flex: '1 1 200px' }}>
            La façon d’écrire de l’agence que l’IA imite : à relire et ajuster.
          </span>
        </div>
      )}
      {guideOuvert && <ModaleGuideRedaction onFermer={() => setGuideOuvert(false)} />}
    </div>
  )
}

// Avant de lancer le robot : ce qu'il faut savoir, et le bouton qui démarre
// (le micro se demande dans ce geste même, exigence d'iOS)
function Demarrage({ onCommencer }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(184,65,44,0.35)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: '#3F3A36', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li><strong>Prévenez les participants</strong> que la réunion est enregistrée pour la rédaction du compte rendu.</li>
        <li><strong>Gardez l’iPad déverrouillé</strong> : écran verrouillé, le micro s’arrête. Il repart seul au retour, mais ce moment-là est perdu.</li>
        <li>Continuez à noter vos remarques comme d’habitude : elles restent la référence.</li>
      </ul>
      <button type="button" onClick={onCommencer} style={{ ...bouton('#B8412C', 'white'), alignSelf: 'flex-start', fontSize: 15, fontWeight: 600, padding: '0 20px' }}>
        <IconeRobot size={22} /> Commencer l’enregistrement
      </button>
    </div>
  )
}

export function PanneauEnregistrements({ onFermer, robot, peutEnregistrer, ...props }) {
  return (
    <Panneau titre="Enregistrer la réunion" onFermer={onFermer}>
      {peutEnregistrer && robot?.etat === 'pret' && (
        <Demarrage onCommencer={() => { robot.demarrer(); onFermer() }} />
      )}
      {robot?.erreur && robot.etat === 'pret' && !props.erreur && <p role="alert" style={{ fontSize: 13, color: '#B8412C', margin: 0 }}>{robot.erreur}</p>}
      <ListeEnregistrements {...props} />
    </Panneau>
  )
}
