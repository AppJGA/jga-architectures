import { useState, useCallback, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, X, Zap, FileDown, CheckCircle, AlertCircle, AlertTriangle,
} from 'lucide-react'

// ─── Réglementations ──────────────────────────────────────────────────────────

const REGLEMENTATIONS = {
  erp: {
    nom: 'ERP',
    label: 'ERP',
    description: 'Établissements Recevant du Public',
    regles: [
      { id: 'ERP-001', element: 'Largeur dégagement principal', exigence: '≥ 1,40 m (jusqu\'à 100 pers) / ≥ 2,00 m (> 100 pers)' },
      { id: 'ERP-002', element: 'Largeur dégagement secondaire', exigence: '≥ 0,90 m' },
      { id: 'ERP-003', element: 'Largeur porte issue de secours', exigence: '≥ 0,80 m (1 UP = 0,60 m)' },
      { id: 'ERP-004', element: 'Distance maximale issue de secours', exigence: '≤ 40 m depuis tout point' },
      { id: 'ERP-005', element: 'Hauteur libre passages', exigence: '≥ 2,20 m' },
    ],
  },
  pmr: {
    nom: 'PMR',
    label: 'PMR',
    description: 'Personnes à Mobilité Réduite',
    regles: [
      { id: 'PMR-001', element: 'Largeur cheminement extérieur', exigence: '≥ 1,40 m' },
      { id: 'PMR-002', element: 'Largeur cheminement intérieur', exigence: '≥ 1,40 m (rétrécissement ponctuel ≥ 1,20 m)' },
      { id: 'PMR-003', element: 'Largeur porte accessible', exigence: '≥ 0,90 m (passage utile ≥ 0,83 m)' },
      { id: 'PMR-004', element: 'Espace de manœuvre porte', exigence: '≥ 1,70 m × 2,20 m côté poignée' },
      { id: 'PMR-005', element: 'Espace retournement fauteuil', exigence: '⌀ ≥ 1,50 m' },
      { id: 'PMR-006', element: 'WC accessible surface', exigence: '≥ 1,50 m × 2,10 m' },
      { id: 'PMR-007', element: 'Pente rampe', exigence: '≤ 5 % (8 % exceptionnel, 12 % sur 0,50 m max)' },
    ],
  },
  logement: {
    nom: 'Logement',
    label: 'Logement',
    description: 'Code de la construction',
    regles: [
      { id: 'LOG-001', element: 'Surface minimale T1', exigence: '≥ 14 m²' },
      { id: 'LOG-002', element: 'Hauteur sous plafond', exigence: '≥ 2,20 m (habitable)' },
      { id: 'LOG-003', element: 'Largeur circulation logement', exigence: '≥ 0,90 m' },
      { id: 'LOG-004', element: 'Logement adapté PMR (RDC ou ascenseur)', exigence: '≥ 10 % des logements' },
      { id: 'LOG-005', element: 'Largeur porte logement PMR', exigence: '≥ 0,90 m' },
    ],
  },
}

// ─── DXF Parsing ──────────────────────────────────────────────────────────────

