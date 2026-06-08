import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Copy, Trash2, Users, ChevronRight } from 'lucide-react'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { useComptesRendus } from '../../../shared/hooks/useComptesRendus'
import { InterlocuteursModal } from './InterlocuteursModal'
import { CrDetail } from './CrDetail'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatutBadge({ statut }) {
  const isEmis = statut === 'emis'
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, borderRadius: 3, padding: '2px 9px',
      backgroundColor: isEmis ? 'rgba(42,138,78,0.12)' : '#F3F4F6',
      color: isEmis ? '#2A8A4E' : '#5E5854',
    }}>
      {isEmis ? 'Émis' : 'Brouillon'}
    </span>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(232,96,44,0.10)', borderTopColor: '#E8602C', animation: 'jga-spin 0.7s linear infinite' }} />
    </div>
  )
}

function CrRow({ cr, onOpen, onDuplicate, onDelete }) {
  const [duplicating, setDuplicating] = useState(false)

  const redacteurName = cr.profiles
    ? [cr.profiles.prenom, cr.profiles.nom].filter(Boolean).join(' ')
    : '—'

  return (
    <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
      <td style={{ padding: '12px 16px', fontWeight: 500, color: '#1F1B17', fontSize: 13 }}>
        {String(cr.numero).padStart(2, '0')}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>
        {fmtDate(cr.date_reunion)}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#5E5854' }}>
        {cr.date_prochaine_reunion ? fmtDate(cr.date_prochaine_reunion) : '—'}
        {cr.heure_prochaine_reunion && ` · ${cr.heure_prochaine_reunion.slice(0, 5)}`}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: '#5E5854' }}>{redacteurName}</td>
      <td style={{ padding: '12px 16px' }}><StatutBadge statut={cr.statut} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onOpen(cr.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 2, fontSize: 11, border: '0.5px solid #E8602C', backgroundColor: 'rgba(232,96,44,0.10)', color: '#E8602C', cursor: 'pointer' }}
          >
            Ouvrir <ChevronRight size={12} />
          </button>
          <button
            onClick={async () => { setDuplicating(true); await onDuplicate(cr.id); setDuplicating(false) }}
            disabled={duplicating}
            title="Dupliquer"
            style={{ padding: '5px 8px', borderRadius: 2, fontSize: 11, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#5E5854', cursor: 'pointer', opacity: duplicating ? 0.6 : 1 }}
          >
            <Copy size={13} />
          </button>
          <button
            onClick={() => onDelete(cr)}
            title="Supprimer"
            style={{ padding: '5px 8px', borderRadius: 2, fontSize: 11, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#9C9591' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function DeleteConfirmModal({ cr, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: 0, padding: '28px 32px',
        maxWidth: 420, width: '100%', border: '0.5px solid rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 2, background: 'rgba(184,65,44,0.10)',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trash2 size={18} color="#B8412C" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>
              Supprimer le compte rendu ?
            </p>
            <p style={{ fontSize: 12, color: '#9C9591' }}>
              Réunion n°{cr.numero} — {new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 24 }}>
          Cette action est <strong>irréversible</strong>. Toutes les présences et remarques associées seront définitivement supprimées.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 16px', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.15)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: '#374151' }}
          >
            Annuler
          </button>
          <button
            onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false) }}
            disabled={deleting}
            style={{ padding: '8px 16px', borderRadius: 2, border: 'none', background: '#B8412C', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  )
}

const TH = { padding: '10px 16px', fontSize: 10, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '0.5px solid rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }

export default function ComptesRendusModule() {
  const { affaireId } = useParams()
  const { affaire } = useAffaire(affaireId)
  const { comptesRendus, loading, createCR, deleteCR, duplicateCR } = useComptesRendus(affaireId)
  const [selectedCrId, setSelectedCrId] = useState(null)
  const [interloOpen, setInterloOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingCr, setDeletingCr] = useState(null)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const cr = await createCR()
      setSelectedCrId(cr.id)
    } catch (err) { console.error(err) }
    setCreating(false)
  }

  const handleDuplicate = async (crId) => {
    const newCr = await duplicateCR(crId)
    setSelectedCrId(newCr.id)
  }

  if (selectedCrId) {
    return (
      <>
        <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>
        <CrDetail
          crId={selectedCrId}
          affaire={affaire}
          onBack={() => setSelectedCrId(null)}
        />
      </>
    )
  }

  const emis = comptesRendus.filter(cr => cr.statut === 'emis').length

  return (
    <>
      <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>Visites de chantier</h2>
          <p style={{ fontSize: 12, color: '#9C9591', marginTop: 3 }}>
            {comptesRendus.length} CR · {emis} émis
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setInterloOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 2, fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}
          >
            <Users size={13} /> Gérer les interlocuteurs
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer', opacity: creating ? 0.6 : 1 }}
          >
            <Plus size={13} /> Nouvelle visite
          </button>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <Spinner />
      ) : comptesRendus.length === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#5E5854', marginBottom: 6 }}>Aucun compte rendu</p>
          <p style={{ fontSize: 12, color: '#9C9591' }}>Commencez par créer le premier CR de cette affaire.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: 0, border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#FAFAF9' }}>
                <th style={TH}>N°</th>
                <th style={TH}>Date réunion</th>
                <th style={TH}>Prochaine réunion</th>
                <th style={TH}>Rédacteur</th>
                <th style={TH}>Statut</th>
                <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {comptesRendus.map(cr => (
                <CrRow
                  key={cr.id}
                  cr={cr}
                  onOpen={setSelectedCrId}
                  onDuplicate={handleDuplicate}
                  onDelete={setDeletingCr}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {interloOpen && (
        <InterlocuteursModal affaireId={affaireId} onClose={() => setInterloOpen(false)} />
      )}

      {deletingCr && (
        <DeleteConfirmModal
          cr={deletingCr}
          onConfirm={async () => { await deleteCR(deletingCr.id); setDeletingCr(null) }}
          onCancel={() => setDeletingCr(null)}
        />
      )}
    </>
  )
}
