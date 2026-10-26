import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, Star } from 'lucide-react'
import { supabase } from '../../core/supabase/client'
import { usagesDePersonne, personneSupprimable, affairesDesUsages } from '../../shared/carnet/carnetLiensLogique'
import { erreurPortable, sansPortable, texteTelephones } from '../../shared/telephones'
import { ecrireAvecReplis } from '../../shared/repliColonnes'

const BLEU = 'var(--jga-blueprint)'
const INPUT = {
  width: '100%', height: 36, padding: '0 12px', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 2,
  fontSize: 13, backgroundColor: 'white', outline: 'none', boxSizing: 'border-box', color: '#1F1B17',
}
const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500, color: '#9C9591',
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4,
}
const BTN = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 2, fontSize: 12,
  cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', color: '#374151',
}
const BTN_PRIMARY = { ...BTN, backgroundColor: BLEU, color: 'white', border: 'none', fontWeight: 500 }
const ICONE = {
  width: 28, height: 28, borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white',
  color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}

const nomComplet = (p) => [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'
const VIDE = { prenom: '', nom: '', fonction: '', telephone: '', telephone_portable: '', email: '', est_principal: false }

// Fenêtre : fermée par ✕, Annuler, Échap seulement, jamais au clic à côté.
function Fenetre({ titre, onClose, largeur = 560, children, pied }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px 16px' }}>
      <div style={{ backgroundColor: 'white', width: '100%', maxWidth: largeur, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 12px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>{titre}</h2>
          <button type="button" onClick={onClose} title="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '0 24px 16px', overflowY: 'auto' }}>{children}</div>
        {pied && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px 20px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>{pied}</div>}
      </div>
    </div>
  )
}

function ListeUsages({ usages, onNavigate }) {
  if (usages.length === 0) return <p style={{ fontSize: 11, color: '#C5BEB9', fontStyle: 'italic' }}>Pas encore utilisée dans une affaire</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {usages.map((u) => (
        <p key={u.cle} style={{ fontSize: 11, color: '#5E5854' }}>
          <a
            href={`/affaires/${u.affaire.id}`}
            onClick={(e) => { e.preventDefault(); onNavigate(`/affaires/${u.affaire.id}`) }}
            style={{ color: BLEU, textDecoration: 'none', fontWeight: 500 }}
          >
            {u.affaire.code_affaire ?? u.affaire.nom}
          </a>
          {' · '}{u.role}
        </p>
      ))}
    </div>
  )
}

export default function PersonnesOrganisation({ entreprise, lots, contacts, verificationImpossible = false, onChange, onClose }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState(null) // null | { personne } (formulaire) | { suppression }
  const [form, setForm] = useState(VIDE)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState(null)
  const personnes = [...(entreprise.interlocuteurs ?? [])]
    .sort((a, b) => (b.est_principal ? 1 : 0) - (a.est_principal ? 1 : 0) || nomComplet(a).localeCompare(nomComplet(b), 'fr'))
  const donnees = { lots, contacts }

  // Échap ferme d'abord la sous-fenêtre ouverte, puis la fenêtre
  useEffect(() => {
    const touche = (e) => {
      if (e.key !== 'Escape') return
      if (mode) setMode(null)
      else onClose()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [mode, onClose])

  const ouvrirFormulaire = (personne) => {
    setErreur(null)
    setForm(personne ? {
      prenom: personne.prenom ?? '', nom: personne.nom ?? '', fonction: personne.fonction ?? '',
      telephone: personne.telephone ?? '', telephone_portable: personne.telephone_portable ?? '',
      email: personne.email ?? '', est_principal: !!personne.est_principal,
    } : { ...VIDE, est_principal: personnes.length === 0 })
    setMode({ personne: personne ?? null })
  }
  const set = (cle) => (e) => setForm((f) => ({ ...f, [cle]: e.target.value }))
  const peutEnregistrer = (form.prenom.trim() || form.nom.trim()) && !saving

  const enregistrer = async () => {
    if (!peutEnregistrer) return
    setSaving(true)
    setErreur(null)
    const champs = {
      prenom: form.prenom.trim(), nom: form.nom.trim(), fonction: form.fonction.trim(),
      telephone: form.telephone.trim(), telephone_portable: form.telephone_portable.trim(),
      email: form.email.trim(), est_principal: form.est_principal,
    }
    // Sans la migration 076, le portable rejoint le fixe
    const replis = [[erreurPortable, sansPortable]]
    const existante = mode.personne
    let id = existante?.id
    let res
    if (existante) {
      res = await ecrireAvecReplis((c) => supabase.from('interlocuteurs').update(c).eq('id', existante.id).select('id'), champs, replis)
      if (!res.error && (res.data?.length ?? 0) === 0) res = { error: { message: 'Modification refusée (droits insuffisants).' } }
    } else {
      res = await ecrireAvecReplis((c) => supabase.from('interlocuteurs').insert(c).select('id').single(), { ...champs, entreprise_id: entreprise.id }, replis)
      id = res.data?.id
    }
    if (res.error) { setSaving(false); setErreur(res.error.message); return }
    // Créée : un nouvel essai après un échec ci-dessous modifie la personne, il n'en insère pas une autre
    if (!existante && id) setMode({ personne: { id, ...champs } })
    // Une seule personne principale par organisation
    if (form.est_principal && id) {
      const { error } = await supabase.from('interlocuteurs').update({ est_principal: false })
        .eq('entreprise_id', entreprise.id).neq('id', id)
      if (error) { setSaving(false); setErreur(error.message); await onChange(); return }
    }
    await onChange()
    setSaving(false)
    setMode(null)
  }

  const supprimer = async (personne) => {
    setSaving(true)
    setErreur(null)
    const { data, error } = await supabase.from('interlocuteurs').delete().eq('id', personne.id).select('id')
    setSaving(false)
    if (error) { setErreur(error.message); return }
    if ((data?.length ?? 0) === 0) { setErreur('Suppression refusée : la personne est toujours là.'); return }
    await onChange()
    setMode(null)
  }

  const aller = (chemin) => { onClose(); navigate(chemin) }

  return createPortal(
    <>
      <Fenetre
        titre={`Personnes — ${entreprise.raison_sociale}`}
        onClose={onClose}
        pied={(
          <>
            <button type="button" style={BTN} onClick={onClose}><X size={13} /> Fermer</button>
            <button type="button" style={BTN_PRIMARY} onClick={() => ouvrirFormulaire(null)}><Plus size={13} /> Ajouter une personne</button>
          </>
        )}
      >
        {personnes.length === 0 ? (
          <p style={{ fontSize: 13, color: '#9C9591', padding: '16px 0' }}>Aucune personne enregistrée pour cette organisation.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {personnes.map((p) => (
              <div key={p.id} style={{ padding: '12px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {nomComplet(p)}
                    {p.est_principal && (
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, backgroundColor: 'rgba(27,58,92,0.10)', color: BLEU, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Star size={9} /> principal
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: '#5E5854' }}>
                    {[p.fonction, texteTelephones(p.telephone, p.telephone_portable), p.email].filter(Boolean).join(' · ') || <span style={{ color: '#C5BEB9' }}>Aucune coordonnée</span>}
                  </p>
                  <ListeUsages usages={usagesDePersonne(p.id, donnees)} onNavigate={aller} />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={ICONE} title="Modifier" onClick={() => ouvrirFormulaire(p)}><Pencil size={12} /></button>
                  <button
                    type="button"
                    style={{ ...ICONE, border: '0.5px solid rgba(220,38,38,0.3)', backgroundColor: 'rgba(184,65,44,0.10)', color: '#B8412C' }}
                    title="Supprimer" onClick={() => { setErreur(null); setMode({ suppression: p }) }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Fenetre>

      {mode && !mode.suppression && (
        <Fenetre
          titre={mode.personne ? 'Modifier la personne' : 'Nouvelle personne'}
          largeur={440}
          onClose={() => setMode(null)}
          pied={(
            <>
              <button type="button" style={BTN} onClick={() => setMode(null)}><X size={13} /> Annuler</button>
              <button type="button" style={{ ...BTN_PRIMARY, opacity: peutEnregistrer ? 1 : 0.5 }} disabled={!peutEnregistrer} onClick={enregistrer}>
                {saving ? 'Enregistrement…' : mode.personne ? 'Enregistrer' : 'Ajouter'}
              </button>
            </>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={LABEL}>Prénom</label><input value={form.prenom} onChange={set('prenom')} style={INPUT} autoFocus /></div>
              <div><label style={LABEL}>Nom</label><input value={form.nom} onChange={set('nom')} style={INPUT} /></div>
            </div>
            <div><label style={LABEL}>Fonction</label><input value={form.fonction} onChange={set('fonction')} style={INPUT} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={LABEL}>Téléphone fixe</label><input type="tel" value={form.telephone} onChange={set('telephone')} style={INPUT} /></div>
              <div><label style={LABEL}>Téléphone portable</label><input type="tel" value={form.telephone_portable} onChange={set('telephone_portable')} style={INPUT} /></div>
            </div>
            <div><label style={LABEL}>E-mail</label><input type="email" value={form.email} onChange={set('email')} style={INPUT} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.est_principal} onChange={(e) => setForm((f) => ({ ...f, est_principal: e.target.checked }))} />
              Personne principale de l’organisation
            </label>
            {erreur && <p style={{ fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
          </div>
        </Fenetre>
      )}

      {mode?.suppression && (() => {
        const p = mode.suppression
        const usages = usagesDePersonne(p.id, donnees)
        const libre = !verificationImpossible && personneSupprimable(p.id, donnees)
        return (
          <Fenetre
            titre={libre ? 'Supprimer cette personne ?' : verificationImpossible ? 'Vérification impossible' : 'Suppression impossible'}
            largeur={440}
            onClose={() => setMode(null)}
            pied={(
              <>
                <button type="button" style={BTN} onClick={() => setMode(null)}>{libre ? 'Annuler' : 'Fermer'}</button>
                {libre && (
                  <button type="button" disabled={saving} onClick={() => supprimer(p)}
                    style={{ ...BTN, backgroundColor: '#B8412C', color: 'white', border: 'none', fontWeight: 500 }}>
                    {saving ? 'Suppression…' : 'Supprimer définitivement'}
                  </button>
                )}
              </>
            )}
          >
            <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.6, marginBottom: 10 }}>
              {libre
                ? <><strong>{nomComplet(p)}</strong> sera retirée du carnet. Cette action est irréversible.</>
                : verificationImpossible
                  ? <>Les affaires où <strong>{nomComplet(p)}</strong> intervient n’ont pas pu être lues : impossible de vérifier qu’elle ne sert pas. Rechargez la page, puis réessayez.</>
                  : <><strong>{nomComplet(p)}</strong> sert encore dans {affairesDesUsages(usages).length > 1 ? 'ces affaires' : 'cette affaire'}. Retirez-la d’abord de ces affaires, puis revenez la supprimer.</>}
            </p>
            {!libre && !verificationImpossible && <ListeUsages usages={usages} onNavigate={aller} />}
            {erreur && <p style={{ fontSize: 12, color: '#B8412C', marginTop: 8 }}>{erreur}</p>}
          </Fenetre>
        )
      })()}
    </>,
    document.body,
  )
}
