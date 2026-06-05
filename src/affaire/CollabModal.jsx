import { useState, useEffect } from 'react'
import { X, Search } from 'lucide-react'
import { supabase } from '../core/supabase/client'

function Avatar({ initiales, isOwner }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: isOwner ? 'var(--jga-orange)' : '#9C9591',
      color: 'white', fontSize: 12, fontWeight: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initiales}
    </div>
  )
}

export function CollabModal({
  collaborateurs,
  isProprietaire,
  addCollaborateur,
  removeCollaborateur,
  onClose,
}) {
  const [search, setSearch] = useState('')
  const [allProfiles, setAllProfiles] = useState([])
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, prenom, nom, email')
      .then(({ data }) => setAllProfiles(data ?? []))
  }, [])

  const existingIds = new Set(collaborateurs.map(c => c.user_id))

  const suggestions = allProfiles.filter(p =>
    !existingIds.has(p.id) &&
    search.length >= 2 &&
    (
      `${p.prenom ?? ''} ${p.nom ?? ''}`.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? '').toLowerCase().includes(search.toLowerCase())
    )
  )

  const proprietaire = collaborateurs.find(c => c.role === 'proprietaire')

  const handleAdd = async (profileId) => {
    setAdding(true)
    await addCollaborateur(profileId)
    setSearch('')
    setAdding(false)
  }

  const handleRemove = async (userId) => {
    await removeCollaborateur(userId)
    setConfirmRemove(null)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 3 }}>Équipe projet</h2>
            {proprietaire?.profiles && (
              <p style={{ fontSize: 11, color: '#9C9591' }}>
                Géré par {proprietaire.profiles.prenom} {proprietaire.profiles.nom}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', marginLeft: 12 }}>
            <X size={18} />
          </button>
        </div>

        {/* Liste */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {collaborateurs.map(c => {
            const initiales = ((c.profiles?.prenom?.[0] ?? '') + (c.profiles?.nom?.[0] ?? '')).toUpperCase() || '?'
            const isOwner = c.role === 'proprietaire'
            const canRemove = isProprietaire && !isOwner

            return (
              <div key={c.user_id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  <Avatar initiales={initiales} isOwner={isOwner} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>
                      {c.profiles?.prenom} {c.profiles?.nom}
                    </p>
                    <p style={{ fontSize: 11, color: '#9C9591', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.profiles?.email}
                    </p>
                  </div>

                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 500, flexShrink: 0,
                    backgroundColor: isOwner ? 'rgba(232,96,44,0.10)' : '#F1EFE8',
                    color: isOwner ? '#993C1D' : '#5E5854',
                  }}>
                    {isOwner ? 'Responsable' : 'Collaborateur'}
                  </span>

                  {canRemove && (
                    <button
                      onClick={() => setConfirmRemove(confirmRemove === c.user_id ? null : c.user_id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 2, flexShrink: 0 }}
                      title="Retirer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {confirmRemove === c.user_id && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8, marginBottom: 4,
                    backgroundColor: 'rgba(184,65,44,0.10)', fontSize: 12, color: '#B8412C',
                  }}>
                    <span>Retirer {c.profiles?.prenom} ?</span>
                    <button
                      onClick={() => handleRemove(c.user_id)}
                      style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 6, backgroundColor: '#B8412C', color: 'white', border: 'none', cursor: 'pointer' }}
                    >
                      Confirmer
                    </button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, backgroundColor: 'transparent', color: '#5E5854', border: '0.5px solid rgba(0,0,0,0.15)', cursor: 'pointer' }}
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Section ajout ou message lecture seule */}
        {isProprietaire ? (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Ajouter un collaborateur
            </p>

            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9C9591', pointerEvents: 'none' }} />
              <input
                placeholder="Rechercher par nom ou email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', height: 36, paddingLeft: 32, paddingRight: 12,
                  border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8,
                  fontSize: 13, backgroundColor: '#FAFAF9', outline: 'none', boxSizing: 'border-box',
                }}
              />

              {search.length >= 2 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  backgroundColor: 'white', borderRadius: 8,
                  border: '0.5px solid rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto',
                  zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                }}>
                  {suggestions.length === 0 ? (
                    <p style={{ padding: '10px 14px', fontSize: 12, color: '#9C9591', textAlign: 'center' }}>
                      Aucun résultat — la personne doit s'être connectée au moins une fois.
                    </p>
                  ) : suggestions.map(p => {
                    const initiales = ((p.prenom?.[0] ?? '') + (p.nom?.[0] ?? '')).toUpperCase() || '?'
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleAdd(p.id)}
                        disabled={adding}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '8px 12px', textAlign: 'left',
                          background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FAFAF9' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          backgroundColor: '#9C9591', color: 'white', fontSize: 10, fontWeight: 500,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {initiales}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>
                            {p.prenom} {p.nom}
                          </p>
                          <p style={{ fontSize: 11, color: '#9C9591' }}>{p.email}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)', fontSize: 12, color: '#9C9591' }}>
            Contactez le responsable de l'affaire pour modifier les autorisations.
          </p>
        )}
      </div>
    </div>
  )
}
