import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { chargerGestion } from './gestionAppDonnees'
import { LIMITES, jauge, parSorte, parAffaire, etatComptes, formatTaille } from './gestionAppLogique'
import { NettoyageStockage } from '../modules/chantier/comptes-rendus/NettoyageStockage'

// ─── Gestion de l'application ────────────────────────────────────────────────
//
// Le tableau de bord de l'administrateur (conception :
// docs/superpowers/specs/2026-10-22-gestion-application-design.md) : la place
// prise dans l'offre gratuite de Supabase, les comptes, la santé de l'app et
// son activité. Lecture seule, sauf le nettoyage des fichiers inutilisés.

const ARDOISE = '#4A5560'
const ORANGE = '#C2410C'

const fmtDate = (iso, avecHeure = false) => (iso
  ? new Date(iso).toLocaleString('fr-FR', avecHeure
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—')

function Carte({ titre, children, large = false }) {
  return (
    <section style={{ gridColumn: large ? '1 / -1' : undefined, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderTop: `3px solid ${ARDOISE}`, padding: '16px 18px', minWidth: 0 }}>
      <h2 style={{ margin: '0 0 14px', fontFamily: "'Archivo', sans-serif", fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>{titre}</h2>
      {children}
    </section>
  )
}

function Jauge({ titre, j }) {
  const pct = Math.round(j.part * 100)
  const couleur = j.alerte ? ORANGE : ARDOISE
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>{titre}</span>
        <span style={{ fontSize: 13, color: couleur, fontVariantNumeric: 'tabular-nums' }}>
          {formatTaille(j.octets)} / {formatTaille(j.limite)} · <strong>{pct} %</strong>
        </span>
      </div>
      <div role="meter" aria-label={titre} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ height: 10, background: '#EEEBE6', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: couleur }} />
      </div>
      {j.alerte && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', fontSize: 12, color: ORANGE }}>
          <AlertTriangle size={13} /> Plus de 80 % de l’offre gratuite : nettoyer, ou prévoir le passage à l’offre payante.
        </p>
      )}
    </div>
  )
}

function Chiffre({ valeur, libelle }) {
  return (
    <div style={{ padding: '10px 12px', background: '#FAF7F2', minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 500, color: '#1F1B17', fontVariantNumeric: 'tabular-nums' }}>{valeur ?? '—'}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>{libelle}</p>
    </div>
  )
}