function parseDxfBrut(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const pairs = []
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim())
    const value = lines[i + 1].trim()
    if (!isNaN(code)) pairs.push({ code, value })
  }

  const layers = new Set()
  for (const p of pairs) {
    if (p.code === 8 && p.value && p.value !== '0') layers.add(p.value)
  }

  const arcs = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'ARC') {
      let layer = '', radius = 0
      for (let j = i + 1; j < Math.min(i + 20, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8) layer = pairs[j].value
        if (pairs[j].code === 40) radius = parseFloat(pairs[j].value)
      }
      if (radius > 50) arcs.push({ layer, radius })
    }
  }

  const polylines = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'LWPOLYLINE') {
      let layer = ''
      const xs = [], ys = []
      for (let j = i + 1; j < Math.min(i + 200, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8) layer = pairs[j].value
        if (pairs[j].code === 10) xs.push(parseFloat(pairs[j].value))
        if (pairs[j].code === 20) ys.push(parseFloat(pairs[j].value))
      }
      if (xs.length >= 2) {
        const w = Math.max(...xs) - Math.min(...xs)
        const h = Math.max(...ys) - Math.min(...ys)
        if (w > 100 || h > 100) polylines.push({ layer, w, h })
      }
    }
  }

  const lines_list = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'LINE') {
      let layer = '', x1 = 0, y1 = 0, x2 = 0, y2 = 0
      for (let j = i + 1; j < Math.min(i + 20, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8)  layer = pairs[j].value
        if (pairs[j].code === 10) x1 = parseFloat(pairs[j].value)
        if (pairs[j].code === 20) y1 = parseFloat(pairs[j].value)
        if (pairs[j].code === 11) x2 = parseFloat(pairs[j].value)
        if (pairs[j].code === 21) y2 = parseFloat(pairs[j].value)
      }
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      if (length > 200) lines_list.push({ layer, length })
    }
  }

  const mtexts = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'MTEXT') {
      let layer = '', t = ''
      for (let j = i + 1; j < Math.min(i + 30, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8) layer = pairs[j].value
        if (pairs[j].code === 1) t = pairs[j].value
      }
      if (t) {
        const clean = t.replace(/\\\.+?;/g, '').replace(/[{}\\]/g, '').trim()
        if (clean) mtexts.push({ layer, text: clean })
      }
    }
  }

  return {
    layers: [...layers],
    arcs,
    polylines,
    lines: lines_list,
    mtexts,
    stats: {
      totalPairs: pairs.length,
      nbLayers: layers.size,
      nbArcs: arcs.length,
      nbPolylines: polylines.length,
      nbLines: lines_list.length,
      nbTexts: mtexts.length,
    },
  }
}

function construireContexte(parsed, nomFichier) {
  const arcsPortes = parsed.arcs.filter(a =>
    a.layer.toLowerCase().includes('porte') || a.layer.toLowerCase().includes('door')
  )
  const rayonsPortes = [...new Set(arcsPortes.map(a => Math.round(a.radius)))].sort((a, b) => a - b)

  const sanitaires = [...parsed.polylines, ...parsed.lines].filter(e =>
    e.layer.toLowerCase().includes('sanit') ||
    e.layer.toLowerCase().includes('wc') ||
    e.layer.toLowerCase().includes('pmr')
  )

  const escaliers = parsed.lines.filter(e =>
    e.layer.toLowerCase().includes('escal') || e.layer.toLowerCase().includes('ascens')
  )

  const espaces = parsed.polylines
    .filter(p => p.w > 500 || p.h > 500)
    .map(p => ({ layer: p.layer, w: (p.w / 1000).toFixed(2), h: (p.h / 1000).toFixed(2) }))

  return `
=== FICHIER : ${nomFichier} ===

CALQUES PRÉSENTS :
${parsed.layers.map(l => `  · ${l}`).join('\n') || '  (aucun calque)'}

STATISTIQUES :
  ${parsed.stats.nbArcs} arcs · ${parsed.stats.nbPolylines} polylignes · ${parsed.stats.nbLines} lignes (>20cm) · ${parsed.stats.nbTexts} textes

PORTES DÉTECTÉES (${arcsPortes.length} arcs sur calques "porte"/"door") :
  Rayons = largeurs vantail : ${rayonsPortes.map(r => `${r}mm (${(r / 1000).toFixed(2)}m)`).join(', ') || 'aucun détecté'}
  Note : passage utile ≈ rayon − 75mm (quincaillerie)

SANITAIRES (calques sanit/wc/pmr) :
  ${sanitaires.length} éléments détectés

ESCALIERS / ASCENSEURS :
  ${escaliers.length} éléments détectés
  Longueurs : ${[...new Set(escaliers.map(e => (e.length / 1000).toFixed(2)))].slice(0, 8).join(', ')}m

ESPACES ET ZONES (polylignes > 50cm) :
${espaces.slice(0, 15).map(e => `  [${e.layer}] ${e.w}m × ${e.h}m`).join('\n') || '  (aucun espace détecté)'}

ANNOTATIONS TEXTE :
${parsed.mtexts.slice(0, 20).map(m => `  [${m.layer}] "${m.text}"`).join('\n') || '  (aucune annotation)'}
`
}

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

