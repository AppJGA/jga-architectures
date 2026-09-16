import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useCr } from './CrContexte'
import {
  avancementParLot, avancementGlobal, infosEcart, lignesAvancement,
} from './avancementLogique'

// Avancement des lots dans le compte rendu. Les chiffres viennent du planning
// chantier ; pointer une tâche ici écrit dans le planning, pas à côté.

function Barre({ realise, prevu, couleur, hauteur = 10 }) {
  return (
    <div style={{ position: 'relative', height: hauteur, background: '#F1EFE8', borderRadius: 2, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, realise)}%`, background: couleur }} />
      {/* Repère du prévu : ce que le planning annonçait pour ce jour-là */}
      <div style={{
        position: 'absolute', top: -2, bottom: -2, left: `${Math.min(100, prevu)}%`,
        width: 2, background: '#1F1B17', opacity: 0.55,
      }} />
    </div>
  )
}

function Ecart({ ecart }) {
  const info = infosEcart(ecart)
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
      color: info.couleur, background: info.etat === 'conforme' ? '#F1EFE8' : `${info.couleur}1A`,
      borderRadius: 3, padding: '2px 8px',
    }}>
      {info.libelle}
    </span>
  )
}

function ChampAvancement({ tache, onModifier, signalerErreur }) {
  const [valeur, setValeur] = useState(String(tache.avancement ?? 0))
  const [enCours, setEnCours] = useState(false)

  const enregistrer = async (v) => {
    const pourcent = Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
    setValeur(String(pourcent))
    if (pourcent === (tache.avancement ?? 0)) return
    setEnCours(true)
    try { await onModifier(tache.id, pourcent) } catch (err) { signalerErreur(err); setValeur(String(tache.avancement ?? 0)) }
    finally { setEnCours(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="range" min={0} max={100} step={5} value={Number(valeur) || 0}
        aria-label={`Avancement de ${tache.nom}`}
        onChange={e => setValeur(e.target.value)}
        onPointerUp={e => enregistrer(e.currentTarget.value)}
        onKeyUp={e => enregistrer(e.currentTarget.value)}
        style={{ width: 120, accentColor: '#E8602C' }}
      />
      <input
        type="number" min={0} max={100} value={valeur}
        aria-label={`Avancement de ${tache.nom} en pourcentage`}
        onChange={e => setValeur(e.target.value)}
        onBlur={e => enregistrer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{
          width: 62, minHeight: 36, padding: '0 8px', fontSize: 13, textAlign: 'right',
          border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, outline: 'none',
          opacity: enCours ? 0.5 : 1,
        }}
      />
      <span style={{ fontSize: 12, color: '#9C9591' }}>%</span>
    </div>
  )
}

function LigneLot({ ligne, taches, lectureSeule, onModifier, signalerErreur }) {
  const [ouvert, setOuvert] = useState(false)
  const Chevron = ouvert ? ChevronDown : ChevronRight

  return (
    <div style={{ border: '0.5px solid rgba(0,0,0,0.08)', background: 'white' }}>
      <button
        type="button" onClick={() => setOuvert(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          padding: '12px 14px', minHeight: 48, border: 'none', background: 'none', cursor: 'pointer',
          borderLeft: `3px solid ${ligne.couleur}`,
        }}
      >
        <Chevron size={15} color="#9C9591" />
        <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>{ligne.nom}</span>
        <span style={{ fontSize: 11, color: '#9C9591', whiteSpace: 'nowrap' }}>
          {ligne.taches} tâche{ligne.taches > 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1, minWidth: 90 }}>
          <Barre realise={ligne.realise} prevu={ligne.prevu} couleur={ligne.couleur} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1F1B17', width: 48, textAlign: 'right' }}>{ligne.realise}%</span>
        <span style={{ fontSize: 11, color: '#9C9591', width: 78, textAlign: 'right' }}>prévu {ligne.prevu}%</span>
        <Ecart ecart={ligne.ecart} />
      </button>

      {ouvert && (
        <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', padding: '6px 14px 10px 32px' }}>
          {taches.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9C9591', padding: '8px 0' }}>
              Les tâches de ce lot ne sont plus au planning.
            </p>
          ) : taches.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.04)',
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9C9591', width: 46 }}>{t.num_tache}</span>
              <span style={{ flex: 1, minWidth: 160, fontSize: 13, color: '#1F1B17' }}>{t.nom}</span>
              {lectureSeule
                ? <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>{t.avancement ?? 0} %</span>
                : <ChampAvancement tache={t} onModifier={onModifier} signalerErreur={signalerErreur} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AvancementLots({ cr, planning, onModifierTache }) {
  const { lectureSeule, signalerErreur } = useCr()
  const vivantes = avancementParLot(planning.taches, planning.lots, {
    date: cr.date_reunion, periodes: planning.periodes,
  })
  const lignes = lignesAvancement(cr, vivantes)
  const total = avancementGlobal(lignes)
  const gele = lignes.some(l => l.gele)

  if (lignes.length === 0) {
    return (
      <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#5E5854' }}>
          Le planning chantier de cette affaire n’a pas encore de tâches : l’avancement s’en déduit.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderTop: '3px solid #E8602C',
        padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#C9C4C0' }}>
            Avancement de l’opération
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 600, color: '#E8602C', letterSpacing: '-0.02em' }}>{total.realise}%</span>
            <span style={{ fontSize: 12, color: '#9C9591', whiteSpace: 'nowrap' }}>
              prévu {total.prevu}%{cr.date_reunion ? ` au ${new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR')}` : ''}
            </span>
            <Ecart ecart={total.ecart} />
          </div>
        </div>
        <div style={{ flex: 2, minWidth: 200 }}>
          <Barre realise={total.realise} prevu={total.prevu} couleur="#E8602C" hauteur={14} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#9C9591', display: 'flex', alignItems: 'center', gap: 6 }}>
        {gele
          ? <><Lock size={12} /> Chiffres figés à l’émission du compte rendu ; le planning a pu avancer depuis.</>
          : <>Chiffres lus dans le planning chantier. Le trait noir marque l’avancement prévu à la date de la réunion.</>}
      </p>

      {lignes.map(l => (
        <LigneLot
          key={l.lot_id ?? 'hors-lot'} ligne={l}
          taches={planning.taches.filter(t => (t.lot_id ?? null) === l.lot_id)}
          lectureSeule={lectureSeule || l.gele}
          onModifier={onModifierTache} signalerErreur={signalerErreur}
        />
      ))}
    </div>
  )
}
