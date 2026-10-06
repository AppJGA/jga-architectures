import { useState } from 'react'
import { CalendarDays, Check } from 'lucide-react'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { affichagePresence } from './crLogique'
import { useCr } from './CrContexte'

// ─── Page « Prochaine visite » ───────────────────────────────────────────────
//
// Ce qu'on règle en fin de réunion pour la suivante : sa date et son heure, et
// qui y est convoqué. Les convocations ne vivent qu'ici (plus dans la page
// Présences) ; elles sont rappelées au pointage de la visite suivante
// (convocationLogique.js) et imprimées dans le PDF.

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 4,
}
const INPUT = {
  width: '100%', height: 36, padding: '0 10px', borderRadius: 2, fontSize: 13,
  border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white', outline: 'none',
  boxSizing: 'border-box', color: '#1F1B17',
}
const CARTE = { background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }
const TITRE = { fontFamily: "'Archivo', sans-serif", fontSize: 15, fontWeight: 500, color: '#1F1B17' }

const HEURE_PAR_DEFAUT = '09:00'

function Toggle({ value, onChange, disabled, libelle }) {
  return (
    <div
      role="switch"
      aria-checked={!!value}
      aria-label={libelle}
      onClick={() => { if (!disabled) onChange(!value) }}
      style={{
        width: 36, height: 20, borderRadius: 2, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        background: value ? '#2A8A4E' : 'rgba(0,0,0,0.15)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function LigneConvocation({ presence, heureDefaut, onUpdate }) {
  const { lectureSeule } = useCr()
  const v = affichagePresence(presence)
  const titre = v.type === 'entreprise' ? (v.entreprise ?? '—') : (v.nom || '—')
  const detail = v.type === 'entreprise'
    ? [v.lotNom && `Lot ${v.lotNumeroAffiche ?? ''} — ${v.lotNom}`, v.contact].filter(Boolean).join(' · ')
    : [v.categorieLabel || CATEGORIE_META[v.categorie]?.label, v.organisation].filter(Boolean).join(' · ')

  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderTop: '0.5px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{titre}</p>
        {detail && <p style={{ fontSize: 11, color: '#9C9591', marginTop: 1 }}>{detail}</p>}
      </div>
      <Toggle
        value={presence.convoque}
        disabled={lectureSeule}
        libelle={`Convoquer ${titre}`}
        // L'heure est enregistrée dès la convocation, sinon le PDF n'en
        // montre aucune ; par défaut, celle de la prochaine réunion.
        onChange={val => onUpdate(presence.id, val && !presence.heure_convocation
          ? { convoque: true, heure_convocation: heureDefaut }
          : { convoque: val })}
      />
      <input
        type="time"
        aria-label={`Heure de convocation de ${titre}`}
        value={presence.heure_convocation?.slice(0, 5) ?? heureDefaut}
        disabled={!presence.convoque || lectureSeule}
        onChange={e => onUpdate(presence.id, { heure_convocation: e.target.value || null })}
        style={{
          fontSize: 12, width: 84, minHeight: 0, height: 30,
          border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 3,
          padding: '2px 6px', outline: 'none',
          color: presence.convoque ? '#1F1B17' : '#9C9591',
          background: presence.convoque ? 'white' : '#FAF7F2',
          cursor: presence.convoque && !lectureSeule ? 'text' : 'not-allowed',
          opacity: presence.convoque ? 1 : 0.5,
        }}
      />
    </li>
  )
}

function Groupe({ titre, lignes, heureDefaut, onUpdate }) {
  if (lignes.length === 0) return null
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ ...LABEL, marginBottom: 2 }}>{titre}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lignes.map(p => <LigneConvocation key={p.id} presence={p} heureDefaut={heureDefaut} onUpdate={onUpdate} />)}
      </ul>
    </div>
  )
}

export function ProchaineVisite({ cr, presences, updateCr, updatePresence }) {
  const { lectureSeule, signalerErreur } = useCr()
  const [enregistre, setEnregistre] = useState(false)

  const enregistrer = async (changement) => {
    setEnregistre(false)
    try {
      await updateCr(changement)
      setEnregistre(true)
    } catch (err) { signalerErreur(err) }
  }
  const handleUpdate = (presenceId, changes) => {
    updatePresence(presenceId, changes).catch(signalerErreur)
  }

  const heureDefaut = cr.heure_prochaine_reunion?.slice(0, 5) || HEURE_PAR_DEFAUT
  const interlos = presences
    .filter(p => affichagePresence(p).type === 'interlocuteur')
    .sort((a, b) => affichagePresence(a).ordre - affichagePresence(b).ordre)
  const entreprises = presences
    .filter(p => affichagePresence(p).type === 'entreprise')
    .sort((a, b) => (affichagePresence(a).lotNumero ?? 99) - (affichagePresence(b).lotNumero ?? 99))
  const convoques = presences.filter(p => p.convoque).length

  return (
    <div style={{ maxWidth: 720 }}>
      <section style={CARTE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <CalendarDays size={17} color="#E8602C" />
          <h3 style={TITRE}>Prochaine réunion de chantier</h3>
          {enregistre && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 11, color: '#2A8A4E' }}>
              <Check size={12} /> Enregistré
            </span>
          )}
        </div>
        {/* Les champs ne sont pas contrôlés : le rechargement du CR qui suit
            un enregistrement contrarierait la saisie */}
        <fieldset disabled={lectureSeule} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <div>
              <label style={LABEL} htmlFor="prochaine-date">Date</label>
              <input
                id="prochaine-date" type="date" key={`d-${cr.id}`}
                defaultValue={cr.date_prochaine_reunion ?? ''}
                // À la sortie du champ : au clavier, Chrome émet une date à
                // chaque chiffre de l'année (0002, 0020, 0202, 2026…)
                onBlur={e => {
                  const valeur = e.target.value || null
                  if (valeur !== (cr.date_prochaine_reunion ?? null)) enregistrer({ date_prochaine_reunion: valeur })
                }}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL} htmlFor="prochaine-heure">Heure</label>
              <input
                id="prochaine-heure" type="time" key={`h-${cr.id}`}
                defaultValue={cr.heure_prochaine_reunion?.slice(0, 5) ?? ''}
                onBlur={e => {
                  const valeur = e.target.value || null
                  if (valeur !== (cr.heure_prochaine_reunion?.slice(0, 5) ?? null)) enregistrer({ heure_prochaine_reunion: valeur })
                }}
                style={INPUT}
              />
            </div>
          </div>
        </fieldset>
      </section>

      <section style={CARTE}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={TITRE}>Convocations à la prochaine réunion</h3>
          <span style={{ fontSize: 12, color: '#9C9591' }}>
            {convoques === 0 ? 'Personne n’est convoqué' : `${convoques} convoqué${convoques > 1 ? 's' : ''}`}
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#5E5854', marginTop: 4 }}>
          Rappelées au pointage des présences de la visite suivante, et imprimées dans le PDF.
        </p>
        <Groupe titre="Interlocuteurs projet" lignes={interlos} heureDefaut={heureDefaut} onUpdate={handleUpdate} />
        <Groupe titre="Entreprises" lignes={entreprises} heureDefaut={heureDefaut} onUpdate={handleUpdate} />
        {interlos.length === 0 && entreprises.length === 0 && (
          <p style={{ fontSize: 12, color: '#9C9591', marginTop: 14 }}>
            Aucun participant : ajoutez-les avec le bouton « Interlocuteurs » de la liste des visites.
          </p>
        )}
      </section>
    </div>
  )
}