const ligneTableau = { borderTop: '0.5px solid rgba(0,0,0,0.06)' }
const cellule = { padding: '6px 8px', fontSize: 12, color: '#1F1B17', textAlign: 'left', verticalAlign: 'top' }
const entete = { ...cellule, fontSize: 11, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.04em' }

// `source` : la lecture des données (remplaçable pour un essai à l'écran)
export default function GestionApplicationPage({ source = chargerGestion }) {
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)

  const lire = useCallback(() => source()
    .then((d) => { setDonnees(d); setErreur(null) })
    .catch((err) => setErreur(err?.message ?? String(err)))
    .finally(() => setChargement(false)), [source])
  useEffect(() => { lire() }, [lire])
  const charger = () => { setChargement(true); lire() }

  const fichiers = useMemo(() => (donnees ? donnees.stockage.reduce((s, l) => s + (Number(l.octets) || 0), 0) : 0), [donnees])
  const sortes = useMemo(() => parSorte(donnees?.stockage), [donnees])
  const lourdes = useMemo(() => parAffaire(donnees?.stockage, donnees?.affaires, 10), [donnees])
  const comptes = useMemo(() => etatComptes(donnees?.comptes), [donnees])
  const commit = import.meta.env.VITE_COMMIT
  const construitLe = import.meta.env.VITE_CONSTRUIT_LE

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Archivo', sans-serif", fontSize: 22, fontWeight: 500, color: '#1F1B17' }}>Gestion de l’application</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9C9591' }}>Réservé à l’administrateur · limites de l’offre gratuite de Supabase</p>
        </div>
        <button type="button" onClick={charger} disabled={chargement}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: ARDOISE, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={14} /> {chargement ? 'Lecture…' : 'Actualiser'}
        </button>
      </div>

      {erreur && <p role="alert" style={{ margin: '0 0 14px', fontSize: 13, color: '#B8412C' }}>Lecture impossible : {erreur}</p>}
      {donnees && !donnees.migration074 && (
        <p role="status" style={{ margin: '0 0 14px', padding: '10px 14px', fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B' }}>
          La migration 074 n’est pas encore passée dans Supabase : stockage détaillé, taille de la base et comptes s’afficheront une fois qu’elle le sera.
        </p>
      )}
      {!donnees && !erreur && <p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>}

      {donnees && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
          <Carte titre="Stockage">
            {donnees.migration074 ? (
              <>
                <Jauge titre="Fichiers (photos, plans, PDF…)" j={jauge(fichiers, LIMITES.fichiers)} />
                <Jauge titre="Base de données" j={jauge(donnees.base, LIMITES.base)} />
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
                  <thead><tr><th style={entete}>Fichiers</th><th style={{ ...entete, textAlign: 'right' }}>Nombre</th><th style={{ ...entete, textAlign: 'right' }}>Taille</th></tr></thead>
                  <tbody>
                    {sortes.map((s) => (
                      <tr key={s.sorte} style={ligneTableau}>
                        <td style={cellule}>{s.libelle}</td>
                        <td style={{ ...cellule, textAlign: 'right' }}>{s.fichiers.toLocaleString('fr-FR')}</td>
                        <td style={{ ...cellule, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatTaille(s.octets)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#5E5854' }}>Détail disponible après la migration 074.</p>
            )}
            <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>Fichiers que plus rien n’utilise — photos et plans des visites, PDF archivés, photos de couverture des affaires (affaire supprimée, photo remplacée, envoi interrompu) :</p>
            <NettoyageStockage onTermine={charger} onErreur={(err) => setErreur(err?.message ?? String(err))} />
          </Carte>

          <Carte titre="Affaires qui pèsent le plus">
            {lourdes.length === 0 ? (
              <p style={{ fontSize: 13, color: '#5E5854' }}>{donnees.migration074 ? 'Aucun fichier.' : 'Disponible après la migration 074.'}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={entete}>Affaire</th><th style={{ ...entete, textAlign: 'right' }}>Fichiers</th><th style={{ ...entete, textAlign: 'right' }}>Taille</th></tr></thead>
                <tbody>
                  {lourdes.map((a) => (
                    <tr key={a.affaireId ?? 'hors'} style={ligneTableau}>
                      <td style={{ ...cellule, color: a.affaireId ? '#1F1B17' : '#9C9591' }}>{a.libelle}</td>
                      <td style={{ ...cellule, textAlign: 'right' }}>{a.fichiers.toLocaleString('fr-FR')}</td>
                      <td style={{ ...cellule, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatTaille(a.octets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Carte>

          <Carte titre="Comptes" large>
            {donnees.migration074 ? (
              <>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5E5854' }}>
                  {comptes.total} compte{comptes.total > 1 ? 's' : ''} · {comptes.agence} agence · {comptes.exterieurs} extérieur{comptes.exterieurs > 1 ? 's' : ''} · {comptes.associes} associé{comptes.associes > 1 ? 's' : ''}
                  {comptes.sansProfil > 0 && <strong style={{ color: '#B8412C' }}> · {comptes.sansProfil} sans profil</strong>}
                </p>
                {comptes.sansProfil > 0 && (
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: '#B8412C' }}>
                    Un compte sans fiche de profil ne voit rien dans l’app : sa ligne de « profiles » est à créer dans Supabase.
                  </p>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead><tr><th style={entete}>Nom</th><th style={entete}>E-mail</th><th style={entete}>Type</th><th style={entete}>Rôle</th><th style={entete}>Créé le</th><th style={entete}>Dernière connexion</th></tr></thead>
                    <tbody>
                      {donnees.comptes.map((c) => {
                        const rouge = !c.a_un_profil
                        const st = { ...cellule, color: rouge ? '#B8412C' : '#1F1B17' }
                        return (
                          <tr key={c.id} style={{ ...ligneTableau, background: rouge ? '#FEF2F2' : undefined }}>
                            <td style={st}>{rouge ? 'Sans profil' : [c.prenom, c.nom].filter(Boolean).join(' ')}</td>
                            <td style={st}>{c.email}</td>
                            <td style={st}>{rouge ? '—' : c.type_compte === 'agence' ? 'Agence' : 'Extérieur'}</td>
                            <td style={st}>{[c.est_associe && 'Associé', c.est_admin && 'Administrateur'].filter(Boolean).join(', ') || '—'}</td>
                            <td style={st}>{fmtDate(c.cree_le)}</td>
                            <td style={st}>{c.derniere_connexion ? fmtDate(c.derniere_connexion, true) : 'Jamais'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#5E5854' }}>Liste des comptes disponible après la migration 074.</p>
            )}
          </Carte>

          <Carte titre="Santé de l’app">
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13 }}>
              <dt style={{ color: '#5E5854' }}>Version en ligne</dt>
              <dd style={{ margin: 0, color: '#1F1B17' }}>
                {construitLe ? `mise en ligne le ${fmtDate(construitLe, true)}` : '—'}
                {commit && <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#9C9591' }}> · {commit}</span>}
              </dd>
              <dt style={{ color: '#5E5854' }}>Envois en attente sur cet appareil</dt>
              <dd style={{ margin: 0, color: donnees.envoisEnAttente ? ORANGE : '#2A8A4E' }}>
                {donnees.envoisEnAttente ? `${donnees.envoisEnAttente} modification${donnees.envoisEnAttente > 1 ? 's' : ''} de visite à envoyer` : 'Aucun'}
              </dd>
              <dt style={{ color: '#5E5854' }}>Échéances non envoyées à Notion</dt>
              <dd style={{ margin: 0, color: donnees.notionEnAttente ? ORANGE : donnees.notionEnAttente === 0 ? '#2A8A4E' : '#9C9591' }}>
                {donnees.notionEnAttente == null ? 'Synchronisation Notion non installée (migration 071)' : donnees.notionEnAttente ? `${donnees.notionEnAttente} en attente : ouvrir le calendrier des rendus pour relancer` : 'Aucune'}
              </dd>
            </dl>
          </Carte>

          <Carte titre="Activité">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <Chiffre valeur={donnees.compteurs.affaires} libelle="affaires" />
              <Chiffre valeur={donnees.compteurs.visites} libelle="visites de chantier" />
              <Chiffre valeur={donnees.compteurs.photos} libelle="photos" />
              <Chiffre valeur={donnees.compteurs.plans} libelle="plans" />
              <Chiffre valeur={donnees.compteurs.pieces} libelle="pièces écrites" />
              <Chiffre valeur={donnees.compteurs.comptes} libelle="comptes" />
            </div>
          </Carte>
        </div>
      )}
    </div>
  )
}
