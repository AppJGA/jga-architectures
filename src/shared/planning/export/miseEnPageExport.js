// ─── Mise en page des PDF de planning : des feuilles faites par la page ──────
//
// Les plannings s'impriment par le navigateur. Le laisser couper les pages
// rendait l'aperçu menteur : il ne pouvait que deviner où tomberaient les
// sauts, et l'impression en ajoutait. Désormais la page fabrique elle-même
// ses feuilles, chacune de la taille exacte de la zone imprimable (format
// moins les marges de `@page`) : l'impression n'a plus rien à couper, et
// l'aperçu montre ces mêmes feuilles.
//
// Deux façons :
//  - une seule feuille : tout le document (en-tête, planning, légende) est
//    élargi puis réduit à l'échelle jusqu'à tenir sur la feuille, quel que
//    soit son nombre de lignes ;
//  - plusieurs feuilles : le planning est réduit à la largeur de la feuille,
//    ses lignes réparties de feuille en feuille (`repartirLignes`), l'en-tête
//    du tableau et la bande des échéances répétés en haut de chacune.
//
// Le script tourne en fin de page, sans attendre « load » : dans une fenêtre
// écrite par document.write, l'événement n'arrive pas toujours (voir le
// calendrier des rendus). Les hauteurs ne dépendent pas du logo (taille fixée).

export const MARGE_PAGE_MM = 10

/**
 * Répartit les lignes du tableau sur des feuilles successives.
 * @param hauteurs  hauteur de chaque ligne (px, à l'échelle de la feuille)
 * @param titres    vrai pour une ligne de titre de groupe (lot, zone) : elle
 *   ne reste jamais seule en bas d'une feuille, elle passe avec ses lignes
 * @param dispo     { premiere, suivantes, fin } : place pour les lignes sur la
 *   première feuille (sous l'en-tête du document), sur les suivantes, et
 *   hauteur de ce qui suit le tableau (texte du bas, légende, pied)
 * @returns { pages: [[indices]], finSeule } — `finSeule` : la fin du document
 *   ne tient pas sous les dernières lignes et prend une feuille à elle
 *
 * Recopiée telle quelle dans la page imprimée (`toString`) : pas de
 * dépendance, rien d'extérieur.
 */
export function repartirLignes(hauteurs, titres, dispo) {
  const pages = []
  let courante = []
  let reste = dispo.premiere
  for (let i = 0; i < hauteurs.length; i++) {
    if (hauteurs[i] > reste && courante.length > 0) {
      const reportees = []
      while (courante.length > 1 && titres[courante[courante.length - 1]]) reportees.unshift(courante.pop())
      pages.push(courante)
      courante = reportees
      reste = dispo.suivantes
      for (let k = 0; k < reportees.length; k++) reste -= hauteurs[reportees[k]]
    }
    courante.push(i)
    reste -= hauteurs[i]
  }
  pages.push(courante)
  return { pages, finSeule: dispo.fin > reste }
}

