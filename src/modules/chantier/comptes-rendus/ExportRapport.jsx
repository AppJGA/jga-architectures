import { useState } from 'react'
import { FileText, FileDown, Eye, Archive, Download, Mail } from 'lucide-react'
import { useCr } from './CrContexte'
import { NettoyageStockage } from './NettoyageStockage'
import { formatOctets, niveauEspace, LIMITE_STOCKAGE } from './photosLogique'
import { lireReglagesRapport, ecrireReglagesRapport } from './rapportReglages'
import { genererPdfCr, telechargerBlob } from './genererRapport'
import { lienArchive } from './rapportStockage'
import { DiffusionCr } from './DiffusionCr'

// ─── Écran « Exporter le CR » ────────────────────────────────────────────────
// Réglages du rapport, aperçu et téléchargement du PDF, archives des émissions,
// espace de stockage.

// Espace de stockage utilisé par tout le projet, face à l'offre gratuite
function CompteurEspace({ utilise }) {
  if (utilise == null) return null
  const { ratio, alerte } = niveauEspace(utilise)
  const couleur = alerte ? '#B8412C' : '#2A8A4E'
  return (
    <div style={{ maxWidth: 360, margin: '20px 0 0', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5E5854', marginBottom: 4 }}>
        <span>Espace de stockage (photos, plans, archives)</span>
        <span style={{ color: alerte ? couleur : undefined, fontWeight: alerte ? 600 : 400 }}>
          {formatOctets(utilise)} / {formatOctets(LIMITE_STOCKAGE)}
        </span>
      </div>
      <div style={{ height: 6, background: '#E9E2D6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: '100%', background: couleur }} />
      </div>
      {alerte && (
        <p style={{ fontSize: 11, color: '#B8412C', marginTop: 6 }}>
          L’espace gratuit sera bientôt plein : supprimez les photos inutiles ou prévoyez un stockage plus grand.
        </p>
      )}
    </div>
  )
}


function Choix({ titre, valeur, options, onChange }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>{titre}</p>
      <div role="radiogroup" aria-label={titre} style={{ display: 'inline-flex', flexWrap: 'wrap', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, overflow: 'hidden' }}>
        {options.map(([code, libelle]) => (
          <button key={code} type="button" role="radio" aria-checked={valeur === code} onClick={() => onChange(code)}
            style={{ padding: '7px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: valeur === code ? '#1F1B17' : 'white', color: valeur === code ? 'white' : '#374151' }}>
            {libelle}
          </button>
        ))}
      </div>
    </div>
  )
}

function fmtHorodatage(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export function ExportRapport({
  cr, affaire, sections, presences, lotEntreprises, interlocuteurs, zones = [], avancement = [], profils = [], photos, liensPhotos, pastilles, plansCr,
  espace, peutGerer, onEspaceChange, archives: toutesArchives, onArchiverMaintenant, onPreparerVersion, signataire,
}) {
  // Archives d'émission ; les versions par entreprise servent à la diffusion
  const archives = toutesArchives === null ? null : (toutesArchives ?? []).filter(a => !a.destinataire)
  const { signalerErreur } = useCr()
  const [reglages, setReglagesBruts] = useState(() => lireReglagesRapport(affaire?.id))
  const [enCours, setEnCours] = useState(null) // 'apercu' | 'telecharger' | 'archiver'
  const [avertissements, setAvertissements] = useState([])
  const num = String(cr.numero).padStart(2, '0')

  const lots = (lotEntreprises ?? []).map(le => le.lots).filter(Boolean).filter((l, i, a) => a.findIndex(x => x.id === l.id) === i)
  const setReglages = (changement) => {
    const suivants = { ...reglages, ...changement }
    setReglagesBruts(suivants)
    ecrireReglagesRapport(affaire?.id, suivants)
  }

  const fabriquer = () => genererPdfCr({
    cr, affaire, sections, presences, lots, interlocuteurs: interlocuteurs ?? [], zones, avancement, profils,
    photos, liensPhotos, pastilles, plansCr, reglages,
  })

  const apercu = async () => {
    // Ouverte pendant le clic : ouverte après la fabrication, elle serait bloquée
    const fenetre = window.open('', '_blank')
    fenetre?.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#5E5854">Préparation du compte rendu…</p>')
    setEnCours('apercu')
    try {
      const { blob, nomFichier, avertissements: avert } = await fabriquer()
      setAvertissements(avert)
      if (fenetre) fenetre.location.href = URL.createObjectURL(blob)
      else telechargerBlob(blob, nomFichier)
    } catch (err) {
      fenetre?.close()
      signalerErreur(err)
    }
    setEnCours(null)
  }

  const telecharger = async () => {
    setEnCours('telecharger')
    try {
      const { blob, nomFichier, avertissements: avert } = await fabriquer()
      setAvertissements(avert)
      telechargerBlob(blob, nomFichier)
    } catch (err) {
      signalerErreur(err)
    }
    setEnCours(null)
  }

  const ouvrirArchive = async (archive) => {
    const fenetre = window.open('', '_blank')
    try {
      const url = await lienArchive(archive.chemin)
      if (fenetre) fenetre.location.href = url
      else window.location.assign(url)
    } catch (err) {
      fenetre?.close()
      signalerErreur(err)
    }
  }

  const archiver = async () => {
    setEnCours('archiver')
    try { await onArchiverMaintenant(reglages) } catch (err) { signalerErreur(err) }
    setEnCours(null)
  }

  const carte = { background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 14 }
  const bouton = (principal) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', minHeight: 40, borderRadius: 2, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    border: principal ? 'none' : '0.5px solid rgba(0,0,0,0.15)', background: principal ? '#E8602C' : 'white', color: principal ? 'white' : '#1F1B17',
    opacity: enCours ? 0.6 : 1,
  })

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={24} color="#9C9591" />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, color: '#1F1B17' }}>Compte rendu n°{num}</p>
          <p style={{ fontSize: 12, color: '#5E5854' }}>
            {cr.date_reunion ? new Date(cr.date_reunion + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date non définie'}
          </p>
        </div>
      </div>

      {cr.statut === 'emis' && archives !== null && (
        <div style={carte}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 8 }}>
            <Archive size={15} color="#2A8A4E" /> PDF archivé{archives.length > 1 ? 's' : ''} à l’émission
          </p>
          {archives.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#B8412C' }}>Aucun PDF archivé pour cette émission.</span>
              {peutGerer && (
                <button type="button" onClick={archiver} disabled={!!enCours} style={{ ...bouton(false), padding: '6px 14px', minHeight: 32 }}>
                  {enCours === 'archiver' ? 'Archivage…' : 'Archiver maintenant'}
                </button>
              )}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {archives.map((a, i) => (
                <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i ? '0.5px solid rgba(0,0,0,0.06)' : 'none', fontSize: 12 }}>
                  <span style={{ flex: 1, color: i === 0 ? '#1F1B17' : '#9C9591' }}>
                    {i === 0 ? 'Émis' : 'Version précédente, émise'} le {fmtHorodatage(a.emis_le)} · {formatOctets(a.taille_octets)}
                  </span>
                  <button type="button" onClick={() => ouvrirArchive(a)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer' }}>
                    <Download size={13} /> Télécharger
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {cr.statut === 'emis' && archives !== null && peutGerer && (
        <div style={carte}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>
            <Mail size={15} color="#E8602C" /> Diffuser
          </p>
          <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 10 }}>
            L’e-mail s’ouvre dans votre messagerie avec un lien vers le PDF, valable 30 jours.
          </p>
          <DiffusionCr cr={cr} affaire={affaire} presences={presences} lots={lots} archives={toutesArchives}
            onPreparerVersion={onPreparerVersion} signataire={signataire} />
        </div>
      )}

      <div style={carte}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 12 }}>Réglages du PDF</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Choix titre="Modèle" valeur={reglages.modele} onChange={v => setReglages({ modele: v })}
            options={[['complet', 'Complet'], ['synthese', 'Synthèse']]} />
          <Choix titre="Remarques closes" valeur={reglages.closes} onChange={v => setReglages({ closes: v })}
            options={[['afficher', 'Affichées'], ['masquer', 'Masquées']]} />
          {photos.length > 0 && (
            <Choix titre="Photos" valeur={reglages.modele === 'synthese' && reglages.photos === 'grandes' ? 'petites' : reglages.photos} onChange={v => setReglages({ photos: v })}
              options={[['aucune', 'Aucune'], ['petites', 'Petites'], ...(reglages.modele === 'synthese' ? [] : [['grandes', 'Grandes']])]} />
          )}
          {zones.length > 0 && (
            <Choix titre="Zones" valeur={reglages.zones} onChange={v => setReglages({ zones: v })}
              options={[['non', 'Par section'], ['grouper', 'Par zone']]} />
          )}
          {avancement.length > 0 && (
            <Choix titre="Avancement" valeur={reglages.avancement} onChange={v => setReglages({ avancement: v })}
              options={[['oui', 'Tableau des lots'], ['non', 'Sans']]} />
          )}
          {pastilles.length > 0 && (
            <Choix titre="Plans" valeur={reglages.plans} onChange={v => setReglages({ plans: v })}
              options={[['aucun', 'Aucun'], ['extraits', 'Extraits'], ['planches', 'Plans entiers'], ['les_deux', 'Les deux']]} />
          )}
        </div>
        {(lots.length > 0 || (interlocuteurs ?? []).length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>Version</span>
              <select value={reglages.destinataire} onChange={e => setReglages({ destinataire: e.target.value })}
                style={{ height: 34, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, background: 'white', minWidth: 220 }}>
                <option value="">Compte rendu complet</option>
                {lots.length > 0 && <optgroup label="Pour une entreprise">{lots.map(l => <option key={l.id} value={`lot:${l.id}`}>{l.numero ? `Lot ${l.numero} — ${l.nom}` : l.nom}</option>)}</optgroup>}
                {(interlocuteurs ?? []).length > 0 && <optgroup label="Pour un interlocuteur">{interlocuteurs.map(i => <option key={i.id} value={`interlo:${i.id}`}>{[i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation}</option>)}</optgroup>}
              </select>
            </label>
            {reglages.destinataire && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', marginTop: 18, cursor: 'pointer' }}>
                <input type="checkbox" checked={reglages.inclureGenerales} onChange={e => setReglages({ inclureGenerales: e.target.checked })} style={{ accentColor: '#E8602C' }} />
                Inclure les remarques générales (sans destinataire)
              </label>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={telecharger} disabled={!!enCours} style={bouton(true)}>
            <FileDown size={15} /> {enCours === 'telecharger' ? 'Préparation…' : 'Télécharger le PDF'}
          </button>
          <button type="button" onClick={apercu} disabled={!!enCours} style={bouton(false)}>
            <Eye size={15} /> {enCours === 'apercu' ? 'Préparation…' : 'Aperçu'}
          </button>
          {enCours && enCours !== 'archiver' && <span style={{ fontSize: 11, color: '#9C9591' }}>Photos et plans en cours de préparation…</span>}
        </div>
        {avertissements.length > 0 && (
          <p role="status" style={{ fontSize: 11, color: '#B8412C', marginTop: 10 }}>
            Éléments omis dans le PDF : {avertissements.join(' · ')}
          </p>
        )}
      </div>

      <CompteurEspace utilise={espace} />
      {espace != null && peutGerer && (
        <div style={{ maxWidth: 360 }}>
          <NettoyageStockage onTermine={onEspaceChange} />
        </div>
      )}
    </div>
  )
}
