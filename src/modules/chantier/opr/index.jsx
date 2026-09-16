import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ClipboardCheck, Plus, RefreshCw, Search, AlertTriangle, X } from 'lucide-react'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { usePlans } from '../comptes-rendus/usePlans'
import { dateDuJour } from '../comptes-rendus/crLogique'
import { useOpr } from './useOpr'
import { VisiteOpr } from './VisiteOpr'
import {
  TYPES_VISITE, STATUTS_RESERVE, tableauParLot, passeFiltreReserve, infosStatutReserve, reserveEnRetard,
  lotsAvecEntreprise, libelleLot, libelleZone,
} from './oprLogique'

// ─── Module OPR : visites et suivi des réserves ──────────────────────────────

const bouton = (fond = 'white', couleur = '#1F1B17') => ({
  minHeight: 40, padding: '0 16px', borderRadius: 3, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  border: fond === 'white' ? '1px solid rgba(0,0,0,0.15)' : 'none', background: fond, color: couleur,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
})

function NouvelleVisite({ type, lots, lotsOuverts, onCreer, onFermer }) {
  const [date, setDate] = useState(dateDuJour())
  const [choix, setChoix] = useState(() => new Set((type === 'levee' ? lots.filter(l => lotsOuverts.has(l.id)) : lots).map(l => l.id)))
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)
  const basculer = (id) => setChoix(c => { const s = new Set(c); if (s.has(id)) s.delete(id); else s.add(id); return s })

  const creer = async () => {
    setOccupe(true)
    setErreur(null)
    try { await onCreer({ type, date_visite: date, lot_ids: [...choix] }) } catch (e) { setErreur(e.message); setOccupe(false) }
  }

  return (
    <div onClick={occupe ? undefined : onFermer} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: 'white', width: '100%', maxWidth: 520, padding: '22px 24px' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>{type === 'levee' ? 'Nouvelle visite de levée des réserves' : 'Nouvelles opérations préalables à la réception'}</h3>
        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>Date de la visite</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ minHeight: 44, padding: '0 10px', fontSize: 16, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3 }} />
        </label>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>Lots concernés</span>
        {lots.length === 0 && <p style={{ fontSize: 13, color: '#5E5854' }}>Aucun lot attribué à une entreprise dans cette affaire (module Lots &amp; entreprises).</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
          {lots.map(l => (
            <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={choix.has(l.id)} onChange={() => basculer(l.id)} style={{ width: 18, height: 18, accentColor: '#E8602C' }} />
              {libelleLot(l)}
              {type === 'levee' && lotsOuverts.has(l.id) && <span style={{ fontSize: 11, color: '#B8412C' }}>réserves ouvertes</span>}
            </label>
          ))}
        </div>
        {erreur && <p role="alert" style={{ fontSize: 13, color: '#B8412C', marginTop: 10 }}>{erreur}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onFermer} disabled={occupe} style={bouton()}>Annuler</button>
          <button type="button" onClick={creer} disabled={occupe || !date || (lots.length > 0 && choix.size === 0)} style={{ ...bouton('#2A8A4E', 'white'), opacity: occupe ? 0.6 : 1 }}>
            {occupe ? 'Création…' : 'Créer la visite'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SuiviReserves({ opr, onOuvrirVisite }) {
  const [filtre, setFiltre] = useState({ statut: 'ouvertes', lotId: '', zone: '', recherche: '' })
  const aujourdHui = dateDuJour()
  const tableau = tableauParLot(opr.reserves, opr.lots, aujourdHui)
  const liste = opr.reserves.filter(r => passeFiltreReserve(r, filtre, aujourdHui))
  const numeroVisite = new Map(opr.visites.map(v => [v.id, v]))
  const pastille = (actif) => ({ ...bouton(actif ? '#1F1B17' : 'white', actif ? 'white' : '#374151'), minHeight: 36, borderRadius: 18, fontWeight: actif ? 600 : 400 })

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAFAF9' }}>
              {['Lot', 'Total', 'Ouvertes', 'Contestées', 'Levées', 'Abandonnées', 'En retard'].map(t => (
                <th key={t} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 500, color: '#9C9591', textTransform: 'uppercase', textAlign: t === 'Lot' ? 'left' : 'center' }}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableau.length === 0 && <tr><td colSpan={7} style={{ padding: 16, color: '#9C9591' }}>Aucune réserve.</td></tr>}
            {tableau.map(l => (
              <tr key={l.lotId ?? 'sans-lot'} onClick={() => setFiltre(f => ({ ...f, lotId: l.lotId ?? 'sans-lot', statut: 'tous' }))} style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{l.libelle}</td>
                <td style={{ textAlign: 'center' }}>{l.total}</td>
                <td style={{ textAlign: 'center', color: l.ouvertes ? '#B8412C' : '#C9C4C0', fontWeight: l.ouvertes ? 600 : 400 }}>{l.ouvertes}</td>
                <td style={{ textAlign: 'center', color: l.contestees ? '#C2610C' : '#C9C4C0' }}>{l.contestees}</td>
                <td style={{ textAlign: 'center', color: l.levees ? '#2A8A4E' : '#C9C4C0' }}>{l.levees}</td>
                <td style={{ textAlign: 'center', color: '#C9C4C0' }}>{l.abandonnees}</td>
                <td style={{ textAlign: 'center', color: l.enRetard ? 'white' : '#C9C4C0' }}>
                  {l.enRetard ? <span style={{ background: '#B8412C', borderRadius: 3, padding: '2px 8px', fontWeight: 600 }}>{l.enRetard}</span> : 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {[['ouvertes', 'Ouvertes'], ['retard', 'En retard'], ...STATUTS_RESERVE.map(s => [s.code, s.libelle + 's']), ['tous', 'Toutes']].map(([code, libelle]) => (
          <button key={code} type="button" aria-pressed={filtre.statut === code} onClick={() => setFiltre(f => ({ ...f, statut: code }))} style={pastille(filtre.statut === code)}>{libelle}</button>
        ))}
        <select value={filtre.lotId} onChange={e => setFiltre(f => ({ ...f, lotId: e.target.value }))} aria-label="Lot" style={{ minHeight: 36, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3 }}>
          <option value="">Tous les lots</option>
          {opr.lots.map(l => <option key={l.id} value={l.id}>{libelleLot(l)}</option>)}
          <option value="sans-lot">Sans lot</option>
        </select>
        {opr.zones.length > 0 && (
          <select value={filtre.zone} onChange={e => setFiltre(f => ({ ...f, zone: e.target.value }))} aria-label="Zone" style={{ minHeight: 36, padding: '0 8px', fontSize: 13, border: `0.5px solid ${filtre.zone ? '#1B3A5C' : 'rgba(0,0,0,0.15)'}`, borderRadius: 3 }}>
            <option value="">Toutes les zones</option>
            <option value="sans-zone">Sans zone</option>
            {opr.zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
          </select>
        )}
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={15} color="#9C9591" style={{ position: 'absolute', left: 10, top: 11 }} />
          <input type="search" value={filtre.recherche} onChange={e => setFiltre(f => ({ ...f, recherche: e.target.value }))} placeholder="Rechercher, n°…"
            style={{ width: '100%', minHeight: 36, padding: '0 10px 0 32px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, boxSizing: 'border-box' }} />
        </div>
      </div>

      <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
        {liste.length === 0 && <p style={{ padding: 16, fontSize: 13, color: '#9C9591' }}>Aucune réserve ne correspond.</p>}
        {liste.map(r => {
          const s = infosStatutReserve(r)
          const lot = opr.lots.find(l => l.id === r.lot_id)
          const origine = numeroVisite.get(r.visite_origine_id)
          const retard = reserveEnRetard(r, aujourdHui)
          return (
            <div key={r.id} onClick={() => origine && onOuvrirVisite(origine.id)} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 14px', borderTop: '0.5px solid rgba(0,0,0,0.05)', cursor: 'pointer', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8602C', minWidth: 36 }}>n°{r.numero}</span>
              <span style={{ fontSize: 12, color: '#5E5854', minWidth: 140 }}>{libelleLot(lot, r.copie_lot)}</span>
              <span style={{ flex: '1 1 260px', fontSize: 14 }}>
                {libelleZone(r, opr.zones) && <span style={{ fontSize: 11, color: '#1B3A5C', background: 'rgba(27,58,92,0.10)', borderRadius: 3, padding: '1px 6px', marginRight: 6 }}>{libelleZone(r, opr.zones)}</span>}
                {r.localisation && <strong style={{ fontWeight: 500 }}>{r.localisation} — </strong>}{r.description}
              </span>
              {r.date_limite && <span style={{ fontSize: 12, color: retard ? '#B8412C' : '#9C9591', fontWeight: retard ? 600 : 400 }}>{new Date(`${r.date_limite}T00:00:00`).toLocaleDateString('fr-FR')}</span>}
              <span style={{ fontSize: 12, fontWeight: 600, color: s.couleur, background: s.fond, borderRadius: 3, padding: '2px 8px' }}>{s.libelle}</span>
              {origine && <span style={{ fontSize: 11, color: '#9C9591' }}>{TYPES_VISITE[origine.type].libelle} n°{origine.numero}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OprModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const { affaire } = useAffaire(affaireId)
  const opr = useOpr(affaireId)
  const plansCr = usePlans(affaireId)
  const [params, setParams] = useSearchParams()
  const [creation, setCreation] = useState(null)
  const [erreur, setErreur] = useState(null)
  const visiteId = params.get('visite')
  const onglet = params.get('onglet') === 'suivi' ? 'suivi' : 'visites'
  const aller = (changements) => setParams(prev => {
    const s = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(changements)) { if (v) s.set(k, v); else s.delete(k) }
    return s
  })

  if (!opr.charge) return <p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>
  if (!opr.disponible) return <p style={{ fontSize: 14, color: '#5E5854' }}>Le module OPR demande la migration 045 dans Supabase.</p>

  const visite = opr.visites.find(v => v.id === visiteId)
  if (visite) {
    return <VisiteOpr key={visite.id} visite={visite} affaire={affaire} opr={opr} plansCr={plansCr} lectureSeuleAffaire={lectureSeule} onRetour={() => aller({ visite: null })} />
  }

  const lots = lotsAvecEntreprise(opr.lots, opr.lotEntreprises)
  const lotsOuverts = new Set(opr.reserves.filter(r => !infosStatutReserve(r).close).map(r => r.lot_id))
  const ouvertes = opr.reserves.filter(r => !infosStatutReserve(r).close).length
  const enRetard = opr.reserves.filter(r => reserveEnRetard(r, dateDuJour())).length

  const creer = async (champs) => {
    const v = await opr.creerVisite(champs)
    setCreation(null)
    aller({ visite: v.id, onglet: null })
  }

  return (
    <div className="jga-entree-vue">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: "'Archivo', sans-serif", fontSize: 19, fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardCheck size={20} color="#2A8A4E" /> OPR et réserves
          </h2>
          <p style={{ fontSize: 12, color: '#9C9591', marginTop: 3 }}>
            {opr.visites.length} visite{opr.visites.length > 1 ? 's' : ''} · {opr.reserves.length} réserve{opr.reserves.length > 1 ? 's' : ''} · {ouvertes} ouverte{ouvertes > 1 ? 's' : ''}
            {enRetard > 0 && <span style={{ color: '#B8412C', fontWeight: 600 }}> · {enRetard} en retard</span>}
          </p>
        </div>
        {!lectureSeule && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setCreation('levee')} disabled={ouvertes === 0} title={ouvertes === 0 ? 'Aucune réserve ouverte' : undefined} style={{ ...bouton(), opacity: ouvertes === 0 ? 0.5 : 1 }}>
              <RefreshCw size={15} /> Nouvelle visite de levée
            </button>
            <button type="button" onClick={() => setCreation('opr')} style={bouton('#2A8A4E', 'white')}><Plus size={16} /> Nouvelle OPR</button>
          </div>
        )}
      </div>

      {(erreur || opr.erreur) && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12, background: '#FBEAE6', color: '#7A2A1C', fontSize: 13, borderLeft: '3px solid #B8412C' }}>
          <AlertTriangle size={15} color="#B8412C" /><span style={{ flex: 1 }}>{erreur ?? opr.erreur}</span>
          <button type="button" onClick={() => setErreur(null)} aria-label="Fermer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#B8412C' }}><X size={15} /></button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 14 }}>
        {[['visites', 'Visites'], ['suivi', 'Suivi des réserves']].map(([id, libelle]) => (
          <button key={id} type="button" onClick={() => aller({ onglet: id === 'suivi' ? 'suivi' : null })}
            style={{ padding: '10px 16px', fontSize: 14, border: 'none', background: 'none', cursor: 'pointer', borderBottom: `2px solid ${onglet === id ? '#E8602C' : 'transparent'}`, fontWeight: onglet === id ? 600 : 400, color: onglet === id ? '#1F1B17' : '#9C9591' }}>
            {libelle}
          </button>
        ))}
      </div>

      {onglet === 'suivi' ? (
        <SuiviReserves opr={opr} onOuvrirVisite={(id) => aller({ visite: id, onglet: null })} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {opr.visites.length === 0 && (
            <div style={{ gridColumn: '1 / -1', background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '40px 20px', textAlign: 'center', fontSize: 13, color: '#5E5854' }}>
              Aucune visite. Créez les opérations préalables à la réception pour commencer à relever les réserves.
            </div>
          )}
          {[...opr.visites].reverse().map(v => {
            const constatees = opr.reserves.filter(r => r.visite_origine_id === v.id).length
            const levees = opr.constats.filter(c => c.visite_id === v.id && c.statut === 'levee').length
            return (
              <button key={v.id} type="button" onClick={() => aller({ visite: v.id })}
                style={{ textAlign: 'left', background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: v.type === 'levee' ? '#2A8A4E' : '#E8602C' }}>{String(v.numero).padStart(2, '0')}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{TYPES_VISITE[v.type].libelle}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, borderRadius: 3, padding: '2px 8px', background: v.statut === 'emis' ? 'rgba(42,138,78,0.12)' : '#F3F4F6', color: v.statut === 'emis' ? '#2A8A4E' : '#5E5854' }}>{v.statut === 'emis' ? 'Émise' : 'Brouillon'}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#1F1B17' }}>{new Date(`${v.date_visite}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span style={{ fontSize: 12, color: '#5E5854' }}>
                  {v.lot_ids.length || 'Tous les'} lot{v.lot_ids.length === 1 ? '' : 's'}
                  {constatees > 0 && ` · ${constatees} réserve${constatees > 1 ? 's' : ''} relevée${constatees > 1 ? 's' : ''}`}
                  {levees > 0 && ` · ${levees} levée${levees > 1 ? 's' : ''}`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {creation && (
        <NouvelleVisite type={creation} lots={lots.length ? lots : opr.lots} lotsOuverts={lotsOuverts} onCreer={creer} onFermer={() => setCreation(null)} />
      )}
    </div>
  )
}
