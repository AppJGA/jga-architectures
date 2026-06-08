import { useState, useEffect, useRef } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { CollaborateursSection } from '../shared/components/CollaborateursSection'
import { supabase } from '../core/supabase/client'
import { useAuth } from '../core/auth/useAuth'

// ─── Valeurs par défaut ────────────────────────────────────────────────────
const DEFAULTS = {
  code_affaire: '', nom: '', phase: 'esq', avancement: 0,
  moa_nom: '', moa_adresse: '', moa_telephone: '', moa_email: '',
  projet_adresse: '', projet_commune: '', projet_code_postal: '',
  cadastre_section: '', cadastre_parcelle: '', cadastre_superficie: '',
  terrain_statut: null,
  viab_voirie: false, viab_electricite: false, viab_gaz: false,
  viab_assainissement: false, viab_eaux_pluviales: false, viab_courants_faibles: false,
  doc_cadastre: false, doc_geometre: false, doc_etude_sol: false, doc_servitudes: false,
  enveloppe_ttc: '', montant_travaux_ttc: '', honoraires_ttc: '',
  surface_plancher: '', surface_habitable: '', surface_terrain: '', cos_autorise: '',
  taux_tva: 1.20,
  seuil_aleas_pct: 5.00,
  date_esq: '', date_avp: '', date_pro: '', date_dce: '',
  date_depot_pc: '', date_obtention_pc: '', date_demarrage_travaux: '', date_livraison: '',
  programme_imperatifs: '', programme_interdits: '', programme_prestations: '', notes: '',
}

const TVA_PRESETS = [
  { value: '1.20',  label: '20 %',  sub: 'Neuf / Tertiaire' },
  { value: '1.10',  label: '10 %',  sub: 'Réhab. résidentiel' },
  { value: '1.055', label: '5,5 %', sub: 'Réhab. logement social' },
  { value: 'autre', label: 'Autre', sub: 'Saisie libre' },
]

function detectTvaPreset(taux) {
  const t = parseFloat(taux) || 1.20
  if (Math.abs(t - 1.20) < 0.001) return '1.20'
  if (Math.abs(t - 1.10) < 0.001) return '1.10'
  if (Math.abs(t - 1.055) < 0.001) return '1.055'
  return 'autre'
}

const NUMERIC_FIELDS = [
  'cadastre_superficie', 'enveloppe_ttc', 'montant_travaux_ttc', 'honoraires_ttc',
  'surface_plancher', 'surface_habitable', 'surface_terrain', 'cos_autorise',
]
const DATE_FIELDS = [
  'date_esq', 'date_avp', 'date_pro', 'date_dce',
  'date_depot_pc', 'date_obtention_pc', 'date_demarrage_travaux', 'date_livraison',
]

function initialForm(affaire) {
  if (!affaire) return { ...DEFAULTS }
  return Object.fromEntries(
    Object.keys(DEFAULTS).map(k => {
      const v = affaire[k]
      if (v === undefined) return [k, DEFAULTS[k]]
      // terrain_statut: keep null as-is (valid DB value)
      if (k === 'terrain_statut') return [k, v ?? null]
      if (v === null) return [k, DEFAULTS[k]]
      // Date fields: keep ISO string prefix only
      if (DATE_FIELDS.includes(k) && typeof v === 'string') return [k, v.slice(0, 10)]
      return [k, v]
    })
  )
}

function cleanData(form) {
  return Object.fromEntries(
    Object.entries(form).map(([k, v]) => {
      if ((NUMERIC_FIELDS.includes(k) || DATE_FIELDS.includes(k)) && v === '') return [k, null]
      if (NUMERIC_FIELDS.includes(k) && v !== null && v !== '') return [k, parseFloat(v)]
      if (k === 'taux_tva') return [k, parseFloat(v) || 1.20]
      if (k === 'seuil_aleas_pct') return [k, parseFloat(v) || 5.00]
      if (k === 'terrain_statut') return [k, v || null]
      if (k === 'phase') return [k, v || 'esq']
      return [k, v]
    })
  )
}

// ─── Composants de champ ──────────────────────────────────────────────────
function Label({ children }) {
  return (
    <label style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--jga-beige)',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      marginBottom: 5,
    }}>
      {children}
    </label>
  )
}

