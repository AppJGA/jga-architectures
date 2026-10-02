import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, Download, Lock, X } from 'lucide-react'
import {
  normaliserGeneralites, aDuTexte, squeletteHabituel, copierPourImport,
  ajouter, modifier, supprimer, deplacer, generalitesAImprimer,
} from './generalitesLogique'

// ─── Généralités du compte rendu (parties I à V) ─────────────────────────────
//
// Une version par affaire (migration 055) : ce qui s'écrit ici s'imprime dans
// tous les comptes rendus de l'affaire. Enregistrement automatique, une
// seconde après la dernière frappe : rien ne se perd en quittant l'écran.
// Un CR émis montre, en lecture, la version copiée le jour de son émission.

const nouvelId = () => crypto.randomUUID()

const CHAMP = {
  border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 2, background: 'white',
  fontSize: 13, color: '#1F1B17', padding: '6px 8px', boxSizing: 'border-box', fontFamily: 'inherit',
}
const BOUTON_DISCRET = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 2, fontSize: 11,
  border: '0.5px dashed rgba(0,0,0,0.2)', backgroundColor: 'transparent', color: '#5E5854', cursor: 'pointer',
}

function Fleches({ id, onDeplacer, onSupprimer, libelle }) {
  const petit = { padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', display: 'flex' }
  return (
    <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
      <button type="button" data-compact title="Monter" onClick={() => onDeplacer(id, -1)} style={petit}><ChevronUp size={13} /></button>
      <button type="button" data-compact title="Descendre" onClick={() => onDeplacer(id, 1)} style={petit}><ChevronDown size={13} /></button>
      <button type="button" data-compact title={`Supprimer ${libelle}`} onClick={() => onSupprimer(id)} style={petit}><Trash2 size={13} /></button>
    </div>
  )
}

// Un paragraphe : son texte, et le repère de suite (▶). Pas de date : les
// généralités valent pour tous les comptes rendus de l'affaire.
function Paragraphe({ p, edition, actions }) {
  if (!edition) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', paddingLeft: p.suite ? 16 : 0 }}>
        {p.suite && <span style={{ fontSize: 11, color: '#9C9591', flexShrink: 0 }}>▶</span>}
        <span style={{ fontSize: 13, color: '#1F1B17', whiteSpace: 'pre-wrap', flex: 1 }}>{p.texte}</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', paddingLeft: p.suite ? 20 : 0 }}>
      <textarea value={p.texte} placeholder="Texte du paragraphe…"
        rows={Math.min(8, Math.max(2, Math.ceil(p.texte.length / 90) + (p.texte.match(/\n/g)?.length ?? 0)))}
        onChange={e => actions.modifier(p.id, { texte: e.target.value })}
        style={{ ...CHAMP, flex: 1, resize: 'vertical', lineHeight: 1.45, minHeight: 0 }} />
      <label title="Suite du paragraphe précédent (▶)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5E5854', cursor: 'pointer', flexShrink: 0, paddingTop: 6 }}>
        <input type="checkbox" checked={p.suite} onChange={e => actions.modifier(p.id, { suite: e.target.checked })} style={{ accentColor: '#E8602C' }} />
        ▶ suite
      </label>
      <Fleches id={p.id} libelle="le paragraphe" onDeplacer={actions.deplacer} onSupprimer={actions.supprimer} />
    </div>
  )
}

