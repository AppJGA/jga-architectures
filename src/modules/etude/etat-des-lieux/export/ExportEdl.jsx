import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileDown, Maximize2, RefreshCw, X, Check } from 'lucide-react'
import { useAffaire } from '../../../../shared/hooks/useAffaires'
import { useAuth } from '../../../../core/auth/useAuth'
import { telechargerBlob } from '../../../chantier/comptes-rendus/genererRapport'
import {
  STYLE_CORPS, STYLE_REGLAGES, STYLE_COLONNE_APERCU,
} from '../../../../shared/planning/export/styleFenetreExport'
import { lireDonneesExport, chargerPlanNiveau } from './exportDonnees'
import { genererRapportEdl } from './genererRapportEdl'
import {
  avertissementsExport, cleDxf, cleRapport, clesAEvincer, clesAGarder, dessinDxf, dxfDuNiveau, exportPossible,
  fabriquerZip, fichiersDxf, nomFichierZip, nomsFichiersDxf, noteUniteArchicad, preparerExport, rapportVoulu, reglagesParDefaut, uniteEtage,
} from './exportFenetreLogique'
import { nomFichierRapportEdl, nomFichierWordEdl } from './rapportEdlLogique'
import { PlancheSymboles } from './PlancheSymboles'
import { ApercuDxfEdl } from './ApercuDxfEdl'

// ─── Fenêtre d'export de l'état des lieux ────────────────────────────────────
//
// Demande de l'agence (2026-11-18) : « un aperçu dynamique, un peu comme pour
// les plannings, pour contrôler avant d'exporter ». Même présentation que
// l'export des plannings : réglages à gauche, aperçu à droite refait 450 ms
// après le dernier réglage, anciennes pages pâlies pendant ce temps,
// « Agrandir » en plein écran (✕, Échap). Onglets : le rapport PDF (pages
// rendues par pdf.js) et le DXF de chaque étage (le fichier produit, relu et
// dessiné). Aperçu et ZIP partent des mêmes fonctions et des mêmes sorties,
// gardées par clé de réglages : ce qui se voit est ce qui part, et le ZIP ne
// refait pas ce que l'aperçu a déjà fabriqué. Rien n'est écrit en base : un
// compte en lecture seule exporte aussi.

const ATTENTE_MS = 450
const LARGEUR_PAGE = 760
const ACCENT = 'var(--affaire-accent, #E8602C)'
const ENCRE = '#1F1B17'
const GRIS = '#5E5854'
const PALE = '#9C9591'
const AMBRE = { fond: '#FFFBEB', bord: '#F59E0B', texte: '#92400E' }

const titreSection = { margin: '0 0 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALE }
const boutonPrincipal = { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 18px', border: 'none', borderRadius: 3, background: ACCENT, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const boutonSecondaire = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: ENCRE, fontSize: 13, cursor: 'pointer' }
const boutonPetit = { display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, padding: '0 10px', fontSize: 11, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 2, cursor: 'pointer', color: '#374151' }
const caseACocher = { width: 18, height: 18, minHeight: 0, margin: 0, flexShrink: 0, accentColor: ACCENT }
const ligneCase = { minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: ENCRE }

// Génération devenue inutile (réglages changés, fenêtre fermée) : arrêtée à
// l'étape suivante du rapport, sans message
class Abandon extends Error {}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

function nouveauxCaches() {
  // dxf : clé → { promesse (texte), regle } ; dessins : clé → dessin relu ;
  // rapport : clé → { promesse ({ blob, nomFichier, avertissements }), regle }.
  // Bornés par `elaguer` : seulement ce que l'écran montre et ce qu'un
  // export attend (exportFenetreLogique.js, `clesAGarder`)
  return { dxf: new Map(), dessins: new Map(), rapport: new Map() }
}

function elaguer(c, garder) {
  for (const k of clesAEvincer(c.rapport, garder.rapport)) c.rapport.delete(k)
  for (const k of clesAEvincer(c.dxf, garder.dxf)) c.dxf.delete(k)
  for (const k of clesAEvincer(c.dessins, garder.dessins)) c.dessins.delete(k)
}

// Une fabrication gardée par clé : réglée, elle devient évinçable ; un
// échec (réseau) n'est pas retenu, le prochain essai refait
function memoriser(cache, cle, fabriquer, surRegle) {
  if (!cache.has(cle)) {
    const entree = { promesse: null, regle: false }
    entree.promesse = fabriquer()
    cache.set(cle, entree)
    entree.promesse.then(
      () => { entree.regle = true; surRegle?.() },
      () => { entree.regle = true; if (cache.get(cle) === entree) cache.delete(cle); surRegle?.() },
    )
  }
  return cache.get(cle).promesse
}

// Un DXF fabriqué une fois par clé ; l'aperçu et le ZIP le partagent
function obtenirDxf(caches, etage, reglages, avecPlan, obtenirLiens, surRegle) {
  return memoriser(caches.dxf, cleDxf(etage.niveau.id, reglages, avecPlan), () => (
    (avecPlan ? chargerPlanNiveau(etage.niveau, obtenirLiens) : Promise.resolve(null))
      .then((plan) => dxfDuNiveau(etage, { plan, inclurePropositions: !!reglages.inclurePropositions }))
  ), surRegle)
}

function liberer(pages) {
  for (const p of pages ?? []) URL.revokeObjectURL(p.url)
}

// La valeur, 450 ms après son dernier changement : une rafale de coches ne
// refabrique l'aperçu qu'une fois
function useDiffere(valeur, ms) {
  const [differe, setDiffere] = useState(valeur)
  useEffect(() => {
    const minuterie = setTimeout(() => setDiffere(valeur), ms)
    return () => clearTimeout(minuterie)
  }, [valeur, ms])
  return differe
}

function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => {
    const suivre = () => setEnLigne(navigator.onLine)
    window.addEventListener('online', suivre)
    window.addEventListener('offline', suivre)
    return () => { window.removeEventListener('online', suivre); window.removeEventListener('offline', suivre) }
  }, [])
  return enLigne
}

