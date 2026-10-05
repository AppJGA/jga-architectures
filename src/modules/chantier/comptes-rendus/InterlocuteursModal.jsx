import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useAffaireInterlocuteurs, CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { verserAuCarnet, chercherDansCarnet, mettreAJourCarnet } from './carnet'
import { ecartsCarnet } from './carnetLogique'
import { RechercheCarnet } from './RechercheCarnet'
import { remplirDepuis } from './rechercheCarnetLogique'

const CATEGORIES = Object.entries(CATEGORIE_META).map(([id, m]) => ({ id, ...m }))

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

function focusOn(e)  { e.target.style.borderColor = '#E8602C'; e.target.style.boxShadow = '0 0 0 3px rgba(224,90,30,0.07)' }
function focusOff(e) { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none' }

function emptyForm(defaultCat = 'moa') {
  return { categorie: defaultCat, categorie_label: '', prenom: '', nom: '', fonction: '', organisation: '', adresse: '', email: '', telephone: '' }
}

function InterloForm({ initial, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(initial ?? emptyForm())
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  // Interlocuteur absent du carnet : on peut l'y verser d'une case
  const [versCarnet, setVersCarnet] = useState(false)
  const [deCarnet, setDeCarnet] = useState(false)
  const [erreurCarnet, setErreurCarnet] = useState(null)
  // Interlocuteur déjà au carnet : sa fiche, cherchée d'après ses valeurs
  // enregistrées ; à l'enregistrement, les écarts sont proposés au carnet
  const [liaison, setLiaison] = useState(null)
  const [ecarts, setEcarts] = useState(null)

  useEffect(() => {
    if (!initial?.id) return undefined
    let annule = false
    chercherDansCarnet(initial).then((l) => { if (!annule) setLiaison(l) }).catch(() => {})
    return () => { annule = true }
  }, [initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Une fiche du carnet choisie remplit le formulaire : rien à y reverser
  const choisirDansCarnet = (option) => {
    setForm(f => remplirDepuis(option, f))
    setDeCarnet(true)
  }

  const enregistrer = async () => {
    setSaving(true)
    try {
      await onSave({ ...form, categorie_label: form.categorie === 'autre' ? form.categorie_label : null })
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  // Choix de la fenêtre des écarts : le carnet aussi, ou l'affaire seule
  const reporterAuCarnet = async (aussiCarnet) => {
    const choisis = ecarts
    setEcarts(null)
    if (aussiCarnet) {
      try { await mettreAJourCarnet(choisis) } catch (err) {
        setErreurCarnet(`Mise à jour du carnet d’adresses impossible : ${err?.message ?? err}`)
        return
      }
    }
    await enregistrer()
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!form.nom?.trim() && !form.organisation?.trim()) return
    // Déjà au carnet et différent de sa fiche : on demande avant d'enregistrer
    if (liaison && !deCarnet) {
      const differences = ecartsCarnet(liaison, form)
      if (differences.length > 0) { setEcarts(differences); return }
    }
    setSaving(true)
    setErreurCarnet(null)
    // Le carnet d'abord : s'il échoue, le formulaire reste ouvert avec le
    // message, et l'on peut décocher la case pour enregistrer quand même
    if (proposerCarnet && versCarnet) {
      try { await verserAuCarnet(form) } catch (err) {
        setErreurCarnet(`Ajout au carnet d’adresses impossible : ${err?.message ?? err}`)
        setSaving(false)
        return
      }
    }
    await enregistrer()
  }

  // Aussi pour un interlocuteur déjà enregistré dans l'affaire : ceux saisis
  // avant cette case n'ont jamais rejoint le carnet. Rien n'y est recréé s'il
  // y figure déjà (carnet.js)
  const proposerCarnet = !deCarnet && !liaison && !!(form.nom?.trim() || form.organisation?.trim())

  const needsLabel = form.categorie === 'autre'

  return (
    // Pas de <form> : cet éditeur vit aussi dans la fiche de l'affaire, qui en
    // est un. Un formulaire imbriqué enverrait la fiche entière (et la
    // fermerait) en enregistrant un interlocuteur. Entrée valide quand même.
    <div
      onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); handleSubmit() } }}
      style={{ backgroundColor: '#FAFAF9', borderRadius: 2, padding: '14px 16px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Catégorie */}
        <div style={{ display: 'grid', gridTemplateColumns: needsLabel ? '1fr 1fr' : '1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Catégorie</label>
            <select value={form.categorie} onChange={e => set('categorie', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }} onFocus={focusOn} onBlur={focusOff}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {needsLabel && (
            <div>
              <label style={LABEL}>Label personnalisé</label>
              <input value={form.categorie_label} onChange={e => set('categorie_label', e.target.value)} placeholder="Ex: AMO, Géomètre…" style={INPUT} onFocus={focusOn} onBlur={focusOff} />
            </div>
          )}
        </div>

        {/* Recherche carnet d'adresses : dans tous les champs des fiches */}
        <div>
          <label style={LABEL}>Rechercher dans le carnet d'adresses</label>
          <RechercheCarnet onChoisir={choisirDansCarnet} />
        </div>

        {/* Identité */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Prénom</label>
            <input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Nom</label>
            <input value={form.nom} onChange={e => set('nom', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Fonction</label>
            <input value={form.fonction} onChange={e => set('fonction', e.target.value)} placeholder="Ex: Architecte, Chef de projet…" style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Organisation</label>
            <input value={form.organisation} onChange={e => set('organisation', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Téléphone</label>
            <input value={form.telephone} onChange={e => set('telephone', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
          <div>
            <label style={LABEL}>Adresse</label>
            <input value={form.adresse} onChange={e => set('adresse', e.target.value)} style={INPUT} onFocus={focusOn} onBlur={focusOff} />
          </div>
        </div>
      </div>

      {proposerCarnet && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: '#1F1B17', cursor: 'pointer' }}>
          <input type="checkbox" checked={versCarnet} onChange={e => setVersCarnet(e.target.checked)}
            style={{ width: 18, height: 18, minHeight: 0, accentColor: '#E8602C', cursor: 'pointer' }} />
          <span>
            <strong>Ajouter au carnet d’adresses</strong>
            <span style={{ color: '#9C9591' }}> — {form.organisation?.trim()
              ? `fiche « ${form.organisation.trim()} »${form.nom?.trim() || form.prenom?.trim() ? ', avec cette personne en contact' : ''}`
              : 'fiche à son nom'}</span>
          </span>
        </label>
      )}
      {liaison && !deCarnet && (
        <p style={{ fontSize: 11, color: '#2A8A4E', margin: '12px 0 0' }}>
          ✓ Au carnet d’adresses (fiche « {liaison.entreprise.raison_sociale} ») : une modification vous sera proposée pour le carnet aussi.
        </p>
      )}
      {erreurCarnet && <p role="alert" style={{ fontSize: 12, color: '#B8412C', margin: '8px 0 0' }}>{erreurCarnet}</p>}
      {ecarts && <ModaleEcarts ecarts={ecarts} nomFiche={liaison?.entreprise?.raison_sociale} onChoisir={reporterAuCarnet} onAnnuler={() => setEcarts(null)} />}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
        {onDelete && (
          <button type="button" onClick={() => { if (!confirmDel) { setConfirmDel(true); return } onDelete() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 2, fontSize: 11, cursor: 'pointer',
              border: `0.5px solid ${confirmDel ? 'rgba(220,38,38,0.5)' : 'rgba(0,0,0,0.12)'}`,
              backgroundColor: confirmDel ? 'rgba(184,65,44,0.10)' : 'white', color: confirmDel ? '#B8412C' : '#9C9591', marginRight: 'auto' }}
          >
            <Trash2 size={12} />{confirmDel ? 'Confirmer' : 'Supprimer'}
          </button>
        )}
        <button type="button" onClick={onCancel}
          style={{ padding: '6px 12px', borderRadius: 2, fontSize: 12, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', backgroundColor: 'white', color: '#374151' }}
        >Annuler</button>
        <button type="button" onClick={handleSubmit} disabled={saving}
          style={{ padding: '6px 14px', borderRadius: 2, fontSize: 12, fontWeight: 500, border: 'none', backgroundColor: '#E8602C', color: 'white', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  )
}

// Les informations saisies diffèrent du carnet : les reporter, ou non
// Les deux fenêtres s'affichent au niveau de la page (portail) : un parent
// animé (`jga-entree-carte` garde un `transform`) enfermerait sinon leur
// `position: fixed` dans sa propre boîte
function ModaleEcarts({ ecarts, nomFiche, onChoisir, onAnnuler }) {
  const bouton = (fond, couleur) => ({
    minHeight: 40, padding: '0 14px', borderRadius: 2, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    border: fond === 'white' ? '0.5px solid rgba(0,0,0,0.15)' : 'none', backgroundColor: fond, color: couleur,
  })
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="ecarts-carnet-titre"
      style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(31,27,23,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', width: '100%', maxWidth: 520, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <p id="ecarts-carnet-titre" style={{ fontSize: 16, fontWeight: 600, color: '#1F1B17', margin: 0 }}>Mettre aussi à jour le carnet d’adresses ?</p>
          <p style={{ fontSize: 13, color: '#5E5854', margin: '6px 0 0', lineHeight: 1.5 }}>
            Ces informations ne correspondent plus à celles du carnet{nomFiche ? <> (fiche « {nomFiche} »)</> : null}.
            Le carnet sert à toutes les affaires : une mise à jour s’y verra partout.
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#9C9591', textAlign: 'left' }}>
              <th style={{ fontWeight: 500, padding: '4px 6px' }}></th>
              <th style={{ fontWeight: 500, padding: '4px 6px' }}>Carnet</th>
              <th style={{ fontWeight: 500, padding: '4px 6px' }}>Affaire</th>
            </tr>
          </thead>
          <tbody>
            {ecarts.map((x) => (
              <tr key={`${x.cible}-${x.champ}`} style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                <td style={{ padding: '6px', fontWeight: 600, color: '#1F1B17', whiteSpace: 'nowrap' }}>{x.libelle}</td>
                <td style={{ padding: '6px', color: '#9C9591', textDecoration: x.avant ? 'line-through' : 'none' }}>{x.avant || '—'}</td>
                <td style={{ padding: '6px', color: '#1F1B17' }}>{x.apres}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onAnnuler} style={bouton('white', '#5E5854')}>Revenir</button>
          <button type="button" onClick={() => onChoisir(false)} style={bouton('white', '#1F1B17')}>Seulement dans l’affaire</button>
          <button type="button" onClick={() => onChoisir(true)} style={bouton('#E8602C', 'white')}>Mettre aussi à jour le carnet</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Un seul interlocuteur, dans une fenêtre : le crayon des fiches de contacts
export function ModaleInterlocuteur({ interlocuteur, onEnregistrer, onSupprimer, onFermer }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Modifier l’interlocuteur"
      style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(31,27,23,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top) + 48px) 16px 16px', overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', width: '100%', maxWidth: 680, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1F1B17', margin: 0 }}>Modifier l’interlocuteur</p>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>
        <InterloForm
          initial={interlocuteur}
          onSave={async (data) => { await onEnregistrer(data); onFermer() }}
          onCancel={onFermer}
          onDelete={onSupprimer ? async () => { await onSupprimer(); onFermer() } : undefined}
        />
      </div>
    </div>,
    document.body,
  )
}

function CategorySection({ cat, items, onAdd, onEdit, onDelete, onReorder }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const meta = CATEGORIE_META[cat]

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: meta?.color ?? '#9C9591', backgroundColor: meta?.bg ?? '#FAF7F2', borderRadius: 3, padding: '3px 10px' }}>
          {meta?.label ?? cat}
        </span>
        <button type="button" onClick={() => setAddOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 3, fontSize: 11, border: `0.5px solid ${meta?.color ?? '#9C9591'}`, backgroundColor: meta?.bg ?? '#FAF7F2', color: meta?.color ?? '#9C9591', cursor: 'pointer' }}
        ><Plus size={11} /> Ajouter</button>
      </div>

      {addOpen && (
        <div style={{ marginBottom: 8 }}>
          <InterloForm
            initial={emptyForm(cat)}
            onSave={async (data) => { await onAdd(data); setAddOpen(false) }}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}

      {items.map((item, idx) => (
        <div key={item.id}>
          {editId === item.id ? (
            <div style={{ marginBottom: 6 }}>
              <InterloForm
                initial={item}
                onSave={async (data) => { await onEdit(item.id, data); setEditId(null) }}
                onCancel={() => setEditId(null)}
                onDelete={async () => { await onDelete(item.id); setEditId(null) }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: 'white', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>
                  {[item.prenom, item.nom].filter(Boolean).join(' ') || item.organisation || '—'}
                </p>
                {item.fonction && <p style={{ fontSize: 11, color: '#5E5854' }}>{item.fonction}{item.organisation ? ` · ${item.organisation}` : ''}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  {item.email && <a href={`mailto:${item.email}`} style={{ fontSize: 11, color: '#1B3A5C' }}>{item.email}</a>}
                  {item.telephone && <span style={{ fontSize: 11, color: '#5E5854' }}>{item.telephone}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button type="button" onClick={() => onReorder(item.id, 'up')} disabled={idx === 0} style={{ padding: 4, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#D1D5DB' : '#9C9591' }}><ChevronUp size={13} /></button>
                <button type="button" onClick={() => onReorder(item.id, 'down')} disabled={idx === items.length - 1} style={{ padding: 4, background: 'none', border: 'none', cursor: idx === items.length - 1 ? 'default' : 'pointer', color: idx === items.length - 1 ? '#D1D5DB' : '#9C9591' }}><ChevronDown size={13} /></button>
                <button type="button" onClick={() => setEditId(item.id)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><Pencil size={13} /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {items.length === 0 && !addOpen && (
        <p style={{ fontSize: 12, color: '#9C9591', fontStyle: 'italic', padding: '4px 12px' }}>Aucun interlocuteur dans cette catégorie</p>
      )}
    </div>
  )
}

// Interlocuteurs d'une affaire, par catégorie : la même gestion depuis les
// visites de chantier (fenêtre ci-dessous) et depuis la fiche de l'affaire
export function InterlocuteursEditeur({ affaireId }) {
  const { interlocuteurs, addInterlocuteur, updateInterlocuteur, deleteInterlocuteur, reorderInterlocuteur } = useAffaireInterlocuteurs(affaireId)

  const byCategory = CATEGORIES.reduce((acc, c) => {
    acc[c.id] = interlocuteurs.filter(i => i.categorie === c.id).sort((a, b) => a.ordre - b.ordre)
    return acc
  }, {})

  return CATEGORIES.map(cat => (
    <CategorySection
      key={cat.id}
      cat={cat.id}
      items={byCategory[cat.id] ?? []}
      onAdd={addInterlocuteur}
      onEdit={updateInterlocuteur}
      onDelete={deleteInterlocuteur}
      onReorder={reorderInterlocuteur}
    />
  ))
}

export function InterlocuteursModal({ affaireId, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: '40px 20px' }}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: 0, padding: '28px 32px', width: '100%', maxWidth: 700, minHeight: 200 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', margin: 0 }}>Interlocuteurs du projet</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        <InterlocuteursEditeur affaireId={affaireId} />
      </div>
    </div>
  )
}