export function GeneralitesVue({ cr, generalites, peutModifier, signalerErreur }) {
  const { contenu, chargement, disponible, majLe, enregistrer, sourcesImport } = generalites
  const emis = cr?.statut === 'emis'
  const edition = peutModifier && !emis
  // Brouillon local, nul tant que rien n'a été touché : l'écran montre alors
  // la version enregistrée
  const [brouillon, setBrouillon] = useState(null)
  const [etat, setEtat] = useState('enregistre') // enregistre | modifie | enregistrement | erreur
  const [importOuvert, setImportOuvert] = useState(false)
  const [sources, setSources] = useState(null)
  // Dernière version saisie : une frappe pendant un enregistrement doit
  // relancer l'enregistrement suivant, pas se perdre
  const dernier = useRef(null)

  const affiche = emis ? generalitesAImprimer(cr, contenu) : (brouillon ?? normaliserGeneralites(contenu))

  // Enregistrement une seconde après la dernière modification
  useEffect(() => {
    if (brouillon === null || etat !== 'modifie') return undefined
    const minuteur = setTimeout(async () => {
      const envoye = brouillon
      setEtat('enregistrement')
      try {
        await enregistrer(envoye)
        setEtat(dernier.current === envoye ? 'enregistre' : 'modifie')
      } catch (err) {
        setEtat('erreur')
        signalerErreur(err)
      }
    }, 1000)
    return () => clearTimeout(minuteur)
  }, [brouillon, etat, enregistrer, signalerErreur])

  const changer = (f) => {
    const suivant = f(affiche)
    dernier.current = suivant
    setBrouillon(suivant)
    setEtat('modifie')
  }
  const actions = {
    modifier: (id, champs) => changer(g => modifier(g, id, champs)),
    deplacer: (id, sens) => changer(g => deplacer(g, id, sens)),
    supprimer: (id) => {
      if (!window.confirm('Supprimer cet élément et tout ce qu’il contient ?')) return
      changer(g => supprimer(g, id))
    },
    ajouter: (parentId, type) => changer(g => ajouter(g, parentId, type, nouvelId)),
  }

  const ouvrirImport = async () => {
    setImportOuvert(true)
    try { setSources(await sourcesImport()) } catch (err) { signalerErreur(err); setSources([]) }
  }
  const importer = (source) => {
    if (aDuTexte(affiche) && !window.confirm(`Remplacer les généralités actuelles par celles de « ${source.nom} » ?`)) return
    changer(() => copierPourImport(source.contenu, nouvelId))
    setImportOuvert(false)
  }

  if (!disponible) {
    return (
      <p style={{ fontSize: 13, color: '#5E5854', background: 'white', padding: 16, border: '0.5px solid rgba(0,0,0,0.08)' }}>
        Les généralités demandent la mise à jour 055 de la base (Supabase → SQL Editor).
      </p>
    )
  }
  if (chargement) return <p style={{ fontSize: 12, color: '#9C9591' }}>Chargement…</p>

  const vide = affiche.parties.length === 0

  return (
    <div>
      {/* Bandeau : ce que c'est, état de l'enregistrement, import */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ flex: 1, minWidth: 260, fontSize: 12, color: '#5E5854', margin: 0, lineHeight: 1.5 }}>
          {emis
            ? <><Lock size={12} style={{ verticalAlign: -1 }} /> {cr.generalites ? 'Version copiée le jour de l’émission de ce compte rendu.' : 'Compte rendu émis avant les généralités : la version actuelle de l’affaire est affichée.'}</>
            : 'Parties I à V, communes à tous les comptes rendus de l’affaire. Elles s’impriment avant les remarques.'}
        </p>
        {edition && (
          <span style={{ fontSize: 11, color: etat === 'erreur' ? '#B8412C' : '#9C9591' }}>
            {etat === 'enregistrement' ? 'Enregistrement…'
              : etat === 'modifie' ? 'Modifications en cours…'
                : etat === 'erreur' ? 'Non enregistré'
                  : majLe ? `Enregistré le ${new Date(majLe).toLocaleDateString('fr-FR')}` : ''}
          </span>
        )}
        {edition && (
          <button type="button" onClick={ouvrirImport} style={{ ...BOUTON_DISCRET, borderStyle: 'solid', color: '#1B3A5C' }}>
            <Download size={12} /> Importer d’une autre affaire
          </button>
        )}
      </div>

      {importOuvert && (
        <div style={{ background: 'white', border: '0.5px solid rgba(27,58,92,0.3)', padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#1B3A5C', margin: 0 }}>Importer les généralités d’une autre affaire</p>
            <button type="button" onClick={() => setImportOuvert(false)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591' }}><X size={14} /></button>
          </div>
          {sources === null ? <p style={{ fontSize: 12, color: '#9C9591' }}>Recherche…</p>
            : sources.length === 0 ? <p style={{ fontSize: 12, color: '#9C9591' }}>Aucune autre affaire n’a encore de généralités.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sources.map(s => (
                    <button key={s.affaireId} type="button" onClick={() => importer(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left', border: '0.5px solid rgba(0,0,0,0.08)', background: '#FAF7F2', cursor: 'pointer' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9C9591', minWidth: 60 }}>{s.code}</span>
                      <span style={{ flex: 1, fontSize: 13, color: '#1F1B17' }}>{s.nom}</span>
                      <span style={{ fontSize: 11, color: '#9C9591' }}>{normaliserGeneralites(s.contenu).parties.length} parties</span>
                    </button>
                  ))}
                </div>
              )}
        </div>
      )}

      {vide && (
        <div style={{ background: 'white', border: '0.5px dashed rgba(0,0,0,0.2)', padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#5E5854', margin: '0 0 12px' }}>Aucune généralité pour cette affaire.</p>
          {edition && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => changer(() => squeletteHabituel(nouvelId))}
                style={{ padding: '7px 14px', borderRadius: 2, fontSize: 12, border: 'none', background: '#E8602C', color: 'white', cursor: 'pointer' }}>
                Partir des titres habituels (I à V)
              </button>
              <button type="button" onClick={ouvrirImport}
                style={{ padding: '7px 14px', borderRadius: 2, fontSize: 12, border: '0.5px solid #1B3A5C', background: 'white', color: '#1B3A5C', cursor: 'pointer' }}>
                Importer d’une autre affaire
              </button>
            </div>
          )}
        </div>
      )}

      {affiche.parties.map(partie => (
        <div key={partie.id} style={{ marginBottom: 12, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#FFF8F5', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            {edition ? (
              <>
                <input value={partie.numero_romain} aria-label="Numéro de la partie" onChange={e => actions.modifier(partie.id, { numero_romain: e.target.value })}
                  style={{ ...CHAMP, width: 56, fontWeight: 600, color: '#E8602C', minHeight: 0 }} />
                <input value={partie.titre} placeholder="Titre de la partie" onChange={e => actions.modifier(partie.id, { titre: e.target.value })}
                  style={{ ...CHAMP, flex: 1, fontWeight: 500, textTransform: 'uppercase', minHeight: 0 }} />
                <Fleches id={partie.id} libelle="la partie" onDeplacer={actions.deplacer} onSupprimer={actions.supprimer} />
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, textTransform: 'uppercase' }}>
                <span style={{ color: '#E8602C', marginRight: 8 }}>{partie.numero_romain}</span>{partie.titre}
              </p>
            )}
          </div>
          <div style={{ padding: '8px 14px 12px' }}>
            {partie.paragraphes.map(p => <Paragraphe key={p.id} p={p} edition={edition} actions={actions} />)}
            {partie.rubriques.map(r => (
              <div key={r.id} style={{ marginTop: 8 }}>
                {edition ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={r.code} aria-label="Code de la rubrique" onChange={e => actions.modifier(r.id, { code: e.target.value })}
                      style={{ ...CHAMP, width: 64, minHeight: 0 }} />
                    <input value={r.titre} placeholder="Titre de la rubrique" onChange={e => actions.modifier(r.id, { titre: e.target.value })}
                      style={{ ...CHAMP, flex: 1, fontWeight: 600, minHeight: 0 }} />
                    <Fleches id={r.id} libelle="la rubrique" onDeplacer={actions.deplacer} onSupprimer={actions.supprimer} />
                  </div>
                ) : (
                  <p style={{ margin: '4px 0', fontSize: 12, fontWeight: 600, color: '#1F1B17' }}>{r.code}-{r.titre}</p>
                )}
                <div style={{ marginLeft: edition ? 16 : 0 }}>
                  {r.paragraphes.map(p => <Paragraphe key={p.id} p={p} edition={edition} actions={actions} />)}
                  {edition && (
                    <button type="button" onClick={() => actions.ajouter(r.id, 'paragraphe')} style={{ ...BOUTON_DISCRET, marginTop: 4 }}>
                      <Plus size={11} /> Paragraphe
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!edition && partie.paragraphes.length === 0 && partie.rubriques.every(r => r.paragraphes.length === 0) && (
              <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', margin: '4px 0' }}>Rien de saisi</p>
            )}
            {edition && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => actions.ajouter(partie.id, 'rubrique')} style={BOUTON_DISCRET}><Plus size={11} /> Rubrique</button>
                <button type="button" onClick={() => actions.ajouter(partie.id, 'paragraphe')} style={BOUTON_DISCRET}><Plus size={11} /> Paragraphe sans rubrique</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {edition && !vide && (
        <button type="button" onClick={() => actions.ajouter(null, 'partie')} style={{ ...BOUTON_DISCRET, padding: '8px 14px', fontSize: 12 }}>
          <Plus size={13} /> Ajouter une partie
        </button>
      )}
    </div>
  )
}
