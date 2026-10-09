import { useMemo, useState } from 'react'
import { ChevronDown, Plus, RotateCcw } from 'lucide-react'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { articlesAffiches, parGroupe, phaseParDefaut, ordreSuivant, lienPartage, compteur } from './todoLogique'
import { enregistrerArticle, ajouterArticle, ajouterAuModele, supprimerElement, recommencerPlans } from './todoDonnees'
import { LigneArticle } from './LigneArticle'
import { CopierLien } from './CopierLien'

// ─── Onglets « Mission » et « Contenu des plans » ────────────────────────────
//
// La mission se lit phase par phase (pastilles avec compteur, la phase en
// cours de l'affaire ouverte d'office) ; le contenu des plans se lit d'un
// trait, rubrique après rubrique, et se recommence pour l'indice suivant.

const VERT = '#2A8A4E'

function Compte({ c }) {
  return <span style={{ fontSize: 12, color: c.total > 0 && c.faits === c.total ? VERT : '#9C9591', fontVariantNumeric: 'tabular-nums' }}>{c.faits} / {c.total}</span>
}

function FormAjout({ onAjouter }) {
  const [texte, setTexte] = useState('')
  const [aussiType, setAussiType] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const valider = async () => {
    const t = texte.trim()
    if (!t || enCours) return
    setEnCours(true)
    try {
      await onAjouter(t, aussiType)
      setTexte('')
    } finally { setEnCours(false) }
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 4px 4px' }}>
      <input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') valider() }}
        placeholder="Ajouter un article…" aria-label="Nouvel article"
        style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13, padding: '8px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3 }} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5E5854', cursor: 'pointer' }}>
        <input type="checkbox" checked={aussiType} onChange={(e) => setAussiType(e.target.checked)} style={{ minHeight: 0 }} />
        Ajouter aussi à la liste type de l’agence
      </label>
      <button type="button" onClick={valider} disabled={!texte.trim() || enCours}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !texte.trim() || enCours ? 0.5 : 1 }}>
        <Plus size={15} /> Ajouter
      </button>
    </div>
  )
}

/**
 * @param liste       'mission' | 'plans'
 * @param poserElement / retirerElement / poserModele  mises à jour de l'état du module
 */
