import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2, ExternalLink, Link2 } from 'lucide-react'
import { ModaleConfirmation } from '../shared/components/ModaleConfirmation'
import { periodeAffaire } from '../affaire/phaseAffaire'
import { semaineIso, vendrediSemaineIso } from './gestionLogique'
import { creerJalon, modifierJalon, supprimerJalon } from './gestionDonnees'
import { ACCENT } from './manifest'

// ─── Jalon posé depuis le calendrier des rendus ──────────────────────────────
//
// Création (affaire, planning, libellé, date, couleur) ou modification d'un
// jalon existant. Il s'écrit dans le planning de l'affaire (migration 070) :
// à l'étude, sur la semaine de la date choisie (S42 = rendu au plus tard le
// vendredi) ; au chantier, à la date. Un jalon accroché à une barre garde sa
// date, qui suit la barre. Fenêtre fermée par ✕, Annuler ou Échap seulement.

const COULEURS = ['#8B5CF6', '#E8602C', '#2A8A4E', '#1B3A5C', '#B8412C', '#D97706', '#0891B2', '#DB2777']
const SUGGESTIONS = {
  etude: ['Rendu ESQ', 'Rendu APS', 'Rendu APD', 'Dépôt du permis de construire', 'Rendu PRO', 'Rendu DCE', 'Remise des offres', 'Signature des marchés'],
  chantier: ['Démarrage des travaux', "Mise hors d'eau / hors d'air", 'Début des OPR', 'Commission de sécurité', 'Réception des travaux', 'Livraison', 'Levée des réserves', 'DOE remis'],
}
const ORIGINES = [['etude', 'Planning d’étude'], ['chantier', 'Planning chantier']]

