import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from './useAuth'

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.35)',
        borderTopColor: 'white',
        animation: 'jga-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

function InputField({ label, type, value, onChange, placeholder, icon: Icon, rightSlot, id }) {
  const [focused, setFocused] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 11, fontWeight: 500, color: 'var(--jga-beige)', letterSpacing: '0.06em' }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <Icon
          size={15}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: focused ? 'var(--jga-orange)' : 'var(--jga-beige)',
            pointerEvents: 'none',
            transition: 'color 0.15s',
          }}
        />
        <input
          id={id}
          type={type}
          required
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            height: 42,
            paddingLeft: 38,
            paddingRight: rightSlot ? 40 : 12,
            border: focused
              ? '0.5px solid var(--jga-orange)'
              : '0.5px solid rgba(0,0,0,0.12)',
            borderRadius: 10,
            backgroundColor: focused ? 'white' : '#FAFAF9',
            fontSize: 14,
            color: '#1F1B17',
            outline: 'none',
            boxShadow: focused ? '0 0 0 3px rgba(232,96,44,0.12)' : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
          }}
        />
        {rightSlot && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  )
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError('Identifiants incorrects. Vérifiez votre email et mot de passe.')
    } else {
      navigate('/home')
    }
  }

  return (
    <>
      <style>{`
        @keyframes jga-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div
        style={{
          minHeight: '100svh',
          backgroundColor: '#FAF7F2',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        {/* Logo block */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img
            src="/Logo_JGA_Archi.jpg"
            alt="Jacques Gerbe & Associés Architectures"
            style={{ width: 220, display: 'block', margin: '0 auto' }}
          />
        </div>

        {/* Auth card */}
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: 'white',
            borderRadius: 16,
            border: '0.5px solid rgba(0,0,0,0.08)',
            padding: '32px 36px',
          }}
        >
          {/* Card header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 6 }}>
              Connexion à l'espace collaborateur
            </h1>
            <p style={{ fontSize: 12, color: 'var(--jga-beige)' }}>
              Accès réservé aux membres de l'agence
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <InputField
              id="email"
              label="ADRESSE E-MAIL"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="prenom.nom@jga-archi.fr"
              icon={Mail}
            />

            <InputField
              id="password"
              label="MOT DE PASSE"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••"
              icon={Lock}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--jga-beige)' }}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword
                    ? <EyeOff size={15} />
                    : <Eye size={15} />
                  }
                </button>
              }
            />

            {/* Forgot password */}
            <div style={{ textAlign: 'right', marginTop: -8 }}>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'var(--jga-orange)',
                  opacity: 0.8,
                  padding: 0,
                }}
              >
                Mot de passe oublié ?
              </button>
            </div>

            {/* Error */}
            {error && (
              <p style={{ fontSize: 12, color: '#E24B4A', marginTop: -4 }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 10,
                border: 'none',
                backgroundColor: 'var(--jga-orange)',
                color: 'white',
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.85 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'opacity 0.15s',
                marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = loading ? '0.85' : '1' }}
            >
              {loading ? <Spinner /> : <ArrowRight size={16} />}
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: 'var(--jga-beige)', marginTop: 20, textAlign: 'center' }}>
          JGA Architectures · Espace collaborateur interne
        </p>
      </div>
    </>
  )
}
