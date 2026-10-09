import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { tachesTriees, enRetard, libelleFait, nomPersonne, lienPartage } from './todoLogique'
import { ajouterTache, modifierElement, supprimerElement } from './todoDonnees'
import { CaseACocher, MenuActions, EditeurNote } from './LigneArticle'
import { copierDansPressePapiers } from './pressePapiers'

// ─── Onglet « À faire » (tâches du quotidien) ────────────────────────────────
//
// Les tâches courantes de l'affaire (« Reprendre la façade nord suite à la
// réunion MOA ») : qui s'en charge, pour quand, et — une fois cochée — qui
// l'a faite et quand. C'est ce qui permet de savoir qu'une modification a
// bien été opérée.

const ROUGE = '#B8412C'

const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dateCourte = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const champ = { fontSize: 13, padding: '8px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3, background: 'white', minHeight: 38 }

/** Texte, personne et échéance : à la création comme à la modification. */
function FormTache({ initial, personnes, libelle, onValider, onAnnuler }) {
  const [texte, setTexte] = useState(initial?.texte ?? '')
  const [responsable, setResponsable] = useState(initial?.responsable_id ?? '')
  const [echeance, setEcheance] = useState(initial?.echeance ?? '')
  const [enCours, setEnCours] = useState(false)
  const valider = async () => {
    const t = texte.trim()
    if (!t || enCours) return
    setEnCours(true)
    try {
      await onValider({ texte: t, responsable_id: responsable || null, echeance: echeance || null })
      if (!initial) { setTexte(''); setEcheance('') }
    } finally { setEnCours(false) }
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <input value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus={!!initial}
        onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape' && onAnnuler) onAnnuler() }}
        placeholder="Nouvelle tâche (ex. reprendre la façade nord suite à la réunion MOA)" aria-label="Tâche"
        style={{ ...champ, flex: '1 1 320px', minWidth: 0 }} />
      <select value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Personne chargée" style={{ ...champ, flex: '0 1 180px' }}>
        <option value="">Personne chargée…</option>
        {personnes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
      </select>
      <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} aria-label="Échéance" style={{ ...champ, flex: '0 0 auto' }} />
      {onAnnuler && (
        <button type="button" onClick={onAnnuler} style={{ minHeight: 38, padding: '0 12px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'transparent', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
      )}
      <button type="button" onClick={valider} disabled={!texte.trim() || enCours}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !texte.trim() || enCours ? 0.5 : 1 }}>
        {!initial && <Plus size={15} />} {libelle}
      </button>
    </div>
  )
}

function LigneTache({ tache, utilisateurId, affaireId, profils, personnes, lectureSeule, enEvidence, poserElement, signalerErreur, onSupprimer }) {
  const [mode, setMode] = useState(null) // null | 'modifier' | 'note'
  const ref = useRef(null)
  const jour = aujourdhui()
  const retard = enRetard(tache, jour)
  const fait = libelleFait(tache, profils)

  useEffect(() => {
    if (enEvidence) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [enEvidence])

  const enregistrer = (champs) => modifierElement(tache.id, champs).then(poserElement).catch(signalerErreur)
  const basculer = () => enregistrer(tache.fait_le
    ? { fait_le: null, fait_par: null }
    : { fait_le: new Date().toISOString(), fait_par: utilisateurId })

  return (
    <li ref={ref} style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 8px', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
      background: enEvidence ? 'var(--affaire-accent-clair, rgba(232,96,44,0.10))' : 'transparent',
    }}>
      <CaseACocher coche={!!tache.fait_le} desactive={lectureSeule} onClick={basculer}
        libelle={tache.fait_le ? `Décocher : ${tache.texte}` : `Cocher : ${tache.texte}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {mode === 'modifier' ? (
          <FormTache initial={tache} personnes={personnes} libelle="Enregistrer" onAnnuler={() => setMode(null)}
            onValider={async (champs) => { await enregistrer(champs); setMode(null) }} />
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: '#1F1B17' }}>{tache.texte}</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9C9591', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
              {tache.responsable_id && <span>Pour {nomPersonne(tache.responsable_id, profils)}</span>}
              {tache.echeance && !tache.fait_le && (
                <span style={{ color: retard ? ROUGE : '#9C9591', fontWeight: retard ? 600 : 400 }}>
                  {retard ? 'En retard · ' : 'Pour le '}{dateCourte(tache.echeance)}
                </span>
              )}
              {fait && <span style={{ color: '#2A8A4E' }}>{fait}</span>}
            </p>
          </>
        )}
        {tache.note && mode !== 'note' && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5E5854', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{tache.note}</p>
        )}
        {mode === 'note' && (
          <EditeurNote valeur={tache.note} onAnnuler={() => setMode(null)}
            onEnregistrer={async (note) => { await enregistrer({ note }); setMode(null) }} />
        )}
      </div>
      <MenuActions actions={[
        !lectureSeule && { libelle: 'Modifier', action: () => setMode('modifier') },
        !lectureSeule && { libelle: tache.note ? 'Modifier la note' : 'Ajouter une note', action: () => setMode('note') },
        { libelle: 'Copier le lien de la tâche', libre: true, action: () => copierDansPressePapiers(lienPartage(window.location.origin, affaireId, { onglet: 'quotidien', tache: tache.id })) },
        !lectureSeule && { libelle: 'Supprimer', danger: true, action: onSupprimer },
      ]} />
    </li>
  )
}

export function Quotidien({ elements, affaireId, profils, personnes, utilisateurId, lectureSeule, tacheLien, poserElement, retirerElement, signalerErreur }) {
  const [miennes, setMiennes] = useState(false)
  const [faitesOuvertes, setFaitesOuvertes] = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)

  const taches = useMemo(() => elements
    .filter((e) => e.type === 'tache')
    .filter((e) => !miennes || e.responsable_id === utilisateurId), [elements, miennes, utilisateurId])
  const { aFaire, faites } = tachesTriees(taches)
  // Une tâche faite ouverte par un lien se montre même repliée
  const faitesVisibles = faitesOuvertes || faites.some((t) => t.id === tacheLien)

  const ligne = (t) => (
    <LigneTache key={t.id} tache={t} utilisateurId={utilisateurId} affaireId={affaireId} profils={profils} personnes={personnes}
      lectureSeule={lectureSeule} enEvidence={t.id === tacheLien}
      poserElement={poserElement} signalerErreur={signalerErreur} onSupprimer={() => setASupprimer(t)} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!lectureSeule && (
        <section style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 18px' }}>
          <FormTache personnes={personnes} libelle="Ajouter"
            onValider={async (champs) => {
              try { poserElement(await ajouterTache(affaireId, champs)) } catch (e) { signalerErreur(e) }
            }} />
        </section>
      )}

      <section style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '6px 18px 12px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <h3 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>
            En cours <span style={{ fontSize: 12, fontWeight: 400, color: '#9C9591' }}>· {aFaire.length}</span>
          </h3>
          <label data-consultation="libre" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5E5854', cursor: 'pointer' }}>
            <input type="checkbox" checked={miennes} onChange={(e) => setMiennes(e.target.checked)} style={{ minHeight: 0 }} />
            Mes tâches
          </label>
        </header>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {aFaire.map(ligne)}
          {aFaire.length === 0 && <li style={{ padding: '12px 4px', fontSize: 13, color: '#9C9591' }}>Rien à faire.</li>}
        </ul>

        {faites.length > 0 && (
          <>
            <button type="button" data-consultation="libre" aria-expanded={faitesVisibles} onClick={() => setFaitesOuvertes((o) => !o)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 0', border: 'none', background: 'none', fontSize: 13, color: '#5E5854', cursor: 'pointer' }}>
              <ChevronDown size={15} style={{ transition: 'transform 0.2s', transform: faitesVisibles ? 'none' : 'rotate(-90deg)' }} />
              {faites.length} tâche{faites.length > 1 ? 's' : ''} faite{faites.length > 1 ? 's' : ''}
            </button>
            {faitesVisibles && <ul style={{ listStyle: 'none', margin: 0, padding: 0, opacity: 0.8 }}>{faites.map(ligne)}</ul>}
          </>
        )}
      </section>

      {aSupprimer && (
        <ModaleConfirmation danger titre="Supprimer cette tâche ?" texte={`« ${aSupprimer.texte} » sera supprimée.`} libelle="Supprimer"
          onAnnuler={() => setASupprimer(null)}
          onConfirmer={async () => {
            try { await supprimerElement(aSupprimer.id); retirerElement(aSupprimer.id) } catch (e) { signalerErreur(e) }
            setASupprimer(null)
          }} />
      )}
    </div>
  )
}
