import { useState, useEffect, useContext } from 'react'
import { X, Camera, Images } from 'lucide-react'
import { Panneau } from '../comptes-rendus/PanneauxVisite'
import { BoutonDictee } from '../comptes-rendus/BoutonDictee'
import { BoutonSupprimer } from '../comptes-rendus/BoutonSupprimer'
import { AnnotationPhoto } from '../comptes-rendus/AnnotationPhoto'
import { compresserPhoto } from '../comptes-rendus/compressionPhoto'
import { PhotosContexte } from '../comptes-rendus/usePhotosRemarque'
import { ajouterDictee, normaliserTexte, echeanceRapide } from '../comptes-rendus/visiteLogique'
import { libelleLot } from './oprLogique'

// ─── Nouvelle réserve / modifier une réserve ─────────────────────────────────

const LABEL = { display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }
const CHAMP = { width: '100%', minHeight: 44, padding: '0 12px', fontSize: 16, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', boxSizing: 'border-box', color: '#1F1B17' }
const puce = (actif, couleur = '#1F1B17') => ({
  minHeight: 44, padding: '0 14px', borderRadius: 22, fontSize: 14, cursor: 'pointer',
  border: `1px solid ${actif ? couleur : 'rgba(0,0,0,0.15)'}`, background: actif ? couleur : 'white',
  color: actif ? 'white' : '#1F1B17', fontWeight: actif ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 6,
})

export function PanneauReserve({ reserve, lotParDefaut, lots, localisations, dateVisite, peutSupprimer, onEnregistrer, onSupprimer, onFermer, signalerErreur }) {
  const modification = !!reserve
  const [lotId, setLotId] = useState(reserve?.lot_id ?? lotParDefaut ?? lots[0]?.id ?? '')
  const [localisation, setLocalisation] = useState(reserve?.localisation ?? '')
  const [description, setDescription] = useState(reserve?.description ?? '')
  const [dateLimite, setDateLimite] = useState(reserve?.date_limite ?? '')
  const [important, setImportant] = useState(!!reserve?.est_important)
  const [photos, setPhotos] = useState([])
  const [annotation, setAnnotation] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const { espacePlein } = useContext(PhotosContexte)

  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const ajouterCompression = (c) => setPhotos(ps => [...ps, { compression: c, url: URL.createObjectURL(c.miniature.blob) }])
  const choisir = async (fichiers) => {
    if (espacePlein) { signalerErreur(new Error('L’espace de stockage gratuit est presque plein.')); return }
    try { for (const f of fichiers) ajouterCompression(await compresserPhoto(f)) } catch (err) { signalerErreur(err) }
  }

  const enregistrer = async () => {
    const texte = normaliserTexte(description)
    if (!texte) return
    setOccupe(true)
    try {
      await onEnregistrer({
        lot_id: lotId || null, localisation: normaliserTexte(localisation) || null,
        description: texte, date_limite: dateLimite || null, est_important: important,
      }, photos.map(p => p.compression))
      onFermer()
    } catch { /* signalé dans le bandeau */ }
    setOccupe(false)
  }

  const plus15 = echeanceRapide(dateVisite, 2)
  const plus30 = echeanceRapide(dateVisite, 4)

  return (
    <Panneau
      titre={modification ? `Modifier la réserve n°${reserve.numero}` : 'Nouvelle réserve'}
      onFermer={onFermer} occupe={occupe}
      pied={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {modification && peutSupprimer && <BoutonSupprimer libelle taille={14} onConfirm={async () => { setOccupe(true); try { await onSupprimer(); onFermer() } catch { /* bandeau */ } setOccupe(false) }} />}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onFermer} disabled={occupe} style={{ ...puce(false), borderRadius: 3 }}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={occupe || !normaliserTexte(description)}
            style={{ ...puce(true, '#2A8A4E'), borderRadius: 3, padding: '0 22px', opacity: occupe || !normaliserTexte(description) ? 0.6 : 1 }}>
            {occupe ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      }
    >
      <div>
        <span style={LABEL}>Lot</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {lots.map(l => (
            <button key={l.id} type="button" aria-pressed={lotId === l.id} onClick={() => setLotId(l.id)} style={puce(lotId === l.id, '#2A8A4E')}>
              {libelleLot(l)}
            </button>
          ))}
          <button type="button" aria-pressed={!lotId} onClick={() => setLotId('')} style={puce(!lotId)}>Sans lot</button>
        </div>
      </div>

      <div>
        <label style={LABEL} htmlFor="reserve-localisation">Localisation</label>
        <input id="reserve-localisation" value={localisation} onChange={e => setLocalisation(e.target.value)} list="reserve-localisations"
          placeholder="Pièce, niveau, façade…" style={CHAMP} />
        <datalist id="reserve-localisations">{localisations.map(l => <option key={l} value={l} />)}</datalist>
      </div>

      <div>
        <label style={LABEL} htmlFor="reserve-description">Réserve</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea id="reserve-description" autoFocus={!modification} value={description} rows={3} onChange={e => setDescription(e.target.value)}
            placeholder="Défaut constaté, ouvrage à reprendre…"
            style={{ ...CHAMP, padding: '10px 12px', minHeight: 96, resize: 'vertical', lineHeight: 1.4, fontFamily: 'inherit' }} />
          <BoutonDictee onTexte={t => setDescription(d => ajouterDictee(d, t))} onErreur={m => signalerErreur(new Error(m))} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
        <div>
          <span style={LABEL}>Délai de levée</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setDateLimite('')} style={puce(!dateLimite)}>Aucun</button>
            <button type="button" onClick={() => setDateLimite(plus15)} style={puce(dateLimite === plus15)}>+2 sem.</button>
            <button type="button" onClick={() => setDateLimite(plus30)} style={puce(dateLimite === plus30)}>+4 sem.</button>
            <input type="date" value={dateLimite} onChange={e => setDateLimite(e.target.value)} aria-label="Date limite de levée" style={{ ...CHAMP, width: 170 }} />
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 44, alignSelf: 'end' }}>
          <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#E8602C' }} />
          Réserve importante
        </label>
      </div>

      {!modification && (
        <div>
          <span style={LABEL}>Photos</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {photos.map((p, i) => (
              <div key={p.url} style={{ position: 'relative', width: 72, height: 72 }}>
                <img src={p.url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button type="button" data-compact aria-label="Retirer la photo" onClick={() => { URL.revokeObjectURL(p.url); setPhotos(ps => ps.filter(x => x !== p)) }}
                  style={{ position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#1F1B17', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <label style={{ ...puce(false), borderRadius: 3 }}>
              <Camera size={18} /> Prendre
              <input type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setAnnotation(f) }} />
            </label>
            <label style={{ ...puce(false), borderRadius: 3 }}>
              <Images size={18} /> Galerie
              <input type="file" accept="image/*" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; choisir(f) }} />
            </label>
          </div>
        </div>
      )}

      {annotation && (
        <AnnotationPhoto
          source={annotation}
          onValider={async canvas => { try { ajouterCompression(await compresserPhoto(canvas)) } catch (err) { signalerErreur(err) } setAnnotation(null) }}
          onAnnuler={() => setAnnotation(null)}
        />
      )}
    </Panneau>
  )
}
