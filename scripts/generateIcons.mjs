// Génère les icônes de l'application à partir du logo JGA.
//
//   npm run generate-icons
//
// À relancer uniquement si le logo change : les PNG produits sont versionnés
// dans public/icons/.
//
// Le logo est un lockup large (monogramme JGA, baseline, « ARCHITECTURES »).
// Réduit tel quel dans un carré, il devient illisible : on n'en garde que le
// bloc monogramme, mesuré une fois sur l'image source.

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const SOURCE = 'public/Logo_JGA_Archi.jpg'
const SORTIE = 'public/icons'

// Boîte d'encre du bloc monogramme, mesurée sur Logo_JGA_Archi.jpg
// (2661 × 1318) — à revoir si le logo change.
//
// « ARCHITECTURES » forme un bloc séparé plus bas et reste exclu : réduit à la
// taille d'une icône, il n'est plus lisible. La baseline « Jacques Gerbe &
// Associés », en revanche, est conservée : elle descend au même niveau que la
// crosse du J, et la retrancher amputerait la lettre.
const MONOGRAMME = { left: 146, top: 108, width: 2375, height: 853 }

// Le logo est posé sur blanc dans le fichier source : tout autre fond ferait
// apparaître un rectangle blanc au milieu de l'icône. La couleur papier de la
// marque reste utilisée pour l'écran de démarrage (background_color).
const FOND = '#FFFFFF'

const TAILLES = [16, 32, 152, 167, 180, 192, 512]

// Marge autour du logo. Les icônes « maskable » sont recadrées par le système
// (cercle, carré arrondi, goutte…) : leur zone sûre est le disque central de
// 80 %, d'où une marge nettement plus large.
const MARGE = 0.08
const MARGE_MASKABLE = 0.22

async function icone(taille, marge, nom) {
  const interieur = Math.max(1, taille - 2 * Math.round(taille * marge))

  const logo = await sharp(SOURCE)
    .extract(MONOGRAMME)
    .resize(interieur, interieur, { fit: 'inside' })
    .png()
    .toBuffer()

  await sharp({
    create: { width: taille, height: taille, channels: 4, background: FOND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${SORTIE}/${nom}`)

  console.log(`✓ ${nom}`)
}

await mkdir(SORTIE, { recursive: true })

for (const taille of TAILLES) {
  await icone(taille, MARGE, `icon-${taille}.png`)
}
for (const taille of [192, 512]) {
  await icone(taille, MARGE_MASKABLE, `icon-${taille}-maskable.png`)
}

console.log(`\n${TAILLES.length + 2} icônes générées dans ${SORTIE}/`)
