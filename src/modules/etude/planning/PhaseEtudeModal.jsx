import { useState, useEffect, useRef } from 'react'
import { X, Trash2, Plus, Minimize2, Maximize2 } from 'lucide-react'
import {
  getWeekStart, getCurrentWeek, addWeeks, weeksBetween,
  computeLagSemaines, getPhaseCouleur, COULEURS_PHASE_PRESET,
} from './types'

const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: '#FAFAF9', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

const MODAL_WIDTH = 480
const MODAL_MINIMIZED_HEIGHT = 44
const MODAL_HEIGHT_REF = 600

function centeredPosition() {
  return {
    x: Math.max(0, (window.innerWidth - MODAL_WIDTH) / 2),
    y: Math.max(0, (window.innerHeight - MODAL_HEIGHT_REF) / 2),
  }
}

function clampPosition(x, y) {
  return {
    x: Math.max(0, Math.min(window.innerWidth - MODAL_WIDTH, x)),
    y: Math.max(0, Math.min(window.innerHeight - MODAL_MINIMIZED_HEIGHT, y)),
  }
}

const TYPE_OPTIONS = [
  { type: 'etude',         label: 'MOE',          sublabel: 'ESQ, APS, APD, PRO, DCE…',       couleur: '#E8A200', fondClair: '#FFF8E7' },
  { type: 'validation',    label: 'MOA',           sublabel: 'Visas, validations, approbations', couleur: '#2A8A4E', fondClair: 'rgba(42,138,78,0.12)' },
  { type: 'administratif', label: 'Administratif', sublabel: 'Instruction PC, recours, dépôt…', couleur: '#D97706', fondClair: '#FEF3C7' },
  { type: 'chantier',      label: 'Chantier',      sublabel: 'DET, travaux, OPR, réception',    couleur: '#1B3A5C', fondClair: 'rgba(27,58,92,0.10)' },
]

const TYPE_PLACEHOLDERS = {
  etude:         'Ex: APS — Avant-Projet Sommaire',
  validation:    'Ex: Validation APS ORSAC',
  administratif: "Ex: Instruction Permis de Construire",
  chantier:      "Ex: DET — Direction de l'exécution des travaux",
}

export function typeToImportance(type) {
  return { etude: 'moe', validation: 'moa', administratif: 'admin', chantier: 'chantier' }[type] ?? 'moa'
}

// `defaultSemaine` : première semaine libre du planning, calculée par le parent
// (dernière phase + périodes bloquantes déduites). Retombe sur la semaine
// courante si le planning est vide.
function emptyForm(defaultSemaine, createDefaults) {
  const debut = createDefaults?.semaine_debut
    ? { semaine: createDefaults.semaine_debut, annee: createDefaults.annee_debut }
    : (defaultSemaine ?? getCurrentWeek())
  return {
    nom: '',
    type_tache: 'etude',
    semaine_debut: debut.semaine,
    annee_debut: debut.annee,
    duree_semaines: createDefaults?.duree_semaines ?? 4,
    duree_arch: '',
    duree_bet: '',
    duree_econ: '',
    label_barre: '',
    couleur_custom: null,
    depends_on: null,
    lag_semaines: 0,
  }
}

