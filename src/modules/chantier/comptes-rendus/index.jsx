import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Printer, Cloud, Sun, CloudRain, Wind, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useAuth } from '../../../core/auth/useAuth'
import { StatusBadge } from '../../../shared/components/Badge'
import { Button } from '../../../shared/components/Button'
import {
  getComptesRendus, createCompteRendu, getReservesOuvertes,
  createReserve, updateReserveStatut,
} from './supabase'

const METEO_OPTIONS = [
  { value: 'ensoleille', label: 'Ensoleillé', Icon: Sun },
  { value: 'nuageux', label: 'Nuageux', Icon: Cloud },
  { value: 'pluvieux', label: 'Pluvieux', Icon: CloudRain },
  { value: 'vent', label: 'Venteux', Icon: Wind },
]

const LOTS = ['Gros œuvre', 'Charpente', 'Couverture', 'Façade', 'Menuiseries ext.', 'Menuiseries int.', 'Plomberie', 'Électricité', 'Cloisonnement', 'Peinture', 'Carrelage', 'VRD', 'Espaces verts', 'Autre']

function MeteoIcon({ meteo }) {
  const opt = METEO_OPTIONS.find(m => m.value === meteo)
  if (!opt) return null
  const { Icon } = opt
  return <Icon size={16} style={{ color: 'var(--jga-beige)' }} />
}

