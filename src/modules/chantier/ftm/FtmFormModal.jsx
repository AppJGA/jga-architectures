import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const ORIGINE_OPTIONS = [
  { value: 'mo', label: 'Demande MO', emoji: '👤', color: '#1B3A5C' },
  { value: 'moe', label: 'Adaptation MOE', emoji: '📐', color: '#E8602C' },
  { value: 'aleas', label: 'Aléas', emoji: '⚡', color: '#2A8A4E' },
]

const TYPE_DEMANDE_OPTIONS = [
  { value: 'ajout', label: 'Ajout' },
  { value: 'suppression', label: 'Suppression' },
  { value: 'modification', label: 'Modification' },
]

const MOTIVATION_OPTIONS = [
  { value: 'confort_usage', label: 'Confort / usage' },
  { value: 'esthetique', label: 'Esthétique' },
  { value: 'technique', label: 'Technique' },
  { value: 'autre', label: 'Autre' },
]

const DECISION_OPTIONS = [
  { value: 'en_attente', label: 'En attente' },
  { value: 'accepte', label: 'Accepté' },
  { value: 'renonce', label: 'Renoncé' },
]

function emptyForm() {
  return {
    origine: 'mo',
    lot_id: '',
    date_emission: new Date().toISOString().split('T')[0],
    reference_chantier: '',
    type_demande: '',
    description: '',
    motivation: '',
    motivation_autre: '',
    faisabilite_technique: null,
    impact_reglementaire: null,
    incidence_delai_valeur: '',
    incidence_delai_unite: 'jours',
    montant_travaux_ht: '',
    montant_honoraires_ht: '',
    decision: 'en_attente',
    date_decision: '',
  }
}

