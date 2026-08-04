// Résolution des imports relatifs sans extension.
//
// Le code source écrit `from './types'` : Vite complète l'extension, Node ESM
// ne le fait pas. Ce crochet, chargé via `--import` par le script `npm test`,
// essaie les extensions du projet avant de rendre la main au résolveur standard.
//
// Il ne s'applique qu'aux spécificateurs relatifs — les paquets de node_modules
// suivent leur résolution habituelle.

import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EXTENSIONS = ['.js', '.jsx', '/index.js', '/index.jsx']

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const ext of EXTENSIONS) {
        const url = new URL(specifier + ext, context.parentURL)
        if (existsSync(fileURLToPath(url))) {
          return { url: url.href, shortCircuit: true }
        }
      }
    }
    return nextResolve(specifier, context)
  },
})