// ─── Ligne de segment ─────────────────────────────────────────────────────────
//
// Les champs sont tenus en brouillon local et ne sont persistés qu'au blur :
// `updateSegment` attend la réponse Supabase avant de mettre le state à jour, si
// bien qu'un input contrôlé directement sur la valeur du hook « perdait » des
// lettres (chaque frappe repartait de la valeur encore non rafraîchie, et les
// réponses concurrentes se résolvaient dans le désordre).
function SegmentRow({ seg, premier, placeholderNom, onUpdate, onDelete }) {
  const [nom, setNom] = useState(seg.nom ?? '')
  const [semaine, setSemaine] = useState(seg.semaine_debut)
  const [annee, setAnnee] = useState(seg.annee_debut)
  const [duree, setDuree] = useState(seg.duree_semaines)

  useEffect(() => { setNom(seg.nom ?? '') }, [seg.nom])
  useEffect(() => { setSemaine(seg.semaine_debut) }, [seg.semaine_debut])
  useEffect(() => { setAnnee(seg.annee_debut) }, [seg.annee_debut])
  useEffect(() => { setDuree(seg.duree_semaines) }, [seg.duree_semaines])

  const commit = (changes) => onUpdate(seg.id, changes)
  const fin = addWeeks(seg.semaine_debut, seg.annee_debut, seg.duree_semaines)

  const CHAMP = { ...INPUT, height: 30, fontSize: 12 }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 70px 80px 70px 28px', gap: 8,
      alignItems: 'end', padding: '8px 0',
      borderBottom: '0.5px solid rgba(0,0,0,0.06)',
    }}>
      <div>
        {premier && <label style={{ ...LABEL, marginBottom: 3 }}>Nom (optionnel)</label>}
        <input
          type="text"
          value={nom}
          onChange={e => setNom(e.target.value)}
          onBlur={() => { if ((seg.nom ?? '') !== nom) commit({ nom: nom || null }) }}
          placeholder={placeholderNom}
          style={CHAMP}
        />
      </div>
      <div>
        {premier && <label style={{ ...LABEL, marginBottom: 3 }}>Semaine</label>}
        <input
          type="number" min={1} max={53}
          value={semaine}
          onChange={e => setSemaine(e.target.value)}
          onBlur={() => {
            const v = Math.min(53, Math.max(1, Number(semaine) || 1))
            setSemaine(v)
            if (v !== seg.semaine_debut) commit({ semaine_debut: v })
          }}
          style={CHAMP}
        />
      </div>
      <div>
        {premier && <label style={{ ...LABEL, marginBottom: 3 }}>Année</label>}
        <input
          type="number" min={2020} max={2040}
          value={annee}
          onChange={e => setAnnee(e.target.value)}
          onBlur={() => {
            const v = Number(annee) || seg.annee_debut
            setAnnee(v)
            if (v !== seg.annee_debut) commit({ annee_debut: v })
          }}
          style={CHAMP}
        />
      </div>
      <div>
        {premier && <label style={{ ...LABEL, marginBottom: 3 }}>Durée</label>}
        <input
          type="number" min={1}
          value={duree}
          onChange={e => setDuree(e.target.value)}
          onBlur={() => {
            const v = Math.max(1, Number(duree) || 1)
            setDuree(v)
            if (v !== seg.duree_semaines) commit({ duree_semaines: v })
          }}
          style={CHAMP}
          title="Durée en semaines"
        />
      </div>
      <button
        type="button"
        onClick={() => onDelete(seg.id)}
        title={`Supprimer ce segment (fin S${fin.semaine} ${fin.annee})`}
        style={{
          width: 28, height: 30,
          border: '0.5px solid rgba(220,38,38,0.3)',
          background: '#FEF2F2', color: '#DC2626', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

export function PhaseEtudeModal({
  open, onClose, phase, phases, onSave, onDelete, mode,
  defaultSemaine = null, createDefaults = null,
  getSegmentsForPhase, addSegment, updateSegment, deleteSegment,
}) {
  const [form, setForm] = useState(() => emptyForm(defaultSemaine, createDefaults))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // ── Fenêtre flottante : position, minimisation, déplacement ─────────────────
  const [position, setPosition] = useState(centeredPosition)
  const [minimized, setMinimized] = useState(false)
  const [isDraggingModal, setIsDraggingModal] = useState(false)
  const dragStartRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setPosition(centeredPosition())
    setMinimized(false)
  }, [open])

  useEffect(() => {
    if (!isDraggingModal) return
    const handleMove = (e) => {
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      setPosition(clampPosition(
        dragStartRef.current.modalX + dx,
        dragStartRef.current.modalY + dy,
      ))
    }
    const handleUp = () => setIsDraggingModal(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDraggingModal])

  const handleModalDragStart = (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return
    setIsDraggingModal(true)
    dragStartRef.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      modalX: position.x, modalY: position.y,
    }
  }

  // Les valeurs par défaut sont décomposées en primitives : le parent les
  // recalcule dans un useMemo, donc leur IDENTITÉ change à chaque rendu même
  // quand la valeur est identique. Les mettre telles quelles dans les
  // dépendances de l'effet ci-dessous réinitialisait le formulaire en pleine
  // saisie ; en primitives, l'effet ne se redéclenche que si la valeur change.
  const semDefaut = defaultSemaine?.semaine ?? null
  const anneeDefaut = defaultSemaine?.annee ?? null
  const cdSemaine = createDefaults?.semaine_debut ?? null
  const cdAnnee = createDefaults?.annee_debut ?? null
  const cdDuree = createDefaults?.duree_semaines ?? null

  useEffect(() => {
    if (!open) return
    if (phase) {
      setForm({
        nom:           phase.nom ?? '',
        type_tache:    phase.type_tache ?? 'etude',
        semaine_debut: phase.semaine_debut,
        annee_debut:   phase.annee_debut,
        duree_semaines: phase.duree_semaines ?? 1,
        duree_arch:    phase.duree_arch ?? '',
        duree_bet:     phase.duree_bet  ?? '',
        duree_econ:    phase.duree_econ ?? '',
        label_barre:   phase.label_barre ?? '',
        couleur_custom: phase.couleur_custom ?? null,
        depends_on:    phase.depends_on ?? null,
        lag_semaines:  phase.lag_semaines ?? 0,
      })
    } else {
      setForm(emptyForm(
        semDefaut ? { semaine: semDefaut, annee: anneeDefaut } : null,
        cdSemaine ? { semaine_debut: cdSemaine, annee_debut: cdAnnee, duree_semaines: cdDuree } : null,
      ))
    }
    setConfirmDelete(false)
  }, [open, phase, semDefaut, anneeDefaut, cdSemaine, cdAnnee, cdDuree])

  if (!open) return null

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleTypeChange = (type) => {
    setForm(f => ({
      ...f,
      type_tache: type,
      // Réinitialiser les sous-durées si on quitte MOE
      duree_arch: type === 'etude' ? f.duree_arch : '',
      duree_bet:  type === 'etude' ? f.duree_bet  : '',
      duree_econ: type === 'etude' ? f.duree_econ : '',
      // Réinitialiser label_barre si on quitte administratif
      label_barre: type === 'administratif' ? f.label_barre : '',
    }))
  }

  const handleDependencyChange = (val) => {
    const newDep = val === 'none' ? null : Number(val)
    if (!newDep) { set('depends_on', null); set('lag_semaines', 0); return }
    const parent = phases.find(p => p.id === newDep)
    if (!parent) { set('depends_on', newDep); return }
    const lag = computeLagSemaines(
      parent.semaine_debut, parent.annee_debut, parent.duree_semaines,
      form.semaine_debut, form.annee_debut
    )
    setForm(f => ({ ...f, depends_on: newDep, lag_semaines: Math.max(0, lag) }))
  }

  const subTotal = (Number(form.duree_arch) || 0) + (Number(form.duree_bet) || 0) + (Number(form.duree_econ) || 0)
  const subDelta = subTotal - Number(form.duree_semaines)

  const debutDate = getWeekStart(form.semaine_debut, form.annee_debut)
  const debutLabel = debutDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const finWeek = addWeeks(form.semaine_debut, form.annee_debut, form.duree_semaines)

  const lagSem = Number(form.lag_semaines ?? 0)
  const lagText = lagSem === 0
    ? 'Collée (commence la semaine suivant la fin)'
    : `${lagSem} semaine${lagSem > 1 ? 's' : ''} de battement`

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    const isMoe = form.type_tache === 'etude'
    // importance : uniquement 'moe'/'moa' tant que la migration 013 n'est pas appliquée
    const importance = isMoe ? 'moe' : 'moa'
    const payload = {
      nom:            form.nom.trim(),
      type_tache:     form.type_tache,
      importance,
      semaine_debut:  Number(form.semaine_debut),
      annee_debut:    Number(form.annee_debut),
      duree_semaines: Math.max(1, Number(form.duree_semaines)),
      duree_arch:  isMoe && form.duree_arch !== '' ? Number(form.duree_arch) : null,
      duree_bet:   isMoe && form.duree_bet  !== '' ? Number(form.duree_bet)  : null,
      duree_econ:  isMoe && form.duree_econ !== '' ? Number(form.duree_econ) : null,
      label_barre: form.type_tache === 'administratif' ? (form.label_barre || null) : null,
      couleur_custom: form.couleur_custom || null,
      depends_on:  form.depends_on ?? null,
      lag_semaines: form.depends_on ? lagSem : 0,
    }
    await onSave({ ...phase, ...payload })
    setSaving(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    await onDelete(phase.id)
    setSaving(false)
    onClose()
  }

  const otherPhases = phases.filter(p => p.id !== phase?.id)

  // ── Segments supplémentaires ────────────────────────────────────────────────
  const segmentsDePhase = (phase?.id && getSegmentsForPhase) ? getSegmentsForPhase(phase.id) : []

  // Nouveau segment : juste après la fin de la phase, ou du dernier segment
  const handleAddSegment = async () => {
    if (!phase?.id || !addSegment) return
    let debut = addWeeks(form.semaine_debut, form.annee_debut, Number(form.duree_semaines) || 1)
    segmentsDePhase.forEach((seg) => {
      const fin = addWeeks(seg.semaine_debut, seg.annee_debut, seg.duree_semaines)
      if (weeksBetween(debut.semaine, debut.annee, fin.semaine, fin.annee) > 0) debut = fin
    })
    await addSegment(phase.id, {
      semaine_debut: debut.semaine,
      annee_debut: debut.annee,
      duree_semaines: 2,
    })
  }

  return (
    // Fenêtre flottante : pas d'overlay sombre, pas de fermeture au clic
    // extérieur — on ne ferme que par ✕, Annuler ou Enregistrer.
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: MODAL_WIDTH,
        height: minimized ? MODAL_MINIMIZED_HEIGHT : 'auto',
        maxHeight: minimized ? MODAL_MINIMIZED_HEIGHT : '85vh',
        overflow: minimized ? 'hidden' : 'auto',
        background: 'white',
        border: '0.5px solid #E9E2D6',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — déplaçable */}
      <div
        onMouseDown={handleModalDragStart}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: '#F5F2F0',
          borderBottom: minimized ? 'none' : '0.5px solid #E9E2D6',
          cursor: isDraggingModal ? 'grabbing' : 'grab',
          userSelect: 'none', flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 12, fontWeight: 500, color: '#1F1B17',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {mode === 'create' ? 'Nouvelle phase' : (phase?.nom || 'Modifier la phase')}
        </span>

        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setMinimized(v => !v)}
            title={minimized ? 'Agrandir' : 'Réduire'}
            style={{
              width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C9591',
            }}
          >
            {minimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </button>
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            style={{
              width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C9591',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 4 boutons de type */}
            <div>
              <label style={LABEL}>Type de phase</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {TYPE_OPTIONS.map(opt => {
                  const isSelected = form.type_tache === opt.type
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => handleTypeChange(opt.type)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 2,
                        border: isSelected
                          ? `1.5px solid ${opt.couleur}`
                          : '0.5px solid rgba(0,0,0,0.12)',
                        backgroundColor: isSelected ? opt.fondClair : '#FAFAF9',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? opt.couleur : '#1F1B17', marginBottom: 2 }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#9C9591', lineHeight: 1.3 }}>
                        {opt.sublabel}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Couleur personnalisée — prime sur la couleur du type */}
            <div>
              <label style={LABEL}>Couleur personnalisée (optionnel)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div
                  title="Couleur appliquée à la barre"
                  style={{
                    width: 28, height: 28,
                    background: getPhaseCouleur(form),
                    border: '2px solid white',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
                    flexShrink: 0,
                  }}
                />

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {COULEURS_PHASE_PRESET.map(couleur => (
                    <div
                      key={couleur}
                      onClick={() => set('couleur_custom', couleur)}
                      title={couleur}
                      style={{
                        width: 18, height: 18, background: couleur, cursor: 'pointer',
                        border: form.couleur_custom === couleur
                          ? '2px solid #1F1B17'
                          : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>

                <input
                  type="color"
                  value={getPhaseCouleur(form)}
                  onChange={e => set('couleur_custom', e.target.value)}
                  title="Choisir une couleur libre"
                  style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                />

                {form.couleur_custom && (
                  <button
                    type="button"
                    onClick={() => set('couleur_custom', null)}
                    style={{
                      fontSize: 10, color: '#9C9591', background: 'none',
                      border: 'none', cursor: 'pointer', padding: '2px 6px',
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            {/* Nom */}
            <div>
              <label style={LABEL}>Nom de la phase *</label>
              <input
                value={form.nom}
                onChange={e => set('nom', e.target.value)}
                placeholder={TYPE_PLACEHOLDERS[form.type_tache]}
                required style={INPUT}
                onFocus={e => { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(232,96,44,0.12)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Temporalité */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>Semaine début (1–53)</label>
                  <input type="number" min={1} max={53}
                    value={form.semaine_debut}
                    onChange={e => set('semaine_debut', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LABEL}>Année</label>
                  <input type="number" min={2020} max={2040}
                    value={form.annee_debut}
                    onChange={e => set('annee_debut', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={LABEL}>Durée (semaines)</label>
                  <input type="number" min={1}
                    value={form.duree_semaines}
                    onChange={e => set('duree_semaines', Number(e.target.value))}
                    style={INPUT}
                  />
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#9C9591', marginTop: 5 }}>
                Début : S{form.semaine_debut} {form.annee_debut} — {debutLabel}
                {' · '}Fin : S{finWeek.semaine} {finWeek.annee}
              </p>
            </div>

            {/* Sous-durées — MOE (etude) uniquement */}
            {form.type_tache === 'etude' && (
              <div style={{ padding: '14px 16px', borderRadius: 2, backgroundColor: '#FAFAF9', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                <label style={{ ...LABEL, marginBottom: 2 }}>Répartition des intervenants (optionnel)</label>
                <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 10 }}>Décomposez la durée en sous-périodes successives</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { key: 'duree_arch', label: '① Architecte', color: '#E8A200' },
                    { key: 'duree_bet',  label: '② BET',        color: '#1B3A5C' },
                    { key: 'duree_econ', label: '③ Économiste', color: '#2A8A4E' },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <label style={{ ...LABEL, color }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: color, marginRight: 4, verticalAlign: 'middle' }} />
                        {label}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min={0}
                          value={form[key]}
                          onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="—"
                          style={{ ...INPUT, paddingRight: 36 }}
                        />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9C9591', pointerEvents: 'none' }}>
                          sem.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {subTotal > 0 && (
                  <p style={{ fontSize: 11, marginTop: 8, fontWeight: 500, color: subDelta > 0 ? '#B8412C' : subDelta === 0 ? '#2A8A4E' : '#9C9591' }}>
                    {subDelta > 0
                      ? `Total dépasse la durée (${subTotal} > ${form.duree_semaines} sem.)`
                      : subDelta === 0
                        ? `✓ Durée totale couverte`
                        : `${subTotal} sem. renseignées sur ${form.duree_semaines} sem.`}
                  </p>
                )}
              </div>
            )}

            {/* Label barre — administratif uniquement */}
            {form.type_tache === 'administratif' && (
              <div>
                <label style={LABEL}>Texte affiché dans la barre</label>
                <input
                  value={form.label_barre}
                  onChange={e => set('label_barre', e.target.value)}
                  placeholder="Ex: 5 MOIS INSTRUCTION PC ERP"
                  style={INPUT}
                />
              </div>
            )}

            {/* Dépendance */}
            {otherPhases.length > 0 && (
              <div>
                <label style={LABEL}>Dépend de (chemin critique)</label>
                <select
                  value={form.depends_on ?? 'none'}
                  onChange={e => handleDependencyChange(e.target.value)}
                  style={{ ...INPUT, height: 36 }}
                >
                  <option value="none">— Aucune dépendance —</option>
                  {otherPhases.map(p => (
                    <option key={p.id} value={p.id}>
                      S{p.semaine_debut} — {p.nom}
                    </option>
                  ))}
                </select>
                {form.depends_on && (
                  <div style={{ marginTop: 8 }}>
                    <label style={LABEL}>Battement (semaines)</label>
                    <input
                      type="number"
                      value={form.lag_semaines ?? 0}
                      onChange={e => set('lag_semaines', Number(e.target.value))}
                      style={{ ...INPUT, width: 80 }}
                    />
                    <p style={{ fontSize: 11, color: '#9C9591', marginTop: 4 }}>{lagText}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Segments supplémentaires ─────────────────────────────────────
                Une phase peut réapparaître à d'autres périodes du planning
                (reprise après interruption, intervention ponctuelle…). */}
            {mode === 'edit' && phase?.id && addSegment && (
              <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, color: '#9C9591',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    Segments supplémentaires
                    {segmentsDePhase.length > 0 && ` (${segmentsDePhase.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSegment}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                      fontSize: 11, borderRadius: 2,
                      border: '0.5px solid #E8602C',
                      background: 'transparent', color: '#E8602C', cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} />
                    Ajouter un segment
                  </button>
                </div>

                {segmentsDePhase.length === 0 && (
                  <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', padding: '4px 0' }}>
                    Aucun segment — la phase n'apparaît qu'à sa période principale.
                  </p>
                )}

                {segmentsDePhase.map((seg, idx) => (
                  <SegmentRow
                    key={seg.id}
                    seg={seg}
                    premier={idx === 0}
                    placeholderNom={phase.nom}
                    onUpdate={updateSegment}
                    onDelete={deleteSegment}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, alignItems: 'center' }}>
            {mode === 'edit' && phase && (
              <button type="button" onClick={handleDelete} disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
                  border: `0.5px solid ${confirmDelete ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
                  backgroundColor: confirmDelete ? 'rgba(184,65,44,0.10)' : 'white',
                  color: confirmDelete ? '#B8412C' : '#9C9591',
                  marginRight: 'auto',
                }}
              >
                <Trash2 size={13} />
                {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            )}
            <button type="button" onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}
            >
              Annuler
            </button>
            <button type="submit" disabled={saving || !form.nom.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 2, fontSize: 12, fontWeight: 500,
                border: 'none', backgroundColor: '#2A8A4E', color: 'white', cursor: 'pointer',
                opacity: saving || !form.nom.trim() ? 0.6 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
        </div>
      )}
    </div>
  )
}