function YesNoToggle({ value, onChange, name }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[{ label: 'Oui', val: true }, { label: 'Non', val: false }].map(opt => (
        <button
          key={String(opt.val)}
          type="button"
          onClick={() => onChange(value === opt.val ? null : opt.val)}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            border: '1px solid',
            fontSize: 12,
            cursor: 'pointer',
            borderColor: value === opt.val ? (opt.val ? '#2A8A4E' : '#B8412C') : '#d1d5db',
            backgroundColor: value === opt.val ? (opt.val ? 'rgba(42,138,78,0.12)' : '#FEE2E2') : 'white',
            color: value === opt.val ? (opt.val ? '#3a6011' : '#991b1b') : '#5E5854',
            fontWeight: value === opt.val ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
  backgroundColor: 'white',
  color: '#1F1B17',
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 500,
  color: '#5E5854',
  marginBottom: 4,
  display: 'block',
}

function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

export function FtmFormModal({ open, onClose, ftm, lots = [], affaire, onSave, onSaveAndExport }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (ftm) {
      setForm({
        origine: ftm.origine ?? 'mo',
        lot_id: ftm.lot_id ?? '',
        date_emission: ftm.date_emission ?? new Date().toISOString().split('T')[0],
        reference_chantier: ftm.reference_chantier ?? '',
        type_demande: ftm.type_demande ?? '',
        description: ftm.description ?? '',
        motivation: ftm.motivation ?? '',
        motivation_autre: ftm.motivation_autre ?? '',
        faisabilite_technique: ftm.faisabilite_technique ?? null,
        impact_reglementaire: ftm.impact_reglementaire ?? null,
        incidence_delai_valeur: ftm.incidence_delai_valeur ?? '',
        incidence_delai_unite: ftm.incidence_delai_unite ?? 'jours',
        montant_travaux_ht: ftm.montant_travaux_ht ?? '',
        montant_honoraires_ht: ftm.montant_honoraires_ht ?? '',
        decision: ftm.decision ?? 'en_attente',
        date_decision: ftm.date_decision ?? '',
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, ftm])

  if (!open) return null

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const tva = affaire?.taux_tva ?? 1.20
  const travHTNum = Number(form.montant_travaux_ht) || 0
  const honHTNum = Number(form.montant_honoraires_ht) || 0

  const buildPayload = () => ({
    ...form,
    lot_id: form.lot_id || null,
    incidence_delai_valeur: form.incidence_delai_valeur !== '' ? Number(form.incidence_delai_valeur) : null,
    montant_travaux_ht: form.montant_travaux_ht !== '' ? Number(form.montant_travaux_ht) : null,
    montant_honoraires_ht: form.montant_honoraires_ht !== '' ? Number(form.montant_honoraires_ht) : null,
    date_decision: form.date_decision || null,
    reference_chantier: form.reference_chantier || null,
    motivation_autre: form.motivation === 'autre' ? form.motivation_autre : null,
  })

  const handleSubmit = async (withExport) => {
    setSaving(true)
    try {
      const payload = buildPayload()
      if (withExport) {
        await onSaveAndExport(payload)
      } else {
        await onSave(payload)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const activeOrigine = ORIGINE_OPTIONS.find(o => o.value === form.origine)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: 24,
    }}>
      <div style={{
        backgroundColor: '#FAF7F2',
        borderRadius: 14,
        width: '100%',
        maxWidth: 680,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '0.5px solid rgba(0,0,0,0.1)',
          backgroundColor: '#FAF7F2',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1F1B17', margin: 0 }}>
            {ftm ? `Modifier FTM-${String(ftm.numero).padStart(3, '0')}` : 'Nouvelle fiche de travaux modificatifs'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Section interne */}
          <div style={{ padding: '16px 20px', backgroundColor: '#FAF7F2', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#9C9591', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Informations internes
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Origine</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ORIGINE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('origine', opt.value)}
                      style={{
                        flex: 1,
                        padding: '8px 6px',
                        borderRadius: 8,
                        border: '1.5px solid',
                        borderColor: form.origine === opt.value ? opt.color : '#d1d5db',
                        backgroundColor: form.origine === opt.value ? opt.color + '15' : 'white',
                        color: form.origine === opt.value ? opt.color : '#5E5854',
                        fontSize: 11,
                        fontWeight: form.origine === opt.value ? 600 : 400,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ fontSize: 16, marginBottom: 2 }}>{opt.emoji}</div>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Lot concerné</label>
                <select
                  value={form.lot_id}
                  onChange={e => set('lot_id', e.target.value)}
                  style={{ ...inputStyle }}
                >
                  <option value="">— Aucun lot spécifique —</option>
                  {lots.map(l => (
                    <option key={l.id} value={l.id}>{l.nom}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section formulaire */}
          <div style={{ padding: '16px 20px', backgroundColor: 'white' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#9C9591', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
              Formulaire
            </p>

            {/* En-tête formulaire */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <FormRow label="Date d'émission">
                <input type="date" value={form.date_emission} onChange={e => set('date_emission', e.target.value)} style={inputStyle} />
              </FormRow>
              <FormRow label="Référence chantier (optionnel)">
                <input type="text" value={form.reference_chantier} onChange={e => set('reference_chantier', e.target.value)} placeholder="ex. : Fax du 12/05/2025" style={inputStyle} />
              </FormRow>
            </div>

            <div style={{ height: '0.5px', backgroundColor: '#f0ece9', margin: '4px 0 16px' }} />

            {/* 1. Description */}
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1F1B17', marginBottom: 10 }}>1. Description de la demande</p>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              {TYPE_DEMANDE_OPTIONS.map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#1F1B17' }}>
                  <input
                    type="radio"
                    name="type_demande"
                    value={opt.value}
                    checked={form.type_demande === opt.value}
                    onChange={() => set('type_demande', opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <FormRow label="Description précise de la demande">
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Décrire la modification demandée..."
              />
            </FormRow>

            <div style={{ height: '0.5px', backgroundColor: '#f0ece9', margin: '4px 0 16px' }} />

            {/* 2. Motivation */}
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1F1B17', marginBottom: 10 }}>2. Motivation de la demande</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginBottom: 10 }}>
              {MOTIVATION_OPTIONS.map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#1F1B17' }}>
                  <input
                    type="radio"
                    name="motivation"
                    value={opt.value}
                    checked={form.motivation === opt.value}
                    onChange={() => set('motivation', opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {form.motivation === 'autre' && (
              <FormRow label="Préciser">
                <input
                  type="text"
                  value={form.motivation_autre}
                  onChange={e => set('motivation_autre', e.target.value)}
                  placeholder="Préciser le motif..."
                  style={inputStyle}
                />
              </FormRow>
            )}

            <div style={{ height: '0.5px', backgroundColor: '#f0ece9', margin: '4px 0 16px' }} />

            {/* 3. Analyse MOE */}
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1F1B17', marginBottom: 12 }}>3. Analyse par le Maître d'Œuvre</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Faisabilité technique</label>
                <YesNoToggle value={form.faisabilite_technique} onChange={v => set('faisabilite_technique', v)} />
              </div>
              <div>
                <label style={labelStyle}>Impact réglementaire</label>
                <YesNoToggle value={form.impact_reglementaire} onChange={v => set('impact_reglementaire', v)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Incidence sur le délai</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={form.incidence_delai_valeur}
                    onChange={e => set('incidence_delai_valeur', e.target.value)}
                    placeholder="0"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <select
                    value={form.incidence_delai_unite}
                    onChange={e => set('incidence_delai_unite', e.target.value)}
                    style={{ ...inputStyle, width: 'auto' }}
                  >
                    <option value="jours">jours</option>
                    <option value="semaines">semaines</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
              <div>
                <label style={labelStyle}>Travaux supplémentaires HT (€)</label>
                <input
                  type="number"
                  value={form.montant_travaux_ht}
                  onChange={e => set('montant_travaux_ht', e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
                {travHTNum !== 0 && (
                  <p style={{ fontSize: 10, color: '#9C9591', marginTop: 3 }}>
                    ≈ {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(travHTNum * tva)} TTC
                  </p>
                )}
              </div>
              <div>
                <label style={labelStyle}>Honoraires MOE supplémentaires HT (€)</label>
                <input
                  type="number"
                  value={form.montant_honoraires_ht}
                  onChange={e => set('montant_honoraires_ht', e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
                {honHTNum !== 0 && (
                  <p style={{ fontSize: 10, color: '#9C9591', marginTop: 3 }}>
                    ≈ {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(honHTNum * tva)} TTC
                  </p>
                )}
              </div>
            </div>

            <div style={{ height: '0.5px', backgroundColor: '#f0ece9', margin: '16px 0' }} />

            {/* 4. Décision MOA */}
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1F1B17', marginBottom: 10 }}>4. Décision du Maître d'Ouvrage</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Décision</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DECISION_OPTIONS.map(opt => {
                    const colors = {
                      en_attente: { border: '#d97706', bg: '#FEF3C7', color: '#92400E' },
                      accepte: { border: '#2A8A4E', bg: 'rgba(42,138,78,0.12)', color: '#3a6011' },
                      renonce: { border: '#9C9591', bg: '#F1EFE8', color: '#6b5f5a' },
                    }
                    const c = colors[opt.value]
                    const active = form.decision === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set('decision', opt.value)}
                        style={{
                          flex: 1, padding: '5px 8px',
                          borderRadius: 6, border: '1px solid',
                          borderColor: active ? c.border : '#d1d5db',
                          backgroundColor: active ? c.bg : 'white',
                          color: active ? c.color : '#5E5854',
                          fontSize: 11, fontWeight: active ? 600 : 400,
                          cursor: 'pointer', transition: 'all 0.12s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <FormRow label="Date de décision">
                <input
                  type="date"
                  value={form.date_decision}
                  onChange={e => set('date_decision', e.target.value)}
                  style={inputStyle}
                />
              </FormRow>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px',
          borderTop: '0.5px solid rgba(0,0,0,0.1)',
          backgroundColor: '#FAF7F2',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '7px 16px', borderRadius: 8,
              border: '1px solid #d1d5db', backgroundColor: 'white',
              fontSize: 12, color: '#5E5854', cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            style={{
              padding: '7px 16px', borderRadius: 8,
              border: 'none', backgroundColor: '#2A8A4E',
              fontSize: 12, color: 'white', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            style={{
              padding: '7px 16px', borderRadius: 8,
              border: 'none', backgroundColor: '#E8602C',
              fontSize: 12, color: 'white', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Enregistrer et exporter PDF
          </button>
        </div>
      </div>
    </div>
  )
}
