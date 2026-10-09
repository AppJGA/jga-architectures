// ─── Calendrier des rendus : PDF d'un mois ──────────────────────────────────
//
// Comme les plannings : une page HTML imprimée par le navigateur (A4 paysage).
// Page 1, la grille du mois ; ensuite, le détail de chaque rendu, lisible
// même quand un jour en porte beaucoup. Le gabarit est pur
// (`htmlCalendrierMois`, tests/gestion.test.js) ; seule l'ouverture de la
// fenêtre touche au navigateur. Tout texte saisi passe par `echapperHtml` :
// la fenêtre d'impression partage la session de l'application.

import { echapperHtml as e } from '../shared/echapperHtml.js'
import { grilleMois, parJour } from './gestionLogique.js'

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

export const titreMois = (annee, mois) => `${MOIS[mois - 1].charAt(0).toUpperCase()}${MOIS[mois - 1].slice(1)} ${annee}`

function dateDetail(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
}

const ronds = (equipe, accent) => (equipe ?? []).map((p, i) =>
  `<span class="rond" style="background:${p.proprietaire ? accent : '#9C9591'};margin-left:${i ? -3 : 0}px" title="${e(p.nom)}">${e(p.initiales)}</span>`).join('')

/**
 * @param evenements  jalons déjà filtrés (`rendus`), toutes dates confondues
 * @param equipes     Map affaireId → équipe (`equipeParAffaire`)
 * @param filtres     texte des filtres appliqués, imprimé sous le titre
 */
