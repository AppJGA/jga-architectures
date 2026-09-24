// ─── Analyseur réglementaire : logique pure ──────────────────────────────────
//
// L'analyse ne passe plus par l'API Claude (facturée à l'usage, et la clé se
// lisait en clair dans la page). Elle se fait dans Claude Code ou sur
// claude.ai, couverts par l'abonnement de l'agence : l'outil prépare le texte
// à analyser, l'utilisateur le colle chez Claude, puis recolle la réponse ici.
//
// Tout ce qui est calculable sans modèle — lire le DXF, relever les cotes,
// fabriquer la demande, relire la réponse — vit donc ici, sans React, et se
// teste sans navigateur (`tests/analyseur.test.js`).

// ─── Réglementations ──────────────────────────────────────────────────────────

export const REGLEMENTATIONS = {
  erp: {
    nom: 'ERP',
    label: 'ERP',
    description: 'Établissements Recevant du Public',
    regles: [
      { id: 'ERP-001', element: 'Largeur dégagement principal', exigence: '≥ 1,40 m (jusqu\'à 100 pers) / ≥ 2,00 m (> 100 pers)' },
      { id: 'ERP-002', element: 'Largeur dégagement secondaire', exigence: '≥ 0,90 m' },
      { id: 'ERP-003', element: 'Largeur porte issue de secours', exigence: '≥ 0,80 m (1 UP = 0,60 m)' },
      { id: 'ERP-004', element: 'Distance maximale issue de secours', exigence: '≤ 40 m depuis tout point' },
      { id: 'ERP-005', element: 'Hauteur libre passages', exigence: '≥ 2,20 m' },
    ],
  },
  pmr: {
    nom: 'PMR',
    label: 'PMR',
    description: 'Personnes à Mobilité Réduite',
    regles: [
      { id: 'PMR-001', element: 'Largeur cheminement extérieur', exigence: '≥ 1,40 m' },
      { id: 'PMR-002', element: 'Largeur cheminement intérieur', exigence: '≥ 1,40 m (rétrécissement ponctuel ≥ 1,20 m)' },
      { id: 'PMR-003', element: 'Largeur porte accessible', exigence: '≥ 0,90 m (passage utile ≥ 0,83 m)' },
      { id: 'PMR-004', element: 'Espace de manœuvre porte', exigence: '≥ 1,70 m × 2,20 m côté poignée' },
      { id: 'PMR-005', element: 'Espace retournement fauteuil', exigence: '⌀ ≥ 1,50 m' },
      { id: 'PMR-006', element: 'WC accessible surface', exigence: '≥ 1,50 m × 2,10 m' },
      { id: 'PMR-007', element: 'Pente rampe', exigence: '≤ 5 % (8 % exceptionnel, 12 % sur 0,50 m max)' },
    ],
  },
  logement: {
    nom: 'Logement',
    label: 'Logement',
    description: 'Code de la construction',
    regles: [
      { id: 'LOG-001', element: 'Surface minimale T1', exigence: '≥ 14 m²' },
      { id: 'LOG-002', element: 'Hauteur sous plafond', exigence: '≥ 2,20 m (habitable)' },
      { id: 'LOG-003', element: 'Largeur circulation logement', exigence: '≥ 0,90 m' },
      { id: 'LOG-004', element: 'Logement adapté PMR (RDC ou ascenseur)', exigence: '≥ 10 % des logements' },
      { id: 'LOG-005', element: 'Largeur porte logement PMR', exigence: '≥ 0,90 m' },
    ],
  },
}

export const STATUTS = ['conforme', 'non_conforme', 'a_verifier']

// ─── Lecture du DXF ───────────────────────────────────────────────────────────

