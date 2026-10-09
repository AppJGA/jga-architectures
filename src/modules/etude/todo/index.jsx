import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import { useAuth } from '../../../core/auth/useAuth'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { useAffaireCollaborateurs } from '../../../shared/hooks/useAffaireCollaborateurs'
import { ZoneConsultation } from '../../../shared/components/ZoneConsultation'
import { articlesAffiches, compteur, lireLien, lienPartage } from './todoLogique'
import { chargerTodo, chargerProfilsAgence } from './todoDonnees'
import { ListeCases } from './ListeCases'
import { Quotidien } from './Quotidien'
import { ModaleListeType } from './ModaleListeType'
import { CopierLien } from './CopierLien'

// ─── To-do list d'une affaire ────────────────────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-10-09-todo-list-design.md.
// Trois onglets : la mission phase par phase (liste type de l'agence), les
// tâches du quotidien, le contenu des plans. Un lien partagé
// (`?onglet=…&phase=…&tache=…`) ouvre directement la bonne vue.

const ONGLETS = [
  { code: 'mission', libelle: 'Mission' },
  { code: 'quotidien', libelle: 'Quotidien' },
  { code: 'plans', libelle: 'Contenu des plans' },
]

const nomAffiche = (p) => [p?.prenom, p?.nom].filter((x) => x && x !== '?').join(' ').trim()

export default function TodoModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const { search } = useLocation()
  const lien = useMemo(() => lireLien(search), [search])
  const { user } = useAuth()
  const { affaire, loading: affaireEnCours } = useAffaire(affaireId)
  const { collaborateurs } = useAffaireCollaborateurs(affaireId)

  // L'onglet choisi à l'écran vaut pour l'adresse où il a été choisi : un
  // nouveau lien ouvert dans la page reprend la main
  const [choix, setChoix] = useState({ onglet: lien.onglet ?? 'mission', search })
  const onglet = choix.search === search ? choix.onglet : (lien.onglet ?? choix.onglet)
  const setOnglet = (o) => setChoix({ onglet: o, search })
  const [donnees, setDonnees] = useState(null) // { disponible, modele, elements }
  const [profilsAgence, setProfilsAgence] = useState([])
  const [erreur, setErreur] = useState(null)
  const [listeTypeOuverte, setListeTypeOuverte] = useState(false)

  useEffect(() => {
    let actif = true
    chargerTodo(affaireId)
      .then((d) => { if (actif) { setDonnees(d); setErreur(null) } })
      .catch((e) => { if (actif) setErreur(e?.message ?? String(e)) })
    chargerProfilsAgence().then((p) => { if (actif) setProfilsAgence(p) }).catch(() => {})
    return () => { actif = false }
  }, [affaireId])

  const profils = useMemo(() => {
    const parId = Object.fromEntries(profilsAgence.map((p) => [p.id, p]))
    for (const c of collaborateurs) if (!parId[c.user_id]) parId[c.user_id] = c.profiles
    return parId
  }, [profilsAgence, collaborateurs])

  // Personnes chargées : les collaborateurs de l'affaire (jamais un extérieur),
  // toute l'agence si l'affaire n'en a aucun
  const personnes = useMemo(() => {
    const collabs = collaborateurs.filter((c) => c.role !== 'exterieur').map((c) => ({ id: c.user_id, nom: nomAffiche(c.profiles) }))
    const liste = collabs.length > 0 ? collabs : profilsAgence.map((p) => ({ id: p.id, nom: nomAffiche(p) }))
    return liste.filter((p) => p.nom).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [collaborateurs, profilsAgence])

  const signalerErreur = useCallback((e) => setErreur(e?.message ?? String(e)), [])
  const poserElement = useCallback((ligne) => setDonnees((d) => ({
    ...d, elements: d.elements.some((e) => e.id === ligne.id) ? d.elements.map((e) => (e.id === ligne.id ? ligne : e)) : [...d.elements, ligne],
  })), [])
  const retirerElement = useCallback((id) => setDonnees((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) })), [])
  const poserModele = useCallback((ligne) => setDonnees((d) => ({
    ...d, modele: d.modele.some((m) => m.id === ligne.id) ? d.modele.map((m) => (m.id === ligne.id ? ligne : m)) : [...d.modele, ligne],
  })), [])

  if (erreur && !donnees) return <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C' }}>Lecture impossible : {erreur}</p>
  // La phase de l'affaire décide de la phase ouverte : l'attendre aussi
  if (!donnees || affaireEnCours) return <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Chargement…</p>
  if (!donnees.disponible) {
    return (
      <p role="status" style={{ margin: 0, maxWidth: 760, fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 14px' }}>
        La to-do list n’est pas encore installée : la migration 066 est à passer dans Supabase.
      </p>
    )
  }

  const { modele, elements } = donnees
  const pastille = {
    mission: compteur(articlesAffiches(modele, elements, 'mission')),
    plans: compteur(articlesAffiches(modele, elements, 'plans')),
    quotidien: elements.filter((e) => e.type === 'tache' && !e.fait_le).length,
  }
  const commun = { affaireId, profils, utilisateurId: user?.id ?? null, lectureSeule, poserElement, retirerElement, signalerErreur }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      {erreur && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C', background: '#FDF2F0', border: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 12px', display: 'flex', gap: 12 }}>
          <span style={{ flex: 1 }}>Non enregistré : {erreur}</span>
          <button type="button" onClick={() => setErreur(null)} style={{ border: 'none', background: 'none', color: '#B8412C', cursor: 'pointer', fontSize: 12 }}>Fermer</button>
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Listes" style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {ONGLETS.map((o) => {
            const actif = onglet === o.code
            const p = pastille[o.code]
            return (
              <button key={o.code} type="button" role="tab" aria-selected={actif} onClick={() => setOnglet(o.code)} data-consultation="libre"
                style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 6, minHeight: 40, padding: '0 16px', cursor: 'pointer',
                  border: 'none', borderBottom: `2px solid ${actif ? 'var(--affaire-accent, #E8602C)' : 'transparent'}`, background: 'none',
                  fontSize: 14, fontWeight: actif ? 600 : 500, color: actif ? '#1F1B17' : '#5E5854',
                }}>
                {o.libelle}
                <span style={{ fontSize: 11, color: '#9C9591' }}>{typeof p === 'number' ? (p > 0 ? p : '') : `${p.faits}/${p.total}`}</span>
              </button>
            )
          })}
        </div>
        <CopierLien avecTexte lien={lienPartage(window.location.origin, affaireId, { onglet })} libelle="Copier le lien" />
        {!lectureSeule && onglet !== 'quotidien' && (
          <button type="button" onClick={() => setListeTypeOuverte(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 12, cursor: 'pointer' }}>
            <ListChecks size={15} /> Modifier la liste type
          </button>
        )}
      </div>

      <ZoneConsultation actif={lectureSeule}>
        {onglet === 'quotidien' ? (
          <Quotidien {...commun} elements={elements} personnes={personnes} tacheLien={lien.tache} />
        ) : (
          <ListeCases key={`${onglet}-${lien.phase}`} {...commun} liste={onglet} modele={modele} elements={elements}
            phaseAffaire={affaire?.phase ?? null} phaseLien={onglet === 'mission' ? lien.phase : null} poserModele={poserModele} />
        )}
      </ZoneConsultation>

      {listeTypeOuverte && (
        <ModaleListeType modele={modele} listeInitiale={onglet === 'plans' ? 'plans' : 'mission'} poserModele={poserModele}
          onFermer={() => setListeTypeOuverte(false)} />
      )}
    </div>
  )
}
