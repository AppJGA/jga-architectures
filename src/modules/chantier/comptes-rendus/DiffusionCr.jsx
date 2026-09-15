import { useState, useEffect, useMemo } from 'react'
import { Send, Mail, Copy, Check, Users, Building2 } from 'lucide-react'
import { useCr } from './CrContexte'
import {
  participantsAvecEmail, selectionParDefaut, entreprisesDiffusion, dateExpiration, texteEmail, lienMailto,
  texteACopier, MAILTO_MAX, DUREE_LIEN_JOURS,
} from './diffusionLogique'
import { lienArchive, diffusionsDuCr, noterDiffusion } from './rapportStockage'

/** Diffusion d'un compte rendu */
export function DiffusionCr({ cr, affaire, presences, lots, archives, onPreparerVersion, signataire }) {
  return (
    <DiffusionDocument
      cleDocument={cr.id} presences={presences} lots={lots}
      archiveEmission={(archives ?? []).find(a => !a.destinataire)}
      optionGenerales
      texte={(options) => texteEmail({ cr, affaire, signataire, ...options })}
      preparerVersion={onPreparerVersion}
      chargerDiffusions={() => diffusionsDuCr(cr.id)}
      noter={(ligne) => noterDiffusion({ affaire_id: affaire.id, cr_id: cr.id, ...ligne })}
    />
  )
}

// ─── Diffuser le compte rendu par la messagerie ──────────────────────────────
// « Préparer » fabrique le lien de téléchargement (30 jours), puis « Ouvrir
// l'e-mail » ouvre la messagerie de l'utilisateur, texte et adresses remplis.
// Deux clics : ouverte automatiquement après une attente, la messagerie serait
// bloquée par certains navigateurs.

function fmtHorodatage(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function BoutonsEmail({ adresses, copieCachee, objet, corps, onOuvert }) {
  const [copie, setCopie] = useState(false)
  const lien = lienMailto({ adresses, copieCachee, objet, corps })
  const tropLong = lien.length > MAILTO_MAX
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texteACopier({ adresses, copieCachee, objet, corps }))
      setCopie(true)
      setTimeout(() => setCopie(false), 2500)
      onOuvert()
    } catch { /* presse-papiers refusé : le texte reste sélectionnable à l'écran */ }
  }
  const style = (principal) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', minHeight: 36, borderRadius: 2, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', textDecoration: 'none', border: principal ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
    background: principal ? '#2A8A4E' : 'white', color: principal ? 'white' : '#1F1B17',
  })
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <a href={lien} onClick={onOuvert} style={style(!tropLong)}><Mail size={14} /> Ouvrir l’e-mail</a>
      <button type="button" onClick={copier} style={style(tropLong)}>
        {copie ? <Check size={14} /> : <Copy size={14} />} {copie ? 'Copié' : 'Copier le texte et les adresses'}
      </button>
      {tropLong && <span style={{ fontSize: 11, color: '#B8412C' }}>E-mail long : certaines messageries le tronquent, préférez la copie.</span>}
    </div>
  )
}

/**
 * Diffusion d'un document archivé (compte rendu, visite OPR).
 * @param archiveEmission archive du document complet
 * @param texte ({ versionPour, lien, expiration }) → { objet, corps }
 * @param preparerVersion (destinataire, inclureGenerales) → archive de la version
 * @param chargerDiffusions () → lignes, ou null si la table manque
 * @param noter (ligne) → enregistre un e-mail préparé
 */