// Écrit sans dépendance au module : ce texte part tel quel dans la page.
const SCRIPT = `
function mettreEnPage(o) {
  var PX = 96 / 25.4;
  var W = (o.largeurMm - 2 * o.margeMm) * PX;
  // Un rien sous la zone imprimable : un arrondi ne doit jamais pousser une
  // feuille sur la suivante (elle imprimerait une page blanche)
  var H = Math.floor((o.hauteurMm - 2 * o.margeMm) * PX) - 3;
  var corps = document.body;
  var entete = document.querySelector('.header');
  var gw = document.getElementById('gw');
  var table = gw.querySelector('table');
  var premier = gw.firstElementChild;
  var bande = premier && premier !== table && premier.tagName === 'DIV' ? premier : null;
  var svg = gw.querySelector('svg');

  // Ce qui suit le planning (texte du bas, légende, pied), réuni
  var fin = document.createElement('div');
  fin.className = 'fin-document';
  var suite = [];
  for (var n = gw.nextElementSibling; n; n = n.nextElementSibling) if (n.tagName !== 'SCRIPT') suite.push(n);
  for (var i = 0; i < suite.length; i++) fin.appendChild(suite[i]);

  // Mesures dans un bloc de la largeur de la feuille, hors de toute réduction
  var contenu = document.createElement('div');
  contenu.className = 'contenu-document';
  contenu.style.width = W + 'px';
  corps.insertBefore(contenu, corps.firstChild);
  contenu.appendChild(entete);
  contenu.appendChild(gw);
  contenu.appendChild(fin);

  function feuille() {
    var f = document.createElement('div');
    f.className = 'feuille';
    f.style.width = W + 'px';
    f.style.height = H + 'px';
    corps.insertBefore(f, contenu);
    return f;
  }
  // Le nom d'une tâche qui finit tard dépasse à droite du tableau : le cadre
  // est élargi pour l'englober (le tableau garde sa largeur), puis l'ensemble
  // est réduit à la largeur voulue. Sans cela, la feuille coupait ce nom.
  // Largeur naturelle du tableau (chantier) : ses longueurs sont écrites
  // « × --k ». Le facteur fait que les colonnes remplissent exactement le
  // cadre ; sans lui, le navigateur étirait les colonnes et laissait les
  // barres à leur longueur, trop courtes.
  var largeurTable = parseFloat(table.getAttribute('data-largeur-mm')) * PX;
  function echelleLargeur(bloc, largeur) {
    bloc.style.zoom = '';
    bloc.style.width = '';
    table.style.width = '';
    if (bande) bande.style.width = '';
    if (largeurTable > 0) bloc.style.setProperty('--k', bloc.clientWidth / largeurTable);
    var bords = bloc.offsetWidth - bloc.clientWidth;
    var sw = bloc.scrollWidth + bords;
    if (sw <= largeur + 1) return 1;
    table.style.width = table.offsetWidth + 'px';
    // La bande des échéances se place en % : elle garde la largeur du tableau
    if (bande) bande.style.width = table.style.width;
    bloc.style.width = sw + 'px';
    return largeur / sw;
  }
  function margesVerticales(el) {
    var cs = getComputedStyle(el);
    return parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  }

  if (o.uneFeuille) {
    // Élargie, la page se replie autrement (textes, légende) : quelques passes
    var f = 1, s = 1, h;
    for (var passe = 0; passe < 5; passe++) {
      contenu.style.width = (W / f) + 'px';
      s = echelleLargeur(gw, contenu.clientWidth);
      gw.style.zoom = s < 1 ? s : '';
      h = contenu.offsetHeight;
      var suivant = Math.min(1, H / h);
      if (Math.abs(suivant - f) < 0.002) break;
      f = suivant;
    }
    // Largeur posée pour la réduction retenue : réduite un peu plus si la
    // hauteur l'exige, la page reste moins large que la feuille, jamais plus
    contenu.style.width = (W / f) + 'px';
    s = echelleLargeur(gw, contenu.clientWidth);
    gw.style.zoom = s < 1 ? s : '';
    h = contenu.offsetHeight;
    if (h * f > H) f = H / h;
    var page = feuille();
    page.appendChild(contenu);
    gw.style.zoom = '';
    if (o.fleches) o.fleches([{ gw: gw, table: table, svg: svg }]);
    gw.style.zoom = s < 1 ? s : '';
    contenu.style.zoom = f < 1 ? f : '';
    page.style.breakAfter = 'auto';
    return { pages: 1, reduction: f * s };
  }

  var s2 = echelleLargeur(gw, W);
  var hEntete = entete.offsetHeight + margesVerticales(entete);
  var hBande = bande ? bande.offsetHeight + margesVerticales(bande) : 0;
  var bordures = gw.offsetHeight - gw.clientHeight;
  var haut = (hBande + table.tHead.offsetHeight) * s2 + bordures;
  var lignes = [].slice.call(table.tBodies[0].rows);
  var hauteurs = [], titres = [];
  for (i = 0; i < lignes.length; i++) {
    hauteurs.push(lignes[i].getBoundingClientRect().height * s2);
    titres.push(lignes[i].cells.length === 1 && lignes[i].cells[0].colSpan > 1);
  }
  var hFin = fin.offsetHeight;
  var rep = repartirLignes(hauteurs, titres, { premiere: H - hEntete - haut, suivantes: H - haut, fin: hFin });

  var blocs = [], derniere = null;
  for (var p = 0; p < rep.pages.length; p++) {
    var pageP = feuille();
    derniere = pageP;
    if (p === 0) pageP.appendChild(entete);
    var g = gw.cloneNode(false);
    g.removeAttribute('id');
    if (bande) g.appendChild(bande.cloneNode(true));
    var t = table.cloneNode(false);
    t.removeAttribute('id');
    var cols = table.querySelector('colgroup');
    if (cols) t.appendChild(cols.cloneNode(true));
    t.appendChild(table.tHead.cloneNode(true));
    var tb = document.createElement('tbody');
    for (var k = 0; k < rep.pages[p].length; k++) tb.appendChild(lignes[rep.pages[p][k]]);
    t.appendChild(tb);
    g.appendChild(t);
    var sv = null;
    if (svg) { sv = svg.cloneNode(false); sv.removeAttribute('id'); g.appendChild(sv); }
    pageP.appendChild(g);
    blocs.push({ gw: g, table: t, svg: sv });
  }
  if (rep.finSeule) derniere = feuille();
  derniere.appendChild(fin);
  derniere.style.breakAfter = 'auto';
  corps.removeChild(contenu);
  if (o.fleches) o.fleches(blocs);
  for (i = 0; i < blocs.length; i++) blocs[i].gw.style.zoom = s2 < 1 ? s2 : '';
  return { pages: rep.pages.length + (rep.finSeule ? 1 : 0), reduction: s2 };
}`