export function ListeCases({
  liste, modele, elements, affaireId, phaseAffaire, phaseLien, profils, utilisateurId,
  lectureSeule, poserElement, retirerElement, poserModele, signalerErreur,
}) {
  const articles = useMemo(() => articlesAffiches(modele, elements, liste), [modele, elements, liste])
  const groupes = useMemo(() => parGroupe(articles, liste), [articles, liste])
  const [phase, setPhase] = useState(() => (
    groupes.some((g) => g.code === phaseLien) ? phaseLien : phaseParDefaut(phaseAffaire, groupes)
  ))
  const [fermees, setFermees] = useState(() => new Set())
  const [aRecommencer, setARecommencer] = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)
  const origine = window.location.origin

  const agir = (promesse) => promesse.catch((e) => signalerErreur(e))

  const actionsDe = (article) => ({
    basculer: () => agir(enregistrerArticle(affaireId, article, article.fait_le
      ? { fait_le: null, fait_par: null }
      : { fait_le: new Date().toISOString(), fait_par: utilisateurId }).then(poserElement)),
    enregistrer: (champs) => agir(enregistrerArticle(affaireId, article, champs).then(poserElement)),
    supprimer: article.source === 'article' ? () => setASupprimer(article) : null,
  })

  const ajouter = (groupe) => async (texte, aussiType) => {
    try {
      if (aussiType) {
        // Dans la liste type, l'article apparaît ici comme dans toutes les affaires
        const lignes = modele.filter((m) => m.liste === liste && m.groupe === groupe)
        poserModele(await ajouterAuModele({ liste, groupe, texte, ordre: ordreSuivant(lignes, groupe) }))
      } else {
        poserElement(await ajouterArticle(affaireId, { liste, groupe, texte, ordre: ordreSuivant(articles, groupe) }))
      }
    } catch (e) { signalerErreur(e) }
  }

  const lignes = (g) => (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {g.articles.map((a) => (
        <LigneArticle key={a.cle} article={a} profils={profils} lectureSeule={lectureSeule} actions={actionsDe(a)} />
      ))}
      {g.articles.length === 0 && <li style={{ padding: '12px 4px', fontSize: 13, color: '#9C9591' }}>Aucun article.</li>}
    </ul>
  )

  const modales = (
    <>
      {aSupprimer && (
        <ModaleConfirmation danger titre="Supprimer cet article ?" texte={`« ${aSupprimer.texte} » sera retiré de cette affaire.`}
          libelle="Supprimer"
          onAnnuler={() => setASupprimer(null)}
          onConfirmer={async () => {
            try { await supprimerElement(aSupprimer.elementId); retirerElement(aSupprimer.elementId) } catch (e) { signalerErreur(e) }
            setASupprimer(null)
          }} />
      )}
      {aRecommencer && (
        <ModaleConfirmation titre="Recommencer la vérification ?" libelle="Recommencer"
          texte="Toutes les cases du contenu des plans seront décochées, pour vérifier le prochain indice. Les notes et les articles « sans objet » restent."
          onAnnuler={() => setARecommencer(false)}
          onConfirmer={async () => {
            try {
              await recommencerPlans(affaireId)
              elements.filter((e) => e.liste === 'plans' && e.fait_le).forEach((e) => poserElement({ ...e, fait_le: null, fait_par: null }))
            } catch (e) { signalerErreur(e) }
            setARecommencer(false)
          }} />
      )}
    </>
  )

  if (liste === 'mission') {
    const g = groupes.find((x) => x.code === phase) ?? groupes[0]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div role="tablist" aria-label="Phases" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {groupes.map((x) => {
            const actif = x.code === g.code
            const fini = x.compteur.total > 0 && x.compteur.faits === x.compteur.total
            return (
              <button key={x.code} type="button" role="tab" aria-selected={actif} onClick={() => setPhase(x.code)} data-consultation="libre"
                style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 18, cursor: 'pointer',
                  border: actif ? 'none' : `0.5px solid ${fini ? 'rgba(42,138,78,0.45)' : 'rgba(0,0,0,0.15)'}`,
                  background: actif ? 'var(--affaire-accent, #E8602C)' : fini ? 'rgba(42,138,78,0.08)' : 'white',
                  color: actif ? 'white' : '#1F1B17', fontSize: 13, fontWeight: actif ? 600 : 500,
                }}>
                {x.court}
                <span style={{ fontSize: 11, opacity: 0.85, color: actif ? 'white' : fini ? VERT : '#9C9591' }}>{x.compteur.faits}/{x.compteur.total}</span>
              </button>
            )
          })}
        </div>

        <section style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 18px' }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <h3 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>{g.libelle}</h3>
            <Compte c={g.compteur} />
            <CopierLien lien={lienPartage(origine, affaireId, { onglet: 'mission', phase: g.code })} libelle="Copier le lien de cette phase" />
          </header>
          {lignes(g)}
          {!lectureSeule && <FormAjout key={g.code} onAjouter={ajouter(g.code)} />}
        </section>
        {modales}
      </div>
    )
  }

  const total = compteur(articles)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>
        À vérifier sur chaque jeu de plans avant de le diffuser : <Compte c={total} /> points vérifiés.
      </p>
      {groupes.map((g) => {
        const ferme = fermees.has(g.code)
        return (
          <section key={g.code} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <button type="button" data-consultation="libre" aria-expanded={!ferme}
              onClick={() => setFermees((f) => { const n = new Set(f); if (n.has(g.code)) n.delete(g.code); else n.add(g.code); return n })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 18px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <ChevronDown size={16} color="#9C9591" style={{ transition: 'transform 0.2s', transform: ferme ? 'rotate(-90deg)' : 'none' }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>{g.libelle}</span>
              <Compte c={g.compteur} />
            </button>
            {!ferme && (
              <div style={{ padding: '0 18px 12px' }}>
                {lignes(g)}
                {!lectureSeule && <FormAjout onAjouter={ajouter(g.code)} />}
              </div>
            )}
          </section>
        )
      })}
      {!lectureSeule && total.faits > 0 && (
        <div>
          <button type="button" onClick={() => setARecommencer(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 13, cursor: 'pointer' }}>
            <RotateCcw size={15} /> Recommencer la vérification
          </button>
        </div>
      )}
      {modales}
    </div>
  )
}
