import { useState, useEffect, useContext } from 'react'
import { X, Camera, Images, Star, Check, RotateCcw } from 'lucide-react'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { STATUTS, FAMILLES_STATUT, STATUT_PAR_DEFAUT, statutNormalise, affichagePresence } from './crLogique'
import { suggestionsTypes, echeanceRapide, ajouterDictee, normaliserTexte } from './visiteLogique'
import { BoutonDictee } from './BoutonDictee'
import { BoutonSupprimer } from './BoutonSupprimer'
import { AnnotationPhoto } from './AnnotationPhoto'
import { compresserPhoto } from './compressionPhoto'
import { PhotosContexte } from './usePhotosRemarque'

// ─── Panneaux du mode Visite ─────────────────────────────────────────────────
// Ancrés en haut de l'écran et non en bas : sur iPad, le clavier recouvrirait
// un panneau posé au bas de la page.

const PAR_CODE = new Map(STATUTS.map(st => [st.code, st]))
const LABEL = { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }
const CHAMP = { width: '100%', minHeight: 44, padding: '0 12px', fontSize: 16, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', boxSizing: 'border-box', color: '#1F1B17' }

function puce(actif, couleur = '#1F1B17') {
  return {
    minHeight: 44, padding: '0 14px', borderRadius: 22, fontSize: 14, cursor: 'pointer',
    border: `1px solid ${actif ? couleur : 'rgba(0,0,0,0.15)'}`,
    background: actif ? couleur : 'white', color: actif ? 'white' : '#1F1B17', fontWeight: actif ? 600 : 400,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }
}

export function Panneau({ titre, onFermer, occupe = false, children, pied }) {
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !occupe) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, occupe])

  return (
    <div onClick={occupe ? undefined : onFermer} style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(20,18,16,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '16px 16px 0' }}>
      <div role="dialog" aria-modal="true" aria-label={titre} onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 720, maxHeight: 'calc(100dvh - 32px)', background: '#FAF7F2', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h3 style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#1F1B17', margin: 0 }}>{titre}</h3>
          <button type="button" onClick={onFermer} disabled={occupe} aria-label="Fermer" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#F1EFE8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {children}
        </div>
        {pied && <div style={{ padding: '12px 16px', background: 'white', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>{pied}</div>}
      </div>
    </div>
  )
}

// Emplacements où créer une remarque : section (remarque directe) ou sous-section
function emplacements(sections) {
  return sections.flatMap(s => [
    { valeur: `sec:${s.id}`, libelle: `${s.numero_romain} — ${s.titre}`, type: s.type_section ?? 'general', sectionId: s.id },
    ...(s.sousSections ?? []).map(ss => ({ valeur: `ss:${ss.id}`, libelle: `${s.numero_romain}.${ss.code} — ${ss.titre}`, type: s.type_section ?? 'general', sectionId: s.id, sousSectionId: ss.id })),
  ])
}

function lireMemoire(cle) {
  try { return localStorage.getItem(cle) } catch { return null }
}
function ecrireMemoire(cle, valeur) {
  try { localStorage.setItem(cle, valeur) } catch { /* navigation privée */ }
}

// ─── Nouvelle remarque / modifier ────────────────────────────────────────────