const inputBase = {
  width: '100%',
  height: 38,
  padding: '0 10px',
  borderRadius: 2,
  border: '0.5px solid rgba(0,0,0,0.12)',
  backgroundColor: '#FAFAF9',
  fontSize: 13,
  color: '#1F1B17',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
}

function TextInput({ value, onChange, placeholder, type = 'text', ...rest }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase,
        borderColor: focused ? 'var(--jga-orange)' : 'rgba(0,0,0,0.12)',
        backgroundColor: focused ? 'white' : '#FAFAF9',
        boxShadow: focused ? '0 0 0 3px rgba(232,96,44,0.12)' : 'none',
      }}
      {...rest}
    />
  )
}

function SelectInput({ value, onChange, options }) {
  const [focused, setFocused] = useState(false)
  return (
    <select
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase,
        cursor: 'pointer',
        borderColor: focused ? 'var(--jga-orange)' : 'rgba(0,0,0,0.12)',
        backgroundColor: focused ? 'white' : '#FAFAF9',
        boxShadow: focused ? '0 0 0 3px rgba(232,96,44,0.12)' : 'none',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function TextArea({ value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        minHeight: 80,
        padding: '8px 10px',
        borderRadius: 2,
        border: '0.5px solid rgba(0,0,0,0.12)',
        backgroundColor: focused ? 'white' : '#FAFAF9',
        borderColor: focused ? 'var(--jga-orange)' : 'rgba(0,0,0,0.12)',
        boxShadow: focused ? '0 0 0 3px rgba(232,96,44,0.12)' : 'none',
        fontSize: 13,
        color: '#1F1B17',
        outline: 'none',
        resize: 'vertical',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
      }}
    />
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div style={{ marginBottom: 18, marginTop: 4 }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--jga-orange)', marginBottom: 6 }}>
        {title}
      </p>
      <div style={{ height: '0.5px', backgroundColor: 'var(--jga-orange)', opacity: 0.2 }} />
    </div>
  )
}

function CheckRow({ label, checked, onChange }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      cursor: 'pointer',
      fontSize: 12,
      color: '#374151',
      userSelect: 'none',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: 'var(--jga-orange)', width: 14, height: 14, cursor: 'pointer' }}
      />
      {label}
    </label>
  )
}

function RadioRow({ label, value, current, onChange }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      cursor: 'pointer',
      fontSize: 12,
      color: '#374151',
      userSelect: 'none',
    }}>
      <input
        type="radio"
        value={value}
        checked={current === value}
        onChange={onChange}
        style={{ accentColor: 'var(--jga-orange)', cursor: 'pointer' }}
      />
      {label}
    </label>
  )
}

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }

// ─── Composant principal ───────────────────────────────────────────────────
function compressToWebP(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX_WIDTH = 800
      const MAX_HEIGHT = 600
      let { width, height } = img

      if (width > MAX_WIDTH) {
        height = Math.round(height * MAX_WIDTH / width)
        width = MAX_WIDTH
      }
      if (height > MAX_HEIGHT) {
        width = Math.round(width * MAX_HEIGHT / height)
        height = MAX_HEIGHT
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.72)
    }

    img.onerror = () => resolve(file)
    img.src = url
  })
}

