import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { DatePickerISO } from '../../../shared/components/DatePickerISO'
import { planDecalage, debutActuel, decalerDate } from './decalage'

// Décaler tout le planning (report du démarrage du chantier) : on donne la
// nouvelle date de démarrage, le récapitulatif dit ce qui va bouger avant de
// valider. Montée seulement à l'ouverture : ses champs partent du planning
// tel qu'il est à ce moment-là.

const fmt = (iso) => (iso
  ? new Date(`${iso}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  : '—')
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

const LABEL = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', display: 'block', marginBottom: 6,
}
const CASE = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1F1B17', cursor: 'pointer' }

export function DecalagePlanningModal({
  tasks, segments, jalons, dependances, periodes, affaire, onValider, onAnnuler,
}) {
  const [nouveauDebut, setNouveauDebut] = useState(() => debutActuel({ tasks, segments }) ?? '')
  const [partiel, setPartiel] = useState(false)
  const [aPartirDe, setAPartirDe] = useState(() => debutActuel({ tasks, segments }) ?? '')
  const datesAffaire = [affaire?.date_demarrage_travaux, affaire?.date_livraison].some(Boolean)
  const [avecAffaire, setAvecAffaire] = useState(datesAffaire)
  const [enCours, setEnCours] = useState(false)

  const plan = useMemo(() => planDecalage({
    tasks, segments, jalons, dependances, periodes,
    nouveauDebut: nouveauDebut || null,
    aPartirDe: partiel && aPartirDe ? aPartirDe : null,
  }), [tasks, segments, jalons, dependances, periodes, nouveauDebut, partiel, aPartirDe])

  const affaireApres = plan && avecAffaire && datesAffaire ? {
    ...(affaire.date_demarrage_travaux ? { date_demarrage_travaux: decalerDate(affaire.date_demarrage_travaux, plan.ecart, periodes) } : {}),
    ...(affaire.date_livraison ? { date_livraison: decalerDate(affaire.date_livraison, plan.ecart, periodes) } : {}),
  } : null

  const rienABouger = !plan || plan.ecart === 0

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler, enCours])

  const valider = async () => {
    if (rienABouger) return
    setEnCours(true)
    try { await onValider(plan, affaireApres) } finally { setEnCours(false) }
  }

  const sens = plan && plan.ecart < 0 ? 'avancé' : 'reporté'
  const semaines = plan ? Math.abs(plan.semaines) : 0

  return (
    <div
      onClick={() => { if (!enCours) onAnnuler() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Décaler le planning"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', padding: '24px 28px', maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          border: '0.5px solid rgba(0,0,0,0.08)', borderTop: '3px solid #E8602C',
          boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <CalendarClock size={17} color="#E8602C" />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1F1B17' }}>Décaler le planning</h2>
        </div>
        <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.5, marginBottom: 18 }}>
          Toutes les tâches, leurs segments et les jalons se décalent ensemble, liés ou non.
          Les durées ne changent pas ; les congés et fermetures restent à leurs dates.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LABEL}>Nouvelle date de démarrage</label>
            <DatePickerISO value={nouveauDebut} onChange={setNouveauDebut} />
            {plan && (
              <p style={{ fontSize: 12, color: '#9C9591', marginTop: 5 }}>
                Démarrage actuel{partiel ? ' de la partie décalée' : ''} : {fmt(plan.ancienDebut)}
              </p>
            )}
          </div>

          <div>
            <label style={CASE}>
              <input type="checkbox" checked={partiel} onChange={e => setPartiel(e.target.checked)}
                style={{ width: 16, height: 16, minHeight: 0, accentColor: '#E8602C' }} />
              Seulement ce qui commence à partir du…
            </label>
            {partiel && (
              <div style={{ marginTop: 8, paddingLeft: 24 }}>
                <DatePickerISO value={aPartirDe} onChange={setAPartirDe} />
                <p style={{ fontSize: 12, color: '#9C9591', marginTop: 5 }}>
                  Ce qui commence avant cette date reste en place.
                </p>
              </div>
            )}
          </div>

          <div>
            <label style={{ ...CASE, cursor: datesAffaire ? 'pointer' : 'default', color: datesAffaire ? '#1F1B17' : '#9C9591' }}>
              <input type="checkbox" checked={avecAffaire && datesAffaire} disabled={!datesAffaire}
                onChange={e => setAvecAffaire(e.target.checked)}
                style={{ width: 16, height: 16, minHeight: 0, accentColor: '#E8602C' }} />
              Décaler aussi les dates de l’affaire
            </label>
            <div style={{ paddingLeft: 24, marginTop: 4, fontSize: 12, color: '#5E5854', lineHeight: 1.6 }}>
              {!datesAffaire && <span style={{ color: '#9C9591' }}>La fiche de l’affaire n’a ni date de démarrage ni date de livraison.</span>}
              {affaire?.date_demarrage_travaux && (
                <div>Démarrage des travaux : {fmt(affaire.date_demarrage_travaux)}{affaireApres ? ` → ${fmt(affaireApres.date_demarrage_travaux)}` : ''}</div>
              )}
              {affaire?.date_livraison && (
                <div>Livraison : {fmt(affaire.date_livraison)}{affaireApres ? ` → ${fmt(affaireApres.date_livraison)}` : ''}</div>
              )}
            </div>
          </div>

          <div style={{ background: '#FAF7F2', border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px', fontSize: 13, color: '#1F1B17', lineHeight: 1.6 }}>
            {!plan && <span style={{ color: '#9C9591' }}>Aucune tâche à décaler.</span>}
            {plan && plan.ecart === 0 && <span style={{ color: '#9C9591' }}>Le planning démarre déjà à cette date.</span>}
            {plan && plan.ecart !== 0 && (
              <>
                <strong>Planning {sens} de {pluriel(semaines, 'semaine')}</strong>
                <span style={{ color: '#9C9591' }}> ({pluriel(Math.abs(plan.ecart), 'jour')} ouvré{Math.abs(plan.ecart) > 1 ? 's' : ''})</span>
                <br />
                {pluriel(plan.resume.taches, 'tâche')} · {pluriel(plan.resume.segments, 'segment')} · {pluriel(plan.resume.jalons, 'jalon')}
                {plan.resume.allongees.length > 0 && (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#B8412C' }}>
                    Traverse{plan.resume.allongees.length > 1 ? 'nt' : ''} désormais une période de congés et s’allonge{plan.resume.allongees.length > 1 ? 'nt' : ''} d’autant :{' '}
                    {plan.resume.allongees.slice(0, 6).join(', ')}{plan.resume.allongees.length > 6 ? `… (+${plan.resume.allongees.length - 6})` : ''}
                  </p>
                )}
              </>
            )}
          </div>

          <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic' }}>
            « Annuler » dans la barre d’outils (⌘Z) remet le planning et les jalons en place.
            {avecAffaire && datesAffaire ? ' Les dates de l’affaire, elles, se corrigent dans sa fiche.' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onAnnuler} disabled={enCours}
            style={{ padding: '9px 16px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#374151', cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="button" onClick={valider} disabled={enCours || rienABouger}
            style={{ padding: '9px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: '#E8602C', color: 'white', cursor: enCours || rienABouger ? 'default' : 'pointer', opacity: rienABouger ? 0.5 : 1 }}>
            {enCours ? 'Décalage…' : 'Décaler le planning'}
          </button>
        </div>
      </div>
    </div>
  )
}
