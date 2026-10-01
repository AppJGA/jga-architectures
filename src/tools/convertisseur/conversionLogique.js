// Convertisseur : tout ce qui se décide sans navigateur. Le décodage et
// l'encodage (heic-to, canvas) vivent dans conversion.js ; ici, on reconnaît
// les fichiers, on nomme les sorties et on dimensionne, pour pouvoir le tester.
//
// L'outil est pensé pour accueillir d'autres conversions : un format d'entrée
// ou de sortie de plus, c'est une entrée dans ces listes, pas un nouvel outil.

// `navigateur` : le navigateur sait lire ce format seul. Sinon il faut un
// décodeur (le HEIC, que Chrome et Firefox ignorent).
export const FORMATS_ENTREE = [
  { id: 'heic', libelle: 'HEIC', extensions: ['heic', 'heif', 'hif'], navigateur: false },
  { id: 'jpeg', libelle: 'JPEG', extensions: ['jpg', 'jpeg', 'jfif'], navigateur: true },
  { id: 'png', libelle: 'PNG', extensions: ['png'], navigateur: true },
  { id: 'webp', libelle: 'WebP', extensions: ['webp'], navigateur: true },
]

export const FORMATS_SORTIE = [
  { id: 'jpeg', libelle: 'JPEG', extension: 'jpg', mime: 'image/jpeg' },
]

// `coteMax` nul : dimensions d'origine. 2 000 px suffisent à l'écran et à
// l'impression A4 d'une photo, pour quelques centaines de Ko.
export const TAILLES = [
  { id: 'origine', libelle: 'Taille d’origine', detail: 'Qualité maximale, fichiers lourds', coteMax: null, qualite: 0.92 },
  { id: 'email', libelle: 'Allégée pour l’e-mail', detail: '2 000 px au plus, quelques centaines de Ko', coteMax: 2000, qualite: 0.85 },
]

export const ACCEPT = FORMATS_ENTREE.flatMap(f => f.extensions.map(e => `.${e}`)).join(',')

export function extensionDe(nom) {
  const m = /\.([^./\\]+)$/.exec(nom ?? '')
  return m ? m[1].toLowerCase() : ''
}

// Marque principale d'un conteneur HEIF (octets 8 à 11, après « ftyp »). Une
// photo AirDrop renommée, ou reçue sans extension, se reconnaît quand même.
const MARQUES_HEIF = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'])

export function estHeif(octets) {
  if (!octets || octets.length < 12) return false
  const ascii = (debut, fin) => String.fromCharCode(...octets.slice(debut, fin))
  return ascii(4, 8) === 'ftyp' && MARQUES_HEIF.has(ascii(8, 12))
}

// Le contenu prime sur l'extension : un « .jpg » qui est un HEIC (cas des
// exports de certaines messageries) passe par le décodeur HEIC.
export function formatDe(nom, entete) {
  if (estHeif(entete)) return FORMATS_ENTREE.find(f => f.id === 'heic')
  const ext = extensionDe(nom)
  return FORMATS_ENTREE.find(f => f.extensions.includes(ext)) ?? null
}

export function dimensionsCible(largeur, hauteur, coteMax) {
  const cote = Math.max(largeur, hauteur)
  if (!coteMax || cote <= coteMax) return { largeur, hauteur }
  const ratio = coteMax / cote
  return {
    largeur: Math.max(1, Math.round(largeur * ratio)),
    hauteur: Math.max(1, Math.round(hauteur * ratio)),
  }
}

// IMG_1234.HEIC et IMG_1234.JPG donneraient tous deux IMG_1234.jpg : dans un
// ZIP, le second écraserait le premier. `pris` est mis à jour au passage.
export function nomSortie(nom, sortie, pris) {
  const base = (nom ?? '').replace(/\.[^./\\]+$/, '') || 'image'
  let candidat = `${base}.${sortie.extension}`
  for (let n = 2; pris.has(candidat.toLowerCase()); n++) {
    candidat = `${base} (${n}).${sortie.extension}`
  }
  pris.add(candidat.toLowerCase())
  return candidat
}

export function nomArchive(date = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `photos-converties-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.zip`
}

// Un seul fichier se télécharge tel quel : un ZIP pour une photo, c'est un
// geste de plus pour l'ouvrir.
export function modeTelechargement(nbFichiers) {
  if (nbFichiers <= 0) return null
  return nbFichiers === 1 ? 'fichier' : 'zip'
}

export function formatTaille(octets) {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