export function parseDxfBrut(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const pairs = []
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim())
    const value = lines[i + 1].trim()
    if (!isNaN(code)) pairs.push({ code, value })
  }

  const layers = new Set()
  for (const p of pairs) {
    if (p.code === 8 && p.value && p.value !== '0') layers.add(p.value)
  }

  const arcs = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'ARC') {
      let layer = '', radius = 0
      for (let j = i + 1; j < Math.min(i + 20, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8) layer = pairs[j].value
        if (pairs[j].code === 40) radius = parseFloat(pairs[j].value)
      }
      if (radius > 50) arcs.push({ layer, radius })
    }
  }

  const polylines = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'LWPOLYLINE') {
      let layer = ''
      const xs = [], ys = []
      for (let j = i + 1; j < Math.min(i + 200, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8) layer = pairs[j].value
        if (pairs[j].code === 10) xs.push(parseFloat(pairs[j].value))
        if (pairs[j].code === 20) ys.push(parseFloat(pairs[j].value))
      }
      if (xs.length >= 2) {
        const w = Math.max(...xs) - Math.min(...xs)
        const h = Math.max(...ys) - Math.min(...ys)
        if (w > 100 || h > 100) polylines.push({ layer, w, h })
      }
    }
  }

  const lines_list = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'LINE') {
      let layer = '', x1 = 0, y1 = 0, x2 = 0, y2 = 0
      for (let j = i + 1; j < Math.min(i + 20, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8)  layer = pairs[j].value
        if (pairs[j].code === 10) x1 = parseFloat(pairs[j].value)
        if (pairs[j].code === 20) y1 = parseFloat(pairs[j].value)
        if (pairs[j].code === 11) x2 = parseFloat(pairs[j].value)
        if (pairs[j].code === 21) y2 = parseFloat(pairs[j].value)
      }
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      if (length > 200) lines_list.push({ layer, length })
    }
  }

  const mtexts = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'MTEXT') {
      let layer = '', t = ''
      for (let j = i + 1; j < Math.min(i + 30, pairs.length); j++) {
        if (pairs[j].code === 0) break
        if (pairs[j].code === 8) layer = pairs[j].value
        if (pairs[j].code === 1) t = pairs[j].value
      }
      if (t) {
        // Un MTEXT porte les codes de mise en forme d'ArchiCAD : « \fArial;Couloir »
        // doit devenir « Couloir », sinon la police part dans l'analyse comme
        // si c'était le nom de la pièce.
        const clean = t
          .replace(/\\P/g, ' ')                 // saut de paragraphe
          .replace(/\\[A-Za-z][^;\\]*;/g, '')   // \fArial;  \H2.5x;  \C1;
          .replace(/[{}\\]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (clean) mtexts.push({ layer, text: clean })
      }
    }
  }

  return {
    layers: [...layers],
    arcs,
    polylines,
    lines: lines_list,
    mtexts,
    stats: {
      totalPairs: pairs.length,
      nbLayers: layers.size,
      nbArcs: arcs.length,
      nbPolylines: polylines.length,
      nbLines: lines_list.length,
      nbTexts: mtexts.length,
    },
  }
}

export function construireContexte(parsed, nomFichier) {
  const arcsPortes = parsed.arcs.filter(a =>
    a.layer.toLowerCase().includes('porte') || a.layer.toLowerCase().includes('door')
  )
  const rayonsPortes = [...new Set(arcsPortes.map(a => Math.round(a.radius)))].sort((a, b) => a - b)

  const sanitaires = [...parsed.polylines, ...parsed.lines].filter(e =>
    e.layer.toLowerCase().includes('sanit') ||
    e.layer.toLowerCase().includes('wc') ||
    e.layer.toLowerCase().includes('pmr')
  )

  const escaliers = parsed.lines.filter(e =>
    e.layer.toLowerCase().includes('escal') || e.layer.toLowerCase().includes('ascens')
  )

  const espaces = parsed.polylines
    .filter(p => p.w > 500 || p.h > 500)
    .map(p => ({ layer: p.layer, w: (p.w / 1000).toFixed(2), h: (p.h / 1000).toFixed(2) }))

  return `
=== FICHIER : ${nomFichier} ===

CALQUES PRÉSENTS :
${parsed.layers.map(l => `  · ${l}`).join('\n') || '  (aucun calque)'}

STATISTIQUES :
  ${parsed.stats.nbArcs} arcs · ${parsed.stats.nbPolylines} polylignes · ${parsed.stats.nbLines} lignes (>20cm) · ${parsed.stats.nbTexts} textes

PORTES DÉTECTÉES (${arcsPortes.length} arcs sur calques "porte"/"door") :
  Rayons = largeurs vantail : ${rayonsPortes.map(r => `${r}mm (${(r / 1000).toFixed(2)}m)`).join(', ') || 'aucun détecté'}
  Note : passage utile ≈ rayon − 75mm (quincaillerie)

SANITAIRES (calques sanit/wc/pmr) :
  ${sanitaires.length} éléments détectés

ESCALIERS / ASCENSEURS :
  ${escaliers.length} éléments détectés
  Longueurs : ${[...new Set(escaliers.map(e => (e.length / 1000).toFixed(2)))].slice(0, 8).join(', ')}m

ESPACES ET ZONES (polylignes > 50cm) :
${espaces.slice(0, 15).map(e => `  [${e.layer}] ${e.w}m × ${e.h}m`).join('\n') || '  (aucun espace détecté)'}

ANNOTATIONS TEXTE :
${parsed.mtexts.slice(0, 20).map(m => `  [${m.layer}] "${m.text}"`).join('\n') || '  (aucune annotation)'}
`
}

