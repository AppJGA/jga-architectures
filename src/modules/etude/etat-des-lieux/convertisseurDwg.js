// ─── DWG → DXF, sur l'appareil ───────────────────────────────────────────────
//
// Les plans arrivent souvent en DWG : on les convertit ici en DXF avant de les
// lire, sans rien envoyer nulle part (LibreDWG compilé en WebAssembly,
// `@mlightcad/libredwg-web`, licence GPL-3.0 — accord de l'agence le
// 2026-11-17). Essai sur les deux DWG d'exemple (2010 et 2018) : pièces,
// noms et surfaces identiques à un DXF converti en ligne, en 0,1 à 0,3 s.
//
// La bibliothèque (≈ 8 Mo) n'est chargée qu'au premier DWG, et n'est pas
// préchargée par l'app installée (vite.config.js) : on importe au bureau.

// Le paquet n'exporte pas son fichier .wasm : on le désigne par son chemin,
// Vite le copie dans le site au build (motif `new URL(…, import.meta.url)`)
const ADRESSE_WASM = new URL('../../../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm', import.meta.url).href

let chargement = null

function libreDwg() {
  chargement ??= import('@mlightcad/libredwg-web').then(async ({ LibreDwg, createModule }) => {
    const module = await createModule({ locateFile: () => ADRESSE_WASM })
    return LibreDwg.createByWasmInstance(module)
  }).catch((err) => {
    chargement = null // un nouvel essai pourra recharger
    throw err
  })
  return chargement
}

/** @returns Uint8Array du DXF ; lève une erreur lisible si la conversion échoue */
export async function convertirDwgEnDxf(octets) {
  let outil
  try {
    outil = await libreDwg()
  } catch (err) {
    throw new Error(`le convertisseur n’a pas pu être chargé (${err?.message ?? err})`, { cause: err })
  }
  const dxf = outil.dwg_write_dxf(octets)
  if (!dxf?.length) throw new Error('LibreDWG n’a pas su le lire (version de DWG non prise en charge ou fichier endommagé)')
  return new Uint8Array(dxf)
}
