import { useEffect, useState } from 'react'

export function Toast({ message, duration = 2000, onDone }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      onDone?.()
    }, duration)
    return () => clearTimeout(t)
  }, [duration, onDone])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 70,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 300,
      pointerEvents: 'none',
      backgroundColor: '#1F1B17',
      color: 'white',
      fontSize: 12,
      fontWeight: 500,
      padding: '8px 18px',
      borderRadius: 2,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  )
}
