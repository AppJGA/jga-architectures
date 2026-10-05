import { useState, useEffect, useContext } from 'react'
import { X, Camera, Images } from 'lucide-react'
import { CATEGORIE_META } from '../../../shared/hooks/useAffaireInterlocuteurs'
import { STATUTS, FAMILLES_STATUT, STATUT_PAR_DEFAUT, statutNormalise, affichagePresence, infosStatut, peutModifierRemarque, miseEnForme, champsMiseEnForme, COULEUR_SURLIGNE } from './crLogique'
import { useCr } from './CrContexte'
import { choixDestinataires, destinataireParDefaut, cleDestinataire, champsDestinataire } from './remarquesLogique'
import { echeanceRapide, ajouterDictee, normaliserTexte } from './visiteLogique'
import { BoutonDictee } from './BoutonDictee'
import { AnnotationPhoto } from './AnnotationPhoto'
import { compresserPhoto } from './compressionPhoto'
import { PhotosContexte } from './usePhotosRemarque'
import { avancementParLot, avancementGlobal, infosEcart, lignesAvancement } from './avancementLogique'
import { MentionConvocation } from './MentionConvocation'
import { convocationDe } from './convocationLogique'

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
    <div onClick={occupe ? undefined : onFermer} style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(20,18,16,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 'calc(16px + env(safe-area-inset-top)) 16px 0' }}>
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

function lireMemoire(cle) {
  try { return localStorage.getItem(cle) } catch { return null }
}
function ecrireMemoire(cle, valeur) {
  try { localStorage.setItem(cle, valeur) } catch { /* navigation privée */ }
}

