/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Lien court d'un PDF diffusé : /pdf/<code> ───────────────────────────────
//
// L'e-mail de diffusion porte « https://<site>/pdf/2618-LVV-CR03-k7Pq9x »
// (vercel.json renvoie /pdf/<code> ici). Le lien signé du stockage, valable
// 30 jours, est lu par la fonction `lien_telechargement` (migration 065),
// ouverte aux visiteurs sans compte mais qui ne rend que le lien du code
// demandé, s'il n'a pas expiré. Clé publique (anon) : rien d'autre n'est lu.

const page = (titre, texte) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${titre}</title></head>
<body style="font-family: -apple-system, Segoe UI, Arial, sans-serif; background: #FAF7F2; color: #1F1B17; display: flex; min-height: 90vh; align-items: center; justify-content: center; margin: 0; padding: 16px">
<div style="max-width: 440px; background: white; border: 1px solid #E9E2D6; padding: 28px 24px">
<p style="margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #E8602C; font-weight: 600">JGA Architectures</p>
<h1 style="margin: 0 0 10px; font-size: 20px">${titre}</h1>
<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #5E5854">${texte}</p>
</div></body></html>`

export default async function handler(req, res) {
  const code = String(req.query?.code ?? '')
  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.VITE_SUPABASE_ANON_KEY
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (!/^[A-Za-z0-9-]{6,80}$/.test(code)) {
    res.status(404).send(page('Lien introuvable', 'Cette adresse ne correspond à aucun document.'))
    return
  }
  if (!url || !cle) {
    res.status(500).send(page('Service indisponible', 'Réessayez dans quelques minutes.'))
    return
  }
  try {
    const reponse = await fetch(`${url}/rest/v1/rpc/lien_telechargement`, {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    })
    const lien = reponse.ok ? await reponse.json() : null
    if (typeof lien === 'string' && lien.startsWith('https://')) {
      res.writeHead(302, { Location: lien, 'Cache-Control': 'no-store' })
      res.end()
      return
    }
    res.status(404).send(page('Lien expiré', 'Ce lien de téléchargement a expiré ou n’existe plus. Le document vous a aussi été envoyé en pièce jointe ; sinon, demandez un nouvel envoi à JGA Architectures.'))
  } catch {
    res.status(502).send(page('Service indisponible', 'Réessayez dans quelques minutes.'))
  }
}
