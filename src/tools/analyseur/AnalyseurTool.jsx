import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, X, FileDown, CheckCircle, AlertCircle, AlertTriangle,
  Copy, Check, Download, ClipboardPaste, ExternalLink,
} from 'lucide-react'
import {
  REGLEMENTATIONS, parseDxfBrut, construireContexte, construirePrompt, lireReponse,
} from './analyseLogique'

// ─── Analyseur réglementaire ─────────────────────────────────────────────────
//
// En trois temps : l'app lit les DXF et prépare la demande, l'utilisateur la
// fait analyser par Claude (Claude Code ou claude.ai, couverts par
// l'abonnement), puis recolle la réponse ici pour obtenir le tableau et
// l'Excel. Aucune clé API : elle se lisait en clair dans la page, et chaque
// analyse était facturée en plus de l'abonnement.

async function parserDxf(file) {
  const text = await file.text()
  const parsed = parseDxfBrut(text)
  const contexte = construireContexte(parsed, file.name)
  return {
    nomFichier: file.name,
    contexte,
    stats: parsed.stats,
    resume: `${parsed.stats.nbArcs} arcs · ${parsed.stats.nbPolylines} polylignes · ${parsed.stats.nbLayers} calques`,
  }
}

// ─── Export Excel ─────────────────────────────────────────────────────────────