// ─── La demande à coller chez Claude ─────────────────────────────────────────

/**
 * @param contextes       résultats de `construireContexte`, un par fichier
 * @param reglementations clés de REGLEMENTATIONS retenues
 */
export function construirePrompt(contextes, reglementations) {
  const contexte = contextes.join('\n\n')
  const regles = reglementations.flatMap(r => REGLEMENTATIONS[r]?.regles ?? [])

  return `Tu es un expert en réglementation du bâtiment français (ERP, PMR, logement). Tu analyses des données extraites de fichiers DXF de plans d'architecture ArchiCAD.

CONTEXTE TECHNIQUE :
Les fichiers sont des plans ArchiCAD exportés en DXF. Les unités d'origine sont en MILLIMÈTRES. Les valeurs ont été converties en mètres (suffixe "m") pour faciliter la comparaison réglementaire.

DONNÉES EXTRAITES DES PLANS :
${contexte}

RÈGLES RÉGLEMENTAIRES À VÉRIFIER :
${regles.map(r => `[${r.id}] ${r.element} : ${r.exigence}`).join('\n')}

MÉTHODE D'ANALYSE :
1. Utilise les cotes 50 cm–1 m pour identifier les largeurs de portes et passages
2. Utilise les cotes 1 m–3 m pour identifier les circulations et espaces
3. Utilise les noms de blocs pour identifier les équipements (WC, lavabo, escalier, porte...)
4. Utilise les annotations texte pour identifier les pièces (WC, couloir, sas, logement...)
5. Utilise les noms de calques pour comprendre la nature des éléments
6. Si tu trouves plusieurs cotes dans une plage réglementaire, analyse la plus petite : c'est elle qui peut poser problème

Pour chaque règle, analyse les données disponibles et fournis un résultat structuré. Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour) :

{
  "resultats": [
    {
      "id": "ERP-001",
      "element": "Largeur dégagement principal",
      "exigence": "≥ 1,40 m",
      "valeur_mesuree": "1,20 m",
      "statut": "non_conforme",
      "confiance": 75,
      "remarque": "Couloir détecté à 1200 mm sur calque CIRCULATION, en dessous du seuil de 1400 mm"
    }
  ]
}

Valeurs de "statut" : "conforme" | "non_conforme" | "a_verifier"
"confiance" : entier 0–100.
"valeur_mesuree" : la valeur trouvée en mètres, ou "Non détecté" si absent des plans.

RÈGLES ABSOLUES :
1. Si une cote est présente dans la plage correspondant à une règle, donne "conforme" ou "non_conforme" avec confiance 50–70, même sans certitude absolue
2. Ne mets "a_verifier" (confiance 20) que si AUCUNE donnée pertinente n'est disponible
3. Ne jamais inventer une mesure absente des données
4. Un indice de confiance > 70 uniquement si une cote précise et clairement identifiable a été trouvée
5. Signaler dans remarque le calque ou bloc source de la valeur mesurée
6. Traiter TOUTES les règles listées, une ligne par règle`
}

