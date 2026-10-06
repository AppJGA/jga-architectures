import { useState } from 'react'
import { FileText, Archive, Download, Mail, Trash2 } from 'lucide-react'
import { useCr } from './CrContexte'
import { NettoyageStockage } from './NettoyageStockage'
import { formatOctets, niveauEspace, LIMITE_STOCKAGE } from './photosLogique'
import { lireReglagesRapport, ecrireReglagesRapport } from './rapportReglages'
import { genererPdfCr, telechargerBlob } from './genererRapport'
import { lienArchive } from './rapportStockage'
import { DiffusionCr } from './DiffusionCr'
import { ApercuPdf } from './ApercuPdf'
import { IconeExportPdf, IconeEmission } from '../../../shared/icones/IconesAffaire'
import { libelleNumeroLot } from '../../../shared/lots/numeroLot'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'

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


function Interrupteur({ actif, onChange, libelle, petit = false, desactive = false }) {
  const l = petit ? 30 : 38
  const h = petit ? 18 : 22
  return (
    <button type="button" role="switch" aria-checked={actif} aria-label={libelle} disabled={desactive} onClick={() => onChange(!actif)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'none', cursor: desactive ? 'default' : 'pointer', opacity: desactive ? 0.45 : 1, fontSize: 12, color: '#374151' }}>
      <span aria-hidden style={{ position: 'relative', width: l, height: h, borderRadius: h, background: actif ? '#2A8A4E' : '#D6D0C7', transition: 'background 0.15s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: actif ? l - h + 2 : 2, width: h - 4, height: h - 4, borderRadius: '50%', background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
      </span>
      {petit && libelle}
    </button>
  )
}

// Une ligne de la liste du contenu ; ses réglages propres sous elle, quand elle est cochée
function Element({ titre, detail, actif = true, onChange, toujours = false, children }) {
  return (
    <li style={{ padding: '10px 0', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: actif ? '#1F1B17' : '#9C9591' }}>{titre}</p>
          {detail && <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9C9591' }}>{detail}</p>}
        </div>
        {toujours
          ? <span style={{ fontSize: 11, color: '#9C9591', whiteSpace: 'nowrap' }}>Toujours</span>
          : <Interrupteur actif={actif} onChange={onChange} libelle={titre} />}
      </div>
      {actif && children}
    </li>
  )
}

function SousReglage({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, margin: '8px 0 2px 14px', paddingLeft: 12, borderLeft: '2px solid #F0EBE3' }}>{children}</div>
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

function BoutonSupprimer({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Supprimer ce PDF" title="Supprimer ce PDF du stockage"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, padding: 0, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer', color: '#B8412C' }}>
      <Trash2 size={13} />
    </button>
  )
}

function fmtHorodatage(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export function ExportRapport({
  cr, affaire, sections, presences, convocations, lotEntreprises, lots: lotsAffaire = null, generalites = null, interlocuteurs, zones = [], avancement = [], profils = [], photos, liensPhotos, pastilles, plansCr,
  espace, peutGerer, onEspaceChange, archives: toutesArchives, onArchiverMaintenant, onPreparerVersion, onSupprimerArchive, signataire, onEmettre,
}) {
  // Archives d'émission ; les versions par entreprise servent à la diffusion
  const archives = toutesArchives === null ? null : (toutesArchives ?? []).filter(a => !a.destinataire)
  const versionsEntreprises = (toutesArchives ?? []).filter(a => a.destinataire)
  const [aSupprimer, setASupprimer] = useState(null)
  // La dernière émission, pas la première ligne : une fois celle-ci supprimée,
  // une version précédente ne doit pas passer pour l'émission en cours
  const estEmissionCourante = (a) => !cr.date_emission || new Date(a.emis_le).getTime() === new Date(cr.date_emission).getTime()
  const { signalerErreur } = useCr()
  const [reglages, setReglagesBruts] = useState(() => lireReglagesRapport(affaire?.id))
  const [enCours, setEnCours] = useState(null) // 'telecharger' | 'archiver'
  const [avertissements, setAvertissements] = useState([])
  const num = String(cr.numero).padStart(2, '0')

  // Tous les lots de l'affaire (une remarque peut viser un lot sans titulaire),
  // à défaut ceux qui ont une entreprise
  const lots = lotsAffaire ?? (lotEntreprises ?? []).map(le => le.lots).filter(Boolean).filter((l, i, a) => a.findIndex(x => x.id === l.id) === i)
  const setReglages = (changement) => {
    const suivants = { ...reglages, ...changement }
    setReglagesBruts(suivants)
    ecrireReglagesRapport(affaire?.id, suivants)
  }

  const fabriquer = () => genererPdfCr({
    cr, affaire, sections, presences, convocations, generalites, lots, interlocuteurs: interlocuteurs ?? [], zones, avancement, profils,
    photos, liensPhotos, pastilles, plansCr, reglages,
  })

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

  // L'aperçu se refait quand un réglage change ; la version (destinataire)
  // en fait partie
  const cleApercu = JSON.stringify({ ...reglages, plansChoisis: undefined, statut: cr.statut })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start', maxWidth: 1240 }}>
    <div style={{ flex: '1 1 460px', minWidth: 0, maxWidth: 760 }}>
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
                  <span style={{ flex: 1, color: estEmissionCourante(a) ? '#1F1B17' : '#9C9591' }}>
                    {estEmissionCourante(a) ? 'Émis' : 'Version précédente, émise'} le {fmtHorodatage(a.emis_le)} · {formatOctets(a.taille_octets)}
                  </span>
                  <button type="button" onClick={() => ouvrirArchive(a)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer' }}>
                    <Download size={13} /> Télécharger
                  </button>
                  {peutGerer && onSupprimerArchive && <BoutonSupprimer onClick={() => setASupprimer(a)} />}
                </li>
              ))}
            </ul>
          )}
          {versionsEntreprises.length > 0 && (
            <details style={{ marginTop: 10, fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', color: '#5E5854' }}>
                Versions préparées pour les entreprises · {versionsEntreprises.length} PDF · {formatOctets(versionsEntreprises.reduce((t, a) => t + (a.taille_octets ?? 0), 0))}
              </summary>
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                {versionsEntreprises.map(a => (
                  <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                    <span style={{ flex: 1, color: '#5E5854' }}>
                      {a.version_pour ?? 'Version par entreprise'} · {fmtHorodatage(a.emis_le)} · {formatOctets(a.taille_octets)}
                    </span>
                    <button type="button" onClick={() => ouvrirArchive(a)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer' }}>
                      <Download size={13} /> Télécharger
                    </button>
                    {peutGerer && onSupprimerArchive && <BoutonSupprimer onClick={() => setASupprimer(a)} />}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {aSupprimer && (
        <ModaleConfirmation
          danger
          titre="Supprimer ce PDF archivé ?"
          texte={aSupprimer.destinataire
            ? 'Le PDF est retiré du stockage. Le lien envoyé à cette entreprise ne fonctionnera plus ; un nouvel envoi refabriquera le PDF.'
            : 'Le PDF est retiré du stockage. Les liens déjà envoyés par e-mail vers ce PDF ne fonctionneront plus. Le compte rendu lui-même ne change pas, et son PDF pourra être réarchivé.'}
          libelle="Supprimer"
          onConfirmer={async () => {
            try { await onSupprimerArchive(aSupprimer) } catch (err) { signalerErreur(err) }
            setASupprimer(null)
          }}
          onAnnuler={() => setASupprimer(null)}
        />
      )}

      {cr.statut === 'emis' && archives !== null && peutGerer && (
        <div style={carte}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>
            <Mail size={15} color="#E8602C" /> Diffuser
          </p>
          <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 10 }}>
            « Ouvrir dans Outlook » prépare l’e-mail (destinataires, objet, texte) et télécharge le PDF à y joindre ; le texte porte aussi un lien de téléchargement valable 30 jours.
          </p>
          <DiffusionCr cr={cr} affaire={affaire} presences={presences} lots={lots} archives={toutesArchives}
            onPreparerVersion={onPreparerVersion} signataire={signataire} />
        </div>
      )}

      <div style={carte}>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', marginBottom: 4 }}>Contenu du PDF</p>
        <p style={{ fontSize: 11, color: '#9C9591', marginBottom: 6 }}>L’aperçu suit chaque changement ; ces réglages servent aussi au PDF archivé à l’émission.</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <Element titre="Page de garde" detail="Toujours imprimée : titre, affaire, maître d’ouvrage" toujours>
            <SousReglage>
              <Interrupteur petit actif={reglages.photoAffaire && !!affaire?.photo_url} desactive={!affaire?.photo_url}
                onChange={v => setReglages({ photoAffaire: v })} libelle="Photo de l’affaire" />
              {!affaire?.photo_url && <span style={{ fontSize: 11, color: '#9C9591' }}>Ajoutez une photo dans la fiche de l’affaire</span>}
            </SousReglage>
          </Element>
          <Element titre="Présences" detail="Feuille de présence de la réunion" actif={reglages.presences} onChange={v => setReglages({ presences: v })}>
            <SousReglage>
              <Interrupteur petit actif={reglages.coordonnees} onChange={v => setReglages({ coordonnees: v })} libelle="Coordonnées des participants" />
            </SousReglage>
          </Element>
          <Element titre="Convocations" detail="Prochaine réunion et participants convoqués" actif={reglages.convocations} onChange={v => setReglages({ convocations: v })} />
          <Element titre="Avancement" detail={avancement.length ? 'Avancement des lots, lu dans le planning' : 'Aucune tâche au planning chantier'}
            actif={reglages.avancement === 'oui'} onChange={v => setReglages({ avancement: v ? 'oui' : 'non' })} />
          <Element titre="Généralités" detail="Parties I à V de l’affaire" actif={reglages.generalites} onChange={v => setReglages({ generalites: v })} />
          <Element titre="Remarques" detail="Remarques de l’équipe et des entreprises" actif={reglages.remarques} onChange={v => setReglages({ remarques: v })}>
            <SousReglage>
              <Choix titre="Remarques closes" valeur={reglages.closes} onChange={v => setReglages({ closes: v })}
                options={[['afficher', 'Affichées'], ['masquer', 'Masquées']]} />
              {photos.length > 0 && (
                <Choix titre="Photos" valeur={reglages.photos} onChange={v => setReglages({ photos: v })}
                  options={[['aucune', 'Aucune'], ['petites', 'Petites'], ['grandes', 'Grandes']]} />
              )}
              {zones.length > 0 && (
                <Choix titre="Classement" valeur={reglages.zones} onChange={v => setReglages({ zones: v })}
                  options={[['non', 'Par lot'], ['grouper', 'Par zone']]} />
              )}
            </SousReglage>
          </Element>
          <Element titre="Plans" detail={pastilles.length ? 'Plans annotés de pastilles' : 'Aucune remarque placée sur un plan'}
            actif={reglages.plans !== 'aucun'} onChange={v => setReglages({ plans: v ? (reglages.plansChoisis ?? 'les_deux') : 'aucun', ...(!v && { plansChoisis: reglages.plans }) })}>
            {pastilles.length > 0 && (
              <SousReglage>
                <Choix titre="Présentation" valeur={reglages.plans} onChange={v => setReglages({ plans: v })}
                  options={[['extraits', 'Extraits sous les remarques'], ['planches', 'Plans entiers'], ['les_deux', 'Les deux']]} />
              </SousReglage>
            )}
          </Element>
        </ul>
        {(lots.length > 0 || (interlocuteurs ?? []).length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9C9591', marginBottom: 6 }}>Version</span>
              <select value={reglages.destinataire} onChange={e => setReglages({ destinataire: e.target.value })}
                style={{ height: 34, padding: '0 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, background: 'white', minWidth: 220 }}>
                <option value="">Compte rendu complet</option>
                {lots.length > 0 && <optgroup label="Pour une entreprise">{lots.map(l => <option key={l.id} value={`lot:${l.id}`}>{libelleNumeroLot(l)}</option>)}</optgroup>}
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
        {/* Règle de l'agence : un PDF ne sort que d'un CR émis — l'émission
            fige le compte rendu et archive sa version officielle. Les réglages
            ci-dessus servent déjà au PDF archivé à l'émission. */}
        {cr.statut !== 'emis' ? (
          <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', background: '#FAF7F2', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <p style={{ flex: '1 1 260px', margin: 0, fontSize: 13, color: '#5E5854', lineHeight: 1.5 }}>
              Le PDF s’exporte une fois le compte rendu <strong>émis</strong> : l’émission fige son contenu et archive sa version officielle, celle qui se diffuse.
              L’aperçu permet de relire le brouillon avant.
            </p>
            {onEmettre && (
              <button type="button" onClick={onEmettre} style={bouton(true)}>
                <IconeEmission size={20} /> Émettre le CR
              </button>
            )}
          </div>
        ) : (
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={telecharger} disabled={!!enCours} style={bouton(true)}>
            <IconeExportPdf size={20} /> {enCours === 'telecharger' ? 'Préparation…' : 'Télécharger le PDF'}
          </button>
          {enCours === 'telecharger' && <span style={{ fontSize: 11, color: '#9C9591' }}>Photos et plans en cours de préparation…</span>}
        </div>
        )}
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
    <aside aria-label="Aperçu du PDF" style={{ flex: '1 1 320px', minWidth: 0, maxWidth: 440, position: 'sticky', top: 12, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', paddingBottom: 12 }}>
      <ApercuPdf cle={cleApercu} fabriquer={fabriquer} onAvertissements={setAvertissements} />
    </aside>
    </div>
  )
}
