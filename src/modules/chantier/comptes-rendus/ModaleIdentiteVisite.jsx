import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../../../core/supabase/client'
import { erreurNumero, redacteursPossibles } from './identiteVisiteLogique'

// ─── Numéro, date et rédacteur d'une visite ──────────────────────────────────
//
// Ouverte par le crayon du tableau de bord de la visite. Le numéro est vérifié
// contre les autres visites de l'affaire avant l'envoi ; la base le refuse de
// toute façon (unique(affaire_id, numero)), ce refus est traduit pareil.
// Portail : le tableau de bord est sous une carte animée qui garderait la
// fenêtre prisonnière.

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}

export function ModaleIdentiteVisite({ cr, profils, collaborateurs, onEnregistrer, onFermer }) {
  const [numero, setNumero] = useState(String(cr.numero ?? ''))
  const [date, setDate] = useState(cr.date_reunion ?? '')
  const [redacteur, setRedacteur] = useState(cr.redacteur_id ?? '')
  const [autres, setAutres] = useState([])
  const [enCours, setEnCours] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)

  // Les numéros pris sont relus à l'ouverture : la liste a pu changer depuis
  // un autre appareil
  useEffect(() => {
    let annule = false
    supabase.from('comptes_rendus').select('id, numero, date_reunion').eq('affaire_id', cr.affaire_id)
      .then(({ data }) => { if (!annule) setAutres(data ?? []) })
    return () => { annule = true }
  }, [cr.affaire_id])

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, enCours])

  const erreur = erreurNumero(numero, autres, cr.id)
  const redacteurs = redacteursPossibles(profils, collaborateurs, cr.redacteur_id)
  const choisiSansAcces = redacteurs.find(r => r.id === redacteur)?.sansAcces

  const enregistrer = async (e) => {
    e.preventDefault()
    if (erreur || !date) return
    setEnCours(true)
    setErreurEnvoi(null)
    try {
      await onEnregistrer({ numero: Number(numero), date_reunion: date, redacteur_id: redacteur || null })
      onFermer()
    } catch (err) {
      setErreurEnvoi(err?.code === '23505'
        ? `Le numéro ${Number(numero)} est déjà attribué à une autre visite.`
        : `Enregistrement impossible : ${err?.message ?? err}`)
      setEnCours(false)
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form
        role="dialog" aria-modal="true" aria-label="Modifier la visite"
        onSubmit={enregistrer}
        style={{
          background: 'white', padding: '24px 28px', maxWidth: 440, width: '100%',
          border: '0.5px solid rgba(0,0,0,0.08)', borderTop: '3px solid #E8602C',
          boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)',
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17', marginBottom: 18 }}>Modifier la visite</p>

        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12 }}>
          <div>
            <label style={LABEL} htmlFor="visite-numero">N° visite</label>
            <input
              id="visite-numero" type="number" min={1} step={1} autoFocus
              value={numero} onChange={e => setNumero(e.target.value)}
              aria-invalid={!!erreur}
              style={{ ...INPUT, ...(erreur ? { borderColor: '#B8412C' } : {}) }}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="visite-date">Date de la visite</label>
            <input id="visite-date" type="date" required value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
          </div>
        </div>
        {erreur && (
          <p role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#B8412C', marginTop: 8 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} /> {erreur}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <label style={LABEL} htmlFor="visite-redacteur">Rédacteur</label>
          <select id="visite-redacteur" value={redacteur} onChange={e => setRedacteur(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
            <option value="">— Non défini —</option>
            {redacteurs.map(r => (
              <option key={r.id} value={r.id}>{r.libelle}{r.sansAcces ? ' (n’a plus accès à l’affaire)' : ''}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: choisiSansAcces ? '#B8412C' : '#9C9591', marginTop: 5 }}>
            {choisiSansAcces
              ? 'Cette personne n’a plus accès à l’affaire : choisissez un autre rédacteur.'
              : 'Seules les personnes qui ont accès à l’affaire peuvent rédiger.'}
          </p>
        </div>

        {erreurEnvoi && <p role="alert" style={{ fontSize: 12, color: '#B8412C', marginTop: 12 }}>{erreurEnvoi}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" onClick={onFermer} disabled={enCours}
            style={{ padding: '8px 16px', borderRadius: 2, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17', cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" disabled={enCours || !!erreur || !date}
            style={{ padding: '8px 18px', borderRadius: 2, fontSize: 13, fontWeight: 600, border: 'none', background: '#E8602C', color: 'white', cursor: enCours || erreur || !date ? 'default' : 'pointer', opacity: enCours || erreur || !date ? 0.5 : 1 }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