export function htmlCalendrierMois({ annee, mois, evenements, equipes, filtres = '', edition, logoUrl = '', accent = '#7A4E9C' }) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  const duMois = evenements.filter((ev) => ev.date.startsWith(prefixe))
  const jours = parJour(duMois)
  const titre = `Calendrier des rendus — ${titreMois(annee, mois)}`

  const cellules = grilleMois(annee, mois).map((semaine) => `<tr>${semaine.map((c, i) => {
    const evs = c.duMois ? (jours.get(c.date) ?? []) : []
    return `<td class="${c.duMois ? '' : 'hors'}${i >= 5 ? ' we' : ''}"><div class="num">${+c.date.slice(8, 10)}</div>${evs.map((ev) => `
      <div class="jalon" style="border-left-color:${e(ev.couleur || accent)}">
        <div class="ligne1"><b>${e(ev.affaire.code_affaire)}</b>${ronds(equipes.get(ev.affaire.id), accent)}</div>
        <div class="libelle">${e(ev.libelle)}${ev.semaine ? ` · S${ev.semaine}` : ''}</div>
      </div>`).join('')}</td>`
  }).join('')}</tr>`).join('')

  const lignes = duMois.map((ev) => {
    const equipe = equipes.get(ev.affaire.id) ?? []
    return `<tr>
      <td class="date">${dateDetail(ev.date)}</td>
      <td><span class="pastille" style="background:${e(ev.couleur || accent)}"></span><b>${e(ev.affaire.code_affaire)}</b> ${e(ev.affaire.nom)}</td>
      <td>${e(ev.libelle)}</td>
      <td>${ev.origine === 'etude' ? `Étude · S${ev.semaine}` : 'Chantier'}</td>
      <td>${equipe.length ? equipe.map((p) => `${ronds([p], accent)} ${e(p.nom)}${p.proprietaire ? ' <i>(propriétaire)</i>' : ''}`).join('<br>') : '<span class="vide">—</span>'}</td>
    </tr>`
  }).join('')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${e(titre)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1F1B17; font-size: 9pt; }
  .feuille { padding: 10mm 12mm; }
  .detail { page-break-before: always; }
  header { display: flex; align-items: center; gap: 6mm; margin-bottom: 4mm; }
  .logo { height: 12mm; width: auto; }
  h1 { font-size: 15pt; font-weight: 600; margin: 0; }
  .sous { color: #5E5854; font-size: 8.5pt; margin-top: 1mm; }
  .grille { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .grille th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #9C9591; text-align: left; padding: 1.5mm; border-bottom: .3mm solid #D6D1CC; }
  .grille td { vertical-align: top; height: 30mm; padding: 1.2mm; border: .2mm solid #E9E2D6; }
  .grille td.we { background: #FAF7F2; }
  .grille td.hors { background: #F4F1EC; color: #C9C4C0; }
  .num { font-size: 8pt; font-weight: 600; color: #5E5854; margin-bottom: 1mm; }
  .jalon { border-left: 1mm solid; background: #F6F3EE; padding: .8mm 1.2mm; margin-bottom: 1mm; page-break-inside: avoid; }
  .ligne1 { display: flex; align-items: center; gap: 1.5mm; font-size: 7.5pt; }
  .libelle { font-size: 7pt; color: #5E5854; margin-top: .4mm; }
  .rond { display: inline-flex; align-items: center; justify-content: center; width: 4.6mm; height: 4.6mm; border-radius: 50%; color: white; font-size: 5.5pt; font-weight: 600; border: .3mm solid white; vertical-align: middle; }
  h2 { font-size: 12pt; font-weight: 600; margin: 0 0 3mm; }
  .tableau { width: 100%; border-collapse: collapse; }
  .tableau th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #9C9591; border-bottom: .3mm solid #D6D1CC; padding: 1.5mm 2mm; }
  .tableau td { border-bottom: .2mm solid #E9E2D6; padding: 2mm; vertical-align: top; }
  .tableau tr { page-break-inside: avoid; }
  .tableau td.date { white-space: nowrap; font-weight: 600; }
  .pastille { display: inline-block; width: 2.5mm; height: 2.5mm; border-radius: 50%; margin-right: 1.5mm; vertical-align: middle; }
  .vide { color: #C9C4C0; }
  .legende { margin-top: 3mm; font-size: 7.5pt; color: #5E5854; display: flex; gap: 5mm; align-items: center; }
</style></head>
<body>
<div class="feuille">
  <header>
    ${logoUrl ? `<img src="${e(logoUrl)}" class="logo" alt="JGA" onerror="this.style.display='none'">` : ''}
    <div><h1>${e(titre)}</h1><div class="sous">${[filtres, `${duMois.length} rendu${duMois.length > 1 ? 's' : ''}`, `édité le ${edition}`].filter(Boolean).map(e).join(' · ')}</div></div>
  </header>
  <table class="grille"><thead><tr>${JOURS.map((j) => `<th>${j}</th>`).join('')}</tr></thead><tbody>${cellules}</tbody></table>
  <div class="legende"><span>${ronds([{ initiales: 'AB', nom: 'Propriétaire', proprietaire: true }], accent)} propriétaire de l’affaire</span><span>${ronds([{ initiales: 'AB', nom: 'Collaborateur' }], accent)} collaborateur</span><span>Échéance d’étude : le vendredi de sa semaine (S42)</span></div>
</div>
<div class="feuille detail">
  <h2>Détail des rendus — ${e(titreMois(annee, mois))}</h2>
  ${duMois.length ? `<table class="tableau"><thead><tr><th>Date</th><th>Affaire</th><th>Rendu</th><th>Planning</th><th>Équipe</th></tr></thead><tbody>${lignes}</tbody></table>` : '<p class="vide">Aucun rendu ce mois-ci.</p>'}
</div>
<script>window.onload = function () { setTimeout(function () { window.print() }, 400) }</script>
</body></html>`
}

export function exporterCalendrierMois(params) {
  const fenetre = window.open('', '_blank')
  if (!fenetre) { alert('Autorisez les fenêtres surgissantes pour exporter en PDF.'); return }
  fenetre.document.write(htmlCalendrierMois({ logoUrl: `${window.location.origin}/Logo_JGA_Archi.jpg`, ...params }))
  fenetre.document.close()
}