function genererExcel(resultats, nomProjet) {
  const wb = XLSX.utils.book_new()
  const date = new Date().toLocaleDateString('fr-FR')

  const conformes = resultats.filter(r => r.statut === 'conforme').length
  const nonConformes = resultats.filter(r => r.statut === 'non_conforme').length
  const aVerifier = resultats.filter(r => r.statut === 'a_verifier').length

  const resume = [
    ["RAPPORT D'ANALYSE RÉGLEMENTAIRE — JGA ARCHITECTURES"],
    [''],
    ['Projet', nomProjet],
    ['Date d\'analyse', date],
    [''],
    ['RÉSULTATS'],
    ['Règles conformes', conformes],
    ['Règles non conformes', nonConformes],
    ['À vérifier manuellement', aVerifier],
    ['Total règles vérifiées', resultats.length],
    [''],
    ['AVERTISSEMENT'],
    [
      'Cette analyse est générée par intelligence artificielle à partir de données DXF ' +
      'et doit impérativement être validée par un professionnel qualifié. ' +
      'Elle ne constitue pas un avis réglementaire certifié.',
    ],
  ]
  const wsResume = XLSX.utils.aoa_to_sheet(resume)
  wsResume['!cols'] = [{ wch: 38 }, { wch: 70 }]

  const lignes = [
    ['Référence', 'Élément vérifié', 'Exigence réglementaire', 'Valeur mesurée', 'Statut', 'Indice de confiance (%)', 'Remarques'],
    ...resultats.map(r => [
      r.id,
      r.element,
      r.exigence,
      r.valeur_mesuree ?? 'Non détecté',
      r.statut === 'conforme' ? '✓ Conforme' : r.statut === 'non_conforme' ? '✗ Non conforme' : '⚠ À vérifier',
      r.confiance,
      r.remarque ?? '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(lignes)
  ws['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 42 }, { wch: 22 }, { wch: 16 }, { wch: 24 }, { wch: 65 }]

  XLSX.utils.book_append_sheet(wb, wsResume, 'Résumé')
  XLSX.utils.book_append_sheet(wb, ws, 'Analyse détaillée')

  const nomFichier = `Analyse_reglementaire_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, nomFichier)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTaille(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function telechargerTexte(texte, nom) {
  const url = URL.createObjectURL(new Blob([texte], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  URL.revokeObjectURL(url)
}

const LABEL_STYLE = {
  fontSize: 10, fontWeight: 600, color: '#9C9591',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'block', marginBottom: 6,
}

const NUMERO_STYLE = {
  width: 20, height: 20, flexShrink: 0,
  backgroundColor: '#E8602C', color: 'white',
  fontSize: 11, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'JetBrains Mono', monospace",
}

function Etape({ numero, titre, actif, children }) {
  return (
    <div style={{
      border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16, padding: '16px 20px',
      opacity: actif ? 1 : 0.5, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ ...NUMERO_STYLE, backgroundColor: actif ? '#E8602C' : '#C4BEB9' }}>{numero}</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>{titre}</span>
      </div>
      {children}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyseurTool() {
  const [files, setFiles] = useState([])
  const [reglesActives, setReglesActives] = useState(['erp', 'pmr'])
  const [isDragging, setIsDragging] = useState(false)
  const [logs, setLogs] = useState([])
  const [copie, setCopie] = useState(false)
  const [demandeVisible, setDemandeVisible] = useState(false)
  const [reponse, setReponse] = useState('')
  const [erreur, setErreur] = useState(null)
  const [resultats, setResultats] = useState(null)
  const fileInputRef = useRef(null)
  const logRef = useRef(null)

  const addLog = useCallback((msg, isErr = false) => {
    setLogs(prev => [...prev, { msg, isErr, id: Date.now() + Math.random() }])
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const addFiles = useCallback(async (rawFiles) => {
    const dxfs = Array.from(rawFiles).filter(f => f.name.toLowerCase().endsWith('.dxf'))
    if (!dxfs.length) return

    const entries = dxfs.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      taille: formatTaille(f.size),
      stats: null,
      parsedData: null,
      status: 'loading',
    }))
    setFiles(prev => [...prev, ...entries])

    for (const e of entries) {
      try {
        addLog(`Lecture du DXF : ${e.name}...`)
        const parsed = await parserDxf(e.file)
        setFiles(prev => prev.map(f =>
          f.id === e.id ? { ...f, stats: parsed.stats, parsedData: parsed, status: 'ready' } : f
        ))
        addLog(`  → ${parsed.resume}`)
      } catch (err) {
        setFiles(prev => prev.map(f =>
          f.id === e.id ? { ...f, status: 'error' } : f
        ))
        addLog(`  Erreur : ${err.message}`, true)
      }
    }
  }, [addLog])

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e) => {
    e.preventDefault()
    if (e.currentTarget.contains(e.relatedTarget)) return
    setIsDragging(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const toggleRegle = (key) => {
    setReglesActives(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev
        return prev.filter(k => k !== key)
      }
      return [...prev, key]
    })
  }

  const prets = files.filter(f => f.status === 'ready')
  const prete = prets.length > 0 && reglesActives.length > 0

  const demande = useMemo(() => (
    prete ? construirePrompt(prets.map(f => f.parsedData.contexte), reglesActives) : ''
  // Le contenu ne dépend que des fichiers lus et des réglementations cochées
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [files, reglesActives])

  const copierDemande = async () => {
    try {
      await navigator.clipboard.writeText(demande)
      setCopie(true)
      addLog(`Demande copiée (${demande.length.toLocaleString('fr-FR')} caractères). À coller dans Claude.`)
      setTimeout(() => setCopie(false), 2500)
    } catch {
      // Presse-papier refusé (navigateur ancien, page non sécurisée) : on
      // affiche le texte pour que l'utilisateur le sélectionne lui-même.
      setDemandeVisible(true)
      addLog('Copie automatique refusée par le navigateur — sélectionne le texte ci-dessous.', true)
    }
  }

  const validerReponse = () => {
    setErreur(null)
    try {
      const res = lireReponse(reponse, reglesActives)
      setResultats(res)
      const nomProjet = prets[0]?.name?.replace(/\.dxf$/i, '') ?? 'projet'
      genererExcel(res, nomProjet)
      addLog(`─── ${res.length} règle(s) lue(s) dans la réponse ───`)
    } catch (err) {
      setResultats(null)
      setErreur(err.message)
    }
  }

  const conformes = resultats?.filter(r => r.statut === 'conforme').length ?? 0
  const nonConformes = resultats?.filter(r => r.statut === 'non_conforme').length ?? 0
  const aVerifier = resultats?.filter(r => r.statut === 'a_verifier').length ?? 0

  return (
    <div style={{ padding: '24px 32px', maxWidth: 740, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>

      {/* En-tête */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F1B17', margin: '0 0 6px', fontFamily: "'Archivo', sans-serif" }}>
          Analyseur réglementaire
        </h1>
        <p style={{ fontSize: 13, color: '#5E5854', margin: 0, lineHeight: 1.5 }}>
          Vérification ERP / PMR / Logement de vos plans DXF. L’outil relève les cotes,
          Claude les confronte à la réglementation.
        </p>
      </div>

      {/* Sélection réglementations */}
      <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16, padding: '16px 20px' }}>
        <span style={LABEL_STYLE}>Réglementations à analyser</span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          {Object.entries(REGLEMENTATIONS).map(([key, reg]) => {
            const actif = reglesActives.includes(key)
            return (
              <button
                key={key}
                onClick={() => toggleRegle(key)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 16px',
                  border: actif ? '1.5px solid #E8602C' : '0.5px solid rgba(0,0,0,0.15)',
                  backgroundColor: actif ? 'rgba(232,96,44,0.06)' : 'white',
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                  textAlign: 'left', transition: 'all 0.15s', minWidth: 176,
                }}
              >
                <div style={{
                  width: 16, height: 16, marginTop: 2, flexShrink: 0,
                  backgroundColor: actif ? '#E8602C' : '#C9C4C0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {actif && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: actif ? '#E8602C' : '#1F1B17', marginBottom: 2 }}>
                    {reg.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#9C9591', lineHeight: 1.3 }}>
                    {reg.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', margin: 0 }}>
          Plusieurs réglementations peuvent être combinées pour les projets mixtes.
        </p>
      </div>

      {/* Zone de dépôt */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #E8602C',
          backgroundColor: isDragging ? 'rgba(232,96,44,0.08)' : '#FAF7F2',
          padding: '20px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6, height: 150, cursor: 'pointer',
          marginBottom: 16, transition: 'background-color 0.15s',
          userSelect: 'none', textAlign: 'center',
        }}
      >
        <Upload size={24} strokeWidth={1.25} style={{ color: '#E8602C', marginBottom: 4 }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
          Déposez vos fichiers DXF ici
        </p>
        <p style={{ fontSize: 11, color: '#9C9591', margin: 0, maxWidth: 500, lineHeight: 1.5 }}>
          Un fichier par niveau : RDC, R+1, R+2… ainsi que coupes et façades.
          Formats acceptés : <strong>.dxf</strong> uniquement.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dxf"
          multiple
          style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 72px 1fr 28px',
            padding: '5px 12px', backgroundColor: '#F5F2EE',
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          }}>
            {['Fichier', 'Taille', 'Entités relevées', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i === 0 ? 'left' : 'center' }}>
                {h}
              </span>
            ))}
          </div>
          {files.map((f, idx) => (
            <div key={f.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 72px 1fr 28px',
              padding: '7px 12px', alignItems: 'center',
              borderBottom: idx < files.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
              backgroundColor: idx % 2 === 1 ? '#FAF7F2' : 'white',
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1F1B17',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8,
              }} title={f.name}>{f.name}</span>

              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9C9591', textAlign: 'center' }}>
                {f.taille}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {f.status === 'loading' && (
                  <span style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic' }}>Lecture...</span>
                )}
                {f.status === 'ready' && f.stats && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5E5854' }}>
                    {f.parsedData?.resume}
                  </span>
                )}
                {f.status === 'error' && (
                  <span style={{ fontSize: 11, color: '#EF4444' }}>Erreur de lecture</span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setFiles(prev => prev.filter(ff => ff.id !== f.id))}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#C4BEB9', padding: 4, display: 'flex', alignItems: 'center',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#C4BEB9' }}
                >
                  <X size={11} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Étape 1 : copier la demande ─────────────────────────────────── */}
      <Etape numero="1" titre="Copier la demande d’analyse" actif={prete}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={copierDemande}
            disabled={!prete}
            style={{
              flex: 1, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: !prete ? '#C4BEB9' : copie ? '#2A8A4E' : '#E8602C',
              color: 'white', border: 'none', fontSize: 14, fontWeight: 600,
              cursor: prete ? 'pointer' : 'not-allowed',
              fontFamily: "'Inter', sans-serif", transition: 'background-color 0.15s',
            }}
          >
            {copie ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.5} />}
            {copie ? 'Copié dans le presse-papier' : 'Copier la demande pour Claude'}
          </button>
          <button
            onClick={() => telechargerTexte(demande, 'analyse-reglementaire.txt')}
            disabled={!prete}
            title="Enregistrer la demande dans un fichier texte"
            style={{
              width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'white', color: prete ? '#5E5854' : '#C4BEB9',
              border: '0.5px solid rgba(0,0,0,0.15)',
              cursor: prete ? 'pointer' : 'not-allowed',
            }}
          >
            <Download size={16} strokeWidth={1.5} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9C9591', margin: 0, lineHeight: 1.5 }}>
          {prete
            ? `${prets.length} fichier(s) · ${reglesActives.map(r => REGLEMENTATIONS[r].nom).join(', ')} · ${demande.length.toLocaleString('fr-FR')} caractères.`
            : 'Déposez au moins un fichier DXF pour préparer la demande.'}
        </p>

        {demandeVisible && (
          <textarea
            readOnly
            value={demande}
            onFocus={e => e.target.select()}
            style={{
              width: '100%', height: 120, marginTop: 10, padding: 10,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, lineHeight: 1.5,
              border: '0.5px solid rgba(0,0,0,0.15)', resize: 'vertical', minHeight: 0,
            }}
          />
        )}
      </Etape>

      {/* ─── Étape 2 : faire analyser ─────────────────────────────────────── */}
      <Etape numero="2" titre="Faire analyser par Claude" actif={prete}>
        <p style={{ fontSize: 12, color: '#5E5854', margin: '0 0 10px', lineHeight: 1.6 }}>
          Collez la demande dans <strong>Claude Code</strong> (le terminal) ou sur{' '}
          <a
            href="https://claude.ai/new"
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#E8602C', textDecoration: 'none', fontWeight: 600,
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            claude.ai <ExternalLink size={10} strokeWidth={2} />
          </a>
          , puis copiez la réponse obtenue. Les deux sont couverts par l’abonnement de l’agence :
          l’analyse ne coûte rien de plus.
        </p>
        <p style={{ fontSize: 11, color: '#9C9591', margin: 0, fontStyle: 'italic' }}>
          Claude répond par un bloc de texte commençant par « {'{'} ». Copiez-le en entier.
        </p>
      </Etape>

      {/* ─── Étape 3 : coller la réponse ──────────────────────────────────── */}
      <Etape numero="3" titre="Coller la réponse de Claude" actif={prete}>
        <textarea
          value={reponse}
          onChange={e => { setReponse(e.target.value); setErreur(null) }}
          placeholder={'Collez ici la réponse de Claude…\n\n{\n  "resultats": [ … ]\n}'}
          spellCheck={false}
          style={{
            width: '100%', height: 130, padding: 10,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.5,
            border: erreur ? '1px solid #EF4444' : '0.5px solid rgba(0,0,0,0.15)',
            resize: 'vertical', marginBottom: 10, minHeight: 0,
          }}
        />

        {erreur && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 12px', marginBottom: 10,
            backgroundColor: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.25)',
          }}>
            <AlertCircle size={13} strokeWidth={1.5} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: '#B8412C', lineHeight: 1.5 }}>{erreur}</span>
          </div>
        )}

        <button
          onClick={validerReponse}
          disabled={!reponse.trim()}
          style={{
            width: '100%', height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: reponse.trim() ? '#2A8A4E' : '#C4BEB9',
            color: 'white', border: 'none', fontSize: 14, fontWeight: 600,
            cursor: reponse.trim() ? 'pointer' : 'not-allowed',
            fontFamily: "'Inter', sans-serif", transition: 'background-color 0.15s',
          }}
        >
          <ClipboardPaste size={16} strokeWidth={1.5} />
          Afficher les résultats et télécharger l’Excel
        </button>
      </Etape>

      {/* Console de lecture */}
      {logs.length > 0 && (
        <div style={{ backgroundColor: '#1F1B17', marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 12px', borderBottom: '1px solid #2D2926',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#4A4744', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Console
            </span>
            <button
              onClick={() => setLogs([])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A4744', fontSize: 10, fontFamily: "'Inter', sans-serif", padding: '2px 6px' }}
            >
              Effacer
            </button>
          </div>
          <div
            ref={logRef}
            style={{ padding: '8px 12px', height: 120, overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.65 }}
          >
            {logs.map(l => (
              <div key={l.id} style={{ color: l.isErr ? '#FF8A80' : '#90EE90', wordBreak: 'break-all' }}>
                {l.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Résultats */}
      {resultats && (
        <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', padding: '16px 20px', marginBottom: 16 }}>
          <span style={LABEL_STYLE}>Résultats de l'analyse</span>

          {/* Compteurs */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
            {[
              { count: conformes, label: 'Conformes', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', color: '#22C55E' },
              { count: nonConformes, label: 'Non conformes', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#EF4444' },
              { count: aVerifier, label: 'À vérifier', bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', color: '#EAB308' },
            ].map(({ count, label, bg, border, color }) => (
              <div key={label} style={{ flex: 1, padding: '10px 12px', backgroundColor: bg, border: `0.5px solid ${border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{count}</div>
                <div style={{ fontSize: 11, color: '#5E5854', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tableau détaillé */}
          <div style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '76px 1fr 1fr 104px 68px',
              padding: '5px 12px', backgroundColor: '#F5F2EE',
              borderBottom: '0.5px solid rgba(0,0,0,0.08)',
            }}>
              {['Réf.', 'Élément', 'Valeur mesurée', 'Statut', 'Conf.'].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>
            {resultats.map((r, idx) => {
              const color = r.statut === 'conforme' ? '#22C55E' : r.statut === 'non_conforme' ? '#EF4444' : '#EAB308'
              const Icon = r.statut === 'conforme' ? CheckCircle : r.statut === 'non_conforme' ? AlertCircle : AlertTriangle
              const label = r.statut === 'conforme' ? 'Conforme' : r.statut === 'non_conforme' ? 'Non conforme' : 'À vérifier'
              return (
                <div key={`${r.id}-${idx}`} style={{
                  display: 'grid', gridTemplateColumns: '76px 1fr 1fr 104px 68px',
                  padding: '8px 12px', alignItems: 'start',
                  borderBottom: idx < resultats.length - 1 ? '0.5px solid rgba(0,0,0,0.05)' : 'none',
                  backgroundColor: idx % 2 === 1 ? '#FAF7F2' : 'white',
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9C9591' }}>{r.id}</span>
                  <div style={{ paddingRight: 8 }}>
                    <div style={{ fontSize: 11, color: '#1F1B17', marginBottom: 2 }}>{r.element}</div>
                    {r.remarque && <div style={{ fontSize: 10, color: '#9C9591', lineHeight: 1.4 }}>{r.remarque}</div>}
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5E5854', paddingRight: 8 }}>
                    {r.valeur_mesuree ?? 'Non détecté'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon size={11} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color }}>{label}</span>
                  </div>
                  <div>
                    <div style={{ height: 3, backgroundColor: '#E8E4DF', marginBottom: 3 }}>
                      <div style={{ width: `${r.confiance}%`, height: '100%', backgroundColor: r.confiance >= 70 ? '#22C55E' : r.confiance >= 40 ? '#EAB308' : '#EF4444' }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#9C9591', fontFamily: "'JetBrains Mono', monospace" }}>{r.confiance} %</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Retélécharger le rapport */}
          <button
            onClick={() => genererExcel(resultats, files[0]?.name?.replace(/\.dxf$/i, '') ?? 'projet')}
            style={{
              marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', backgroundColor: '#2A8A4E', color: 'white',
              border: 'none', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            <FileDown size={13} strokeWidth={1.25} />
            Retélécharger le rapport Excel
          </button>
        </div>
      )}

      {/* Tout recommencer */}
      {files.length > 0 && (
        <button
          onClick={() => {
            setFiles([]); setResultats(null); setLogs([])
            setReponse(''); setErreur(null); setDemandeVisible(false)
          }}
          style={{
            background: 'none', border: '0.5px solid rgba(0,0,0,0.12)',
            padding: '6px 14px', fontSize: 12, color: '#9C9591',
            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}
        >
          Vider la liste
        </button>
      )}
    </div>
  )
}