export function ExportEdl({ affaireId, obtenirLiens, enAttente = 0, onFermer }) {
  const { affaire, loading: affaireEnLecture } = useAffaire(affaireId)
  const { profil } = useAuth()
  const redacteur = [profil?.prenom, profil?.nom].filter(Boolean).join(' ')
  // Une date pour toute la séance : les noms des fichiers et la page de
  // garde ne changent pas si l'export passe minuit
  const [date] = useState(() => new Date())
  const enLigne = useEnLigne()

  // Couleur de la phase : le portail sort du cadre de l'affaire qui la porte
  const ancre = useRef(null)
  const [accent, setAccent] = useState(null)
  useLayoutEffect(() => {
    const valeur = ancre.current && getComputedStyle(ancre.current).getPropertyValue('--affaire-accent').trim()
    if (valeur) setAccent(valeur)
  }, [])

  // ── Lecture ──
  const [lecture, setLecture] = useState({ etat: 'chargement' })
  const [reglages, setReglages] = useState(null)
  const caches = useRef(nouveauxCaches())
  const charger = useCallback(() => {
    let vivant = true
    lireDonneesExport(affaireId).then(
      (d) => {
        if (!vivant) return
        if (d.indisponible) { setLecture({ etat: 'indisponible' }); return }
        caches.current = nouveauxCaches()
        setLecture({ etat: 'pret', donnees: d })
        setReglages(reglagesParDefaut(d.niveaux))
      },
      (err) => { if (vivant) setLecture({ etat: 'echec', message: err?.message ?? String(err) }) },
    )
    return () => { vivant = false }
  }, [affaireId])
  useEffect(() => charger(), [charger])
  const relire = () => { setLecture({ etat: 'chargement' }); charger() }
  const donnees = lecture.donnees ?? null

  // ── Réglages et aperçu différé ──
  const reglagesApercu = useDiffere(reglages, ATTENTE_MS)
  const pret = !!donnees && !!reglages && !affaireEnLecture
  const affaireExport = useMemo(() => affaire ?? { id: affaireId }, [affaire, affaireId])
  const preparation = useMemo(
    () => (donnees && reglagesApercu ? preparerExport(donnees, reglagesApercu) : null),
    [donnees, reglagesApercu],
  )
  const noms = useMemo(() => nomsFichiersDxf(affaireExport, donnees?.niveaux ?? [], date), [affaireExport, donnees, date])

  // La génération du rapport en cours s'arrête dès que ses réglages ne sont
  // plus ceux de l'écran (ou que la fenêtre se ferme)
  const cleVivante = useRef(null)
  useEffect(() => {
    cleVivante.current = rapportVoulu(reglages) ? cleRapport(reglages) : null
  }, [reglages])
  useEffect(() => () => { cleVivante.current = null }, [])

  // Ce que l'écran montre et ce qu'un export attend : le reste des caches
  // part dès que ses fabrications sont finies
  const vus = useRef({ reglages: [], etageVisible: null, dessinVisible: null })
  const retenues = useRef(new Set())
  const elaguerMaintenant = useCallback(() => {
    elaguer(caches.current, clesAGarder({ ...vus.current, retenues: [...retenues.current] }))
  }, [])

  const [etapeRapport, setEtapeRapport] = useState(null) // { cle, texte }
  const obtenirRapport = useCallback((voulus) => {
    const cle = cleRapport(voulus)
    // Arrêt d'une fabrication périmée : entre deux étapes, avant chaque
    // extrait de pièce et avant chaque photo
    const verifier = () => { if (cleVivante.current !== cle) throw new Abandon() }
    const surEtape = (texte) => {
      verifier()
      setEtapeRapport({ cle, texte })
    }
    return memoriser(caches.current.rapport, cle, () => (async () => {
      const r = preparerExport(donnees, voulus).rapport
      // Les plans par le même chemin que les DXF « avec plan » (déjà lus
      // si l'aperçu d'un DXF les a ouverts) ; un plan illisible ici est
      // retenté, puis remplacé par l'aperçu, par le rapport lui-même
      surEtape('Rapport : plans des étages…')
      const vecteurs = new Map()
      for (const n of r.niveaux) {
        const v = await chargerPlanNiveau(n, obtenirLiens).catch(() => null)
        if (v) vecteurs.set(n.id, v)
      }
      return genererRapportEdl({ affaire: affaireExport, etat: donnees.etat, ...r, redacteur, date, obtenirLiens, vecteurs, surEtape, verifier })
    })(), elaguerMaintenant)
  }, [donnees, affaireExport, redacteur, date, obtenirLiens, elaguerMaintenant])
  // L'aperçu lit la dernière version sans en dépendre : un rendu qui refait
  // la fonction (affaire relue) ne doit pas recommencer le rendu des pages
  const obtenirRapportCourant = useRef(obtenirRapport)
  useLayoutEffect(() => { obtenirRapportCourant.current = obtenirRapport })

  // ── Onglets ──
  const etagesChoisis = useMemo(
    () => (donnees?.niveaux ?? []).filter((n) => reglages?.niveaux.includes(n.id)),
    [donnees, reglages],
  )
  const onglets = [
    // Le Word dit la même chose que le PDF : son aperçu est celui du PDF
    ...(rapportVoulu(reglages) ? [{ id: 'rapport', libelle: reglages.rapport ? 'Rapport PDF' : 'Rapport (aperçu du Word)' }] : []),
    ...etagesChoisis.map((n) => ({ id: n.id, libelle: `DXF — ${n.nom || 'sans nom'}` })),
  ]
  const [ongletVoulu, setOngletVoulu] = useState('rapport')
  const onglet = onglets.some((o) => o.id === ongletVoulu) ? ongletVoulu : onglets[0]?.id ?? null
  const [avecPlanVu, setAvecPlanVu] = useState(true)

  // ── Aperçu du rapport ──
  const [apercuPdf, setApercuPdf] = useState({ cle: null, pages: [], total: 0, complet: false, avertissements: [] })
  const pagesCourantes = useRef(apercuPdf)
  const [erreurPdf, setErreurPdf] = useState(null) // { cle, message }
  const [relancePdf, setRelancePdf] = useState(0)
  const ongletRapport = onglet === 'rapport' && pret && rapportVoulu(reglagesApercu)
  const cleRapportApercu = reglagesApercu ? cleRapport(reglagesApercu) : null

  useEffect(() => {
    if (!ongletRapport || !reglagesApercu?.niveaux.length) return undefined
    let fini = false
    const cle = cleRapport(reglagesApercu)
    const poser = (suivant) => { pagesCourantes.current = suivant; setApercuPdf(suivant) }
    obtenirRapportCourant.current(reglagesApercu)
      .then(async ({ blob, avertissements }) => {
        if (fini) return
        const deja = pagesCourantes.current
        if (deja.cle === cle && deja.complet) return
        const { pagesEnImages } = await import('../../../chantier/comptes-rendus/apercuPdfRendu')
        let premiere = true
        const fin = await pagesEnImages(blob, LARGEUR_PAGE, {
          abandonne: () => fini,
          surPage: (img, i, total) => {
            if (fini) { URL.revokeObjectURL(img.url); return }
            const avant = pagesCourantes.current
            // Les anciennes pages restent pâlies jusqu'à la première nouvelle
            if (premiere) { liberer(avant.pages); premiere = false }
            const pages = i === 1 ? [img] : [...avant.pages, img]
            poser({ cle, pages, total, complet: i === total, avertissements })
          },
        })
        if (fin && !fini && !fin.length) poser({ cle, pages: [], total: 0, complet: true, avertissements })
        if (!fini) setErreurPdf(null)
      })
      .catch((err) => {
        if (fini || err instanceof Abandon) return
        setErreurPdf({ cle, message: err?.message ?? String(err) })
      })
    return () => { fini = true }
  }, [ongletRapport, reglagesApercu, relancePdf])

  // Pages rendues libérées à la fermeture
  useEffect(() => () => liberer(pagesCourantes.current.pages), [])

  // ── Aperçu d'un DXF ──
  const etageOnglet = preparation?.etages.find((e) => e.niveau.id === onglet) ?? null
  const planPossible = !!etageOnglet?.niveau.chemin_vecteurs && !!reglagesApercu?.avecPlan
  const varianteAvecPlan = planPossible && avecPlanVu
  const cleDessin = etageOnglet ? cleDxf(etageOnglet.niveau.id, reglagesApercu, varianteAvecPlan) : null
  const [apercuDxf, setApercuDxf] = useState({ cle: null, dessin: null, erreur: null })
  const [relanceDxf, setRelanceDxf] = useState(0)

  // Ce qui est à l'écran, pour borner les caches
  useEffect(() => {
    vus.current = { reglages: [reglages, reglagesApercu], etageVisible: etageOnglet?.niveau.id ?? null, dessinVisible: cleDessin }
    elaguerMaintenant()
  }, [reglages, reglagesApercu, etageOnglet, cleDessin, elaguerMaintenant])

  useEffect(() => {
    if (!etageOnglet || !pret) return undefined
    let fini = false
    const c = caches.current
    const cle = cleDxf(etageOnglet.niveau.id, reglagesApercu, varianteAvecPlan)
    const deja = c.dessins.get(cle)
    const promesse = deja
      ? Promise.resolve(deja)
      : obtenirDxf(c, etageOnglet, reglagesApercu, varianteAvecPlan, obtenirLiens, elaguerMaintenant).then((texte) => {
        const d = { ...dessinDxf(texte), octets: texte.length }
        c.dessins.set(cle, d)
        elaguerMaintenant()
        return d
      })
    promesse.then(
      (dessin) => { if (!fini) setApercuDxf({ cle, dessin, erreur: null }) },
      // L'ancien dessin ne reste pas : il pourrait passer pour le fichier demandé
      (err) => { if (!fini) setApercuDxf({ cle, dessin: null, erreur: err?.message ?? String(err) }) },
    )
    return () => { fini = true }
  }, [etageOnglet, reglagesApercu, varianteAvecPlan, pret, obtenirLiens, elaguerMaintenant, relanceDxf])

  // ── Agrandir ──
  const [agrandi, setAgrandi] = useState(false)
  useEffect(() => {
    if (!agrandi) return undefined
    const surTouche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAgrandi(false) } }
    window.addEventListener('keydown', surTouche, true)
    return () => window.removeEventListener('keydown', surTouche, true)
  }, [agrandi])

  // ── Export ──
  const [exportEtat, setExportEtat] = useState(null) // { etape } | { fini, avertissements } | { erreur }
  const exportEnCours = !!exportEtat?.etape

  // Échap ferme la fenêtre, sauf pendant l'export (et l'agrandi l'intercepte avant)
  useEffect(() => {
    const surTouche = (e) => { if (e.key === 'Escape' && !exportEnCours) onFermer() }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer, exportEnCours])

  const exporter = async () => {
    if (!pret || !exportPossible(reglages)) return
    const voulus = reglages
    const c = caches.current
    const prep = preparerExport(donnees, voulus)
    // Tout ce que ce ZIP attend reste en cache jusqu'à la fin
    retenues.current = new Set([
      ...prep.etages.flatMap((e) => [cleDxf(e.niveau.id, voulus, false), cleDxf(e.niveau.id, voulus, true)]),
      ...(rapportVoulu(voulus) ? [cleRapport(voulus)] : []),
    ])
    try {
      // Un plan illisible ne coûte que le DXF avec le plan de son étage (avertissement)
      const { fichiers, avertissements: avertissementsDxf } = await fichiersDxf({
        etages: prep.etages, noms, avecPlan: voulus.avecPlan,
        obtenirTexte: (etage, avecPlan) => obtenirDxf(c, etage, voulus, avecPlan, obtenirLiens, elaguerMaintenant),
        surEtape: (etape) => setExportEtat({ etape }),
      })
      let avertissements = avertissementsDxf
      if (rapportVoulu(voulus)) {
        setExportEtat({ etape: 'Rapport : images…', rapport: true })
        const r = await obtenirRapport(voulus)
        if (voulus.rapport) fichiers.push({ nom: r.nomFichier, octets: new Uint8Array(await r.blob.arrayBuffer()) })
        if (voulus.word) {
          setExportEtat({ etape: 'Rapport Word…' })
          const w = await r.fabriquerWord()
          fichiers.push({ nom: w.nomFichier, octets: new Uint8Array(await w.blob.arrayBuffer()) })
        }
        avertissements = [...avertissements, ...(r.avertissements ?? [])]
      }
      setExportEtat({ etape: 'Compression du ZIP…' })
      // Compression dans des workers : l'écran reste vivant pendant ce temps
      const zip = await fabriquerZip(fichiers)
      telechargerBlob(new Blob([zip], { type: 'application/zip' }), nomFichierZip(affaireExport, date))
      setExportEtat({ fini: true, avertissements, fichiers: fichiers.length })
    } catch (err) {
      setExportEtat({ erreur: err instanceof Abandon ? 'Export interrompu.' : err?.message ?? String(err) })
    } finally {
      retenues.current = new Set()
      elaguerMaintenant()
    }
  }

  // ── Rendu ──
  const majReglages = (champs) => { setReglages((r) => ({ ...r, ...champs })); setExportEtat(null) }
  const basculerNiveau = (id, coche) => majReglages({
    niveaux: coche ? (donnees.niveaux.filter((n) => n.id === id || reglages.niveaux.includes(n.id)).map((n) => n.id)) : reglages.niveaux.filter((x) => x !== id),
  })
  const avertissements = donnees && reglages ? avertissementsExport({ donnees, reglages, enLigne }) : []
  if (enAttente > 0) avertissements.push(`${pluriel(enAttente, 'geste')} de visite pas encore ${enAttente > 1 ? 'envoyés' : 'envoyé'} depuis cet appareil : ${enAttente > 1 ? 'ils ne seront' : 'il ne sera'} pas dans l’export.`)

  // Chaque DXF avec l'unité de son étage : ArchiCAD peut la demander à la fusion
  const fichiersPrevus = donnees && reglages ? [
    ...etagesChoisis.flatMap((n) => [
      { nom: noms.get(n.id).edl, unite: uniteEtage(n) },
      ...(reglages.avecPlan && n.chemin_vecteurs ? [{ nom: noms.get(n.id).avecPlan, unite: uniteEtage(n) }] : []),
    ]),
    ...(reglages.rapport ? [{ nom: nomFichierRapportEdl(affaireExport, date), unite: null }] : []),
    ...(reglages.word ? [{ nom: nomFichierWordEdl(affaireExport, date), unite: null }] : []),
  ] : []
  const noteUnite = noteUniteArchicad(etagesChoisis)
  const sansPlan = reglages?.avecPlan ? etagesChoisis.filter((n) => !n.chemin_vecteurs) : []
  const compteParNiveau = useMemo(() => {
    const m = new Map()
    for (const p of donnees?.pieces ?? []) m.set(p.niveau_id, (m.get(p.niveau_id) ?? 0) + 1)
    return m
  }, [donnees])

  const majEnCours = reglages !== reglagesApercu
  const pdfAJour = apercuPdf.cle === cleRapportApercu && apercuPdf.complet
  const pdfEnCours = ongletRapport && (majEnCours || !pdfAJour) && erreurPdf?.cle !== cleRapportApercu
  const dxfEnCours = !!etageOnglet && (majEnCours || apercuDxf.cle !== cleDessin || (!apercuDxf.dessin && !apercuDxf.erreur))
  const progressionPdf = ongletRapport && pdfEnCours
    ? (apercuPdf.cle === cleRapportApercu && apercuPdf.total
      ? `Aperçu : page ${apercuPdf.pages.length} / ${apercuPdf.total}…`
      : etapeRapport?.cle === cleRapportApercu ? etapeRapport.texte : 'Mise à jour…')
    : null

  const apercu = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div role="tablist" aria-label="Aperçu" style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '0.5px solid rgba(0,0,0,0.1)', overflowX: 'auto', flexShrink: 0 }}>
        {onglets.map((o) => {
          const actif = o.id === onglet
          return (
            <button key={o.id} type="button" role="tab" aria-selected={actif} onClick={() => setOngletVoulu(o.id)}
              style={{
                minHeight: 44, padding: '0 14px', whiteSpace: 'nowrap', cursor: 'pointer', border: 'none', background: 'none',
                borderTop: '2px solid transparent', borderBottom: `2px solid ${actif ? ACCENT : 'transparent'}`,
                fontSize: 13, fontWeight: actif ? 600 : 400, color: actif ? ENCRE : GRIS,
              }}>
              {o.libelle}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        {!agrandi && onglet && (
          <button type="button" onClick={() => setAgrandi(true)} title="Agrandir l’aperçu" style={{ ...boutonPetit, marginLeft: 8 }}>
            <Maximize2 size={12} /> Agrandir
          </button>
        )}
        {agrandi && (
          <button type="button" onClick={() => setAgrandi(false)} title="Fermer (Échap)" aria-label="Fermer l’aperçu agrandi"
            style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 2, background: 'white', cursor: 'pointer', color: ENCRE }}>
            <X size={20} />
          </button>
        )}
      </div>

      {!onglet && <p style={{ margin: '40px 0', textAlign: 'center', fontSize: 12, color: PALE }}>Aucun étage choisi : rien à montrer.</p>}

      {onglet === 'rapport' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, flexShrink: 0 }}>
            <p style={{ flex: 1, margin: 0, fontSize: 11, color: PALE }}>
              {apercuPdf.pages.length > 0 && pdfAJour ? pluriel(apercuPdf.pages.length, 'page') : ''}
              {apercuPdf.avertissements?.length > 0 && pdfAJour ? ` · ${apercuPdf.avertissements.join(' · ')}` : ''}
            </p>
            {progressionPdf && <span role="status" style={{ fontSize: 11, color: PALE }}>{progressionPdf}</span>}
            {erreurPdf?.cle === cleRapportApercu && !majEnCours && (
              <button type="button" onClick={() => { setErreurPdf(null); setRelancePdf((n) => n + 1) }} style={boutonPetit}>
                <RefreshCw size={12} /> Réessayer
              </button>
            )}
          </div>
          {erreurPdf?.cle === cleRapportApercu && (
            <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: '#B8412C' }}>Aperçu impossible : {erreurPdf.message}</p>
          )}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#EEEBE7', padding: 12 }}>
            {apercuPdf.pages.length === 0 && erreurPdf?.cle !== cleRapportApercu && (
              <p style={{ margin: '40px 0', textAlign: 'center', fontSize: 12, color: PALE }}>Préparation de l’aperçu…</p>
            )}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              opacity: apercuPdf.cle !== cleRapportApercu || majEnCours ? 0.5 : 1, transition: 'opacity 150ms',
            }}>
              {apercuPdf.pages.map((p, i) => (
                <img key={p.url} src={p.url} alt={`Page ${i + 1}`}
                  style={{ display: 'block', width: '100%', maxWidth: agrandi ? 1000 : LARGEUR_PAGE, height: 'auto', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }} />
              ))}
            </div>
          </div>
        </>
      )}

      {etageOnglet && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, flexShrink: 0, flexWrap: 'wrap' }}>
            {planPossible ? (
              <div role="group" aria-label="Fichier montré" style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.15)' }}>
                {[[false, noms.get(etageOnglet.niveau.id)?.edl], [true, noms.get(etageOnglet.niveau.id)?.avecPlan]].map(([avec, nom]) => (
                  <button key={nom} type="button" aria-pressed={avecPlanVu === avec} onClick={() => setAvecPlanVu(avec)}
                    style={{ minHeight: 44, padding: '0 10px', fontSize: 11, border: 'none', cursor: 'pointer', background: avecPlanVu === avec ? ACCENT : 'white', color: avecPlanVu === avec ? 'white' : GRIS }}>
                    {nom}
                  </button>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 11, color: GRIS }}>{noms.get(etageOnglet.niveau.id)?.edl}</span>
            )}
            <span style={{ flex: 1 }} />
            {dxfEnCours && !apercuDxf.erreur && <span role="status" style={{ fontSize: 11, color: PALE }}>Mise à jour…</span>}
            {apercuDxf.cle === cleDessin && apercuDxf.dessin && (
              <span style={{ fontSize: 11, color: PALE }}>{Math.max(1, Math.round(apercuDxf.dessin.octets / 1024))} Ko</span>
            )}
          </div>
          {apercuDxf.erreur && apercuDxf.cle === cleDessin && (
            <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: '#B8412C', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>Aperçu impossible : {apercuDxf.erreur}</span>
              <button type="button" onClick={() => { setApercuDxf({ cle: null, dessin: null, erreur: null }); setRelanceDxf((n) => n + 1) }} style={boutonPetit}>
                <RefreshCw size={12} /> Réessayer
              </button>
            </p>
          )}
          <div style={{ flex: 1, minHeight: 280 }}>
            <ApercuDxfEdl dessin={apercuDxf.dessin} pali={dxfEnCours} />
          </div>
        </>
      )}
    </div>
  )

  const contenuReglages = !donnees || !reglages ? null : (
    <>
      <section>
        <p style={titreSection}>Étages à exporter</p>
        {donnees.niveaux.map((n) => (
          <label key={n.id} style={ligneCase}>
            <input type="checkbox" checked={reglages.niveaux.includes(n.id)} disabled={exportEnCours}
              onChange={(e) => basculerNiveau(n.id, e.target.checked)} style={caseACocher} />
            <span style={{ flex: 1 }}>{n.nom || 'Étage sans nom'}</span>
            <span style={{ fontSize: 11, color: PALE }}>{pluriel(compteParNiveau.get(n.id) ?? 0, 'pièce')}</span>
          </label>
        ))}
      </section>

      <section>
        <p style={titreSection}>Contenu</p>
        <label style={ligneCase}>
          <input type="checkbox" checked={reglages.inclurePropositions} disabled={exportEnCours}
            onChange={(e) => majReglages({ inclurePropositions: e.target.checked })} style={caseACocher} />
          <span>Inclure les propositions non validées <span style={{ color: PALE, fontSize: 11 }}>(calque EDL-À valider)</span></span>
        </label>
        <label style={ligneCase}>
          <input type="checkbox" checked={reglages.avecPlan} disabled={exportEnCours}
            onChange={(e) => majReglages({ avecPlan: e.target.checked })} style={caseACocher} />
          <span>DXF avec le plan existant <span style={{ color: PALE, fontSize: 11 }}>(en plus du DXF à fusionner)</span></span>
        </label>
        <label style={ligneCase}>
          <input type="checkbox" checked={reglages.rapport} disabled={exportEnCours}
            onChange={(e) => majReglages({ rapport: e.target.checked })} style={caseACocher} />
          <span>Rapport PDF</span>
        </label>
        <label style={ligneCase}>
          <input type="checkbox" checked={!!reglages.word} disabled={exportEnCours}
            onChange={(e) => majReglages({ word: e.target.checked })} style={caseACocher} />
          <span>Rapport Word <span style={{ color: PALE, fontSize: 11 }}>(.docx, modifiable — même contenu que le PDF)</span></span>
        </label>
        {sansPlan.length > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: PALE }}>
            Sans plan vectoriel enregistré, pas de DXF avec le plan pour : {sansPlan.map((n) => n.nom || 'sans nom').join(', ')}.
          </p>
        )}
      </section>

      {avertissements.length > 0 && (
        <div role="status" style={{ padding: '10px 12px', background: AMBRE.fond, border: `0.5px solid ${AMBRE.bord}` }}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: AMBRE.texte, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {avertissements.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}

      <section>
        <p style={titreSection}>Dans le ZIP</p>
        {fichiersPrevus.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: GRIS, display: 'flex', flexDirection: 'column', gap: 2, wordBreak: 'break-all' }}>
            {fichiersPrevus.map((f) => (
              <li key={f.nom}>
                {f.nom}
                {f.unite && <span style={{ marginLeft: 6, fontSize: 11, color: PALE, wordBreak: 'normal', whiteSpace: 'nowrap' }}>· {f.unite}</span>}
              </li>
            ))}
          </ul>
        ) : <p style={{ margin: 0, fontSize: 12, color: PALE }}>Aucun fichier : cochez au moins un étage.</p>}
        <p style={{ margin: '10px 0 0', fontSize: 12, color: GRIS, lineHeight: 1.5, padding: '8px 10px', background: 'white', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          Dans ArchiCAD : Fichier → Fusionner → choisir le DXF <code style={{ fontSize: 11, whiteSpace: 'nowrap' }}>…-EDL.dxf</code> (même unité et mêmes coordonnées que le plan d’origine).
          {noteUnite && <> {noteUnite}</>}
        </p>
      </section>

      <details>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: ENCRE }}>
          Symboles utilisés — à relire par l’agence
        </summary>
        <div style={{ paddingTop: 8 }}><PlancheSymboles /></div>
      </details>
    </>
  )

  return (
    <>
      <span ref={ancre} hidden />
      {createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + env(safe-area-inset-top)) 16px 16px',
          ...(accent ? { '--affaire-accent': accent } : {}),
        }}>
          <div role="dialog" aria-modal="true" aria-label="Exporter l’état des lieux"
            style={{
              background: '#FAF7F2', width: 'min(1320px, 100%)', height: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
              borderTop: `3px solid ${ACCENT}`, boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)', boxSizing: 'border-box',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
              <FileDown size={16} style={{ color: ACCENT }} />
              <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: ENCRE }}>Exporter l’état des lieux</h2>
              <button type="button" onClick={onFermer} disabled={exportEnCours} aria-label="Fermer"
                style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: PALE, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ ...STYLE_CORPS, padding: '16px 20px' }}>
              {lecture.etat === 'chargement' && <p style={{ margin: 0, fontSize: 13, color: PALE }}>Lecture de l’état des lieux…</p>}
              {lecture.etat === 'indisponible' && <p style={{ margin: 0, fontSize: 13, color: AMBRE.texte }}>L’état des lieux demande la migration 077 dans Supabase.</p>}
              {lecture.etat === 'echec' && (
                <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>{enLigne ? `L’état des lieux n’a pas pu être lu : ${lecture.message}` : 'L’export demande du réseau (photos, plans).'}</span>
                  <button type="button" onClick={relire} style={boutonSecondaire}><RefreshCw size={14} /> Réessayer</button>
                </p>
              )}
              {lecture.etat === 'pret' && (
                <>
                  <div style={STYLE_REGLAGES}>{contenuReglages}</div>
                  <div style={agrandi ? {
                    position: 'fixed', inset: 0, zIndex: 410, background: '#FAF7F2', padding: 'calc(8px + env(safe-area-inset-top)) 16px 16px', boxSizing: 'border-box',
                  } : STYLE_COLONNE_APERCU}>
                    {apercu}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'white', borderTop: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, fontSize: 12 }}>
                {exportEtat?.etape && (
                  <span role="status" style={{ color: GRIS }}>
                    {exportEtat.rapport && etapeRapport?.cle === cleRapport(reglages) ? etapeRapport.texte : exportEtat.etape}
                  </span>
                )}
                {exportEtat?.fini && (
                  <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2A8A4E' }}>
                    <Check size={14} /> ZIP téléchargé ({pluriel(exportEtat.fichiers, 'fichier')}).
                    {exportEtat.avertissements.length > 0 && <span style={{ color: AMBRE.texte }}> {exportEtat.avertissements.join(' · ')}</span>}
                  </span>
                )}
                {exportEtat?.erreur && <span role="alert" style={{ color: '#B8412C' }}>Export impossible : {exportEtat.erreur}</span>}
              </div>
              <button type="button" onClick={onFermer} disabled={exportEnCours} style={boutonSecondaire}>Annuler</button>
              <button type="button" onClick={exporter}
                disabled={!pret || !enLigne || exportEnCours || !exportPossible(reglages)}
                style={{ ...boutonPrincipal, opacity: !pret || !enLigne || exportEnCours || !exportPossible(reglages) ? 0.55 : 1 }}>
                <Download size={15} /> {exportEnCours ? 'Préparation…' : 'Préparer l’export'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export default ExportEdl
