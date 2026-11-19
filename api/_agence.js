// Vérification commune aux fonctions serveur : session Supabase valide, puis
// `est_agence()` demandé avec le propre jeton de l'appelant (règles de la base).

export async function verifierAgence(url, cle, jeton) {
  if (!jeton) return 401
  const entetes = { apikey: cle, Authorization: `Bearer ${jeton}` }
  const utilisateur = await fetch(`${url}/auth/v1/user`, { headers: entetes })
  if (!utilisateur.ok) return 401
  const agence = await fetch(`${url}/rest/v1/rpc/est_agence`, {
    method: 'POST', headers: { ...entetes, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!agence.ok || (await agence.json()) !== true) return 403
  return 200
}

export const jetonDe = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')

// Note le coût d'un appel à Claude (table ia_consommation, migration 083),
// avec le jeton de l'appelant. Ne fait jamais échouer l'appel : sans la
// migration ou sans réseau, l'appel n'est simplement pas compté.
export async function noterConsommation(url, cle, jeton, { fonction, modele, usage }) {
  if (!url || !cle || !jeton || !usage) return
  try {
    await fetch(`${url}/rest/v1/ia_consommation`, {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ fonction, modele: String(modele ?? 'inconnu'), usage }),
    })
  } catch { /* compteur perdu, l'appel continue */ }
}
