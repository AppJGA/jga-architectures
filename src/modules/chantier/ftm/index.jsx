import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Eye, Printer, Pencil, Trash2, FilePen } from 'lucide-react'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { useFtm } from '../../../shared/hooks/useFtm'
import { supabase } from '../../../core/supabase/client'
import { FtmFormModal } from './FtmFormModal'
import { generateFtmPdf } from './generateFtmPdf'

const ORIGINE_COLOR = { moe: '#E05A1E', mo: '#2563EB', aleas: '#639922' }
const ORIGINE_LABEL = { moe: 'MOE', mo: 'MO', aleas: 'Aléas' }

const DECISION_BADGE = {
  en_attente: { bg: '#FEF3C7', color: '#92400E', label: 'En attente' },
  accepte: { bg: '#EAF3DE', color: '#3a6011', label: 'Accepté' },
  renonce: { bg: '#F1EFE8', color: '#6b5f5a', label: 'Renoncé' },
}

function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMontant(v) {
  if (v == null) return null
  const n = Number(v)
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.abs(n))
}

function FtmCard({ ftm, lots, affaire, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const origineColor = ORIGINE_COLOR[ftm.origine] ?? '#9B8F85'
  const badge = DECISION_BADGE[ftm.decision ?? 'en_attente']
  const ref = `FTM-${String(ftm.numero).padStart(3, '0')}`
  const lotNom = lots.find(l => l.id === ftm.lot_id)?.nom ?? null

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 10,
      border: '0.5px solid rgba(0,0,0,0.08)',
      borderLeft: `3px solid ${origineColor}`,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: ref + badge origine + decision badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{ref}</span>
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: origineColor,
            backgroundColor: origineColor + '18',
            borderRadius: 4, padding: '1px 6px',
          }}>
            {ORIGINE_LABEL[ftm.origine] ?? ftm.origine}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500,
            color: badge.color, backgroundColor: badge.bg,
            borderRadius: 4, padding: '1px 6px',
          }}>
            {badge.label}
          </span>
          {ftm.date_emission && (
            <span style={{ fontSize: 11, color: '#9B8F85' }}>{fmtDate(ftm.date_emission)}</span>
          )}
        </div>

        {/* Row 2: description */}
        <p style={{
          fontSize: 12, color: '#374151',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 3,
        }}>
          {ftm.description || <em style={{ color: '#9B8F85' }}>Aucune description</em>}
        </p>

        {/* Row 3: lot + montant */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lotNom && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>Lot : {lotNom}</span>
          )}
          {ftm.montant_travaux_ht != null && Number(ftm.montant_travaux_ht) !== 0 && (
            <span style={{ fontSize: 11, color: Number(ftm.montant_travaux_ht) > 0 ? '#639922' : '#dc2626', fontWeight: 500 }}>
              {Number(ftm.montant_travaux_ht) > 0 ? '+' : '−'}{fmtMontant(ftm.montant_travaux_ht)} HT
            </span>
          )}
          {ftm.type_demande && (
            <span style={{ fontSize: 11, color: '#9B8F85', fontStyle: 'italic' }}>{ftm.type_demande}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => generateFtmPdf(ftm, affaire, { autoPrint: false })}
          title="Prévisualiser le PDF"
          style={iconBtnStyle}
        >
          <Eye size={14} />
        </button>
        <button
          onClick={() => generateFtmPdf(ftm, affaire, { autoPrint: true })}
          title="Imprimer / Exporter en PDF"
          style={iconBtnStyle}
        >
          <Printer size={14} />
        </button>
        <button
          onClick={() => onEdit(ftm)}
          title="Modifier"
          style={iconBtnStyle}
        >
          <Pencil size={14} />
        </button>
        {confirmDelete ? (
          <>
            <button
              onClick={() => { onDelete(ftm.id); setConfirmDelete(false) }}
              style={{ ...iconBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}
              title="Confirmer la suppression"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={iconBtnStyle}
              title="Annuler"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={iconBtnStyle}
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

const iconBtnStyle = {
  width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6,
  border: '0.5px solid rgba(0,0,0,0.12)',
  backgroundColor: 'white',
  color: '#6b7280',
  cursor: 'pointer',
  fontSize: 12,
}

export default function FtmModule() {
  const { affaireId } = useParams()
  const { affaire } = useAffaire(affaireId)
  const { ftms, loading, createFtm, updateFtm, deleteFtm } = useFtm(affaireId)
  const [lots, setLots] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFtm, setEditingFtm] = useState(null)

  useEffect(() => {
    if (!affaireId) return
    supabase.from('lots').select('id, nom').eq('affaire_id', affaireId).order('nom')
      .then(({ data }) => setLots(data ?? []))
  }, [affaireId])

  const handleEdit = (ftm) => {
    setEditingFtm(ftm)
    setModalOpen(true)
  }

  const handleNew = () => {
    setEditingFtm(null)
    setModalOpen(true)
  }

  const handleClose = () => {
    setModalOpen(false)
    setEditingFtm(null)
  }

  const handleSave = async (payload) => {
    if (editingFtm) {
      await updateFtm(editingFtm.id, payload)
    } else {
      await createFtm(payload)
    }
  }

  const handleSaveAndExport = async (payload) => {
    let savedFtm
    if (editingFtm) {
      savedFtm = await updateFtm(editingFtm.id, payload)
    } else {
      savedFtm = await createFtm(payload)
    }
    if (savedFtm && affaire) {
      generateFtmPdf(savedFtm, affaire, { autoPrint: true })
    }
  }

  const handleDelete = async (id) => {
    await deleteFtm(id)
  }

  const ftmsAcceptes = ftms.filter(f => f.decision === 'accepte')
  const ftmsEnAttente = ftms.filter(f => f.decision === 'en_attente' || !f.decision)
  const totalAccepteHT = ftmsAcceptes.reduce((sum, f) => sum + (Number(f.montant_travaux_ht) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FilePen size={18} style={{ color: '#639922' }} />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
            Fiches de travaux modificatifs
          </h2>
          {ftms.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: '#639922', backgroundColor: '#EAF3DE',
              borderRadius: 20, padding: '2px 10px',
            }}>
              {ftms.length}
            </span>
          )}
        </div>
        <button
          onClick={handleNew}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 20,
            border: 'none', backgroundColor: '#639922',
            color: 'white', fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Nouvelle FTM
        </button>
      </div>

      {/* Stats bar */}
      {ftms.length > 0 && (
        <div style={{
          display: 'flex', gap: 16,
          backgroundColor: 'white',
          borderRadius: 10,
          border: '0.5px solid rgba(0,0,0,0.08)',
          padding: '12px 16px',
          marginBottom: 16,
        }}>
          <div>
            <p style={{ fontSize: 10, color: '#9B8F85', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Total</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{ftms.length}</p>
          </div>
          <div style={{ width: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <div>
            <p style={{ fontSize: 10, color: '#9B8F85', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Acceptées</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#3a6011' }}>{ftmsAcceptes.length}</p>
          </div>
          <div style={{ width: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <div>
            <p style={{ fontSize: 10, color: '#9B8F85', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>En attente</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#92400E' }}>{ftmsEnAttente.length}</p>
          </div>
          {totalAccepteHT !== 0 && (
            <>
              <div style={{ width: '0.5px', backgroundColor: 'rgba(0,0,0,0.08)' }} />
              <div>
                <p style={{ fontSize: 10, color: '#9B8F85', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Montant accepté HT</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: totalAccepteHT >= 0 ? '#3a6011' : '#dc2626' }}>
                  {totalAccepteHT > 0 ? '+' : '−'}{fmtMontant(totalAccepteHT)}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              border: '2px solid #EAF3DE',
              borderTopColor: '#639922',
              animation: 'jga-spin 0.7s linear infinite',
            }} />
          </div>
        ) : ftms.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: 200,
            backgroundColor: 'white',
            borderRadius: 10,
            border: '0.5px dashed rgba(0,0,0,0.15)',
            gap: 10,
          }}>
            <FilePen size={28} style={{ color: '#d1d5db' }} />
            <p style={{ fontSize: 13, color: '#9B8F85', margin: 0 }}>Aucune FTM pour ce chantier</p>
            <button
              onClick={handleNew}
              style={{
                fontSize: 12, color: '#639922',
                background: 'none', border: 'none',
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Créer la première fiche
            </button>
          </div>
        ) : (
          ftms.map(ftm => (
            <FtmCard
              key={ftm.id}
              ftm={ftm}
              lots={lots}
              affaire={affaire}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <FtmFormModal
        open={modalOpen}
        onClose={handleClose}
        ftm={editingFtm}
        lots={lots}
        affaire={affaire}
        onSave={handleSave}
        onSaveAndExport={handleSaveAndExport}
      />

      <style>{`@keyframes jga-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
