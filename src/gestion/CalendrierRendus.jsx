import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronDown, FileDown, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../core/auth/useAuth'
import {
  rendus, grilleMois, parJour, prochaines, ecartJours, mesAffaires, equipeParAffaire,
  marquerNotion, rendusNotion, aDater, affairesNotionSeules,
} from './gestionLogique'
import { MarqueNotion } from '../shared/notion/MarqueNotion'
import { synchroniser, lienCarte } from '../shared/notion/echeancesNotion'
import { chargerCalendrier } from './gestionDonnees'
import { exporterCalendrierMois } from './exportCalendrier'
import { ModaleJalon } from './ModaleJalon'
import { ACCENT, aujourdhuiLocal } from './manifest'

// ─── Calendrier des rendus ───────────────────────────────────────────────────
//
// Tous les jalons des plannings, mois par mois : ceux du chantier à leur
// date, ceux de l'étude le vendredi de leur semaine (« S42 »), avec les
// initiales de l'équipe de l'affaire (sans les associés). À côté, les
// échéances des 30 prochains jours. Les associés y posent, modifient ou
// retirent les jalons de chaque affaire (migration 070, `ModaleJalon`) : un
// jour vide ou « + Jalon » pour en créer un, un jalon pour le modifier ; ils
// s'écrivent dans le planning de l'affaire, qui en retour nourrit le calendrier.

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const PAR_CASE = 3

const nomMois = (annee, mois) => new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const dateLongue = (iso) => {
  const t = new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function delai(jours) {
  if (jours === 0) return 'aujourd’hui'
  if (jours === 1) return 'demain'
  return `dans ${jours} j`
}

function Bascule({ actif, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      style={{
        minHeight: 34, padding: '0 12px', borderRadius: 17, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: actif ? 'none' : '0.5px solid rgba(0,0,0,0.15)', background: actif ? ACCENT : 'white', color: actif ? 'white' : '#5E5854',
      }}>
      {children}
    </button>
  )
}

// Les ronds d'initiales, comme sur la page d'une affaire : propriétaire en
// couleur, collaborateurs en gris, légèrement chevauchés
function Ronds({ equipe, taille }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {equipe.map((p, i) => (
        <span key={p.id} title={`${p.nom}${p.proprietaire ? ' (propriétaire)' : ''}`}
          style={{
            width: taille, height: taille, borderRadius: '50%', flexShrink: 0,
            background: p.proprietaire ? ACCENT : '#9C9591', color: 'white',
            fontSize: Math.round(taille * 0.42), fontWeight: 600, lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid white', marginLeft: i === 0 ? 0 : -Math.round(taille * 0.3),
            position: 'relative', zIndex: equipe.length - i,
          }}>
          {p.initiales}
        </span>
      ))}
    </span>
  )
}