const etiquette = { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#9C9591', marginBottom: 5 }
const champ = { width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '9px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 3, background: 'white', color: '#1F1B17' }
const dateLongue = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * @param evenement  jalon à modifier (issu de `rendus`), ou null pour créer
 * @param dateInitiale  jour cliqué dans le calendrier (création)
 */
export function ModaleJalon({ evenement = null, affaires, dateInitiale, onFermer, onEnregistre, onOuvrirPlanning }) {
  const creation = !evenement
  const [affaireId, setAffaireId] = useState(evenement?.affaire.id ?? '')
  const [origine, setOrigine] = useState(evenement?.origine ?? 'etude')
  const [libelle, setLibelle] = useState(evenement?.libelle ?? '')
  const [date, setDate] = useState(evenement?.date ?? dateInitiale ?? '')
  const [couleur, setCouleur] = useState(evenement?.couleur ?? COULEURS[0])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [aSupprimer, setASupprimer] = useState(false)

  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape' && !aSupprimer && !enCours) onFermer() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer, aSupprimer, enCours])

  const affairesTriees = useMemo(() => [...(affaires ?? [])].sort((a, b) => (a.code_affaire ?? '').localeCompare(b.code_affaire ?? '')), [affaires])
  const semaine = date ? semaineIso(date) : null
  const pret = affaireId && libelle.trim() && date && !enCours

  // Le planning proposé suit la phase de l'affaire choisie
  const choisirAffaire = (id) => {
    setAffaireId(id)
    const a = affaires.find((x) => x.id === id)
    if (a) setOrigine(periodeAffaire(a.phase))
  }

  const expliquer = (e) => (e?.code === 'PGRST116' || e?.code === '42501'
    ? 'La base a refusé l’enregistrement : la migration 070 est-elle passée dans Supabase ?'
    : e?.message ?? String(e))

  const enregistrer = async () => {
    if (!pret) return
    setEnCours(true); setErreur(null)
    const valeurs = { libelle: libelle.trim(), couleur, date, semaineAnnee: semaine }
    try {
      if (creation) await creerJalon(affaireId, origine, valeurs)
      else await modifierJalon(evenement, valeurs)
      onEnregistre()
    } catch (e) { setErreur(expliquer(e)); setEnCours(false) }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top) + 24px) 16px 24px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label={creation ? 'Nouveau jalon' : 'Modifier le jalon'}
        style={{ background: 'white', width: '100%', maxWidth: 520, borderTop: `3px solid ${ACCENT}`, boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <p style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: '#1F1B17' }}>{creation ? 'Nouveau jalon' : 'Modifier le jalon'}</p>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ width: 34, height: 34, border: 'none', background: 'none', cursor: 'pointer', color: '#5E5854', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </header>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={etiquette} htmlFor="jalon-affaire">Affaire</label>
            {creation ? (
              <select id="jalon-affaire" value={affaireId} onChange={(e) => choisirAffaire(e.target.value)} style={champ}>
                <option value="">Choisir une affaire…</option>
                {affairesTriees.map((a) => <option key={a.id} value={a.id}>{a.code_affaire} · {a.nom}</option>)}
              </select>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: '#1F1B17' }}><strong>{evenement.affaire.code_affaire}</strong> {evenement.affaire.nom}</p>
            )}
          </div>

          <div>
            <span style={etiquette}>Planning</span>
            {creation ? (
              <div role="radiogroup" aria-label="Planning" style={{ display: 'flex', gap: 6 }}>
                {ORIGINES.map(([code, nom]) => (
                  <button key={code} type="button" role="radio" aria-checked={origine === code} onClick={() => setOrigine(code)}
                    style={{ flex: 1, minHeight: 38, borderRadius: 3, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: origine === code ? 'none' : '0.5px solid rgba(0,0,0,0.15)', background: origine === code ? ACCENT : 'white', color: origine === code ? 'white' : '#5E5854' }}>
                    {nom}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: '#1F1B17' }}>{origine === 'etude' ? 'Planning d’étude' : 'Planning chantier'}</p>
            )}
          </div>

          <div>
            <label style={etiquette} htmlFor="jalon-libelle">Libellé</label>
            <input id="jalon-libelle" list="jalon-suggestions" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Rendu APD, réception…" style={champ} />
            <datalist id="jalon-suggestions">{SUGGESTIONS[origine].map((s) => <option key={s} value={s} />)}</datalist>
          </div>

          <div>
            <label style={etiquette} htmlFor="jalon-date">Date</label>
            {evenement?.ancre ? (
              <p style={{ margin: 0, fontSize: 13, color: '#5E5854', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link2 size={14} /> Accroché à une barre du planning : sa date suit la barre ({dateLongue(evenement.date)}).
              </p>
            ) : (
              <>
                <input id="jalon-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={champ} />
                {origine === 'etude' && semaine && (
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: '#5E5854' }}>
                    Posé en <strong>S{semaine.semaine} {semaine.annee}</strong> au planning d’étude, soit au plus tard le {dateLongue(vendrediSemaineIso(semaine.semaine, semaine.annee))}.
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <span style={etiquette}>Couleur</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COULEURS.map((c) => (
                <button key={c} type="button" onClick={() => setCouleur(c)} aria-label={`Couleur ${c}`} aria-pressed={couleur === c}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: couleur === c ? '3px solid #1F1B17' : '2px solid white', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)' }} />
              ))}
            </div>
          </div>

          {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C' }}>{erreur}</p>}
        </div>

        <footer style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 16px', borderTop: '0.5px solid rgba(0,0,0,0.08)', flexWrap: 'wrap' }}>
          {!creation && (
            <>
              <button type="button" onClick={() => setASupprimer(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 12px', border: '0.5px solid rgba(184,65,44,0.4)', borderRadius: 3, background: 'white', color: '#B8412C', fontSize: 13, cursor: 'pointer' }}>
                <Trash2 size={14} /> Supprimer
              </button>
              <button type="button" onClick={() => onOuvrirPlanning(evenement)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 12px', border: 'none', background: 'none', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Ouvrir le planning <ExternalLink size={13} />
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onFermer} style={{ minHeight: 38, padding: '0 14px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={!pret}
            style={{ minHeight: 38, padding: '0 16px', border: 'none', borderRadius: 3, background: ACCENT, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: pret ? 1 : 0.5 }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </footer>
      </div>

      {aSupprimer && (
        <ModaleConfirmation danger titre="Supprimer ce jalon ?" libelle="Supprimer"
          texte={`« ${evenement.libelle} » sera retiré du ${evenement.origine === 'etude' ? 'planning d’étude' : 'planning chantier'} de ${evenement.affaire.code_affaire}.`}
          onAnnuler={() => setASupprimer(false)}
          onConfirmer={async () => {
            try { await supprimerJalon(evenement); onEnregistre() } catch (e) { setErreur(expliquer(e)); setASupprimer(false) }
          }} />
      )}
    </div>,
    document.body,
  )
}
