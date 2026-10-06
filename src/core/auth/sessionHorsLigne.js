// ─── Rester connecté sans réseau ─────────────────────────────────────────────
//
// Le jeton d'accès de Supabase vit une heure. Au-delà, la bibliothèque doit
// le renouveler auprès du serveur ; sans réseau, elle garde la session sur
// l'appareil mais répond « pas de session » — l'app renvoyait alors à la page
// de connexion, où l'on ne peut rien faire sans réseau. Tant que l'échec vient
// du réseau, l'utilisateur gardé sur l'appareil fait foi ; le jeton se
// renouvelle au retour du réseau. Un refus du serveur (session révoquée)
// déconnecte, lui, normalement.

/** L'utilisateur d'une session telle que Supabase la range (texte JSON) */
export function utilisateurDeSessionGardee(brut) {
  try {
    const session = JSON.parse(brut ?? 'null')
    const user = session?.user ?? session?.currentSession?.user ?? null
    return user?.id ? user : null
  } catch {
    return null
  }
}

/** Une erreur due au réseau, et non un refus du serveur */
export function echecDeReseau(erreur, enLigne = true) {
  if (!enLigne) return true
  if (!erreur) return false
  if (erreur.name === 'AuthRetryableFetchError' || (erreur.__isAuthError && erreur.status === 0)) return true
  return /fetch|network|réseau|Load failed/i.test(String(erreur.message ?? ''))
}
