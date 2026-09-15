import { useState } from 'react'
import { FileSignature, Eye, FileDown, Check } from 'lucide-react'
import { Panneau } from '../comptes-rendus/PanneauxVisite'
import { telechargerBlob } from '../comptes-rendus/genererRapport'
import { lienArchive } from '../comptes-rendus/rapportStockage'
import { TYPES_PV, CONSTATATIONS_OPR, CHAMPS_PAR_TYPE, typesPvPourVisite, champsInitiaux } from './pvLogique'
import { genererPv } from './genererPv'
import { libelleLot } from './oprLogique'

// ─── Procès-verbaux d'une visite ─────────────────────────────────────────────
// Un PV par lot et par type ; champs pré-remplis, complétés puis PDF archivé,
// à imprimer et signer à la main.

const PAR_CODE = new Map(TYPES_PV.map(t => [t.code, t]))
const LABEL = { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }
const CHAMP = { width: '100%', minHeight: 44, padding: '0 12px', fontSize: 16, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', boxSizing: 'border-box', color: '#1F1B17', fontFamily: 'inherit' }
const bouton = (fond = 'white', couleur = '#1F1B17') => ({
  minHeight: 40, padding: '0 14px', borderRadius: 3, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  border: fond === 'white' ? '1px solid rgba(0,0,0,0.15)' : 'none', background: fond, color: couleur,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
})
const puce = (actif, couleur = '#1F1B17') => ({
  minHeight: 40, padding: '0 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
  border: `1px solid ${actif ? couleur : 'rgba(0,0,0,0.15)'}`, background: actif ? couleur : 'white', color: actif ? 'white' : '#1F1B17',
})

const LIBELLES = {
  numero_marche: 'Numéro du marché',
  date_avis_achevement: 'Avis d’achèvement du titulaire reçu le',
  titulaire_refus_signature: 'Le titulaire refuse de signer',
  observations: 'Observations',
  lieu: 'Fait à',
  date_pv_opr: 'Date du PV des OPR',
  date_propositions: 'Date des propositions du maître d’œuvre',
  date_effet: 'Date d’effet de la réception (achèvement)',
  delai_levee: 'Réserves à lever avant le',
  motifs: 'Motifs du refus',
  date_reception: 'Date du document',
  nb_exemplaires: 'Nombre d’exemplaires',
}
const DATES = new Set(['date_avis_achevement', 'date_pv_opr', 'date_propositions', 'date_effet', 'delai_levee', 'date_reception'])

function lireMarche(affaireId) {
  try { return localStorage.getItem(`jga-opr-marche-${affaireId}`) ?? 'public' } catch { return 'public' }
}

function PanneauPv({ type, lot, pv, initiaux, onApercu, onEnregistrer, onFermer }) {
  const [champs, setChamps] = useState(() => ({ ...initiaux, ...(pv?.champs ?? {}) }))
  const [occupe, setOccupe] = useState(null)
  const t = PAR_CODE.get(type)
  const set = (cle, valeur) => setChamps(c => ({ ...c, [cle]: valeur }))
  const executer = async (mode, fn) => {
    setOccupe(mode)
    try { await fn(champs) } catch { /* signalé par l'appelant */ }
    setOccupe(null)
  }

  const champ = (cle) => {
    if (cle === 'motifs' && champs.decision !== 'refus') return null
    if (cle === 'delai_levee' && champs.decision === 'refus' && type !== 'levee') return null
    if (cle === 'decision') {
      return (
        <div key={cle}>
          <span style={LABEL}>{type === 'public_propositions' ? 'Proposition' : 'Décision'}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['sans_reserves', 'Réception sans réserve'], ['avec_reserves', 'Avec réserves'], ['refus', 'Réception refusée']].map(([code, libelle]) => (
              <button key={code} type="button" aria-pressed={champs.decision === code} onClick={() => set('decision', code)} style={puce(champs.decision === code, code === 'refus' ? '#B8412C' : '#2A8A4E')}>{libelle}</button>
            ))}
          </div>
        </div>
      )
    }
    if (cle === 'constatations') {
      return (
        <div key={cle}>
          <span style={LABEL}>Constatations</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CONSTATATIONS_OPR.map(c => (
              <div key={c.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'white', padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.06)' }}>
                <span style={{ flex: '1 1 220px', fontSize: 14 }}>{c.libelle}</span>
                {[['oui', 'Oui'], ['non', 'Non'], ['so', 'Sans objet']].map(([code, libelle]) => {
                  const actif = champs.constatations?.[c.cle] === code
                  return (
                    <button key={code} type="button" aria-pressed={actif}
                      onClick={() => set('constatations', { ...champs.constatations, [c.cle]: actif ? undefined : code })}
                      style={puce(actif, code === 'non' ? '#B8412C' : code === 'oui' ? '#2A8A4E' : '#5E5854')}>
                      {libelle}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )
    }
    if (cle === 'titulaire_refus_signature') {
      return (
        <label key={cle} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!champs[cle]} onChange={e => set(cle, e.target.checked)} style={{ width: 20, height: 20, accentColor: '#E8602C' }} />
          {LIBELLES[cle]}
        </label>
      )
    }
    if (cle === 'observations' || cle === 'motifs') {
      return (
        <label key={cle} style={{ display: 'block' }}>
          <span style={LABEL}>{LIBELLES[cle]}</span>
          <textarea value={champs[cle] ?? ''} onChange={e => set(cle, e.target.value)} rows={3} style={{ ...CHAMP, padding: '10px 12px', minHeight: 80, resize: 'vertical' }} />
        </label>
      )
    }
    return (
      <label key={cle} style={{ display: 'block' }}>
        <span style={LABEL}>{LIBELLES[cle]}</span>
        <input type={DATES.has(cle) ? 'date' : cle === 'nb_exemplaires' ? 'number' : 'text'} value={champs[cle] ?? ''} onChange={e => set(cle, e.target.value)}
          style={{ ...CHAMP, ...(DATES.has(cle) || cle === 'nb_exemplaires' ? { maxWidth: 220 } : {}) }} />
      </label>
    )
  }

  return (
    <Panneau
      titre={`${t.court} · ${lot ? libelleLot(lot) : 'Sans lot'}`}
      onFermer={onFermer} occupe={!!occupe}
      pied={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" disabled={!!occupe} onClick={() => executer('apercu', onApercu)} style={bouton()}>
            <Eye size={15} /> {occupe === 'apercu' ? 'Préparation…' : 'Aperçu'}
          </button>
          <button type="button" disabled={!!occupe} onClick={() => executer('enregistrer', onEnregistrer)} style={{ ...bouton('#2A8A4E', 'white'), opacity: occupe ? 0.6 : 1 }}>
            <FileSignature size={15} /> {occupe === 'enregistrer' ? 'Enregistrement…' : 'Enregistrer et générer le PDF'}
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 12, color: '#5E5854' }}>{t.titre}{t.reference ? ` — ${t.reference}` : ''}. Le PDF est à imprimer et à signer à la main.</p>
      {CHAMPS_PAR_TYPE[type].map(champ)}
    </Panneau>
  )
}

export function ProcesVerbaux({ visite, affaire, opr, lectureSeuleAffaire, signalerErreur }) {
  const [marche, setMarcheBrut] = useState(() => lireMarche(affaire?.id))
  const [edition, setEdition] = useState(null) // { type, lotId }
  if (opr.pvs === null) {
    return <p style={{ fontSize: 13, color: '#5E5854' }}>Les procès-verbaux demandent la migration 046 dans Supabase.</p>
  }
  const setMarche = (m) => {
    setMarcheBrut(m)
    try { localStorage.setItem(`jga-opr-marche-${affaire?.id}`, m) } catch { /* navigation privée */ }
  }

  const types = typesPvPourVisite(visite, marche)
  const lots = opr.lots.filter(l => (visite.lot_ids ?? []).length === 0 || visite.lot_ids.includes(l.id))
  const entrepriseDe = (lotId) => opr.lotEntreprises.find(le => le.lot_id === lotId)?.entreprises ?? null
  const pvDe = (lotId, type) => opr.pvs.find(p => p.visite_id === visite.id && p.lot_id === lotId && p.type === type)

  const fabriquer = (type, lotId, champs) => genererPv({
    type, affaire, lot: opr.lots.find(l => l.id === lotId), entreprise: entrepriseDe(lotId), visite, reserves: opr.reserves, champs,
  })

  const apercu = async (type, lotId, champs) => {
    const fenetre = window.open('', '_blank')
    fenetre?.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#5E5854">Préparation du PV…</p>')
    try {
      const { blob, nomFichier } = await fabriquer(type, lotId, champs)
      if (fenetre) fenetre.location.href = URL.createObjectURL(blob)
      else telechargerBlob(blob, nomFichier)
    } catch (err) { fenetre?.close(); signalerErreur(err); throw err }
  }

  const enregistrer = async (type, lotId, champs) => {
    try {
      const pv = await opr.enregistrerPv({ visite, lotId, type, champs })
      const { blob, nomFichier } = await fabriquer(type, lotId, champs)
      await opr.archiverPv(pv, blob)
      telechargerBlob(blob, nomFichier)
      setEdition(null)
    } catch (err) { signalerErreur(err); throw err }
  }

  const telecharger = async (pv) => {
    const fenetre = window.open('', '_blank')
    try {
      const url = await lienArchive(pv.chemin)
      if (fenetre) fenetre.location.href = url
      else window.location.assign(url)
    } catch (err) { fenetre?.close(); signalerErreur(err) }
  }

  return (
    <div>
      {visite.type === 'opr' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#5E5854' }}>Type de marché de l’affaire :</span>
          {[['public', 'Marché public'], ['prive', 'Marché privé']].map(([code, libelle]) => (
            <button key={code} type="button" aria-pressed={marche === code} onClick={() => setMarche(code)} style={puce(marche === code)}>{libelle}</button>
          ))}
        </div>
      )}
      {lots.length === 0 && <p style={{ fontSize: 13, color: '#5E5854' }}>Aucun lot concerné par cette visite.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lots.map(l => (
          <div key={l.id} style={{ border: '0.5px solid rgba(0,0,0,0.08)', padding: '10px 12px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {libelleLot(l)} <span style={{ fontWeight: 400, color: '#9C9591' }}>· {entrepriseDe(l.id)?.raison_sociale ?? 'entreprise non renseignée'}</span>
            </p>
            {types.map(t => {
              const pv = pvDe(l.id, t.code)
              return (
                <div key={t.code} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0' }}>
                  <span style={{ flex: '1 1 220px', fontSize: 13 }}>
                    {t.court}
                    {pv?.genere_le
                      ? <span style={{ color: '#2A8A4E', marginLeft: 8, fontSize: 12 }}><Check size={12} style={{ verticalAlign: -2 }} /> PDF généré le {new Date(pv.genere_le).toLocaleDateString('fr-FR')}</span>
                      : <span style={{ color: '#9C9591', marginLeft: 8, fontSize: 12 }}>non établi</span>}
                  </span>
                  {pv?.chemin && <button type="button" onClick={() => telecharger(pv)} style={bouton()}><FileDown size={14} /> PDF</button>}
                  {!lectureSeuleAffaire && (
                    <button type="button" onClick={() => setEdition({ type: t.code, lotId: l.id })} style={bouton(pv ? 'white' : '#1F1B17', pv ? '#1F1B17' : 'white')}>
                      <FileSignature size={14} /> {pv ? 'Modifier' : 'Établir'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {edition && (
        <PanneauPv
          type={edition.type}
          lot={opr.lots.find(l => l.id === edition.lotId)}
          pv={pvDe(edition.lotId, edition.type)}
          initiaux={champsInitiaux(edition.type, { visite, pvs: opr.pvs, reserves: opr.reserves, lotId: edition.lotId })}
          onApercu={(champs) => apercu(edition.type, edition.lotId, champs)}
          onEnregistrer={(champs) => enregistrer(edition.type, edition.lotId, champs)}
          onFermer={() => setEdition(null)}
        />
      )}
    </div>
  )
}
