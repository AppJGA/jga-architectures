// ─── Lecture des instructions de dessin d'un PDF ─────────────────────────────
//
// Un flux de contenu PDF est une suite d'instructions « opérandes puis
// opérateur » : `0.36 0.45 0.25 RG`, `224.4 601.7 m`, `S`. Un plan ArchiCAD en
// compte plusieurs millions : on ne les garde pas en mémoire. La lecture
// appelle `surInstruction` pour chacune, avec des tampons réutilisés — ce qui
// doit durer au-delà de l'appel est à recopier par l'appelant.
//
// Seuls les opérandes utiles à l'analyse sont décodés : les nombres et le
// dernier nom (`/G1 gs`, `/Fm2 Do`). Chaînes, tableaux, dictionnaires et images
// en ligne sont reconnus pour être franchis sans erreur, pas interprétés.
// Chaque instruction garde ses bornes en octets : ce qui n'est pas réécrit est
// recopié tel quel.

const ESPACE = new Uint8Array(256)
for (const c of [0, 9, 10, 12, 13, 32]) ESPACE[c] = 1
const DELIM = new Uint8Array(256)
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1

const decodeur = new TextDecoder('latin1')

/**
 * @param octets Uint8Array du flux décompressé
 * @param surInstruction (op, nombres, nNombres, nom, debut, fin, autres) => void
 *   - nombres : Float64Array réutilisé, les `nNombres` premiers sont valides
 *   - nom : dernier nom lu parmi les opérandes (sans « / »), ou null
 *   - debut : octet du premier opérande (ou de l'opérateur s'il n'en a pas)
 *   - fin : octet qui suit l'opérateur
 *   - autres : nombre d'opérandes ni nombre ni nom (chaînes, tableaux…)
 */
export function lireInstructions(octets, surInstruction) {
  const n = octets.length
  let i = 0
  const nombres = new Float64Array(64)
  let nNombres = 0
  let nom = null
  let autres = 0
  let debut = -1

  const reinitialiser = () => { nNombres = 0; nom = null; autres = 0; debut = -1 }
  const marquer = (pos) => { if (debut < 0) debut = pos }

  while (i < n) {
    const c = octets[i]

    if (ESPACE[c]) { i++; continue }

    // Commentaire
    if (c === 37 /* % */) {
      while (i < n && octets[i] !== 10 && octets[i] !== 13) i++
      continue
    }

    // Nom
    if (c === 47 /* / */) {
      marquer(i)
      const d = ++i
      while (i < n && !ESPACE[octets[i]] && !DELIM[octets[i]]) i++
      nom = decodeur.decode(octets.subarray(d, i))
      continue
    }

    // Chaîne littérale, parenthèses équilibrées et échappements
    if (c === 40 /* ( */) {
      marquer(i)
      let profondeur = 1
      i++
      while (i < n && profondeur > 0) {
        const b = octets[i]
        if (b === 92 /* \ */) i += 2
        else { if (b === 40) profondeur++; else if (b === 41) profondeur--; i++ }
      }
      autres++
      continue
    }

    // Dictionnaire << … >> ou chaîne hexadécimale < … >
    if (c === 60 /* < */) {
      marquer(i)
      if (octets[i + 1] === 60) {
        let profondeur = 0
        while (i < n) {
          if (octets[i] === 60 && octets[i + 1] === 60) { profondeur++; i += 2 }
          else if (octets[i] === 62 && octets[i + 1] === 62) { profondeur--; i += 2; if (profondeur === 0) break }
          else if (octets[i] === 40) {
            // une chaîne dans un dictionnaire peut contenir « >> »
            let p = 1; i++
            while (i < n && p > 0) { const b = octets[i]; if (b === 92) i += 2; else { if (b === 40) p++; else if (b === 41) p--; i++ } }
          } else i++
        }
      } else {
        while (i < n && octets[i] !== 62) i++
        i++
      }
      autres++
      continue
    }

    // Tableau, avec imbrication et chaînes
    if (c === 91 /* [ */) {
      marquer(i)
      let profondeur = 0
      while (i < n) {
        const b = octets[i]
        if (b === 91) { profondeur++; i++ }
        else if (b === 93) { profondeur--; i++; if (profondeur === 0) break }
        else if (b === 40) {
          let p = 1; i++
          while (i < n && p > 0) { const x = octets[i]; if (x === 92) i += 2; else { if (x === 40) p++; else if (x === 41) p--; i++ } }
        } else i++
      }
      autres++
      continue
    }

    // Délimiteur isolé inattendu : franchi
    if (DELIM[c]) { i++; continue }

    // Nombre ou mot-clé (suite de caractères réguliers)
    const d = i
    while (i < n && !ESPACE[octets[i]] && !DELIM[octets[i]]) i++
    const premier = octets[d]
    const estNombre = (premier >= 48 && premier <= 57) || premier === 45 || premier === 43 || premier === 46

    if (estNombre) {
      marquer(d)
      if (nNombres < nombres.length) nombres[nNombres] = lireNombre(octets, d, i)
      nNombres++
      continue
    }

    const mot = decodeur.decode(octets.subarray(d, i))
    if (mot === 'true' || mot === 'false' || mot === 'null') { marquer(d); autres++; continue }

    // Image en ligne : BI … ID <données binaires> EI
    if (mot === 'ID') {
      i++ // un blanc unique suit ID
      while (i < n) {
        if (octets[i] === 69 && octets[i + 1] === 73 && ESPACE[octets[i - 1]]
          && (i + 2 >= n || ESPACE[octets[i + 2]] || DELIM[octets[i + 2]])) { i += 2; break }
        i++
      }
      surInstruction('EI', nombres, 0, null, debut < 0 ? d : debut, i, autres)
      reinitialiser()
      continue
    }

    surInstruction(mot, nombres, Math.min(nNombres, nombres.length), nom, debut < 0 ? d : debut, i, autres)
    reinitialiser()
  }
}

// Nombre PDF : entier ou décimal, signe éventuel, sans exposant
function lireNombre(octets, d, f) {
  let i = d
  let signe = 1
  if (octets[i] === 45) { signe = -1; i++ } else if (octets[i] === 43) i++
  let entier = 0
  while (i < f && octets[i] >= 48 && octets[i] <= 57) { entier = entier * 10 + (octets[i] - 48); i++ }
  if (i < f && octets[i] === 46) {
    i++
    let frac = 0
    let div = 1
    while (i < f && octets[i] >= 48 && octets[i] <= 57) { frac = frac * 10 + (octets[i] - 48); div *= 10; i++ }
    return signe * (entier + frac / div)
  }
  return signe * entier
}
