import { useState } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { useAffaireCollaborateurs } from '../hooks/useAffaireCollaborateurs'

function Avatar({ name, email, isOwner }) {
  const initials = name
    ? name.trim().slice(0, 2).toUpperCase()
    : email?.slice(0, 2).toUpperCase() ?? '??'
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      backgroundColor: isOwner ? 'var(--jga-orange)' : '#C5BEB9',
      color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600,
    }}>
      {initials}
    </div>
  )
}

export function CollaborateursSection({ affaireId }) {
  const { user } = useAuth()
  const { collaborateurs, loading, addCollaborateur, removeCollaborateur, searchProfiles } = useAffaireCollaborateurs(affaireId)
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [confirmRemove, setConfirmRemove] = useState(null)

  const currentUserRole = collaborateurs.find(c => c.user_id === user?.id)?.role
  const isOwner = currentUserRole === 'proprietaire'

  const handleSearchChange = async (value) => {
    setSearchEmail(value)
    if (value.length < 3) { setSearchResults([]); return }
    const results = await searchProfiles(value)
    setSearchResults(results)
  }

  const handleAdd = async (profile) => {
    await addCollaborateur(profile.id)
    setSearchEmail('')
    setSearchResults([])
  }

  if (!affaireId) return null

  return (
    <div>
      {loading ? (
        <p style={{ fontSize: 12, color: '#9C9591' }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {collaborateurs.map(c => {
            const profile = c.profiles
            const displayName = profile
              ? `${profile.prenom ?? ''} ${profile.nom ?? ''}`.trim() || profile.email
              : c.user_id
            const isItemOwner = c.role === 'proprietaire'

            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={displayName} email={profile?.email} isOwner={isItemOwner} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>{displayName}</p>
                  {profile?.email && (
                    <p style={{ fontSize: 11, color: '#9C9591', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profile.email}
                    </p>
                  )}
                </div>
                {isItemOwner && (
                  <span style={{
                    fontSize: 10, fontWeight: 500,
                    backgroundColor: 'rgba(232,96,44,0.10)', color: 'var(--jga-orange)',
                    borderRadius: 20, padding: '2px 8px', flexShrink: 0,
                  }}>
                    Responsable
                  </span>
                )}
                {!isItemOwner && isOwner && (
                  confirmRemove === c.user_id ? (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => { removeCollaborateur(c.user_id); setConfirmRemove(null) }}
                        style={{ fontSize: 11, color: '#B8412C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        style={{ fontSize: 11, color: '#9C9591', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(c.user_id)}
                      title="Retirer"
                      style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        border: 'none', backgroundColor: '#FAF7F2',
                        color: '#9C9591', cursor: 'pointer',
                        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                  )
                )}
              </div>
            )
          })}

          {collaborateurs.length === 0 && (
            <p style={{ fontSize: 12, color: '#9C9591' }}>Aucun collaborateur assigné.</p>
          )}
        </div>
      )}

      {/* Ajout d'un collaborateur — propriétaire uniquement */}
      {isOwner && (
        <div style={{ marginTop: 14 }}>
          <input
            type="text"
            value={searchEmail}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Ajouter par email…"
            style={{
              width: '100%', padding: '8px 10px',
              borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)',
              backgroundColor: '#FAFAF9', fontSize: 12, color: '#1F1B17', outline: 'none',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{
              marginTop: 4, border: '0.5px solid rgba(0,0,0,0.1)',
              borderRadius: 8, overflow: 'hidden', backgroundColor: 'white',
            }}>
              {searchResults.map(p => {
                const name = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim()
                return (
                  <div
                    key={p.id}
                    onClick={() => handleAdd(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(232,96,44,0.10)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                  >
                    <Avatar name={name || p.email} email={p.email} isOwner={false} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500 }}>{name || '—'}</p>
                      <p style={{ fontSize: 11, color: '#9C9591' }}>{p.email}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
