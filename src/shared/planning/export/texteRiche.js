// ─── Texte mis en forme des exports PDF ──────────────────────────────────────
//
// L'éditeur de la modale produit du HTML (gras, italique, souligné, listes).
// Ce HTML finit tel quel dans la page imprimée : on n'en garde qu'une liste
// fermée de balises, sans aucun attribut. Un collage depuis Word ou une page
// web apporte styles, classes, scripts ou gestionnaires `on…` : tout part ici.
//
// Pas de DOM : la fonction tourne aussi dans les tests (node).

const AUTORISEES = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'ul', 'ol', 'li'])
const VIDES = new Set(['br'])
// Balises dont le contenu lui-même est à jeter, pas seulement la balise
const A_VIDER = new Set(['script', 'style', 'head', 'title', 'template', 'iframe', 'object', 'noscript', 'xml'])

const ENTITE = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/i

function echapperTexte(texte) {
  let res = ''
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (c === '<') res += '&lt;'
    else if (c === '>') res += '&gt;'
    else if (c === '"') res += '&quot;'
    else if (c === '&') {
      // Les entités produites par l'éditeur (&nbsp;, &amp;…) sont gardées
      const m = texte.slice(i).match(ENTITE)
      if (m) { res += m[0]; i += m[0].length - 1 } else res += '&amp;'
    } else res += c
  }
  return res
}

/** HTML de l'éditeur → HTML sûr, réduit aux balises de mise en forme simple. */
export function nettoyerHtml(html) {
  if (!html) return ''
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '')
  const morceaux = source.split(/(<[^>]*>)/)
  const pile = []
  let aVider = null
  let res = ''

  for (const m of morceaux) {
    if (!m) continue
    const balise = m.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)/)
    if (m.startsWith('<') && m.endsWith('>') && balise) {
      const fermante = balise[1] === '/'
      const nom = balise[2].toLowerCase()
      if (aVider) {
        if (fermante && nom === aVider) aVider = null
        continue
      }
      if (A_VIDER.has(nom)) {
        if (!fermante && !/\/\s*>$/.test(m)) aVider = nom
        continue
      }
      if (!AUTORISEES.has(nom)) continue
      if (VIDES.has(nom)) { res += '<br>'; continue }
      if (!fermante) {
        pile.push(nom)
        res += `<${nom}>`
      } else if (pile.includes(nom)) {
        // Ferme aussi ce qui a été laissé ouvert à l'intérieur
        while (pile.length) {
          const haut = pile.pop()
          res += `</${haut}>`
          if (haut === nom) break
        }
      }
      continue
    }
    if (aVider) continue
    // Un « < » orphelin ou une balise mal formée : c'est du texte
    res += echapperTexte(m)
  }
  while (pile.length) res += `</${pile.pop()}>`
  return res
}

/** Vrai si le texte n'affiche rien (balises vides, espaces insécables…). */
export function estVide(html) {
  return !String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
    .trim()
}