export function PanneauRemarque({ remarque, cr, sections, lots, interlocuteurs, zones = [], typesAgence, onEnregistrer, onFermer, signalerErreur }) {
  const modification = !!remarque
  const cleMemoire = `jga-visite-emplacement-${cr.id}`
  const liste = emplacements(sections)
  const [emplacement, setEmplacement] = useState(() => {
    const memo = lireMemoire(cleMemoire)
    return liste.some(e => e.valeur === memo) ? memo : (liste[0]?.valeur ?? 'nouvelle')
  })
  const [description, setDescription] = useState(remarque?.description ?? '')
  const [pour, setPour] = useState(remarque?.pour ?? '')
  const [statut, setStatut] = useState(remarque ? statutNormalise(remarque) : STATUT_PAR_DEFAUT)
  const [echeance, setEcheance] = useState(remarque?.date_echeance ?? '')
  const [zoneId, setZoneId] = useState(remarque?.zone_id ?? '')
  const [destinataire, setDestinataire] = useState(remarque?.lot_id ? `lot:${remarque.lot_id}` : remarque?.interlocuteur_id ? `interlo:${remarque.interlocuteur_id}` : '')
  const [important, setImportant] = useState(!!remarque?.est_important)
  const [commeType, setCommeType] = useState(false)
  const [gererTypes, setGererTypes] = useState(false)
  const [photos, setPhotos] = useState([]) // { compression, url }
  const [annotation, setAnnotation] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const { espacePlein } = useContext(PhotosContexte)

  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const place = liste.find(e => e.valeur === emplacement)
  const typeSection = modification
    ? (sections.find(s => s.id === remarque.section_id)?.type_section ?? 'general')
    : (place?.type ?? 'general')
  const suggestions = typesAgence.disponible ? suggestionsTypes(typesAgence.types, description) : []

  const ajouterCompression = (compression) => setPhotos(ps => [...ps, { compression, url: URL.createObjectURL(compression.miniature.blob) }])

  const choisirPhotos = async (fichiers) => {
    if (espacePlein) { signalerErreur(new Error('L’espace de stockage gratuit est presque plein.')); return }
    try {
      for (const f of fichiers) ajouterCompression(await compresserPhoto(f))
    } catch (err) { signalerErreur(err) }
  }

  const enregistrer = async () => {
    const texte = normaliserTexte(description)
    if (!texte) return
    setOccupe(true)
    try {
      const payload = {
        description: texte, pour: pour.trim() || null, statut, est_clos: PAR_CODE.get(statut).clos,
        date_echeance: echeance || null, est_important: important,
        ...(zones.length > 0 && { zone_id: zoneId || null }),
        lot_id: typeSection === 'interlocuteurs' && destinataire.startsWith('lot:') ? destinataire.slice(4) : null,
        interlocuteur_id: typeSection === 'interlocuteurs' && destinataire.startsWith('interlo:') ? destinataire.slice(8) : null,
      }
      if (!modification) {
        payload.date_note = cr.date_reunion
        payload.est_nouveau = true
        ecrireMemoire(cleMemoire, emplacement)
      }
      await onEnregistrer(payload, { emplacement: place ?? null, compressions: photos.map(p => p.compression), commeType })
      onFermer()
    } catch { /* signalé dans le bandeau */ }
    setOccupe(false)
  }

  return (
    <Panneau
      titre={modification ? `Modifier la remarque${remarque.numero != null ? ` n°${remarque.numero}` : ''}` : 'Nouvelle remarque'}
      onFermer={onFermer} occupe={occupe}
      pied={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onFermer} disabled={occupe} style={{ ...puce(false), borderRadius: 3 }}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={occupe || !normaliserTexte(description)}
            style={{ ...puce(true, '#2A8A4E'), borderRadius: 3, padding: '0 22px', opacity: occupe || !normaliserTexte(description) ? 0.6 : 1 }}>
            {occupe ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      }
    >
      {!modification && (
        <div>
          <label style={LABEL} htmlFor="visite-emplacement">Section</label>
          <select id="visite-emplacement" value={emplacement} onChange={e => setEmplacement(e.target.value)} style={CHAMP}>
            {liste.length === 0 && <option value="nouvelle">Observations générales (nouvelle section)</option>}
            {liste.map(e => <option key={e.valeur} value={e.valeur}>{e.libelle}</option>)}
          </select>
        </div>
      )}

      {zones.length > 0 && (
        <div>
          <span style={LABEL}>Zone</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={() => setZoneId('')} style={puce(!zoneId)}>Sans zone</button>
            {zones.map(z => (
              <button key={z.id} type="button" onClick={() => setZoneId(z.id)} style={puce(zoneId === z.id, '#1B3A5C')}>{z.nom}</button>
            ))}
          </div>
        </div>
      )}

      {typeSection === 'interlocuteurs' && (lots.length > 0 || interlocuteurs.length > 0) && (
        <div>
          <span style={LABEL}>Destinataire</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={() => setDestinataire('')} style={puce(!destinataire)}>Aucun</button>
            {lots.map(l => (
              <button key={l.id} type="button" onClick={() => setDestinataire(`lot:${l.id}`)} style={puce(destinataire === `lot:${l.id}`, '#2A8A4E')}>
                {l.numero ? `Lot ${l.numero}` : l.nom}
              </button>
            ))}
            {interlocuteurs.map(i => (
              <button key={i.id} type="button" onClick={() => setDestinataire(`interlo:${i.id}`)} style={puce(destinataire === `interlo:${i.id}`, '#993C1D')}>
                {[i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation}
                <span style={{ fontSize: 11, opacity: 0.7 }}>{CATEGORIE_META[i.categorie]?.label ?? ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label style={LABEL} htmlFor="visite-texte">Remarque</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            id="visite-texte" autoFocus={!modification} value={description} rows={3}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ce qui a été constaté, ce qu’il faut faire…"
            style={{ ...CHAMP, padding: '10px 12px', minHeight: 96, resize: 'vertical', lineHeight: 1.4, fontFamily: 'inherit' }}
          />
          <BoutonDictee onTexte={t => setDescription(d => ajouterDictee(d, t))} onErreur={m => signalerErreur(new Error(m))} />
        </div>
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {suggestions.map(t => (
              <button key={t.id} type="button"
                onClick={() => { setDescription(t.texte); typesAgence.utiliser(t.id) }}
                style={{ minHeight: 40, padding: '6px 12px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px dashed rgba(232,96,44,0.6)', background: 'rgba(232,96,44,0.06)', color: '#1F1B17', textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Star size={12} color="#E8602C" /> {t.texte}
              </button>
            ))}
          </div>
        )}
        {typesAgence.disponible && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={commeType} onChange={e => setCommeType(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#E8602C' }} />
              Enregistrer comme remarque type
            </label>
            {typesAgence.types.length > 0 && (
              <button type="button" onClick={() => setGererTypes(g => !g)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: '#1B3A5C', textDecoration: 'underline', cursor: 'pointer' }}>
                {gererTypes ? 'Masquer les remarques types' : `Gérer les remarques types (${typesAgence.types.length})`}
              </button>
            )}
          </div>
        )}
        {gererTypes && (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            {typesAgence.types.map(t => (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: 13 }}>
                <span style={{ flex: 1 }}>{t.texte}</span>
                <span style={{ fontSize: 11, color: '#9C9591' }}>{t.utilisations}×</span>
                <BoutonSupprimer taille={14} onConfirm={() => typesAgence.supprimer(t.id).catch(signalerErreur)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <span style={LABEL}>Statut</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STATUTS.map(st => (
            <button key={st.code} type="button" aria-pressed={statut === st.code} onClick={() => setStatut(st.code)} style={puce(statut === st.code, st.couleur)}>
              {st.libelle}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
        <div>
          <span style={LABEL}>Pour le</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setEcheance('')} style={puce(!echeance)}>Aucune</button>
            <button type="button" onClick={() => setEcheance(echeanceRapide(cr.date_reunion, 1))} style={puce(echeance === echeanceRapide(cr.date_reunion, 1))}>+1 sem.</button>
            <button type="button" onClick={() => setEcheance(echeanceRapide(cr.date_reunion, 2))} style={puce(echeance === echeanceRapide(cr.date_reunion, 2))}>+2 sem.</button>
            <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} aria-label="Date d’échéance" style={{ ...CHAMP, width: 170 }} />
          </div>
        </div>
        <div>
          <label style={LABEL} htmlFor="visite-pour">Pour (initiales)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input id="visite-pour" value={pour} onChange={e => setPour(e.target.value)} placeholder="SAR, JAC…" style={{ ...CHAMP, width: 120 }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#E8602C' }} />
              Important
            </label>
          </div>
        </div>
      </div>

      {!modification && (
        <div>
          <span style={LABEL}>Photos</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {photos.map((p, i) => (
              <div key={p.url} style={{ position: 'relative', width: 72, height: 72 }}>
                <img src={p.url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button type="button" aria-label="Retirer la photo" onClick={() => { URL.revokeObjectURL(p.url); setPhotos(ps => ps.filter(x => x !== p)) }}
                  style={{ position: 'absolute', top: -8, right: -8, width: 28, height: 28, minHeight: 28, minWidth: 28, borderRadius: '50%', border: 'none', background: '#1F1B17', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-compact>
                  <X size={14} />
                </button>
              </div>
            ))}
            <label style={{ ...puce(false), borderRadius: 3, cursor: 'pointer' }}>
              <Camera size={18} /> Prendre
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setAnnotation(f) }} />
            </label>
            <label style={{ ...puce(false), borderRadius: 3, cursor: 'pointer' }}>
              <Images size={18} /> Galerie
              <input type="file" accept="image/*" multiple hidden
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; choisirPhotos(f) }} />
            </label>
          </div>
        </div>
      )}

      {annotation && (
        <AnnotationPhoto
          source={annotation}
          onValider={async canvas => {
            try { ajouterCompression(await compresserPhoto(canvas)) } catch (err) { signalerErreur(err) }
            setAnnotation(null)
          }}
          onAnnuler={() => setAnnotation(null)}
        />
      )}
    </Panneau>
  )
}

// ─── Suivis d'une remarque ───────────────────────────────────────────────────

export function PanneauSuivi({ remarque, cr, lectureSeule, ops, onFermer, signalerErreur }) {
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const suivis = remarque.sous_remarques ?? []

  const ajouter = async () => {
    const propre = normaliserTexte(texte)
    if (!propre) return
    setOccupe(true)
    try {
      await ops.addSousRemarque(remarque.id, { date_note: cr.date_reunion, description: propre, est_nouveau: true, est_clos: false, est_important: false })
      setTexte('')
    } catch { /* signalé dans le bandeau */ }
    setOccupe(false)
  }

  return (
    <Panneau titre={`Suivi${remarque.numero != null ? ` · n°${remarque.numero}` : ''}`} onFermer={onFermer} occupe={occupe}>
      <p style={{ fontSize: 15, color: '#1F1B17' }}>{remarque.description}</p>
      {suivis.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
          {suivis.map(sr => (
            <li key={sr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#9C9591', minWidth: 44 }}>
                {sr.date_note ? new Date(sr.date_note + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—'}
              </span>
              <span style={{ flex: 1, fontSize: 14, textDecoration: sr.est_clos ? 'line-through' : 'none', color: sr.est_clos ? '#9CA3AF' : '#1F1B17' }}>{sr.description}</span>
              {!lectureSeule && (
                <button type="button" onClick={() => ops.updateRemarque(sr.id, { est_clos: !sr.est_clos }).catch(() => {})}
                  aria-label={sr.est_clos ? 'Rouvrir le suivi' : 'Clore le suivi'}
                  style={{ ...puce(sr.est_clos, '#2A8A4E'), padding: '0 12px' }}>
                  {sr.est_clos ? <RotateCcw size={16} /> : <Check size={16} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!lectureSeule && (
        <div>
          <label style={LABEL} htmlFor="visite-suivi">Nouveau suivi</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea id="visite-suivi" autoFocus value={texte} onChange={e => setTexte(e.target.value)} rows={2}
              placeholder="Constat du jour…" style={{ ...CHAMP, padding: '10px 12px', minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            <BoutonDictee onTexte={t => setTexte(x => ajouterDictee(x, t))} onErreur={m => signalerErreur(new Error(m))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={ajouter} disabled={occupe || !normaliserTexte(texte)}
              style={{ ...puce(true, '#E8602C'), borderRadius: 3, opacity: occupe || !normaliserTexte(texte) ? 0.6 : 1 }}>
              {occupe ? 'Enregistrement…' : 'Ajouter le suivi'}
            </button>
          </div>
        </div>
      )}
    </Panneau>
  )
}

// ─── Présences ───────────────────────────────────────────────────────────────

const CODES_PRESENCE = [
  { id: 'p', libelle: 'Présent', couleur: '#2A8A4E' },
  { id: 'r', libelle: 'Retard', couleur: '#E8602C' },
  { id: 'a', libelle: 'Absent', couleur: '#B8412C' },
  { id: 'e', libelle: 'Excusé', couleur: '#5E5854' },
]

export function PanneauPresences({ presences, setPresence, lectureSeule, onFermer, signalerErreur }) {
  const lignes = presences.map(p => ({ p, v: affichagePresence(p) })).filter(l => l.v.type)
    .sort((a, b) => (a.v.type === b.v.type ? 0 : a.v.type === 'interlocuteur' ? -1 : 1)
      || (a.v.type === 'interlocuteur' ? a.v.ordre - b.v.ordre : (a.v.lotNumero ?? 99) - (b.v.lotNumero ?? 99)))

  return (
    <Panneau titre="Présences" onFermer={onFermer}>
      {lignes.length === 0 && <p style={{ fontSize: 14, color: '#5E5854' }}>Aucun participant pour cette affaire.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lignes.map(({ p, v }) => (
          <li key={p.id} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>
                {v.type === 'entreprise' ? (v.entreprise ?? '—') : (v.nom || '—')}
              </p>
              <p style={{ fontSize: 12, color: '#9C9591' }}>
                {v.type === 'entreprise'
                  ? [v.lotNom && `Lot ${v.lotNumero ?? ''} — ${v.lotNom}`, v.contact].filter(Boolean).join(' · ')
                  : [v.categorieLabel || CATEGORIE_META[v.categorie]?.label, v.organisation].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {CODES_PRESENCE.map(c => {
                const actif = p.presence === c.id
                return (
                  <button key={c.id} type="button" disabled={lectureSeule} aria-pressed={actif} title={c.libelle}
                    onClick={() => setPresence(p.id, actif ? 'na' : c.id).catch(signalerErreur)}
                    style={{ width: 48, height: 48, borderRadius: '50%', fontSize: 15, fontWeight: 700, cursor: lectureSeule ? 'default' : 'pointer', border: actif ? 'none' : '1px solid rgba(0,0,0,0.15)', background: actif ? c.couleur : 'white', color: actif ? 'white' : '#9C9591', opacity: lectureSeule && !actif ? 0.4 : 1 }}>
                    {c.libelle[0]}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </Panneau>
  )
}

// ─── Tous les statuts ────────────────────────────────────────────────────────

export function PanneauStatuts({ remarque, onChoisir, onFermer }) {
  const actuel = statutNormalise(remarque)
  return (
    <Panneau titre={`Statut${remarque.numero != null ? ` · n°${remarque.numero}` : ''}`} onFermer={onFermer}>
      {FAMILLES_STATUT.map(f => (
        <div key={f.id}>
          <span style={{ ...LABEL, color: f.couleur }}>{f.libelle}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STATUTS.filter(st => st.famille === f.id).map(st => (
              <button key={st.code} type="button" aria-pressed={actuel === st.code}
                onClick={() => { onChoisir(st.code); onFermer() }}
                style={{ ...puce(actuel === st.code, st.couleur), minWidth: 140, justifyContent: 'center' }}>
                {st.libelle}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Panneau>
  )
}
