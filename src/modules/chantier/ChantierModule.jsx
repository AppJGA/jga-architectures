import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Printer, Cloud, Sun, CloudRain, Wind, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useAuth } from '../../core/auth/useAuth'
import { useAffaire } from '../../shared/hooks/useAffaires'
import { StatusBadge } from '../../shared/components/Badge'
import { Button } from '../../shared/components/Button'
import {
  getRapports, createRapport, getReservesOuvertes,
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

// ─── Formulaire nouveau rapport ───────────────────────────────────────────────
function NouveauRapportForm({ affaireId, userId, onSave, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [dateVisite, setDateVisite] = useState(today)
  const [meteo, setMeteo] = useState('ensoleille')
  const [contenu, setContenu] = useState('')
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

    const { data: rapport, error } = await createRapport({
      affaire_id: affaireId,
      date_visite: dateVisite,
      meteo,
      contenu,
      redacteur_id: userId,
    })

    if (!error && rapport && reserves.length > 0) {
      const { supabase } = await import('../../core/supabase/client')
      await supabase.from('reserves').insert(
        reserves
          .filter(r => r.description.trim())
          .map(r => ({ ...r, rapport_id: rapport.id, affaire_id: affaireId }))
      )
    }

    setSaving(false)
    onSave()
  }

  return (
    <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#e9e5e2' }}>
      <h3 className="text-sm font-medium text-gray-800 mb-5">Nouveau rapport de visite</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Date */}
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

        {/* Météo */}
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
                  borderColor: meteo === value ? 'var(--jga-orange)' : '#e9e5e2',
                  backgroundColor: meteo === value ? 'var(--jga-orange-light)' : 'transparent',
                  color: meteo === value ? 'var(--jga-orange)' : 'var(--jga-beige)',
                }}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Observations */}
      <div className="mb-4">
        <label className="block text-xs mb-1.5" style={{ color: 'var(--jga-beige)' }}>
          Observations générales
        </label>
        <textarea
          value={contenu}
          onChange={e => setContenu(e.target.value)}
          inputMode="text"
          style={{ touchAction: 'manipulation', fontSize: 16 }}
          rows={5}
          placeholder="Déroulement de la visite, avancement des travaux, points d'attention…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none"
        />
      </div>

      {/* Réserves */}
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
                  inputMode="text"
                  style={{ touchAction: 'manipulation', fontSize: 14 }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
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

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer le rapport'}
        </Button>
      </div>
    </div>
  )
}

// ─── Ligne de rapport ─────────────────────────────────────────────────────────
function RapportRow({ rapport }) {
  const [open, setOpen] = useState(false)
  const dateStr = new Date(rapport.date_visite).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="border rounded-xl overflow-hidden bg-white" style={{ borderColor: '#e9e5e2' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <MeteoIcon meteo={rapport.meteo} />
        <span className="flex-1 text-sm text-gray-700 capitalize">{dateStr}</span>
        <span className="text-xs" style={{ color: 'var(--jga-beige)' }}>
          {rapport.reserves?.length ?? 0} réserve{rapport.reserves?.length !== 1 ? 's' : ''}
        </span>
        {open ? <ChevronUp size={16} style={{ color: 'var(--jga-beige)' }} /> : <ChevronDown size={16} style={{ color: 'var(--jga-beige)' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: '#e9e5e2' }}>
          {rapport.contenu && (
            <p className="text-sm text-gray-600 mt-3 mb-3 whitespace-pre-wrap leading-relaxed">
              {rapport.contenu}
            </p>
          )}
          {rapport.reserves?.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--jga-beige)' }}>Réserves</p>
              <div className="flex flex-col gap-1">
                {rapport.reserves.map(r => (
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

// ─── Tableau des réserves ouvertes ────────────────────────────────────────────
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
    setReserves(prev => prev.map(r => r.id === id ? { ...r, statut } : r).filter(r => r.statut !== 'levee'))
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

// ─── Module principal ─────────────────────────────────────────────────────────
export function ChantierModule() {
  const { affaireId } = useParams()
  const { user } = useAuth()
  const { affaire } = useAffaire(affaireId)
  const [rapports, setRapports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadRapports = () => {
    setLoading(true)
    getRapports(affaireId).then(({ data }) => {
      setRapports(data ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { loadRapports() }, [affaireId, refreshKey])

  const handleSaved = () => {
    setShowForm(false)
    setRefreshKey(k => k + 1)
  }

  const handlePrint = () => window.print()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Print header */}
      <div className="print-only mb-6">
        <div className="text-2xl font-medium mb-1">
          <span style={{ color: 'var(--jga-orange)' }}>jG</span>
          <span style={{ color: 'var(--jga-beige)' }}>A</span>
        </div>
        <p className="text-sm text-gray-600">Rapport de chantier — {affaire?.nom}</p>
        <p className="text-xs text-gray-400">Imprimé le {new Date().toLocaleDateString('fr-FR')}</p>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-6 no-print">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--jga-beige)' }}>{affaire?.reference}</p>
          <h1 className="text-lg font-medium text-gray-800">{affaire?.nom}</h1>
          <p className="text-sm" style={{ color: 'var(--jga-beige)' }}>Suivi chantier</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handlePrint}>
            <Printer size={15} /> Imprimer
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={15} /> Nouveau rapport
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 no-print">
          <NouveauRapportForm
            affaireId={affaireId}
            userId={user?.id}
            onSave={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Rapports list */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Rapports de visite ({rapports.length})
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--jga-orange-light)', borderTopColor: 'var(--jga-orange)' }} />
          </div>
        ) : rapports.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: '#e9e5e2' }}>
            <p className="text-sm text-gray-500 mb-1">Aucun rapport de visite</p>
            <p className="text-xs" style={{ color: 'var(--jga-beige)' }}>
              Cliquez sur "Nouveau rapport" pour commencer le suivi.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rapports.map(r => <RapportRow key={r.id} rapport={r} />)}
          </div>
        )}
      </div>

      {/* Open reserves */}
      <div className="no-print">
        <ReservesTable affaireId={affaireId} refreshKey={refreshKey} />
      </div>

      {/* Print: reserves */}
      <div className="print-only mt-6">
        <h3 className="font-medium mb-2">Réserves</h3>
        {rapports.flatMap(r => r.reserves ?? []).filter(r => r.statut !== 'levee').map(r => (
          <div key={r.id} className="mb-1 text-sm">
            [{r.statut}] {r.description} — {r.lot}
          </div>
        ))}
      </div>
    </div>
  )
}
