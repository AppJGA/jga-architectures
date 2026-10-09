// Copie d'un lien de partage ; à défaut de presse-papiers, le lien s'affiche
// pour être recopié à la main.

/** @returns vrai si le lien est dans le presse-papiers */
export async function copierDansPressePapiers(lien) {
  try {
    await navigator.clipboard.writeText(lien)
    return true
  } catch {
    // Presse-papiers refusé (contexte non sécurisé, ancien navigateur) : le lien à recopier à la main
    window.prompt('Lien à copier :', lien)
    return false
  }
}