// ─── Claude API ───────────────────────────────────────────────────────────────

async function analyserAvecClaude(fichiersParsés, reglementationsActives, onLog) {
  onLog('Préparation des données...')

  const contexte = fichiersParsés.map(f => f.contexte).join('\n\n')

  const reglesActives = reglementationsActives.flatMap(r => REGLEMENTATIONS[r].regles)

  const prompt = `Tu es un expert en réglementation du bâtiment français (ERP, PMR, logement). Tu analyses des données extraites de fichiers DXF de plans d'architecture ArchiCAD.

CONTEXTE TECHNIQUE :
Les fichiers sont des plans ArchiCAD exportés en DXF. Les unités d'origine sont en MILLIMÈTRES. Les valeurs ont été converties en mètres (suffixe "m") pour faciliter la comparaison réglementaire.

DONNÉES EXTRAITES DES PLANS :
${contexte}

RÈGLES RÉGLEMENTAIRES À VÉRIFIER :
${reglesActives.map(r => `[${r.id}] ${r.element} : ${r.exigence}`).join('\n')}

MÉTHODE D'ANALYSE :
1. Utilise les cotes 50 cm–1 m pour identifier les largeurs de portes et passages
2. Utilise les cotes 1 m–3 m pour identifier les circulations et espaces
3. Utilise les noms de blocs pour identifier les équipements (WC, lavabo, escalier, porte...)
4. Utilise les annotations texte pour identifier les pièces (WC, couloir, sas, logement...)
5. Utilise les noms de calques pour comprendre la nature des éléments
6. Si tu trouves plusieurs cotes dans une plage réglementaire, analyse la plus petite : c'est elle qui peut poser problème

Pour chaque règle, analyse les données disponibles et fournis un résultat structuré. Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte autour) :

{
  "resultats": [
    {
      "id": "ERP-001",
      "element": "Largeur dégagement principal",
      "exigence": "≥ 1,40 m",
      "valeur_mesuree": "1,20 m",
      "statut": "non_conforme",
      "confiance": 75,
      "remarque": "Couloir détecté à 1200 mm sur calque CIRCULATION, en dessous du seuil de 1400 mm"
    }
  ]
}

Valeurs de "statut" : "conforme" | "non_conforme" | "a_verifier"
"confiance" : entier 0–100.
"valeur_mesuree" : la valeur trouvée en mètres, ou "Non détecté" si absent des plans.

RÈGLES ABSOLUES :
1. Si une cote est présente dans la plage correspondant à une règle, donne "conforme" ou "non_conforme" avec confiance 50–70, même sans certitude absolue
2. Ne mets "a_verifier" (confiance 20) que si AUCUNE donnée pertinente n'est disponible
3. Ne jamais inventer une mesure absente des données
4. Un indice de confiance > 70 uniquement si une cote précise et clairement identifiable a été trouvée
5. Signaler dans remarque le calque ou bloc source de la valeur mesurée`

  onLog('Envoi à l\'API Claude (claude-haiku-4-5)...')

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Clé API manquante — définir VITE_ANTHROPIC_API_KEY dans .env')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API Claude ${response.status} : ${err}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    return JSON.parse(clean)
  } catch {
    throw new Error('Réponse Claude non parseable — vérifier la clé API et réessayer')
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

const LABEL_STYLE = {
  fontSize: 10, fontWeight: 600, color: '#9C9591',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'block', marginBottom: 6,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyseurTool() {
  const [files, setFiles] = useState([])
  const [reglesActives, setReglesActives] = useState(['erp', 'pmr'])
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [logs, setLogs] = useState([])
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
        addLog(`Parsing DXF : ${e.name}...`)
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

  const lancerAnalyse = async () => {
    const prets = files.filter(f => f.status === 'ready')
    if (isAnalyzing || !prets.length || !reglesActives.length) return

    setIsAnalyzing(true)
    setResultats(null)
    setLogs([])

    try {
      addLog('Démarrage de l\'analyse réglementaire...')
      addLog(`  ${prets.length} fichier(s) · ${reglesActives.map(r => REGLEMENTATIONS[r].nom).join(', ')}`)

      const res = await analyserAvecClaude(prets.map(f => f.parsedData), reglesActives, addLog)

      const nomProjet = prets[0].name.replace(/\.dxf$/i, '')
      genererExcel(res.resultats, nomProjet)
      setResultats(res.resultats)
      addLog(`─── Terminé : ${res.resultats.length} règle(s) vérifiée(s) ───`)
    } catch (err) {
      addLog(`Erreur : ${err.message}`, true)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const readyCount = files.filter(f => f.status === 'ready').length
  const canLaunch = readyCount > 0 && reglesActives.length > 0 && !isAnalyzing

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
          Vérification automatique ERP / PMR / Logement de vos plans DXF via intelligence artificielle
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
        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
        style={{
          border: '2px dashed #E8602C',
          backgroundColor: isDragging ? 'rgba(232,96,44,0.08)' : '#FAF7F2',
          padding: '20px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 6, height: 150,
          cursor: isAnalyzing ? 'default' : 'pointer',
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
            {['Fichier', 'Taille', 'Entités parsées', ''].map((h, i) => (
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
                  <span style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic' }}>Parsing...</span>
                )}
                {f.status === 'ready' && f.stats && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5E5854' }}>
                    {f.parsedData?.resume}
                  </span>
                )}
                {f.status === 'error' && (
                  <span style={{ fontSize: 11, color: '#EF4444' }}>Erreur de parsing</span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setFiles(prev => prev.filter(ff => ff.id !== f.id))}
                  disabled={isAnalyzing}
                  style={{
                    background: 'none', border: 'none',
                    cursor: isAnalyzing ? 'default' : 'pointer',
                    color: '#C4BEB9', padding: 4,
                    display: 'flex', alignItems: 'center',
                    opacity: isAnalyzing ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!isAnalyzing) e.currentTarget.style.color = '#EF4444' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#C4BEB9' }}
                >
                  <X size={11} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bouton lancement */}
      <button
        onClick={lancerAnalyse}
        disabled={!canLaunch}
        style={{
          width: '100%', height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: canLaunch ? '#E8602C' : '#C4BEB9',
          color: 'white', border: 'none',
          fontSize: 14, fontWeight: 600,
          cursor: canLaunch ? 'pointer' : 'not-allowed',
          fontFamily: "'Inter', sans-serif",
          marginBottom: 16, transition: 'background-color 0.15s',
        }}
        onMouseEnter={e => { if (canLaunch) e.currentTarget.style.backgroundColor = '#CF5526' }}
        onMouseLeave={e => { if (canLaunch) e.currentTarget.style.backgroundColor = '#E8602C' }}
      >
        <Zap size={16} strokeWidth={1.25} />
        {isAnalyzing ? 'Analyse en cours...' : 'Lancer l\'analyse réglementaire'}
      </button>

      {/* Console de logs */}
      {(logs.length > 0 || isAnalyzing) && (
        <div style={{ backgroundColor: '#1F1B17', marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 12px', borderBottom: '1px solid #2D2926',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: isAnalyzing ? '#22C55E' : '#555',
                boxShadow: isAnalyzing ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
              }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#4A4744', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Console
              </span>
            </div>
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
                <div key={r.id} style={{
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

      {/* Vider la liste */}
      {files.length > 0 && !isAnalyzing && (
        <button
          onClick={() => { setFiles([]); setResultats(null); setLogs([]) }}
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