/**
 * Styles des feuilles, communs à l'impression et à l'aperçu.
 * `z-index: 0` fait de chaque feuille son propre plan : les fonds des
 * périodes, posés sous la grille (`z-index: -1`), restent au-dessus du fond
 * blanc de la feuille. Sans lui, l'aperçu les cachait.
 */
export const STYLE_FEUILLES = `
  .feuille { position: relative; z-index: 0; overflow: hidden; break-after: page; page-break-after: always; }
  .contenu-document, .fin-document { display: flow-root; }`

// Dans l'aperçu, la marge de la feuille (celle de `@page`, qui ne vaut qu'à
// l'impression) entoure chaque feuille, posée sur un fond comme dans un
// lecteur de PDF.
export const STYLE_APERCU = `@media screen {
  html { background: #EEEBE7; overflow: hidden; }
  body { width: auto; max-width: none; margin: 0; background: transparent; }
  .feuille { box-sizing: content-box; padding: ${MARGE_PAGE_MM}mm; margin: 0 0 6mm; background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.18); }
  .feuille:last-of-type { margin-bottom: 0; }
}`

/**
 * Script de fin de page : met en page, puis imprime — ou, dans l'aperçu,
 * envoie à la fenêtre d'export la hauteur, le nombre de feuilles et la
 * réduction (le cadre est isolé, elle ne peut pas les lire elle-même).
 * @param fleches nom d'une fonction de la page qui trace les flèches de
 *   chaque bloc de planning (chantier), ou rien
 */
export function scriptMiseEnPage({ largeurMm, hauteurMm, uneFeuille, apercu, fleches = null }) {
  const options = `{ largeurMm: ${Number(largeurMm)}, hauteurMm: ${Number(hauteurMm)}, margeMm: ${MARGE_PAGE_MM}, uneFeuille: ${!!uneFeuille}, fleches: ${fleches ?? 'null'} }`
  const finale = apercu
    ? `parent.postMessage({ apercuPlanning: true, hauteur: Math.ceil(document.body.scrollHeight), pages: resultat.pages, reduction: resultat.reduction }, '*');`
    : `var imprime = false;
function imprimer() { if (imprime) return; imprime = true; setTimeout(function () { window.print(); }, 300); }
window.addEventListener('load', imprimer);
setTimeout(imprimer, 2000);`
  return `var repartirLignes = ${repartirLignes.toString()};
${SCRIPT}
var resultat = mettreEnPage(${options});
${finale}`
}