// Statut en menu déroulant, rangé par famille de couleur : huit boutons
// prenaient deux lignes du panneau
function MenuStatut({ id, label, valeur, onChange }) {
  const st = PAR_CODE.get(valeur)
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <label style={LABEL} htmlFor={id}>{label}</label>
      <select id={id} value={valeur} onChange={e => onChange(e.target.value)}
        style={{ ...CHAMP, cursor: 'pointer', color: st?.couleur, fontWeight: 600, borderColor: st?.couleur ?? 'rgba(0,0,0,0.15)' }}>
        {FAMILLES_STATUT.map(f => (
          <optgroup key={f.id} label={f.libelle}>
            {STATUTS.filter(x => x.famille === f.id).map(x => <option key={x.code} value={x.code}>{x.libelle}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

// ─── Nouvelle remarque / modifier ────────────────────────────────────────────

// Choix du destinataire : deux menus déroulants, les entreprises (partie VII)
// et l'équipe (partie VI). Sur un gros chantier, des boutons pour chaque lot et
// chaque interlocuteur remplissaient tout le panneau. Choisir dans un menu vide
// l'autre : une remarque n'a qu'un destinataire.
function ChoixDestinataire({ choix, valeur, onChoisir, facultatif, numeros }) {
  const menu = (id, titre, liste, prefixe, vide) => (
    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, color: '#9C9591', marginBottom: 6 }}>{titre}</label>
      <select id={id} value={valeur.startsWith(prefixe) ? valeur : ''} disabled={liste.length === 0}
        onChange={e => onChoisir(e.target.value || (valeur.startsWith(prefixe) ? '' : valeur))}
        style={{
          ...CHAMP, cursor: liste.length === 0 ? 'default' : 'pointer',
          borderColor: valeur.startsWith(prefixe) ? '#2A8A4E' : 'rgba(0,0,0,0.15)',
          fontWeight: valeur.startsWith(prefixe) ? 600 : 400,
        }}>
        <option value="">{liste.length === 0 ? 'Aucun' : vide}</option>
        {liste.map(c => <option key={c.cle} value={c.cle}>{c.libelle}{c.role ? ` — ${c.role}` : ''}</option>)}
      </select>
    </div>
  )
  return (
    <div>
      <span style={LABEL}>Pour qui ?{facultatif ? ' (facultatif)' : ' *'}</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {menu('visite-dest-lot', `Entreprise (${numeros.entreprises})`, choix.entreprises, 'lot:', '— Choisir un lot —')}
        {menu('visite-dest-equipe', `Équipe MOE / MOA (${numeros.equipe})`, choix.equipe.map(c => ({ ...c, role: c.detail })), 'interlo:', '— Choisir une personne —')}
      </div>
      {choix.entreprises.length === 0 && choix.equipe.length === 0 && (
        <p style={{ fontSize: 13, color: '#5E5854', margin: '8px 0 0' }}>
          Aucun lot ni interlocuteur dans cette affaire : ajoutez-les (lots, Interlocuteurs) pour adresser les remarques.
        </p>
      )}
    </div>
  )
}

/**
 * @param destinataireInitial clé proposée par le « + » d'un groupe
 * @param contributeur intervenant extérieur : destinataire facultatif, ses
 *   observations vont dans leur section à part
 */
export function PanneauRemarque({ remarque, cr, lots, interlocuteurs, zones = [], destinataireInitial = null, contributeur = false, numeros = { equipe: 'VI', entreprises: 'VII' }, onEnregistrer, onFermer, signalerErreur }) {
  const modification = !!remarque
  // Le destinataire de la remarque précédente est reproposé : sur le chantier,
  // on enchaîne souvent plusieurs remarques pour le même lot
  const cleMemoire = `jga-cr-destinataire-${cr.id}`
  const choix = choixDestinataires({ lots, interlocuteurs })
  const [description, setDescription] = useState(remarque?.description ?? '')
  const [statut, setStatut] = useState(remarque ? statutNormalise(remarque) : STATUT_PAR_DEFAUT)
  const [echeance, setEcheance] = useState(remarque?.date_echeance ?? '')
  const [zoneId, setZoneId] = useState(remarque?.zone_id ?? '')
  const [destinataire, setDestinataire] = useState(() => (modification
    ? cleDestinataire(remarque)
    : destinataireInitial ?? destinataireParDefaut(lireMemoire(cleMemoire), choix)))
  // Mise en forme de toute la remarque (migration 056 ; sans elle, gras seul)
  const { miseEnForme: formeDisponible } = useCr()
  const [forme, setForme] = useState(() => miseEnForme(remarque))
  const [photos, setPhotos] = useState([]) // { compression, url }
  const [annotation, setAnnotation] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const { espacePlein } = useContext(PhotosContexte)

  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const destinataireRequis = !contributeur
  const pret = !!normaliserTexte(description) && (!destinataireRequis || !!destinataire)

  const ajouterCompression = (compression) => setPhotos(ps => [...ps, { compression, url: URL.createObjectURL(compression.miniature.blob) }])

  const choisirPhotos = async (fichiers) => {
    if (espacePlein) { signalerErreur(new Error('L’espace de stockage gratuit est presque plein.')); return }
    try {
      for (const f of fichiers) ajouterCompression(await compresserPhoto(f))
    } catch (err) { signalerErreur(err) }
  }

  const enregistrer = async () => {
    const texte = normaliserTexte(description)
    if (!texte || !pret) return
    setOccupe(true)
    try {
      const payload = {
        description: texte, statut, est_clos: PAR_CODE.get(statut).clos,
        date_echeance: echeance || null, ...champsMiseEnForme(forme, formeDisponible),
        ...(zones.length > 0 && { zone_id: zoneId || null }),
        ...champsDestinataire(destinataire),
      }
      if (!modification) {
        payload.date_note = cr.date_reunion
        payload.est_nouveau = true
        if (destinataire) ecrireMemoire(cleMemoire, destinataire)
      }
      await onEnregistrer(payload, { destinataire, compressions: photos.map(p => p.compression) })
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
          <button type="button" onClick={enregistrer} disabled={occupe || !pret}
            title={!destinataire && destinataireRequis ? 'Choisissez à qui s’adresse la remarque' : undefined}
            style={{ ...puce(true, '#2A8A4E'), borderRadius: 3, padding: '0 22px', opacity: occupe || !pret ? 0.6 : 1 }}>
            {occupe ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      }
    >
      {/* Le texte d'abord, et en évidence : c'est ce qu'on vient noter ; le reste
          se règle ensuite */}
      <div style={{ background: 'white', borderLeft: '4px solid #E8602C', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <label htmlFor="visite-texte" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#1F1B17', marginBottom: 8 }}>Remarque</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            id="visite-texte" autoFocus={!modification} value={description} rows={4}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ce qui a été constaté, ce qu’il faut faire…"
            style={{
              ...CHAMP, padding: '12px 14px', minHeight: 128, fontSize: 18, lineHeight: 1.45, resize: 'vertical', fontFamily: 'inherit',
              border: '1.5px solid rgba(232,96,44,0.55)',
              fontWeight: forme.gras ? 700 : 400, fontStyle: forme.italique ? 'italic' : 'normal',
              background: forme.surligne ? COULEUR_SURLIGNE : 'white',
            }}
          />
          <BoutonDictee onTexte={t => setDescription(d => ajouterDictee(d, t))} onErreur={m => signalerErreur(new Error(m))} />
        </div>
        <div role="group" aria-label="Mise en forme de la remarque" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            { cle: 'gras', libelle: 'G', titre: 'Gras', style: { fontWeight: 800 } },
            ...(formeDisponible ? [
              { cle: 'italique', libelle: 'I', titre: 'Italique', style: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
              { cle: 'surligne', libelle: 'Surligné', titre: 'Surligné', style: { background: COULEUR_SURLIGNE, padding: '0 4px' } },
            ] : []),
          ].map(b => (
            <button key={b.cle} type="button" aria-pressed={forme[b.cle]} title={b.titre}
              onClick={() => setForme(f => ({ ...f, [b.cle]: !f[b.cle] }))}
              style={{
                minWidth: 44, minHeight: 44, padding: '0 12px', borderRadius: 3, cursor: 'pointer', fontSize: 15,
                border: `1px solid ${forme[b.cle] ? '#1F1B17' : 'rgba(0,0,0,0.15)'}`,
                background: forme[b.cle] ? '#1F1B17' : 'white', color: forme[b.cle] ? 'white' : '#1F1B17',
              }}>
              <span style={forme[b.cle] && b.cle === 'surligne' ? { ...b.style, color: '#1F1B17' } : b.style}>{b.libelle}</span>
            </button>
          ))}
        </div>
      </div>

      <ChoixDestinataire choix={choix} valeur={destinataire} onChoisir={setDestinataire} facultatif={!destinataireRequis} numeros={numeros} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MenuStatut id="visite-statut" label="Statut" valeur={statut} onChange={setStatut} />
        {zones.length > 0 && (
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label style={LABEL} htmlFor="visite-zone">Zone</label>
            <select id="visite-zone" value={zoneId} onChange={e => setZoneId(e.target.value)}
              style={{ ...CHAMP, cursor: 'pointer', borderColor: zoneId ? '#1B3A5C' : 'rgba(0,0,0,0.15)', fontWeight: zoneId ? 600 : 400 }}>
              <option value="">Sans zone</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
            </select>
          </div>
        )}
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

// ─── Suites d'une remarque (▶) ──────────────────────────────────────────────
//
// Toucher une remarque ouvre ce panneau : la suite s'écrit en un geste, avec
// son propre statut et sa propre échéance (migration 054). La remarque
// d'origine garde le sien, sauf si l'on coche « Clore la remarque d'origine ».

export function PanneauSuite({ remarque, cr, lectureSeule, acces, ops, onModifier, onFermer, signalerErreur }) {
  const [texte, setTexte] = useState('')
  const [statut, setStatut] = useState(STATUT_PAR_DEFAUT)
  const [echeance, setEcheance] = useState('')
  const [clore, setClore] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const suites = remarque.sous_remarques ?? []
  const statutOrigine = infosStatut(remarque)
  const peutModifier = !lectureSeule && peutModifierRemarque(remarque, acces)

  const ajouter = async () => {
    const propre = normaliserTexte(texte)
    if (!propre) return
    setOccupe(true)
    try {
      await ops.addSousRemarque(remarque.id, {
        date_note: cr.date_reunion, description: propre,
        statut, est_clos: PAR_CODE.get(statut).clos, date_echeance: echeance || null,
        est_nouveau: true, est_important: false,
      })
      if (clore && peutModifier) await ops.updateRemarque(remarque.id, { statut: 'fait', est_clos: true })
      onFermer()
    } catch { /* signalé dans le bandeau */ }
    setOccupe(false)
  }

  const changerStatutSuite = (sr, code) =>
    ops.updateRemarque(sr.id, { statut: code, est_clos: PAR_CODE.get(code).clos }).catch(() => {})

  return (
    <Panneau
      titre={`Suite de la remarque${remarque.numero != null ? ` n°${remarque.numero}` : ''}`}
      onFermer={onFermer} occupe={occupe}
      pied={!lectureSeule && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onFermer} disabled={occupe} style={{ ...puce(false), borderRadius: 3 }}>Annuler</button>
          <button type="button" onClick={ajouter} disabled={occupe || !normaliserTexte(texte)}
            style={{ ...puce(true, '#E8602C'), borderRadius: 3, padding: '0 22px', opacity: occupe || !normaliserTexte(texte) ? 0.6 : 1 }}>
            {occupe ? 'Enregistrement…' : 'Ajouter la suite'}
          </button>
        </div>
      )}
    >
      <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderLeft: `4px solid ${statutOrigine.couleur}`, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <p style={{ flex: 1, margin: 0, fontSize: 15, color: statutOrigine.clos ? '#9CA3AF' : '#1F1B17', textDecoration: statutOrigine.clos ? 'line-through' : 'none' }}>
            {remarque.description}
          </p>
          <span style={{ fontSize: 12, fontWeight: 600, color: statutOrigine.couleur, background: statutOrigine.fond, borderRadius: 3, padding: '3px 8px', whiteSpace: 'nowrap' }}>{statutOrigine.libelle}</span>
        </div>
        {peutModifier && onModifier && (
          <button type="button" onClick={() => onModifier(remarque)}
            style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, minHeight: 32, fontSize: 13, color: '#1B3A5C', textDecoration: 'underline', cursor: 'pointer' }}>
            Modifier la remarque elle-même
          </button>
        )}
      </div>

      {suites.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
          {suites.map(sr => {
            const st = infosStatut(sr)
            return (
              <li key={sr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#9C9591', minWidth: 52 }}>
                  ▶ {sr.date_note ? new Date(sr.date_note + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—'}
                </span>
                <span style={{ flex: 1, fontSize: 14, textDecoration: st.clos ? 'line-through' : 'none', color: st.clos ? '#9CA3AF' : '#1F1B17' }}>{sr.description}</span>
                {lectureSeule || !peutRepondreSuite(sr, acces) ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: st.couleur }}>{st.libelle}</span>
                ) : (
                  <select value={st.code} onChange={e => changerStatutSuite(sr, e.target.value)} aria-label="Statut de la suite"
                    style={{ ...CHAMP, width: 140, color: st.couleur, fontWeight: 600 }}>
                    {STATUTS.map(x => <option key={x.code} value={x.code}>{x.libelle}</option>)}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!lectureSeule && (
        <>
          <div>
            <label style={LABEL} htmlFor="visite-suite">Nouvelle suite</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea id="visite-suite" autoFocus value={texte} onChange={e => setTexte(e.target.value)} rows={2}
                placeholder="Constat du jour, ce qu’il reste à faire…" style={{ ...CHAMP, padding: '10px 12px', minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
              <BoutonDictee onTexte={t => setTexte(x => ajouterDictee(x, t))} onErreur={m => signalerErreur(new Error(m))} />
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            <MenuStatut id="visite-statut-suite" label="Statut de la suite" valeur={statut} onChange={setStatut} />
          </div>
          <div>
            <span style={LABEL}>Pour le</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => setEcheance('')} style={puce(!echeance)}>Aucune</button>
              <button type="button" onClick={() => setEcheance(echeanceRapide(cr.date_reunion, 1))} style={puce(echeance === echeanceRapide(cr.date_reunion, 1))}>+1 sem.</button>
              <button type="button" onClick={() => setEcheance(echeanceRapide(cr.date_reunion, 2))} style={puce(echeance === echeanceRapide(cr.date_reunion, 2))}>+2 sem.</button>
              <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} aria-label="Échéance de la suite" style={{ ...CHAMP, width: 170 }} />
            </div>
          </div>
          {peutModifier && !statutOrigine.clos && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={clore} onChange={e => setClore(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#2A8A4E' }} />
              Clore la remarque d’origine (Fait)
            </label>
          )}
        </>
      )}
    </Panneau>
  )
}

// Un intervenant extérieur ne règle le statut que de ses propres suites
function peutRepondreSuite(sr, acces) {
  return peutModifierRemarque(sr, acces)
}

// ─── Présences ───────────────────────────────────────────────────────────────

const CODES_PRESENCE = [
  { id: 'p', libelle: 'Présent', couleur: '#2A8A4E' },
  { id: 'r', libelle: 'Retard', couleur: '#E8602C' },
  { id: 'a', libelle: 'Absent', couleur: '#B8412C' },
  { id: 'e', libelle: 'Excusé', couleur: '#5E5854' },
]

export function PanneauPresences({ presences, setPresence, convocations = new Map(), lectureSeule, onFermer, signalerErreur }) {
  // Équipe puis entreprises ; dans chaque groupe, les convoqués au CR
  // précédent d'abord : ce sont ceux qu'on attend
  const lignes = presences.map(p => ({ p, v: affichagePresence(p), c: convocationDe(p, convocations) })).filter(l => l.v.type)
    .sort((a, b) => (a.v.type === b.v.type ? 0 : a.v.type === 'interlocuteur' ? -1 : 1)
      || (a.c ? 0 : 1) - (b.c ? 0 : 1)
      || (a.v.type === 'interlocuteur' ? a.v.ordre - b.v.ordre : (a.v.lotNumero ?? 99) - (b.v.lotNumero ?? 99)))

  return (
    <Panneau titre="Présences" onFermer={onFermer}>
      {lignes.length === 0 && <p style={{ fontSize: 14, color: '#5E5854' }}>Aucun participant pour cette affaire.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lignes.map(({ p, v, c }) => (
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
              <MentionConvocation convocation={c} />
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

// ─── Avancement des lots, sur la tablette ────────────────────────────────────
//
// Même lecture que l'écran de bureau, en gros boutons : sur le chantier on
// pointe un lot entier plutôt qu'une tâche à la fois.
export function PanneauAvancement({ cr, planning, onModifierTache, lectureSeule, onFermer, signalerErreur }) {
  const lignes = lignesAvancement(cr, avancementParLot(planning.taches, planning.lots, {
    date: cr.date_reunion, periodes: planning.periodes,
  }))
  const total = avancementGlobal(lignes)
  const [ouvert, setOuvert] = useState(null)

  const pointer = (tache, valeur) => {
    onModifierTache(tache.id, valeur).catch(signalerErreur)
  }

  return (
    <Panneau titre="Avancement des lots" onFermer={onFermer}>
      {lignes.length === 0 ? (
        <p style={{ fontSize: 15, color: '#5E5854' }}>
          Le planning chantier de cette affaire n’a pas encore de tâches.
        </p>
      ) : (
        <>
          <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 14, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28, fontWeight: 600, color: '#E8602C' }}>{total.realise}%</span>
            <span style={{ fontSize: 14, color: '#9C9591' }}>réalisé · prévu {total.prevu}%</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: infosEcart(total.ecart).couleur }}>{infosEcart(total.ecart).libelle}</span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lignes.map(l => {
              const taches = planning.taches.filter(t => (t.lot_id ?? null) === l.lot_id)
              const deplie = ouvert === (l.lot_id ?? 'hors-lot')
              return (
                <li key={l.lot_id ?? 'hors-lot'} style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderLeft: `3px solid ${l.couleur}` }}>
                  <button type="button" onClick={() => setOuvert(deplie ? null : (l.lot_id ?? 'hors-lot'))}
                    style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>{l.nom}</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#1F1B17' }}>{l.realise}%</span>
                    <span style={{ fontSize: 12, color: '#9C9591' }}>prévu {l.prevu}%</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: infosEcart(l.ecart).couleur }}>{infosEcart(l.ecart).libelle}</span>
                  </button>
                  {deplie && (
                    <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)', padding: '4px 14px 10px' }}>
                      {taches.map(t => (
                        <div key={t.id} style={{ padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.04)' }}>
                          <p style={{ fontSize: 14, color: '#1F1B17', marginBottom: 6 }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9C9591', marginRight: 8 }}>{t.num_tache}</span>
                            {t.nom}
                            <span style={{ marginLeft: 8, fontWeight: 600 }}>{t.avancement ?? 0} %</span>
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {lectureSeule || l.gele ? null : PALIERS.map(v => (
                              <button key={v} type="button" onClick={() => pointer(t, v)} aria-pressed={(t.avancement ?? 0) === v}
                                style={{ minWidth: 56, minHeight: 44, borderRadius: 3, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                  border: (t.avancement ?? 0) === v ? 'none' : '1px solid rgba(0,0,0,0.15)',
                                  background: (t.avancement ?? 0) === v ? '#E8602C' : 'white',
                                  color: (t.avancement ?? 0) === v ? 'white' : '#5E5854' }}>
                                {v}%
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panneau>
  )
}

// Paliers de pointage : sur le chantier, l'avancement se dit au quart
const PALIERS = [0, 25, 50, 75, 100]
