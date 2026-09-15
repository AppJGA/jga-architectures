import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff } from 'lucide-react'

// ─── Dictée vocale ───────────────────────────────────────────────────────────
// Reconnaissance vocale du navigateur (Chrome, Edge, Safari). Absente
// (Firefox) : le bouton ne s'affiche pas. Sur iPad, elle suppose la dictée
// activée dans les réglages ; le micro du clavier reste une autre voie.

const Reconnaissance = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export function BoutonDictee({ onTexte, onErreur, taille = 44 }) {
  const [actif, setActif] = useState(false)
  const reco = useRef(null)
  const rappel = useRef(onTexte)
  useEffect(() => { rappel.current = onTexte }, [onTexte])
  useEffect(() => () => reco.current?.abort(), [])

  if (!Reconnaissance) return null

  const basculer = () => {
    if (actif) { reco.current?.stop(); return }
    const r = new Reconnaissance()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) rappel.current(e.results[i][0].transcript)
      }
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        onErreur?.('Micro refusé : autorisez-le pour ce site (et activez la dictée dans les réglages de l’iPad).')
      } else if (e.error === 'network') {
        onErreur?.('La dictée a besoin du réseau.')
      }
    }
    r.onend = () => { setActif(false); reco.current = null }
    reco.current = r
    try {
      r.start()
      setActif(true)
    } catch {
      onErreur?.('La dictée n’a pas pu démarrer.')
    }
  }

  return (
    <button
      type="button" onClick={basculer}
      aria-pressed={actif} aria-label={actif ? 'Arrêter la dictée' : 'Dicter'}
      title={actif ? 'Arrêter la dictée' : 'Dicter'}
      className={actif ? 'jga-respire' : undefined}
      style={{
        width: taille, height: taille, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: actif ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
        background: actif ? '#B8412C' : 'white', color: actif ? 'white' : '#1F1B17',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {actif ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  )
}