export function DiffusionDocument({ cleDocument, presences, lots, archiveEmission, optionGenerales = false, texte, preparerVersion, chargerDiffusions, noter: noterLigne }) {
  const { signalerErreur } = useCr()
  const participants = useMemo(() => participantsAvecEmail(presences), [presences])
  const entreprises = useMemo(() => entreprisesDiffusion(presences, lots), [presences, lots])
  const [mode, setMode] = useState('tous')
  const [selection, setSelection] = useState(() => selectionParDefaut(participants))
  const [copieCachee, setCopieCachee] = useState(true)
  const [inclureGenerales, setInclureGenerales] = useState(true)
  const [emailTous, setEmailTous] = useState(null)   // { objet, corps, archiveId }
  const [emailsLots, setEmailsLots] = useState({})    // destinataire → { objet, corps, archiveId }
  const [enCours, setEnCours] = useState(null)
  const [diffusions, setDiffusions] = useState(undefined)
  const [versionHistorique, setVersionHistorique] = useState(0)

  useEffect(() => {
    let abandon = false
    chargerDiffusions().then(d => { if (!abandon) setDiffusions(d) }).catch(err => { console.warn('Diffusions :', err); if (!abandon) setDiffusions([]) })
    return () => { abandon = true }
  }, [cleDocument, versionHistorique]) // eslint-disable-line react-hooks/exhaustive-deps

  if (diffusions === undefined) return null
  if (diffusions === null) {
    return <p style={{ fontSize: 12, color: '#5E5854' }}>La diffusion par e-mail demande une migration à passer dans Supabase.</p>
  }

  const adresses = participants.filter(x => selection.has(x.id)).map(x => x.email)
  const expiration = dateExpiration()

  const lienMail = async (chemin) => lienArchive(chemin, DUREE_LIEN_JOURS * 24 * 3600)

  const preparerTous = async () => {
    if (!archiveEmission) {
      signalerErreur(new Error('Aucun PDF archivé pour cette émission : utilisez d’abord « Archiver maintenant ».'))
      return
    }
    setEnCours('tous')
    try {
      const lien = await lienMail(archiveEmission.chemin)
      setEmailTous({ ...texte({ lien, expiration }), archiveId: archiveEmission.id })
    } catch (err) { signalerErreur(err) }
    setEnCours(null)
  }

  const preparerLot = async (e) => {
    setEnCours(e.destinataire)
    try {
      const archive = await preparerVersion(e.destinataire, inclureGenerales)
      const lien = await lienMail(archive.chemin)
      setEmailsLots(m => ({ ...m, [e.destinataire]: { ...texte({ versionPour: e.libelle, lien, expiration }), archiveId: archive.id } }))
    } catch (err) { signalerErreur(err) }
    setEnCours(null)
  }

  const noter = (ligne) => {
    noterLigne(ligne)
      .then(() => setVersionHistorique(v => v + 1))
      .catch(err => console.warn('Diffusions :', err))
  }

  const basculer = (id) => setSelection(s => {
    const suivante = new Set(s)
    if (suivante.has(id)) suivante.delete(id)
    else suivante.add(id)
    return suivante
  })
  const selectionner = (filtre) => setSelection(new Set(participants.filter(filtre).map(x => x.id)))

  const onglet = (actif) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
    border: 'none', borderBottom: `2px solid ${actif ? '#E8602C' : 'transparent'}`, background: 'none',
    color: actif ? '#1F1B17' : '#9C9591', fontWeight: actif ? 600 : 400,
  })
  const petitBouton = { padding: '4px 10px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, background: 'white', cursor: 'pointer' }
  const champ = { width: '100%', padding: '8px 10px', fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 12 }}>
        <button type="button" onClick={() => setMode('tous')} style={onglet(mode === 'tous')}><Users size={14} /> Un e-mail à tous</button>
        <button type="button" onClick={() => setMode('entreprise')} style={onglet(mode === 'entreprise')}><Building2 size={14} /> Un e-mail par entreprise</button>
      </div>

      {mode === 'tous' && (
        <>
          {participants.length === 0 ? (
            <p style={{ fontSize: 12, color: '#5E5854' }}>Aucun participant n’a d’adresse e-mail dans la feuille de présence.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#9C9591', marginRight: 4 }}>{adresses.length} / {participants.length} destinataire{participants.length > 1 ? 's' : ''}</span>
                <button type="button" style={petitBouton} onClick={() => selectionner(() => true)}>Tous</button>
                <button type="button" style={petitBouton} onClick={() => selectionner(x => x.present)}>Présents</button>
                <button type="button" style={petitBouton} onClick={() => selectionner(x => x.convoque)}>Convoqués</button>
                <button type="button" style={petitBouton} onClick={() => setSelection(new Set())}>Aucun</button>
              </div>
              <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, maxHeight: 220, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.08)' }}>
                {participants.map(x => (
                  <li key={x.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
                      <input type="checkbox" checked={selection.has(x.id)} onChange={() => basculer(x.id)} style={{ accentColor: '#E8602C' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontWeight: 500 }}>{x.nom}</strong>
                        {x.detail && <span style={{ color: '#9C9591' }}> · {x.detail}</span>}
                        <span style={{ display: 'block', color: '#5E5854', fontSize: 11 }}>{x.email}</span>
                      </span>
                      {x.present && <span style={{ fontSize: 10, color: '#2A8A4E' }}>présent</span>}
                      {x.convoque && <span style={{ fontSize: 10, color: '#1B3A5C' }}>convoqué</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={copieCachee} onChange={e => setCopieCachee(e.target.checked)} style={{ accentColor: '#E8602C' }} />
                Destinataires en copie cachée (chacun ne voit pas les autres adresses)
              </label>
              {!emailTous ? (
                <div>
                  <button type="button" onClick={preparerTous} disabled={enCours === 'tous' || adresses.length === 0}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 2, background: '#E8602C', color: 'white', cursor: 'pointer', opacity: enCours === 'tous' || adresses.length === 0 ? 0.6 : 1 }}>
                    <Send size={14} /> {enCours === 'tous' ? 'Préparation…' : 'Préparer l’e-mail'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={emailTous.objet} onChange={e => setEmailTous(m => ({ ...m, objet: e.target.value }))} aria-label="Objet" style={champ} />
                  <textarea value={emailTous.corps} onChange={e => setEmailTous(m => ({ ...m, corps: e.target.value }))} aria-label="Texte de l’e-mail" rows={11} style={{ ...champ, resize: 'vertical', lineHeight: 1.45 }} />
                  <BoutonsEmail adresses={adresses} copieCachee={copieCachee} objet={emailTous.objet} corps={emailTous.corps}
                    onOuvert={() => noter({ archive_id: emailTous.archiveId, mode: 'tous', libelle: 'À tous', adresses, objet: emailTous.objet })} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {mode === 'entreprise' && (
        <>
          {optionGenerales && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={inclureGenerales} onChange={e => { setInclureGenerales(e.target.checked); setEmailsLots({}) }} style={{ accentColor: '#E8602C' }} />
              Inclure les remarques générales (sans destinataire) dans chaque version
            </label>
          )}
          {entreprises.length === 0 && <p style={{ fontSize: 12, color: '#5E5854' }}>Aucune entreprise de la feuille de présence n’est rattachée à un lot.</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {entreprises.map(e => {
              const pret = emailsLots[e.destinataire]
              const deja = diffusions.find(d => d.destinataire === e.destinataire)
              return (
                <li key={e.destinataire} style={{ padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>{e.libelle}</p>
                      <p style={{ fontSize: 11, color: '#5E5854' }}>
                        {e.entreprises.join(', ')}{e.adresses.length > 0 ? ` · ${e.adresses.join(', ')}` : ''}
                      </p>
                      {deja && <p style={{ fontSize: 10, color: '#2A8A4E' }}>Préparé le {fmtHorodatage(deja.prepare_le)}</p>}
                    </div>
                    {e.adresses.length === 0 ? (
                      <span style={{ fontSize: 11, color: '#B8412C' }}>Pas d’adresse e-mail</span>
                    ) : !pret && (
                      <button type="button" onClick={() => preparerLot(e)} disabled={!!enCours} style={{ ...petitBouton, padding: '6px 12px', fontSize: 12, opacity: enCours ? 0.6 : 1 }}>
                        {enCours === e.destinataire ? 'Préparation du PDF…' : 'Préparer'}
                      </button>
                    )}
                  </div>
                  {pret && (
                    <div style={{ marginTop: 8 }}>
                      <BoutonsEmail adresses={e.adresses} copieCachee={false} objet={pret.objet} corps={pret.corps}
                        onOuvert={() => noter({ archive_id: pret.archiveId, mode: 'entreprise', destinataire: e.destinataire, libelle: e.libelle, adresses: e.adresses, objet: pret.objet })} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {diffusions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>E-mails préparés</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {diffusions.map(d => (
              <li key={d.id} style={{ fontSize: 12, color: '#5E5854', padding: '3px 0' }}>
                {fmtHorodatage(d.prepare_le)} — {d.libelle ?? (d.mode === 'tous' ? 'À tous' : d.destinataire)} ({d.adresses.length} adresse{d.adresses.length > 1 ? 's' : ''})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