async function uploadPhoto(file, affaireId, oldPhotoUrl) {
  if (oldPhotoUrl) {
    try {
      const parts = oldPhotoUrl.split('/affaires-photos/')
      if (parts.length > 1) {
        await supabase.storage.from('affaires-photos').remove([parts[1].split('?')[0]])
      }
    } catch (e) {
      console.warn('Suppression ancienne photo:', e)
    }
  }

  const compressed = await compressToWebP(file)
  const path = `${affaireId}/${Date.now()}.webp`
  const { error } = await supabase.storage
    .from('affaires-photos')
    .upload(path, compressed, { contentType: 'image/webp', upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('affaires-photos').getPublicUrl(path)
  return data.publicUrl
}

export function AffaireFormModal({ affaire = null, onSave, onClose, scrollToSection, open = true, mode: modeProp = undefined }) {
  const mode = modeProp ?? (affaire ? 'edit' : 'create')
  const { user } = useAuth()
  const [form, setForm] = useState(() => initialForm(affaire))
  const [tvaPreset, setTvaPreset] = useState(() => detectTvaPreset(affaire?.taux_tva))
  const [saving, setSaving] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [formError, setFormError] = useState(null)
  const [isAssigned, setIsAssigned] = useState(true)
  const formRef = useRef(null)
  const photoInputRef = useRef(null)
  const [photoPreview, setPhotoPreview] = useState(affaire?.photo_url ?? null)
  const [photoFile, setPhotoFile] = useState(null)

  useEffect(() => {
    if (!affaire?.id || !user?.id) return
    supabase
      .from('affaire_collaborateurs')
      .select('id')
      .eq('affaire_id', affaire.id)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setIsAssigned(!!data))
  }, [affaire?.id, user?.id])

  useEffect(() => {
    if (!open) return
    if (mode === 'create' || !affaire) {
      setForm({ ...DEFAULTS })
      setTvaPreset('1.20')
      setCodeError('')
      setPhotoPreview(null)
      setPhotoFile(null)
    } else {
      const f = { ...affaire }
      DATE_FIELDS.forEach(k => { if (typeof f[k] === 'string') f[k] = f[k].slice(0, 10) })
      setForm({
        ...f,
        terrain_statut: affaire.terrain_statut ?? null,
        taux_tva: affaire.taux_tva ?? 1.20,
        seuil_aleas_pct: affaire.seuil_aleas_pct ?? 5.00,
      })
      setTvaPreset(detectTvaPreset(affaire.taux_tva))
      setCodeError('')
      setPhotoPreview(affaire.photo_url ?? null)
      setPhotoFile(null)
    }
  }, [open, mode, affaire])

  useEffect(() => {
    if (open) setFormError(null)
  }, [open])

  useEffect(() => {
    if (!scrollToSection) return
    const timer = setTimeout(() => {
      const el = formRef.current?.querySelector(`[data-section="${scrollToSection}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(timer)
  }, [scrollToSection])

  // Fermeture sur Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  const setNum = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  const toggle = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.checked }))
  const setInt = (key) => (e) => setForm(f => ({ ...f, [key]: Number(e.target.value) }))

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const handlePhotoRemove = () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!/^\d{4}-[A-Z]{3}$/.test(form.code_affaire)) {
      setCodeError('Format attendu : 4 chiffres, tiret, 3 lettres majuscules (ex. 2024-ABC)')
      return
    }
    setCodeError('')
    setFormError(null)
    setSaving(true)
    try {
      let finalPhotoUrl = photoPreview
      if (photoFile) {
        const folderId = affaire?.id ?? crypto.randomUUID()
        const oldPhotoUrl = affaire?.photo_url ?? null
        finalPhotoUrl = await uploadPhoto(photoFile, folderId, oldPhotoUrl)
      }
      await onSave({ ...cleanData(form), photo_url: finalPhotoUrl ?? null })
      onClose()
    } catch (err) {
      if (err.message?.includes('affaires_code_affaire_key')) {
        setFormError('Ce code affaire existe déjà. Choisissez un code différent.')
      } else {
        setFormError("Erreur lors de l'enregistrement : " + err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const isEdit = Boolean(affaire?.id)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          backgroundColor: 'white',
          borderRadius: 0,
          border: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '22px 32px 18px',
          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>
              {isEdit ? "Modifier l'affaire" : 'Nouvelle affaire'}
            </h2>
            {isEdit && (
              <p style={{ fontSize: 11, color: 'var(--jga-beige)', marginTop: 2 }}>
                {affaire.code_affaire} · {affaire.nom}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 2,
              border: 'none', backgroundColor: 'transparent',
              cursor: 'pointer', color: 'var(--jga-beige)',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FAF7F2'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form body */}
        <form
          ref={formRef}
          id="affaire-form"
          onSubmit={handleSubmit}
          style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}
        >
          {/* ── Photo de couverture ── */}
          <div style={{ marginBottom: 28 }}>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
            {photoPreview ? (
              <div style={{ position: 'relative', height: 160, borderRadius: 2, overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => photoInputRef.current?.click()}
              >
                <img
                  src={photoPreview}
                  alt="Couverture"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundColor: 'rgba(0,0,0,0)', transition: 'background-color 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.35)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0)'}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    style={{
                      padding: '6px 14px', borderRadius: 3, fontSize: 12, fontWeight: 500,
                      border: 'none', backgroundColor: 'white', color: '#1F1B17', cursor: 'pointer',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                  >
                    Changer
                  </button>
                  <button
                    type="button"
                    onClick={handlePhotoRemove}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', border: 'none',
                      backgroundColor: 'rgba(255,255,255,0.9)', color: '#B8412C',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                style={{
                  width: '100%', height: 160, borderRadius: 2,
                  border: '1.5px dashed rgba(0,0,0,0.15)', backgroundColor: '#FAFAF9',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, cursor: 'pointer', color: '#9C9591', transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--jga-orange)'; e.currentTarget.style.backgroundColor = 'rgba(232,96,44,0.10)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; e.currentTarget.style.backgroundColor = '#FAFAF9' }}
              >
                <ImagePlus size={24} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Ajouter une photo de couverture</span>
                <span style={{ fontSize: 11 }}>JPG, PNG, WEBP — max 5 Mo</span>
              </button>
            )}
          </div>

          {/* ── Section 1 : Identification ── */}
          <SectionHeader title="Identification" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            <div style={grid2}>
              <Field label="Code affaire *">
                <TextInput
                  value={form.code_affaire}
                  onChange={e => {
                    setCodeError('')
                    set('code_affaire')(e)
                  }}
                  placeholder="2024-ABC"
                />
                {codeError
                  ? <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 4 }}>{codeError}</p>
                  : <p style={{ fontSize: 11, color: 'var(--jga-beige)', marginTop: 4 }}>4 chiffres, tiret, 3 lettres majuscules</p>
                }
                {formError && (
                  <p style={{ fontSize: 11, color: '#B8412C', marginTop: 4 }}>{formError}</p>
                )}
              </Field>
              <Field label="Nom de l'affaire *">
                <TextInput value={form.nom} onChange={set('nom')} placeholder="Résidence Les Peupliers" required />
              </Field>
            </div>
            <Field label="Phase" style={{ maxWidth: 240 }}>
              <SelectInput
                value={form.phase}
                onChange={set('phase')}
                options={[
                  { value: 'esq', label: 'ESQ — Esquisse' },
                  { value: 'avp', label: 'AVP — Avant-Projet' },
                  { value: 'pro', label: 'PRO — Projet' },
                  { value: 'dce', label: 'DCE' },
                  { value: 'chantier', label: 'Chantier' },
                  { value: 'livree', label: 'Livrée' },
                ]}
              />
            </Field>
          </div>

          {/* ── Section 2 : Maître d'ouvrage ── */}
          <SectionHeader title="Maître d'ouvrage" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            <div style={grid2}>
              <Field label="Nom / Raison sociale">
                <TextInput value={form.moa_nom} onChange={set('moa_nom')} placeholder="Ville de Lyon" />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={form.moa_email} onChange={set('moa_email')} placeholder="contact@mairie.fr" />
              </Field>
            </div>
            <div style={grid2}>
              <Field label="Téléphone">
                <TextInput type="tel" value={form.moa_telephone} onChange={set('moa_telephone')} placeholder="04 00 00 00 00" />
              </Field>
              <Field label="Adresse">
                <TextInput value={form.moa_adresse} onChange={set('moa_adresse')} placeholder="1 place de la Mairie" />
              </Field>
            </div>
          </div>

          {/* ── Section 3 : Site du projet ── */}
          <SectionHeader title="Site du projet" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            <Field label="Adresse du terrain">
              <TextInput value={form.projet_adresse} onChange={set('projet_adresse')} placeholder="12 rue des Peupliers" />
            </Field>
            <div style={grid2}>
              <Field label="Commune">
                <TextInput value={form.projet_commune} onChange={set('projet_commune')} placeholder="Calais" />
              </Field>
              <Field label="Code postal">
                <TextInput value={form.projet_code_postal} onChange={set('projet_code_postal')} placeholder="62100" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Section cadastrale">
                <TextInput value={form.cadastre_section} onChange={set('cadastre_section')} placeholder="AB" />
              </Field>
              <Field label="Numéro(s) de parcelle(s)">
                <TextInput value={form.cadastre_parcelle} onChange={set('cadastre_parcelle')} placeholder="0142" />
              </Field>
              <Field label="Superficie (m²)">
                <TextInput type="number" value={form.cadastre_superficie} onChange={setNum('cadastre_superficie')} placeholder="4200" />
              </Field>
            </div>

            <Field label="Statut du terrain">
              <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                {[
                  { value: 'propriete', label: 'Pleine propriété' },
                  { value: 'compromis', label: 'Compromis en cours' },
                  { value: 'location', label: 'Location' },
                  { value: 'en_vue', label: 'En vue' },
                ].map(r => (
                  <RadioRow
                    key={r.value}
                    label={r.label}
                    value={r.value}
                    current={form.terrain_statut}
                    onChange={set('terrain_statut')}
                  />
                ))}
              </div>
            </Field>

            <Field label="Viabilités existantes">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                {[
                  { key: 'viab_voirie', label: 'Voirie' },
                  { key: 'viab_electricite', label: 'Électricité' },
                  { key: 'viab_gaz', label: 'Gaz' },
                  { key: 'viab_assainissement', label: 'Assainissement' },
                  { key: 'viab_eaux_pluviales', label: 'Eaux pluviales' },
                  { key: 'viab_courants_faibles', label: 'Courants faibles' },
                ].map(v => (
                  <CheckRow key={v.key} label={v.label} checked={form[v.key]} onChange={toggle(v.key)} />
                ))}
              </div>
            </Field>
          </div>

          {/* ── Section 4 : Documents ── */}
          <SectionHeader title="Documents disponibles" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
            {[
              { key: 'doc_cadastre', label: 'Copie du cadastre' },
              { key: 'doc_geometre', label: 'Relevé de géomètre' },
              { key: 'doc_etude_sol', label: 'Étude de sol' },
              { key: 'doc_servitudes', label: 'Servitudes' },
            ].map(d => (
              <CheckRow key={d.key} label={d.label} checked={form[d.key]} onChange={toggle(d.key)} />
            ))}
          </div>

          {/* ── Section 5 : Financier ── */}
          <div data-section="financier">
            <SectionHeader title="Financier" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            <div style={grid2}>
              <Field label="Enveloppe globale TTC (€)">
                <TextInput type="number" value={form.enveloppe_ttc} onChange={setNum('enveloppe_ttc')} placeholder="1 200 000" />
              </Field>
              <Field label="dont Travaux TTC (€)">
                <TextInput type="number" value={form.montant_travaux_ttc} onChange={setNum('montant_travaux_ttc')} placeholder="950 000" />
              </Field>
            </div>
            <div style={grid2}>
              <Field label="dont Honoraires architecte TTC (€)">
                <TextInput type="number" value={form.honoraires_ttc} onChange={setNum('honoraires_ttc')} placeholder="85 000" />
              </Field>
              <Field label="Surface de plancher (m²)">
                <TextInput type="number" value={form.surface_plancher} onChange={setNum('surface_plancher')} placeholder="1 800" />
              </Field>
            </div>
            <div style={grid2}>
              <Field label="SHAB — Surface habitable (m²)">
                <TextInput type="number" value={form.surface_habitable} onChange={setNum('surface_habitable')} placeholder="1 650" />
              </Field>
              <Field label="Surface terrain (m²)">
                <TextInput type="number" value={form.surface_terrain} onChange={setNum('surface_terrain')} placeholder="4 200" />
              </Field>
            </div>

            {/* Taux de TVA */}
            <Field label="Taux de TVA applicable">
              <div style={{ display: 'flex', gap: 6 }}>
                {TVA_PRESETS.map(p => {
                  const sel = tvaPreset === p.value
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        setTvaPreset(p.value)
                        if (p.value !== 'autre') setForm(f => ({ ...f, taux_tva: parseFloat(p.value) }))
                      }}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 2, cursor: 'pointer',
                        backgroundColor: sel ? 'rgba(232,96,44,0.10)' : '#FAFAF9',
                        border: sel ? '1.5px solid #E8602C' : '0.5px solid rgba(0,0,0,0.12)',
                        textAlign: 'left',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 500, color: sel ? '#E8602C' : '#1F1B17', marginBottom: 2 }}>
                        {p.label}
                      </p>
                      <p style={{ fontSize: 10, color: '#9C9591' }}>{p.sub}</p>
                    </button>
                  )
                })}
              </div>
              {tvaPreset === 'autre' && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="number"
                    min="1.00" max="1.30" step="0.005"
                    value={form.taux_tva}
                    onChange={e => setForm(f => ({ ...f, taux_tva: e.target.value }))}
                    placeholder="Ex: 1.085 pour 8,5%"
                    style={{ ...inputBase, width: 200 }}
                  />
                  {form.taux_tva !== '' && parseFloat(form.taux_tva) > 1 && (
                    <p style={{ fontSize: 11, color: '#9C9591', marginTop: 4 }}>
                      soit {((parseFloat(form.taux_tva) - 1) * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} % de TVA
                    </p>
                  )}
                </div>
              )}
            </Field>

            {/* Seuil d'aléas */}
            <Field label="Seuil d'aléas contractuels">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min="0" max="20" step="0.5"
                  value={form.seuil_aleas_pct}
                  onChange={setNum('seuil_aleas_pct')}
                  style={{ ...inputBase, width: 120 }}
                />
                <span style={{ fontSize: 13, color: '#5E5854' }}>%</span>
              </div>
              <p style={{ fontSize: 11, color: '#9C9591', marginTop: 6 }}>
                Pourcentage du marché de base au-delà duquel une alerte est déclenchée dans le suivi financier.
              </p>
            </Field>
          </div>

          {/* ── Section 6 : Calendrier ── */}
          <SectionHeader title="Calendrier des phases" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
            {[
              { key: 'date_esq', label: 'Esquisse (ESQ)' },
              { key: 'date_avp', label: 'Avant-Projet (AVP)' },
              { key: 'date_pro', label: 'Projet (PRO)' },
              { key: 'date_dce', label: 'DCE' },
              { key: 'date_depot_pc', label: 'Dépôt Permis de Construire' },
              { key: 'date_obtention_pc', label: 'Obtention Permis de Construire' },
              { key: 'date_demarrage_travaux', label: 'Démarrage des travaux' },
              { key: 'date_livraison', label: 'Livraison prévisionnelle' },
            ].map(d => (
              <Field key={d.key} label={d.label}>
                <TextInput type="date" value={form[d.key]} onChange={set(d.key)} />
              </Field>
            ))}
          </div>

          {/* ── Section 7 : Collaborateurs (édition uniquement) ── */}
          {isEdit && (
            <div>
              <SectionHeader title="Équipe" />
              <div style={{ marginBottom: 28 }}>
                {!isAssigned && (
                  <button
                    type="button"
                    onClick={async () => {
                      const { error } = await supabase
                        .from('affaire_collaborateurs')
                        .upsert(
                          [{ affaire_id: affaire.id, user_id: user.id, role: 'proprietaire' }],
                          { onConflict: 'affaire_id,user_id' }
                        )
                      if (!error) setIsAssigned(true)
                    }}
                    style={{
                      fontSize: 11, color: 'var(--jga-orange)',
                      background: 'var(--jga-orange-light)',
                      border: '0.5px solid rgba(224,90,30,0.3)',
                      borderRadius: 3, padding: '4px 10px',
                      cursor: 'pointer', marginBottom: 12,
                    }}
                  >
                    + M'assigner comme responsable de cette affaire
                  </button>
                )}
                <CollaborateursSection affaireId={affaire?.id} />
              </div>
            </div>
          )}

          {/* ── Section 8 : Programme & Notes ── */}
          <SectionHeader title="Programme & Notes" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Impératifs / Souhaits du maître d'ouvrage">
              <TextArea value={form.programme_imperatifs} onChange={set('programme_imperatifs')} placeholder="Ex. : Ossature bois, BBC, livraison avant été 2026…" />
            </Field>
            <Field label="Éléments non souhaités">
              <TextArea value={form.programme_interdits} onChange={set('programme_interdits')} placeholder="Ex. : Pas de couleur sombre en façade…" />
            </Field>
            <Field label="Niveau de prestations attendu">
              <TextArea value={form.programme_prestations} onChange={set('programme_prestations')} placeholder="Ex. : Prestations haut de gamme, matériaux nobles…" />
            </Field>
            <Field label="Notes internes">
              <TextArea value={form.notes} onChange={set('notes')} placeholder="Notes réservées à l'équipe JGA…" />
            </Field>
          </div>
        </form>

        {/* Modal footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '18px 32px 22px',
          borderTop: '0.5px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: 2,
              border: '0.5px solid rgba(0,0,0,0.15)',
              backgroundColor: 'transparent',
              fontSize: 13,
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            form="affaire-form"
            disabled={saving}
            style={{
              padding: '9px 22px',
              borderRadius: 2,
              border: 'none',
              backgroundColor: 'var(--jga-orange)',
              color: 'white',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : "Créer l'affaire"}
          </button>
        </div>
      </div>
    </div>
  )
}
