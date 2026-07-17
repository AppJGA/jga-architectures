import { useState, useCallback, useRef, useEffect } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { jsPDF } from 'jspdf'
import { Layers, Upload, X, CheckCircle, AlertCircle } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function loadPageCount(file) {
  try {
    const ab = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: ab }).promise
    const n = doc.numPages
    doc.destroy()
    return n
  } catch {
    return null
  }
}

const labelStyle = {
  fontSize: 10, fontWeight: 600, color: '#9C9591',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'block', marginBottom: 6,
}

export function RasterisationTool() {
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [dpi, setDpi] = useState(150)
  const [format, setFormat] = useState('pdf')
  const [jpegQuality, setJpegQuality] = useState(85)
  const [isProcessing, setIsProcessing] = useState(false)
  const [logs, setLogs] = useState([])
  const logRef = useRef(null)
  const fileInputRef = useRef(null)

  const addLog = useCallback((msg, isErr = false) => {
    setLogs(prev => [...prev, { msg, isErr, id: Math.random().toString(36).slice(2) }])
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const addFiles = useCallback(async (rawFiles) => {
    const pdfs = Array.from(rawFiles).filter(f => f.type === 'application/pdf')
    if (!pdfs.length) return
    const entries = pdfs.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      size: formatSize(f.size),
      pages: null,
      status: 'pending',
      progress: 0,
    }))
    setFiles(prev => [...prev, ...entries])
    for (const e of entries) {
      const n = await loadPageCount(e.file)
      setFiles(prev => prev.map(f => f.id === e.id ? { ...f, pages: n } : f))
    }
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget)) return
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (dropped.length > 0) addFiles(dropped)
  }

  const removeFile = (id) => {
    if (isProcessing) return
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const processAll = async () => {
    const pending = files.filter(f => f.status === 'pending')
    if (isProcessing || !pending.length) return
    setIsProcessing(true)
    setLogs([])

    for (const entry of pending) {
      setFiles(prev => prev.map(f =>
        f.id === entry.id ? { ...f, status: 'processing', progress: 0 } : f
      ))
      try {
        addLog(`Ouverture : ${entry.name}`)
        const ab = await entry.file.arrayBuffer()
        const pdfDoc = await pdfjs.getDocument({ data: ab }).promise
        const total = pdfDoc.numPages
        const scale = dpi / 72
        const base = entry.name.replace(/\.pdf$/i, '')

        addLog(`  ${total} page(s) à ${dpi} dpi → ${format === 'pdf' ? 'PDF aplati' : format.toUpperCase()}`)

        if (format === 'pdf') {
          // 1re passe : rendu de toutes les pages en canvas
          const pages = []
          for (let i = 1; i <= total; i++) {
            const pg = await pdfDoc.getPage(i)
            const vp0 = pg.getViewport({ scale: 1 })   // taille originale en points
            const vp = pg.getViewport({ scale })
            const cv = document.createElement('canvas')
            cv.width = Math.round(vp.width)
            cv.height = Math.round(vp.height)
            const ctx = cv.getContext('2d')
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(0, 0, cv.width, cv.height)
            await pg.render({ canvasContext: ctx, viewport: vp }).promise
            pg.cleanup()
            pages.push({ canvas: cv, wPt: vp0.width, hPt: vp0.height })
            setFiles(prev => prev.map(f =>
              f.id === entry.id ? { ...f, progress: Math.round(i / total * 80) } : f
            ))
          }
          pdfDoc.destroy()

          // 2e passe : assemblage avec jsPDF (pas de parsing couleur — pas de toHex)
          const { wPt: fw, hPt: fh } = pages[0]
          const pdf = new jsPDF({
            orientation: fw >= fh ? 'landscape' : 'portrait',
            unit: 'pt',
            format: [fw, fh],
            compress: true,
          })
          for (let i = 0; i < pages.length; i++) {
            const { canvas, wPt, hPt } = pages[i]
            if (i > 0) pdf.addPage([wPt, hPt], wPt >= hPt ? 'landscape' : 'portrait')
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wPt, hPt, '', 'FAST')
            addLog(`  Page ${i + 1}/${pages.length} intégrée`)
            setFiles(prev => prev.map(f =>
              f.id === entry.id ? { ...f, progress: 80 + Math.round((i + 1) / pages.length * 20) } : f
            ))
          }
          pdf.save(`${base}_aplati.pdf`)
          addLog(`  → ${base}_aplati.pdf`)

        } else {
          const ext = format === 'jpeg' ? 'jpg' : 'png'
          const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
          const q = format === 'jpeg' ? jpegQuality / 100 : undefined
          for (let i = 1; i <= total; i++) {
            const pg = await pdfDoc.getPage(i)
            const vp = pg.getViewport({ scale })
            const cv = document.createElement('canvas')
            cv.width = Math.round(vp.width)
            cv.height = Math.round(vp.height)
            const ctx = cv.getContext('2d')
            ctx.fillStyle = '#FFFFFF'                   // fond blanc — évite transparence noire
            ctx.fillRect(0, 0, cv.width, cv.height)
            await pg.render({ canvasContext: ctx, viewport: vp }).promise
            pg.cleanup()
            const blob = await new Promise(res => cv.toBlob(res, mime, q))
            downloadBlob(blob, `${base}_p${String(i).padStart(2, '0')}.${ext}`)
            if (i < total) await new Promise(res => setTimeout(res, 150))
            setFiles(prev => prev.map(f =>
              f.id === entry.id ? { ...f, progress: Math.round(i / total * 100) } : f
            ))
          }
          pdfDoc.destroy()
          addLog(`  → ${total} fichier(s) ${ext.toUpperCase()} exporté(s)`)
        }

        addLog(`Terminé : ${entry.name}`)
        setFiles(prev => prev.map(f =>
          f.id === entry.id ? { ...f, status: 'done', progress: 100 } : f
        ))

      } catch (err) {
        addLog(`Erreur : ${entry.name} — ${err.message}`, true)
        setFiles(prev => prev.map(f =>
          f.id === entry.id ? { ...f, status: 'error' } : f
        ))
      }
    }

    addLog('─── Traitement terminé ───')
    setIsProcessing(false)
  }

  const pending = files.filter(f => f.status === 'pending')

  const selectStyle = {
    width: '100%', fontSize: 12, color: '#1F1B17',
    border: '0.5px solid rgba(0,0,0,0.15)',
    backgroundColor: '#FAF7F2',
    padding: '6px 8px',
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    cursor: isProcessing ? 'default' : 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 680, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44,
          backgroundColor: 'rgba(232,96,44,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Layers size={22} strokeWidth={1.25} style={{ color: '#E8602C' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: '#1F1B17', margin: 0, lineHeight: 1.3 }}>
            Aplatisseur de plan
          </h1>
          <p style={{ fontSize: 12, color: '#9C9591', margin: 0 }}>
            Convertit les plans PDF vectoriels en images bitmap aplaties
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        style={{
          border: '2px dashed #E8602C',
          backgroundColor: isDragging ? 'rgba(232,96,44,0.08)' : '#FAF7F2',
          padding: '28px 24px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6,
          cursor: isProcessing ? 'default' : 'pointer',
          marginBottom: 16,
          transition: 'background-color 0.15s',
          userSelect: 'none',
        }}
      >
        <Upload size={26} strokeWidth={1.25} style={{ color: '#E8602C', marginBottom: 2 }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', margin: 0 }}>
          Déposez vos plans PDF ici
        </p>
        <p style={{ fontSize: 11, color: '#9C9591', margin: 0 }}>
          ou cliquez pour sélectionner
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 56px 68px 112px 32px',
            padding: '6px 12px',
            backgroundColor: '#F5F2EE',
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          }}>
            {['Nom', 'Pages', 'Taille', 'Statut', ''].map((h, i) => (
              <span key={i} style={{
                fontSize: 10, fontWeight: 600, color: '#9C9591',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                textAlign: i === 0 ? 'left' : 'center',
              }}>{h}</span>
            ))}
          </div>

          {files.map((f, idx) => (
            <div key={f.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 56px 68px 112px 32px',
              padding: '8px 12px',
              alignItems: 'center',
              borderBottom: idx < files.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
              backgroundColor: idx % 2 === 1 ? '#FAF7F2' : 'white',
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: '#1F1B17',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                paddingRight: 8,
              }} title={f.name}>{f.name}</span>

              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: '#9C9591', textAlign: 'center',
              }}>{f.pages ?? '–'}</span>

              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: '#9C9591', textAlign: 'center',
              }}>{f.size}</span>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {f.status === 'pending' && (
                  <span style={{ fontSize: 11, color: '#9C9591' }}>En attente</span>
                )}
                {f.status === 'processing' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center' }}>
                    <div style={{ flex: 1, maxWidth: 50, height: 3, backgroundColor: '#E8E4DF' }}>
                      <div style={{
                        width: `${f.progress}%`, height: '100%',
                        backgroundColor: '#E8602C',
                        transition: 'width 0.2s ease',
                      }} />
                    </div>
                    <span style={{
                      fontSize: 10, color: '#E8602C',
                      fontFamily: "'JetBrains Mono', monospace",
                      minWidth: 28,
                    }}>{f.progress}%</span>
                  </div>
                )}
                {f.status === 'done' && (
                  <span style={{ fontSize: 11, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <CheckCircle size={11} strokeWidth={1.5} />
                    Exporté
                  </span>
                )}
                {f.status === 'error' && (
                  <span style={{ fontSize: 11, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <AlertCircle size={11} strokeWidth={1.5} />
                    Erreur
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => removeFile(f.id)}
                  disabled={isProcessing || f.status === 'processing'}
                  style={{
                    background: 'none', border: 'none',
                    cursor: isProcessing || f.status === 'processing' ? 'default' : 'pointer',
                    color: '#C4BEB9', padding: 4,
                    display: 'flex', alignItems: 'center',
                    opacity: isProcessing || f.status === 'processing' ? 0.4 : 1,
                    transition: 'color 0.12s',
                  }}
                  onMouseEnter={e => { if (!isProcessing && f.status !== 'processing') e.currentTarget.style.color = '#EF4444' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#C4BEB9' }}
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: format === 'jpeg' ? '1fr 1fr 1.2fr' : '1fr 1fr',
        border: '0.5px solid rgba(0,0,0,0.1)',
        marginBottom: 16,
      }}>
        <div style={{ padding: '12px 14px', borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
          <label style={labelStyle}>Résolution</label>
          <select
            value={dpi}
            onChange={e => setDpi(+e.target.value)}
            disabled={isProcessing}
            style={selectStyle}
          >
            <option value={72}>72 dpi</option>
            <option value={96}>96 dpi</option>
            <option value={150}>150 dpi</option>
            <option value={200}>200 dpi</option>
            <option value={300}>300 dpi</option>
          </select>
        </div>

        <div style={{
          padding: '12px 14px',
          borderRight: format === 'jpeg' ? '0.5px solid rgba(0,0,0,0.08)' : 'none',
        }}>
          <label style={labelStyle}>Format de sortie</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            disabled={isProcessing}
            style={selectStyle}
          >
            <option value="pdf">PDF aplati</option>
            <option value="png">Images PNG</option>
            <option value="jpeg">Images JPEG</option>
          </select>
        </div>

        {format === 'jpeg' && (
          <div style={{ padding: '12px 14px' }}>
            <label style={labelStyle}>Qualité JPEG — {jpegQuality}%</label>
            <input
              type="range" min={60} max={100}
              value={jpegQuality}
              onChange={e => setJpegQuality(+e.target.value)}
              disabled={isProcessing}
              style={{ width: '100%', accentColor: '#E8602C', marginTop: 4 }}
            />
          </div>
        )}
      </div>

      {/* Main button */}
      <button
        onClick={processAll}
        disabled={isProcessing || pending.length === 0}
        style={{
          width: '100%',
          padding: '13px 24px',
          backgroundColor: isProcessing || pending.length === 0 ? '#C4BEB9' : '#E8602C',
          color: 'white',
          border: 'none',
          fontSize: 14, fontWeight: 600,
          cursor: isProcessing || pending.length === 0 ? 'not-allowed' : 'pointer',
          fontFamily: "'Inter', sans-serif",
          marginBottom: 16,
          transition: 'background-color 0.15s',
          letterSpacing: '-0.1px',
        }}
      >
        {isProcessing
          ? 'Traitement en cours…'
          : pending.length > 0
            ? `Aplatir les plans (${pending.length} fichier${pending.length > 1 ? 's' : ''})`
            : 'Aplatir les plans'
        }
      </button>

      {/* Console log */}
      {(logs.length > 0 || isProcessing) && (
        <div style={{ backgroundColor: '#1F1B17', marginBottom: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 12px',
            borderBottom: '1px solid #2D2926',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: isProcessing ? '#22C55E' : '#444',
                boxShadow: isProcessing ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
                transition: 'background-color 0.3s',
              }} />
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#4A4744',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>Console</span>
            </div>
            <button
              onClick={() => setLogs([])}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#4A4744', fontSize: 10,
                fontFamily: "'Inter', sans-serif",
                padding: '2px 6px',
              }}
            >
              Effacer
            </button>
          </div>
          <div
            ref={logRef}
            style={{
              padding: '8px 12px',
              height: 96,
              overflowY: 'auto',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, lineHeight: 1.6,
            }}
          >
            {logs.map(l => (
              <div key={l.id} style={{ color: l.isErr ? '#FF8A80' : '#90EE90', wordBreak: 'break-all' }}>
                {l.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clear list */}
      {files.length > 0 && !isProcessing && (
        <button
          onClick={() => setFiles([])}
          style={{
            background: 'none',
            border: '0.5px solid rgba(0,0,0,0.12)',
            padding: '7px 14px',
            fontSize: 12, color: '#9C9591',
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Vider la liste
        </button>
      )}
    </div>
  )
}