// ─── Relecture de la réponse ─────────────────────────────────────────────────

/**
 * Isole la première valeur JSON du texte — objet `{…}` ou tableau `[…]` — en
 * comptant les délimiteurs. Un simple `indexOf('{')` / `lastIndexOf('}')`
 * suffirait rarement : collée depuis claude.ai, la réponse arrive souvent
 * entourée d'une phrase d'introduction, d'un bloc ```json, ou suivie d'un
 * commentaire qui contient lui aussi des accolades. Les délimiteurs trouvés à
 * l'intérieur d'une chaîne ne comptent pas.
 */
function extraireObjetJson(texte) {
  const candidats = [texte.indexOf('{'), texte.indexOf('[')].filter(i => i !== -1)
  if (!candidats.length) return null
  const debut = Math.min(...candidats)

  let profondeur = 0
  let dansChaine = false
  let echappe = false
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i]
    if (echappe) { echappe = false; continue }
    if (c === '\\') { echappe = true; continue }
    if (c === '"') { dansChaine = !dansChaine; continue }
    if (dansChaine) continue
    if (c === '{' || c === '[') profondeur++
    else if (c === '}' || c === ']') {
      profondeur--
      if (profondeur === 0) return texte.slice(debut, i + 1)
    }
  }
  return null
}

const nombreEntre = (v, min, max, defaut) => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return defaut
  return Math.min(max, Math.max(min, n))
}

/**
 * Relit ce que Claude a répondu et le ramène à la forme attendue par le
 * tableau et l'export Excel. Tolère un bloc ```json, une phrase autour, et des
 * champs manquants ; refuse en revanche ce qui ne contient aucun résultat,
 * avec un message que l'utilisateur peut comprendre.
 *
 * @returns [{ id, element, exigence, valeur_mesuree, statut, confiance, remarque }]
 */
export function lireReponse(texte, reglementations = []) {
  if (!texte || !texte.trim()) {
    throw new Error('Aucune réponse collée.')
  }

  const brut = extraireObjetJson(texte)
  if (!brut) {
    // Une ouverture sans fermeture veut dire que la sélection s'est arrêtée
    // en route : c'est le cas le plus fréquent, et le remède n'est pas le même.
    throw new Error(/[{[]/.test(texte)
      ? 'Réponse incomplète : le bloc de résultats est coupé avant sa fin. Recopie la réponse de Claude en entier, jusqu’à la dernière accolade.'
      : 'Réponse illisible : aucun bloc de résultats trouvé. Copie la réponse de Claude, qui commence par « { ».')
  }

  let objet
  try {
    objet = JSON.parse(brut)
  } catch {
    throw new Error('Réponse illisible : le JSON est incomplet. La copie a peut-être été tronquée — recopie la réponse en entier.')
  }

  const liste = Array.isArray(objet) ? objet : objet.resultats
  if (!Array.isArray(liste) || !liste.length) {
    throw new Error('Réponse lue, mais elle ne contient aucun résultat.')
  }

  // Les libellés de référence permettent de recompléter une ligne où Claude
  // n'aurait renvoyé que l'identifiant.
  const connues = new Map(
    reglementations.flatMap(r => REGLEMENTATIONS[r]?.regles ?? []).map(r => [r.id, r])
  )

  return liste
    .filter(r => r && typeof r === 'object')
    .map((r, i) => {
      const id = String(r.id ?? `?-${String(i + 1).padStart(3, '0')}`)
      const connue = connues.get(id)
      const statut = STATUTS.includes(r.statut) ? r.statut : 'a_verifier'
      return {
        id,
        element: String(r.element ?? connue?.element ?? 'Règle inconnue'),
        exigence: String(r.exigence ?? connue?.exigence ?? ''),
        valeur_mesuree: r.valeur_mesuree ? String(r.valeur_mesuree) : 'Non détecté',
        statut,
        // Une ligne sans indice de confiance ne doit pas s'afficher à 100 %
        confiance: nombreEntre(r.confiance, 0, 100, statut === 'a_verifier' ? 20 : 50),
        remarque: r.remarque ? String(r.remarque) : '',
      }
    })
}
