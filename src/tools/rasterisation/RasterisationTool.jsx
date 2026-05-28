import { useState, useCallback } from 'react'
import { FileType, Upload, Download, X, Image } from 'lucide-react'
import { Button } from '../../shared/components/Button'

const DPI_OPTIONS = [72, 150, 300, 600]

export function RasterisationTool() {
  const [files, setFiles] = useState([])
  const [dpi, setDpi] = useState(300)
  const [dragging, setDragging] = useState(false)

  const addFiles = useCallback((newFiles) => {
    const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf')
    setFiles(prev => [
      ...prev,
      ...pdfs.map(f => ({ file: f, name: f.name, status: 'pending', url: null })),
    ])
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const processFiles = () => {
    setFiles(prev => prev.map(f => ({ ...f, status: 'processing' })))
    // Simulation : dans une vraie implémentation, appeler une API de conversion
    setTimeout(() => {
      setFiles(prev => prev.map(f => ({ ...f, status: 'done' })))
    }, 2000)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ backgroundColor: 'var(--jga-orange-light)' }}
        >
          <FileType size={22} style={{ color: 'var(--jga-orange)' }} />
        </div>
        <div>
          <h1 className="text-base font-medium text-gray-800">Rastérisation PDF</h1>
          <p className="text-xs" style={{ color: 'var(--jga-beige)' }}>
            Convertit les plans vectoriels en bitmap haute résolution
          </p>
        </div>
      </div>

      {/* DPI selector */}
      <div className="bg-white rounded-xl border p-4 mb-4" style={{ borderColor: '#e9e5e2' }}>
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--jga-beige)' }}>Résolution de sortie</p>
        <div className="flex gap-2">
          {DPI_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDpi(d)}
              className="flex-1 py-2 rounded-lg border text-sm font-medium transition-all"
              style={{
                borderColor: dpi === d ? 'var(--jga-orange)' : '#e9e5e2',
                backgroundColor: dpi === d ? 'var(--jga-orange-light)' : 'transparent',
                color: dpi === d ? 'var(--jga-orange)' : 'var(--jga-beige)',
              }}
            >
              {d} dpi
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="border-2 border-dashed rounded-xl p-10 mb-4 text-center transition-all cursor-pointer"
        style={{
          borderColor: dragging ? 'var(--jga-orange)' : '#e9e5e2',
          backgroundColor: dragging ? 'var(--jga-orange-light)' : 'white',
        }}
        onClick={() => document.getElementById('pdf-input').click()}
      >
        <Upload size={28} className="mx-auto mb-2" style={{ color: 'var(--jga-beige)' }} />
        <p className="text-sm text-gray-600 mb-1">Déposez vos fichiers PDF ici</p>
        <p className="text-xs" style={{ color: 'var(--jga-beige)' }}>ou cliquez pour sélectionner</p>
        <input
          id="pdf-input"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden mb-4" style={{ borderColor: '#e9e5e2' }}>
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
              style={{ borderColor: '#e9e5e2' }}
            >
              <Image size={16} style={{ color: 'var(--jga-beige)' }} />
              <span className="flex-1 text-sm text-gray-700 truncate">{f.name}</span>
              <span className="text-xs" style={{
                color: f.status === 'done' ? '#059669' : f.status === 'processing' ? 'var(--jga-orange)' : 'var(--jga-beige)'
              }}>
                {f.status === 'done' ? '✓ Prêt' : f.status === 'processing' ? 'Conversion…' : 'En attente'}
              </span>
              {f.status === 'pending' && (
                <button onClick={() => removeFile(i)} className="text-gray-300 hover:text-red-400">
                  <X size={14} />
                </button>
              )}
              {f.status === 'done' && (
                <button className="text-gray-400 hover:text-gray-700">
                  <Download size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && files.some(f => f.status === 'pending') && (
        <Button onClick={processFiles} className="w-full" size="lg">
          Convertir {files.filter(f => f.status === 'pending').length} fichier{files.filter(f => f.status === 'pending').length > 1 ? 's' : ''} en {dpi} dpi
        </Button>
      )}

      {files.length === 0 && (
        <p className="text-center text-xs py-2" style={{ color: 'var(--jga-beige)' }}>
          Note : la conversion réelle nécessite un service backend (ex: Ghostscript, PDF.js, ou API tierce).
        </p>
      )}
    </div>
  )
}
