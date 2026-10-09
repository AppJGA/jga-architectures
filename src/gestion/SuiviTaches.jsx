import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ExternalLink } from 'lucide-react'
import { useAuth } from '../core/auth/useAuth'
import { enRetard, nomPersonne } from '../modules/etude/todo/todoLogique'
import { ajouterTache, modifierElement } from '../modules/etude/todo/todoDonnees'
import { CaseACocher } from '../modules/etude/todo/LigneArticle'
import { ChoixAffaire } from '../shared/components/ChoixAffaire'
import { groupesTaches, affairesModifiables, mesAffaires } from './gestionLogique'
import { chargerTaches } from './gestionDonnees'
import { ACCENT, aujourdhuiLocal } from './manifest'

// ─── Suivi des tâches ────────────────────────────────────────────────────────
//
// Les tâches « À faire » (to-do list des affaires) de toute l'agence, par
// affaire, retards en tête. Cocher et ajouter passent par les fonctions de la
// to-do list : ce sont les mêmes lignes. L'écriture suit la règle de la base
// (migration 060) : une affaire dont on n'est pas collaborateur se lit
// seulement.

const ROUGE = '#B8412C'
const champ = { fontSize: 13, padding: '8px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3, background: 'white', minHeight: 38 }
const dateCourte = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const nomAffiche = (p) => [p?.prenom, p?.nom].filter(Boolean).join(' ').trim()

function FormAjout({ affaires, personnesDe, onAjouter }) {
  const [affaireId, setAffaireId] = useState('')
  const [texte, setTexte] = useState('')
  const [responsable, setResponsable] = useState('')
  const [echeance, setEcheance] = useState('')
  const [enCours, setEnCours] = useState(false)
  const pret = affaireId && texte.trim() && !enCours
  const valider = async () => {
    if (!pret) return
    setEnCours(true)
    try {
      await onAjouter(affaireId, { texte: texte.trim(), responsable_id: responsable || null, echeance: echeance || null })
      setTexte(''); setEcheance('')
    } finally { setEnCours(false) }
  }
  return (
    <section style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <ChoixAffaire affaires={affaires} valeur={affaireId} accent={ACCENT}
          onChange={(id) => { setAffaireId(id); setResponsable('') }} />
      </div>
      <input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') valider() }}
        placeholder="Nouvelle tâche" aria-label="Tâche" style={{ ...champ, flex: '1 1 260px', minWidth: 0 }} />
      <select value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Personne chargée" style={{ ...champ, flex: '0 1 180px' }}>
        <option value="">Personne chargée…</option>
        {personnesDe(affaireId).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
      </select>
      <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} aria-label="Échéance" style={champ} />
      <button type="button" onClick={valider} disabled={!pret}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px', border: 'none', borderRadius: 3, background: ACCENT, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: pret ? 1 : 0.5 }}>
        <Plus size={15} /> Ajouter
      </button>
    </section>
  )
}

export default function SuiviTaches() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const utilisateurId = user?.id ?? null
  const aujourdhui = aujourdhuiLocal()
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [portee, setPortee] = useState('toutes')
  const [personne, setPersonne] = useState('')
  const [seulementRetard, setSeulementRetard] = useState(false)

  useEffect(() => {
    chargerTaches().then(setDonnees).catch((e) => setErreur(e?.message ?? String(e)))
  }, [])

  const profils = useMemo(() => Object.fromEntries((donnees?.profils ?? []).map((p) => [p.id, p])), [donnees])
  const modifiables = useMemo(() => affairesModifiables(donnees?.affaires, donnees?.collaborateurs, utilisateurId), [donnees, utilisateurId])
  const miennes = useMemo(() => mesAffaires(donnees?.collaborateurs, utilisateurId), [donnees, utilisateurId])
  const groupes = useMemo(() => groupesTaches(donnees?.taches, donnees?.affaires, {
    affaires: portee === 'mes' ? miennes : undefined, personne: personne || undefined, enRetard: seulementRetard,
  }, aujourdhui), [donnees, portee, miennes, personne, seulementRetard, aujourdhui])

  // Personnes chargées : les collaborateurs de l'affaire (jamais un
  // extérieur), toute l'agence si elle n'en a aucun — comme dans l'affaire
  const personnesDe = (affaireId) => {
    const collabs = (donnees?.collaborateurs ?? []).filter((c) => c.affaire_id === affaireId && c.role !== 'exterieur').map((c) => c.user_id)
    const ids = collabs.length > 0 ? collabs : Object.keys(profils)
    return ids.map((id) => ({ id, nom: nomAffiche(profils[id]) })).filter((p) => p.nom).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }

  const poserTaches = (fn) => setDonnees((d) => ({ ...d, taches: fn(d.taches) }))
  const cocher = async (t) => {
    try {
      await modifierElement(t.id, { fait_le: new Date().toISOString(), fait_par: utilisateurId })
      // Le suivi ne montre que ce qui reste à faire
      poserTaches((liste) => liste.filter((x) => x.id !== t.id))
    } catch (e) { setErreur(e?.message ?? String(e)) }
  }
  const ajouter = async (affaireId, champs) => {
    try {
      const ligne = await ajouterTache(affaireId, champs)
      poserTaches((liste) => [...liste, ligne])
    } catch (e) { setErreur(e?.message ?? String(e)) }
  }

  if (erreur && !donnees) return <p role="alert" style={{ fontSize: 13, color: ROUGE }}>Lecture impossible : {erreur}</p>
  if (!donnees) return <p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>
  if (!donnees.disponible) {
    return <p role="status" style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 14px', maxWidth: 760 }}>La to-do list n’est pas encore installée : la migration 066 est à passer dans Supabase.</p>
  }

  const affairesAjout = donnees.affaires.filter((a) => modifiables.has(a.id))
  const total = groupes.reduce((n, g) => n + g.taches.length, 0)
  const retards = groupes.reduce((n, g) => n + g.enRetard, 0)
  const personnesFiltre = Object.values(profils).map((p) => ({ id: p.id, nom: nomAffiche(p) })).filter((p) => p.nom).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100 }}>
      {erreur && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: ROUGE, background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 12px', display: 'flex', gap: 12 }}>
          <span style={{ flex: 1 }}>Non enregistré : {erreur}</span>
          <button type="button" onClick={() => setErreur(null)} style={{ border: 'none', background: 'none', color: ROUGE, cursor: 'pointer', fontSize: 12 }}>Fermer</button>
        </p>
      )}

      <FormAjout affaires={affairesAjout} personnesDe={personnesDe} onAjouter={ajouter} />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        {[['toutes', 'Toutes les affaires'], ['mes', 'Mes affaires']].map(([code, libelle]) => (
          <button key={code} type="button" onClick={() => setPortee(code)} aria-pressed={portee === code}
            style={{ minHeight: 34, padding: '0 12px', borderRadius: 17, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: portee === code ? 'none' : '0.5px solid rgba(0,0,0,0.15)', background: portee === code ? ACCENT : 'white', color: portee === code ? 'white' : '#5E5854' }}>
            {libelle}
          </button>
        ))}
        <select value={personne} onChange={(e) => setPersonne(e.target.value)} aria-label="Filtrer par personne" style={{ ...champ, minHeight: 34, padding: '4px 10px' }}>
          <option value="">Toutes les personnes</option>
          {personnesFiltre.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5E5854', cursor: 'pointer' }}>
          <input type="checkbox" checked={seulementRetard} onChange={(e) => setSeulementRetard(e.target.checked)} style={{ minHeight: 0 }} />
          En retard seulement
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5E5854' }}>
          {total} tâche{total > 1 ? 's' : ''} à faire{retards > 0 && <> · <strong style={{ color: ROUGE }}>{retards} en retard</strong></>}
        </span>
      </div>

      {groupes.length === 0 && <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Aucune tâche à faire.</p>}

      {groupes.map((g) => {
        const ecriture = modifiables.has(g.affaire.id)
        return (
          <section key={g.affaire.id} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderLeft: g.enRetard > 0 ? `3px solid ${ROUGE}` : '0.5px solid rgba(0,0,0,0.08)' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1F1B17' }}>{g.affaire.code_affaire}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.affaire.nom}</span>
              {g.enRetard > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: ROUGE }}>{g.enRetard} en retard</span>}
              {!ecriture && <span style={{ fontSize: 11, color: '#9C9591' }}>Lecture seule</span>}
              <button type="button" onClick={() => navigate(`/affaires/${g.affaire.id}/todo?onglet=quotidien`)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: ACCENT, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                To-do list <ExternalLink size={13} />
              </button>
            </header>
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 16px' }}>
              {g.taches.map((t) => {
                const retard = enRetard(t, aujourdhui)
                return (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <CaseACocher coche={false} desactive={!ecriture} onClick={() => cocher(t)} libelle={`Cocher : ${t.texte}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: '#1F1B17' }}>{t.texte}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9C9591', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                        {t.responsable_id && <span>Pour {nomPersonne(t.responsable_id, profils)}</span>}
                        {t.echeance && <span style={{ color: retard ? ROUGE : '#9C9591', fontWeight: retard ? 600 : 400 }}>{retard ? 'En retard · ' : 'Pour le '}{dateCourte(t.echeance)}</span>}
                      </p>
                      {t.note && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5E5854', fontStyle: 'italic' }}>{t.note}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