function Jalon({ ev, equipe = [], compact, onOuvrir }) {
  const titre = `${ev.affaire.code_affaire ?? ''} · ${ev.affaire.nom ?? ''} — ${ev.libelle}${ev.semaine ? ` (S${ev.semaine})` : ''}`
    + (equipe.length ? `\nÉquipe : ${equipe.map((p) => p.nom).join(', ')}` : '')
    + (ev.notion?.nbDates > 1 ? ' · carte Notion à plusieurs dates, à modifier dans Notion' : '')
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOuvrir(ev) }} title={titre}
      style={{
        display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'stretch' : 'center', gap: compact ? 1 : 8,
        width: '100%', minWidth: 0, textAlign: 'left', cursor: 'pointer',
        padding: compact ? '3px 4px' : '6px 8px', border: 'none', borderLeft: `3px solid ${ev.couleur || ACCENT}`,
        background: 'rgba(0,0,0,0.03)', fontSize: compact ? 11 : 12, color: '#1F1B17', lineHeight: 1.3,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <span style={{ fontWeight: 700, flexShrink: 0 }}>{ev.affaire.code_affaire}</span>
        {ev.notion && <MarqueNotion size={compact ? 10 : 12} title={ev.notion.nbDates > 1 ? 'Carte Notion à plusieurs dates · à modifier dans Notion' : 'Liée à une carte Notion'} />}
        {equipe.length > 0 && <Ronds equipe={equipe} taille={compact ? 18 : 22} />}
      </span>
      <span style={compact
        ? { color: '#5E5854', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
        : { color: '#5E5854' }}>
        {ev.libelle}{ev.semaine ? ` · S${ev.semaine}` : ''}
      </span>
    </button>
  )
}

// Le format du PDF : la grille du mois tient sur une page A4 ou A3 paysage.
// Menu déroulant : il se referme au clic à côté.
function BoutonExport({ onExporter }) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e) => { if (!boite.current?.contains(e.target)) setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    return () => document.removeEventListener('pointerdown', dehors)
  }, [ouvert])
  return (
    <div ref={boite} style={{ position: 'relative', marginRight: 8 }}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} title="Exporter ce mois en PDF"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', border: 'none', background: ACCENT, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        <FileDown size={15} /> Exporter le PDF <ChevronDown size={14} />
      </button>
      {ouvert && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 40, zIndex: 50, minWidth: 210, background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', boxShadow: '0 12px 30px -12px rgba(31,27,23,0.35)', padding: 4 }}>
          {[['A4', 'A4 paysage'], ['A3', 'A3 paysage (plus lisible)']].map(([format, libelle]) => (
            <button key={format} type="button" role="menuitem" onClick={() => { setOuvert(false); onExporter(format) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 40, padding: '0 12px', border: 'none', background: 'none', fontSize: 13, color: '#1F1B17', cursor: 'pointer' }}>
              {libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CalendrierRendus() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const aujourdhui = aujourdhuiLocal()
  const [mois, setMois] = useState(() => ({ annee: +aujourdhui.slice(0, 4), mois: +aujourdhui.slice(5, 7) }))
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [portee, setPortee] = useState('toutes')
  const [origines, setOrigines] = useState({ etude: true, chantier: true })
  const [jourOuvert, setJourOuvert] = useState(null)
  // null | { evenement } (modifier) | { dateInitiale } (créer)
  const [modale, setModale] = useState(null)

  const [notion, setNotion] = useState({ etat: 'encours', lectureLe: null, references: [] })

  const recharger = useCallback(() => chargerCalendrier().then(setDonnees).catch((e) => setErreur(e?.message ?? String(e))), [])
  useEffect(() => { recharger() }, [recharger])

  // Lit Notion et met les deux côtés d'accord ; le calendrier se relit ensuite
  const lireNotion = useCallback(() => synchroniser().then((r) => {
    setNotion((n) => ({ etat: r.etat, lectureLe: r.lectureLe ?? n.lectureLe, references: r.references ?? n.references }))
    if (r.etat === 'ok') recharger()
  }), [recharger])
  useEffect(() => { lireNotion() }, [lireNotion])
  const actualiserNotion = () => { setNotion((n) => ({ ...n, etat: 'encours' })); return lireNotion() }

  const evenements = useMemo(() => {
    if (!donnees) return []
    const miennes = mesAffaires(donnees.collaborateurs, user?.id)
    const tous = [
      ...marquerNotion(rendus(donnees.jalonsChantier, donnees.jalonsEtude, donnees.affaires), donnees.registre),
      ...rendusNotion(donnees.registre, donnees.affaires),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.affaire.code_affaire ?? '').localeCompare(b.affaire.code_affaire ?? ''))
    return tous.filter((e) => (origines[e.origine] ?? true) && (portee === 'toutes' || (!e.affaire.horsApp && miennes.has(e.affaire.id))))
  }, [donnees, user?.id, portee, origines])
  const equipes = useMemo(() => equipeParAffaire(
    donnees?.collaborateurs, Object.fromEntries((donnees?.profils ?? []).map((p) => [p.id, p])),
  ), [donnees])
  const jours = useMemo(() => parJour(evenements), [evenements])
  const aVenir = useMemo(() => prochaines(evenements, aujourdhui, 30), [evenements, aujourdhui])
  const cartesADater = useMemo(() => aDater(donnees?.registre), [donnees])
  const affairesChoix = useMemo(
    () => [...(donnees?.affaires ?? []), ...affairesNotionSeules(notion.references, donnees?.affaires)],
    [donnees, notion.references],
  )
  const grille = grilleMois(mois.annee, mois.mois)

  const decaler = (n) => setMois(({ annee, mois: m }) => {
    const d = new Date(annee, m - 1 + n, 1)
    return { annee: d.getFullYear(), mois: d.getMonth() + 1 }
  })
  const exporter = (format) => exporterCalendrierMois({
    annee: mois.annee, mois: mois.mois, evenements, equipes, format,
    filtres: [portee === 'mes' ? 'Mes affaires' : 'Toutes les affaires',
      origines.etude && origines.chantier ? 'étude et chantier' : origines.etude ? 'étude seulement' : origines.chantier ? 'chantier seulement' : 'aucun planning'].join(', '),
    edition: new Date().toLocaleDateString('fr-FR'),
  })
  const ouvrir = (ev) => setModale({ evenement: ev })
  const allerAuPlanning = (ev) => !ev.affaire.horsApp && navigate(`/affaires/${ev.affaire.id}/${ev.origine === 'etude' ? 'planning-etude' : 'planning-chantier'}`)

  if (erreur) return <p role="alert" style={{ fontSize: 13, color: '#B8412C' }}>Lecture impossible : {erreur}</p>
  if (!donnees) return <p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>

  const parDate = parJour(aVenir)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Bascule actif={portee === 'toutes'} onClick={() => setPortee('toutes')}>Toutes les affaires</Bascule>
        <Bascule actif={portee === 'mes'} onClick={() => setPortee('mes')}>Mes affaires</Bascule>
        <span style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
        <Bascule actif={origines.etude} onClick={() => setOrigines((o) => ({ ...o, etude: !o.etude }))}>Étude</Bascule>
        <Bascule actif={origines.chantier} onClick={() => setOrigines((o) => ({ ...o, chantier: !o.chantier }))}>Chantier</Bascule>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section style={{ flex: '1 1 640px', minWidth: 0, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: '#1F1B17', textTransform: 'capitalize' }}>{nomMois(mois.annee, mois.mois)}</h2>
            {notion.etat !== 'indisponible' && (
              <>
                <span aria-live="polite" style={{ fontSize: 11, color: notion.etat === 'injoignable' ? '#B8412C' : '#9C9591' }}>
                  {notion.etat === 'encours' ? 'Lecture de Notion…'
                    : notion.etat === 'injoignable' ? 'Notion injoignable'
                      : notion.etat === 'hors-ligne' ? 'Hors ligne'
                        : notion.etat === 'ok' && notion.lectureLe ? `Notion lu à ${new Date(notion.lectureLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
                <button type="button" onClick={actualiserNotion} disabled={notion.etat === 'encours'} title="Relire les cartes de Notion et mettre les plannings d’accord"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#37352F', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: notion.etat === 'encours' ? 0.6 : 1 }}>
                  <RefreshCw size={14} /> Actualiser depuis Notion
                </button>
              </>
            )}
            <button type="button" onClick={() => setModale({ dateInitiale: aujourdhui })} title="Poser une échéance dans le planning d’une affaire"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', border: `1px solid ${ACCENT}`, background: 'rgba(122,78,156,0.10)', color: ACCENT, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <Plus size={15} /> Échéance
            </button>
            <BoutonExport onExporter={exporter} />
            <button type="button" onClick={() => decaler(-1)} aria-label="Mois précédent" style={{ width: 36, height: 36, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => setMois({ annee: +aujourdhui.slice(0, 4), mois: +aujourdhui.slice(5, 7) })} style={{ minHeight: 36, padding: '0 12px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', cursor: 'pointer', fontSize: 12 }}>Aujourd’hui</button>
            <button type="button" onClick={() => decaler(1)} aria-label="Mois suivant" style={{ width: 36, height: 36, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={18} /></button>
          </header>
          <div role="grid" aria-label="Calendrier du mois" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {JOURS.map((j) => (
              <div key={j} role="columnheader" style={{ padding: '6px 6px', fontSize: 11, fontWeight: 600, color: '#9C9591', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>{j}</div>
            ))}
            {grille.flat().map((c, i) => {
              const evs = jours.get(c.date) ?? []
              const ouvert = jourOuvert === c.date
              const visibles = ouvert ? evs : evs.slice(0, PAR_CASE)
              const estAujourdhui = c.date === aujourdhui
              const weekEnd = i % 7 >= 5
              return (
                <div key={c.date} role="gridcell" aria-label={dateLongue(c.date)} title="Cliquer pour poser une échéance ce jour"
                  onClick={() => setModale({ dateInitiale: c.date })}
                  style={{
                    cursor: 'copy',
                    minHeight: 96, padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
                    borderRight: i % 7 < 6 ? '0.5px solid rgba(0,0,0,0.06)' : 'none', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                    background: weekEnd ? '#FAF7F2' : 'white', opacity: c.duMois ? 1 : 0.45,
                  }}>
                  <span style={{
                    alignSelf: 'flex-start', minWidth: 22, height: 22, padding: '0 4px', borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: estAujourdhui ? 700 : 500, color: estAujourdhui ? 'white' : '#5E5854', background: estAujourdhui ? ACCENT : 'transparent',
                  }}>{+c.date.slice(8, 10)}</span>
                  {visibles.map((ev) => <Jalon key={ev.id} ev={ev} equipe={equipes.get(ev.affaire.id)} compact onOuvrir={ouvrir} />)}
                  {/* Le reste de la case : un jalon à ce jour */}
                  <span style={{ flex: 1, minHeight: 8 }} />
                  {evs.length > PAR_CASE && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setJourOuvert(ouvert ? null : c.date) }}
                      style={{ border: 'none', background: 'none', padding: '2px 4px', fontSize: 11, color: ACCENT, cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}>
                      {ouvert ? 'Réduire' : `+ ${evs.length - PAR_CASE} autre${evs.length - PAR_CASE > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {cartesADater.length > 0 && (
            <div style={{ padding: '12px 14px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>À dater</h3>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#5E5854' }}>Cartes de la colonne ECHEANCES RENDUS dont la date n’a pas pu être lue.</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cartesADater.map((c) => (
                  <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#1F1B17' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{c.texte || c.reference}</span>
                    <a href={lienCarte(c.pageId)} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>Ouvrir dans Notion</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside style={{ flex: '1 1 280px', maxWidth: 420, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 14px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>
            Prochaines échéances <span style={{ fontSize: 12, fontWeight: 400, color: '#9C9591' }}>· 30 jours</span>
          </h2>
          {aVenir.length === 0 && <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Aucun rendu prévu dans les 30 jours.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...parDate.entries()].map(([date, evs]) => {
              const d = ecartJours(aujourdhui, date)
              return (
                <div key={date}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: d <= 7 ? '#B8412C' : '#5E5854' }}>
                    {dateLongue(date)} · {delai(d)}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {evs.map((ev) => (
                      <div key={ev.id}>
                        <Jalon ev={ev} equipe={equipes.get(ev.affaire.id)} onOuvrir={ouvrir} />
                        <p style={{ margin: '2px 0 0 11px', fontSize: 11, color: '#9C9591' }}>
                          {[ev.affaire.nom, (equipes.get(ev.affaire.id) ?? []).map((p) => p.nom).join(', '), ev.origine === 'notion' ? 'Notion' : ev.origine === 'etude' ? 'planning d’étude' : 'planning chantier'].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      {modale && (
        <ModaleJalon evenement={modale.evenement ?? null} dateInitiale={modale.dateInitiale} affaires={affairesChoix}
          onFermer={() => setModale(null)}
          onEnregistre={() => { setModale(null); recharger(); actualiserNotion() }}
          onOuvrirPlanning={allerAuPlanning} />
      )}
    </div>
  )
}
