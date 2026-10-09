import { useState, useRef } from 'react'
import { ArrowRightLeft, Upload, X, CheckCircle, AlertCircle, Download } from 'lucide-react'
import {
  ACCEPT, FORMATS_SORTIE, TAILLES, formatDe, nomSortie, nomArchive,
  modeTelechargement, formatTaille,
} from './conversionLogique'
import { lireEntete, convertir, fabriquerZip, telecharger } from './conversion'

const labelStyle = {
  fontSize: 10, fontWeight: 600, color: '#9C9591',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'block', marginBottom: 6,
}

const mono = { fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }

const COLONNES = '1fr 64px 76px 120px 32px'

// Les noms sont tirés au moment du téléchargement, dans l'ordre de la liste :
// une photo retirée ne laisse pas de « (2) » orphelin chez la suivante.
function sortiesNommees(fichiers, sortie) {
  const pris = new Set()
  return fichiers
    .filter(f => f.statut === 'fait')
    .map(f => ({ nom: nomSortie(f.nom, sortie, pris), blob: f.resultat }))
}

export function ConvertisseurTool() {
  const [fichiers, setFichiers] = useState([])
  const [survol, setSurvol] = useState(false)
  const [sortieId, setSortieId] = useState(FORMATS_SORTIE[0].id)
  const [tailleId, setTailleId] = useState('email')
  const [enCours, setEnCours] = useState(false)
  const [preparationZip, setPreparationZip] = useState(false)
  const inputRef = useRef(null)

  const sortie = FORMATS_SORTIE.find(f => f.id === sortieId)
  const taille = TAILLES.find(t => t.id === tailleId)

  const ajouter = async (bruts) => {
    const entrees = await Promise.all(Array.from(bruts).map(async fichier => {
      const format = formatDe(fichier.name, await lireEntete(fichier).catch(() => null))
      return {
        id: crypto.randomUUID(),
        fichier,
        nom: fichier.name,
        octets: fichier.size,
        format: format?.libelle ?? '?',
        statut: format ? 'attente' : 'refuse',
        resultat: null,
      }
    }))
    setFichiers(prev => [...prev, ...entrees])
  }

  // Les photos déjà converties l'ont été avec les anciens réglages : elles
  // repassent en attente plutôt que de partir dans le ZIP avec la mauvaise taille
  const changerReglage = (appliquer) => {
    appliquer()
    setFichiers(prev => prev.map(f =>
      f.statut === 'fait' || f.statut === 'erreur' ? { ...f, statut: 'attente', resultat: null, erreur: null } : f
    ))
  }

  const maj = (id, champs) => setFichiers(prev => prev.map(f => f.id === id ? { ...f, ...champs } : f))

  const telechargerTout = async (liste) => {
    const sorties = sortiesNommees(liste, sortie)
    const mode = modeTelechargement(sorties.length)
    if (mode === 'fichier') telecharger(sorties[0].blob, sorties[0].nom)
    if (mode === 'zip') {
      setPreparationZip(true)
      try {
        telecharger(await fabriquerZip(sorties), nomArchive())
      } finally {
        setPreparationZip(false)
      }
    }
  }

  const convertirTout = async () => {
    const aFaire = fichiers.filter(f => f.statut === 'attente')
    if (enCours || !aFaire.length) return
    setEnCours(true)
    // La liste est suivie ici en plus de l'état : le téléchargement final en a
    // besoin tout de suite, pas au rendu suivant
    let liste = fichiers
    for (const entree of aFaire) {
      maj(entree.id, { statut: 'conversion' })
      let champs
      try {
        const { blob } = await convertir(entree.fichier, sortie, taille)
        champs = { statut: 'fait', resultat: blob }
      } catch (err) {
        console.error(`Conversion de ${entree.nom}`, err)
        champs = { statut: 'erreur', erreur: err?.message ?? String(err) }
      }
      liste = liste.map(f => f.id === entree.id ? { ...f, ...champs } : f)
      maj(entree.id, champs)
    }
    setEnCours(false)
    await telechargerTout(liste)
  }

  const retirer = (id) => !enCours && setFichiers(prev => prev.filter(f => f.id !== id))

  const enAttente = fichiers.filter(f => f.statut === 'attente').length
  const faits = fichiers.filter(f => f.statut === 'fait').length
  const mode = modeTelechargement(faits)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 680, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44,
          backgroundColor: 'rgba(42,138,78,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ArrowRightLeft size={22} strokeWidth={1.25} style={{ color: 'var(--jga-green)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#1F1B17', margin: 0, lineHeight: 1.3 }}>
            Convertisseur
          </h1>
          <p style={{ fontSize: 12, color: '#9C9591', margin: 0 }}>
            Photos HEIC de l’iPhone en JPEG, une à une ou par lot
          </p>
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false) }}
        onDrop={e => { e.preventDefault(); setSurvol(false); if (!enCours) ajouter(e.dataTransfer.files) }}
        onClick={() => !enCours && inputRef.current?.click()}
        style={{
          border: '2px dashed var(--jga-green)',
          backgroundColor: survol ? 'rgba(42,138,78,0.08)' : '#FAF7F2',
          padding: '28px 24px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6,
          cursor: enCours ? 'default' : 'pointer',
          marginBottom: 8,
          transition: 'background-color 0.15s',
          userSelect: 'none',
        }}
      >
        <Upload size={26} strokeWidth={1.25} style={{ color: 'var(--jga-green)', marginBottom: 2 }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
          Déposez vos photos ici
        </p>
        <p style={{ fontSize: 11, color: '#9C9591', margin: 0 }}>
          ou cliquez pour les choisir — HEIC, mais aussi JPEG, PNG ou WebP
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={e => { ajouter(e.target.files); e.target.value = '' }}
        />
      </div>
      <p style={{ fontSize: 11, color: '#9C9591', margin: '0 0 16px' }}>
        Les photos restent sur cet ordinateur : rien n’est envoyé ni conservé en ligne.
      </p>

      {fichiers.length > 0 && (
        <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16, maxHeight: 360, overflowY: 'auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLONNES,
            padding: '6px 12px', backgroundColor: '#F5F2EE',
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
            position: 'sticky', top: 0,
          }}>
            {['Nom', 'Format', 'Taille', 'Statut', ''].map((h, i) => (
              <span key={i} style={{ ...labelStyle, marginBottom: 0, textAlign: i === 0 ? 'left' : 'center' }}>{h}</span>
            ))}
          </div>

          {fichiers.map((f, idx) => (
            <div key={f.id} style={{
              display: 'grid', gridTemplateColumns: COLONNES,
              padding: '8px 12px', alignItems: 'center',
              borderBottom: idx < fichiers.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
              backgroundColor: idx % 2 === 1 ? '#FAF7F2' : 'white',
            }}>
              <span style={{
                ...mono, color: '#1F1B17',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8,
              }} title={f.nom}>{f.nom}</span>
              <span style={{ ...mono, color: '#9C9591', textAlign: 'center' }}>{f.format}</span>
              <span style={{ ...mono, color: '#9C9591', textAlign: 'center' }}>
                {formatTaille(f.resultat?.size ?? f.octets)}
              </span>
              <Statut fichier={f} />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => retirer(f.id)}
                  disabled={enCours}
                  title="Retirer de la liste"
                  style={{
                    background: 'none', border: 'none', padding: 4,
                    cursor: enCours ? 'default' : 'pointer',
                    color: '#C4BEB9', opacity: enCours ? 0.4 : 1,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 2fr',
        border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16,
      }}>
        <div style={{ padding: '12px 14px', borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
          <label style={labelStyle}>Convertir en</label>
          <select
            value={sortieId}
            onChange={e => changerReglage(() => setSortieId(e.target.value))}
            disabled={enCours}
            style={{
              width: '100%', fontSize: 12, color: '#1F1B17',
              border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: '#FAF7F2',
              padding: '6px 8px', fontFamily: "'Inter', sans-serif", outline: 'none',
            }}
          >
            {FORMATS_SORTIE.map(f => <option key={f.id} value={f.id}>{f.libelle}</option>)}
          </select>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <label style={labelStyle}>Taille</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TAILLES.map(t => {
              const actif = t.id === tailleId
              return (
                <button
                  key={t.id}
                  onClick={() => t.id !== tailleId && changerReglage(() => setTailleId(t.id))}
                  disabled={enCours}
                  style={{
                    flex: 1, textAlign: 'left', padding: '6px 10px',
                    border: actif ? '1px solid var(--jga-green)' : '0.5px solid rgba(0,0,0,0.15)',
                    backgroundColor: actif ? 'var(--jga-green-light)' : 'white',
                    cursor: enCours ? 'default' : 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>{t.libelle}</span>
                  <span style={{ display: 'block', fontSize: 10, color: '#9C9591' }}>{t.detail}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <button
        onClick={convertirTout}
        disabled={enCours || enAttente === 0}
        style={{
          width: '100%', padding: '13px 24px',
          backgroundColor: enCours || enAttente === 0 ? '#C4BEB9' : 'var(--jga-green)',
          color: 'white', border: 'none',
          fontSize: 14, fontWeight: 600,
          cursor: enCours || enAttente === 0 ? 'not-allowed' : 'pointer',
          fontFamily: "'Inter', sans-serif",
          marginBottom: 12, transition: 'background-color 0.15s',
        }}
      >
        {enCours
          ? 'Conversion en cours…'
          : enAttente > 0
            ? `Convertir (${enAttente} photo${enAttente > 1 ? 's' : ''})`
            : 'Convertir'}
      </button>

      <div style={{ display: 'flex', gap: 8 }}>
        {mode && !enCours && (
          <button
            onClick={() => telechargerTout(fichiers)}
            disabled={preparationZip}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'white', border: '0.5px solid var(--jga-green)',
              padding: '7px 14px', fontSize: 12, color: 'var(--jga-green)',
              cursor: preparationZip ? 'default' : 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            <Download size={13} strokeWidth={1.5} />
            {preparationZip
              ? 'Préparation du ZIP…'
              : mode === 'zip' ? `Télécharger à nouveau (ZIP, ${faits} photos)` : 'Télécharger à nouveau'}
          </button>
        )}
        {fichiers.length > 0 && !enCours && (
          <button
            onClick={() => setFichiers([])}
            style={{
              background: 'none', border: '0.5px solid rgba(0,0,0,0.12)',
              padding: '7px 14px', fontSize: 12, color: '#9C9591',
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            Vider la liste
          </button>
        )}
      </div>
    </div>
  )
}

function Statut({ fichier }) {
  const base = { fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }
  switch (fichier.statut) {
    case 'attente':
      return <span style={{ ...base, color: '#9C9591' }}>En attente</span>
    case 'conversion':
      return <span style={{ ...base, color: 'var(--jga-green)' }}>Conversion…</span>
    case 'fait':
      return (
        <span style={{ ...base, color: '#22C55E' }}>
          <CheckCircle size={11} strokeWidth={1.5} /> Convertie
        </span>
      )
    case 'refuse':
      return <span style={{ ...base, color: '#9C9591' }} title="Ce fichier n’est pas une image prise en charge">Non pris en charge</span>
    default:
      return (
        <span style={{ ...base, color: '#EF4444' }} title={`Fichier illisible ou abîmé (${fichier.erreur})`}>
          <AlertCircle size={11} strokeWidth={1.5} /> Échec
        </span>
      )
  }
}
