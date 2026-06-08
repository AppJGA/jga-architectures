import { useState } from 'react'
import { Plus, Search, Trash2, Lock } from 'lucide-react'
import { useAffaires } from '../shared/hooks/useAffaires'
import { AffaireCard } from './AffaireCard'
import { AffaireFormModal } from './AffaireFormModal'

export function DashboardPage() {
  const { affaires, affairesNonAutorisees, loading, error, createAffaire, deleteAffaire } = useAffaires()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deletingAffaire, setDeletingAffaire] = useState(null)

  const filtered = affaires.filter(a =>
    !search ||
    a.nom?.toLowerCase().includes(search.toLowerCase()) ||
    a.moa_nom?.toLowerCase().includes(search.toLowerCase()) ||
    a.code_affaire?.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async (data) => {
    try {
      await createAffaire(data)
    } catch (err) {
      console.error('Erreur création affaire:', err.message)
    }
    setModalOpen(false)
  }

  const handleDeleteAffaire = async (id) => {
    try {
      await deleteAffaire(id)
      setDeletingAffaire(null)
    } catch (err) {
      console.error('Erreur suppression:', err.message)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '2px solid var(--jga-orange-light)',
          borderTopColor: 'var(--jga-orange)',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 256, gap: 8 }}>
        <p style={{ fontSize: 13, color: '#B8412C' }}>Erreur de connexion à la base de données.</p>
        <p style={{ fontSize: 11, color: 'var(--jga-beige)' }}>
          Vérifiez vos variables d'environnement Supabase dans le fichier .env
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 500, color: '#1F1B17', fontFamily: "'Archivo', sans-serif" }}>Mes affaires</h1>
            <p style={{ fontSize: 12, color: 'var(--jga-beige)', marginTop: 2 }}>
              {affaires.length} affaire{affaires.length > 1 ? 's' : ''}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute', left: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--jga-beige)', pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                  border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2,
                  fontSize: 12, color: '#1F1B17', backgroundColor: 'white',
                  outline: 'none', width: 180,
                }}
              />
            </div>

            <button
              onClick={() => setModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 3, border: 'none',
                backgroundColor: 'var(--jga-orange)', color: 'white',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              Nouvelle affaire
            </button>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#5E5854' }}>Aucune affaire</p>
            <p style={{ fontSize: 11, color: 'var(--jga-beige)' }}>
              {search ? 'Aucun résultat pour cette recherche.' : 'Cliquez sur "Nouvelle affaire" pour commencer.'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {filtered.map(affaire => (
              <AffaireCard key={affaire.id} affaire={affaire} isAuthorized={true} onDeleteRequest={setDeletingAffaire} />
            ))}
          </div>
        )}

        {/* Section affaires non autorisées */}
        {affairesNonAutorisees.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 16px' }}>
              <div style={{ flex: 1, height: '0.5px', background: 'rgba(0,0,0,0.1)' }} />
              <span style={{
                fontSize: 11, fontWeight: 500, color: '#9C9591',
                letterSpacing: '0.05em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Lock size={11} />
                Autres affaires de l'agence ({affairesNonAutorisees.length})
              </span>
              <div style={{ flex: 1, height: '0.5px', background: 'rgba(0,0,0,0.1)' }} />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
              {affairesNonAutorisees.map(affaire => (
                <AffaireCard key={affaire.id} affaire={affaire} isAuthorized={false} />
              ))}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <AffaireFormModal
          affaire={null}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}

      {deletingAffaire && (
        <div
          onClick={() => setDeletingAffaire(null)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px 16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: 0, padding: '28px 32px',
              maxWidth: 440, width: '100%',
              border: '0.5px solid rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 2, flexShrink: 0,
                backgroundColor: 'rgba(184,65,44,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trash2 size={18} color="#B8412C" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>
                  Supprimer l'affaire ?
                </p>
                <p style={{ fontSize: 12, color: '#9C9591' }}>
                  {deletingAffaire.code_affaire} — {deletingAffaire.nom}
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 24 }}>
              Cette action est <strong>irréversible</strong>. Toutes les données liées à cette affaire
              seront définitivement supprimées : plannings, comptes rendus, suivi financier, FTM, etc.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingAffaire(null)}
                style={{
                  padding: '8px 16px', borderRadius: 2,
                  border: '0.5px solid rgba(0,0,0,0.15)',
                  backgroundColor: 'transparent', fontSize: 13, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => handleDeleteAffaire(deletingAffaire.id)}
                style={{
                  padding: '8px 16px', borderRadius: 2,
                  border: 'none', backgroundColor: '#B8412C',
                  color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