function NouveauRapportForm({ affaireId, userId, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [dateVisite, setDateVisite] = useState(today)
  const [meteo, setMeteo] = useState('ensoleille')
  const [observations, setObservations] = useState('')
  const [reserves, setReserves] = useState([])
  const [saving, setSaving] = useState(false)

  const addReserve = () =>
    setReserves(prev => [...prev, { description: '', lot: LOTS[0], statut: 'ouverte' }])

  const updateReserve = (i, field, value) =>
    setReserves(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))

  const removeReserve = (i) =>
    setReserves(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!dateVisite) return
    setSaving(true)

    const { data: cr, error } = await createCompteRendu({
      affaire_id: affaireId,
      date_visite: dateVisite,
      meteo,
      observations,
      redacteur_id: userId,
    })

    if (!error && cr && reserves.length > 0) {
      const { supabase } = await import('../../../core/supabase/client')
      await supabase.from('reserves').insert(
        reserves
          .filter(r => r.description.trim())
          .map(r => ({ ...r, compte_rendu_id: cr.id, affaire_id: affaireId }))
      )
    }

    setSaving(false)
    onSave()
  }

  return (
    <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#e9e5e2' }}>
      <h3 className="text-sm font-medium text-gray-800 mb-5">Nouveau compte rendu de visite</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--jga-beige)' }}>
            Date de visite
          </label>
          <input
            type="date"
            value={dateVisite}
            onChange={e => setDateVisite(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ fontSize: 14 }}
          />
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--jga-beige)' }}>Météo</label>
          <div className="flex gap-2">
            {METEO_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                title={label}
                onClick={() => setMeteo(value)}
                className="flex-1 flex items-center justify-center py-2 rounded-lg border transition-all"
                style={{
                  borderColor: meteo === value ? 'var(--jga-green)' : '#e9e5e2',
                  backgroundColor: meteo === value ? 'var(--jga-green-light)' : 'transparent',
                  color: meteo === value ? 'var(--jga-green)' : 'var(--jga-beige)',
                }}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs mb-1.5" style={{ color: 'var(--jga-beige)' }}>
          Observations générales
        </label>
        <textarea
          value={observations}
          onChange={e => setObservations(e.target.value)}
          rows={5}
          placeholder="Déroulement de la visite, avancement des travaux, points d'attention…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none"
          style={{ fontSize: 14 }}
        />
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium" style={{ color: 'var(--jga-beige)' }}>
            Réserves ({reserves.length})
          </label>
          <Button variant="secondary" size="sm" onClick={addReserve}>
            <Plus size={12} /> Ajouter
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {reserves.map((reserve, i) => (
            <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
              <div className="flex-1 flex flex-col gap-2">
                <input
                  type="text"
                  value={reserve.description}
                  onChange={e => updateReserve(i, 'description', e.target.value)}
                  placeholder="Description de la réserve…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
                  style={{ fontSize: 14 }}
                />
                <select
                  value={reserve.lot}
                  onChange={e => updateReserve(i, 'lot', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
                >
                  {LOTS.map(lot => <option key={lot}>{lot}</option>)}
                </select>
              </div>
              <button onClick={() => removeReserve(i)} className="p-1.5 text-gray-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button onClick={handleSubmit} disabled={saving} style={{ backgroundColor: 'var(--jga-green)', borderColor: 'var(--jga-green)' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}

function CompteRenduRow({ cr }) {
  const [open, setOpen] = useState(false)
  const dateStr = new Date(cr.date_visite).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="border rounded-xl overflow-hidden bg-white" style={{ borderColor: '#e9e5e2' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <MeteoIcon meteo={cr.meteo} />
        <span className="flex-1 text-sm text-gray-700 capitalize">{dateStr}</span>
        <span className="text-xs" style={{ color: 'var(--jga-beige)' }}>
          {cr.reserves?.length ?? 0} réserve{cr.reserves?.length !== 1 ? 's' : ''}
        </span>
        {open
          ? <ChevronUp size={16} style={{ color: 'var(--jga-beige)' }} />
          : <ChevronDown size={16} style={{ color: 'var(--jga-beige)' }} />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#e9e5e2' }}>
          {cr.observations && (
            <p className="text-sm text-gray-600 mt-3 mb-3 whitespace-pre-wrap leading-relaxed">
              {cr.observations}
            </p>
          )}
          {cr.reserves?.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--jga-beige)' }}>Réserves</p>
              <div className="flex flex-col gap-1">
                {cr.reserves.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <StatusBadge statut={r.statut} />
                    <span className="text-xs text-gray-600">{r.description}</span>
                    {r.lot && <span className="text-xs text-gray-400">— {r.lot}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReservesTable({ affaireId, refreshKey }) {
  const [reserves, setReserves] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getReservesOuvertes(affaireId).then(({ data }) => {
      setReserves(data ?? [])
      setLoading(false)
    })
  }, [affaireId, refreshKey])

  const handleStatutChange = async (id, statut) => {
    await updateReserveStatut(id, statut)
    setReserves(prev =>
      prev.map(r => r.id === id ? { ...r, statut } : r).filter(r => r.statut !== 'levee')
    )
  }

  if (loading) return null

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Réserves ouvertes ({reserves.length})
      </h3>
      {reserves.length === 0 ? (
        <div className="bg-white rounded-xl border p-6 text-center" style={{ borderColor: '#e9e5e2' }}>
          <p className="text-sm" style={{ color: 'var(--jga-beige)' }}>Aucune réserve ouverte</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e9e5e2' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: '#e9e5e2' }}>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--jga-beige)' }}>Description</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--jga-beige)' }}>Lot</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--jga-beige)' }}>Statut</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {reserves.map(r => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: '#e9e5e2' }}>
                  <td className="px-4 py-2.5 text-gray-700">{r.description}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--jga-beige)' }}>{r.lot}</td>
                  <td className="px-4 py-2.5"><StatusBadge statut={r.statut} /></td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r.statut}
                      onChange={e => handleStatutChange(r.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 outline-none"
                    >
                      <option value="ouverte">Ouverte</option>
                      <option value="en_cours">En cours</option>
                      <option value="levee">Levée</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ComptesRendusModule() {
  const { affaireId } = useParams()
  const { user } = useAuth()
  const [comptesRendus, setComptesRendus] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadComptesRendus = () => {
    setLoading(true)
    getComptesRendus(affaireId).then(({ data }) => {
      setComptesRendus(data ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { loadComptesRendus() }, [affaireId, refreshKey])

  const handleSaved = () => {
    setShowForm(false)
    setRefreshKey(k => k + 1)
  }

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>Comptes rendus de visite</h2>
          <p style={{ fontSize: 12, color: 'var(--jga-beige)', marginTop: 2 }}>
            {comptesRendus.length} compte{comptesRendus.length > 1 ? 's' : ''} rendu{comptesRendus.length > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer size={14} /> Imprimer
          </Button>
          <Button
            onClick={() => setShowForm(true)}
            style={{ backgroundColor: 'var(--jga-green)', borderColor: 'var(--jga-green)' }}
          >
            <Plus size={14} /> Nouveau CR
          </Button>
        </div>
      </div>

      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <NouveauRapportForm
            affaireId={affaireId}
            userId={user?.id}
            onSave={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
          Visites de chantier ({comptesRendus.length})
        </h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              border: '2px solid var(--jga-green-light)',
              borderTopColor: 'var(--jga-green)',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : comptesRendus.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: '#e9e5e2' }}>
            <p className="text-sm text-gray-500 mb-1">Aucun compte rendu</p>
            <p className="text-xs" style={{ color: 'var(--jga-beige)' }}>
              Cliquez sur "Nouveau CR" pour commencer le suivi de chantier.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {comptesRendus.map(cr => <CompteRenduRow key={cr.id} cr={cr} />)}
          </div>
        )}
      </div>

      <ReservesTable affaireId={affaireId} refreshKey={refreshKey} />
    </div>
  )
}
