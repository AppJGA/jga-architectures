// ─── Recherche dans le carnet d'adresses ─────────────────────────────────────
//
// Une option par personne du carnet (avec son organisation) et une par fiche
// d'organisation. On cherche dans tous les champs : chaque mot tapé doit se
// trouver quelque part, sans tenir compte des majuscules ni des accents ; un
// numéro se retrouve même tapé sans espaces. Pur (tests/recherche-carnet.test.js).

const norm = (s) => String(s ?? '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const chiffres = (...valeurs) => valeurs.map((v) => String(v ?? '').replace(/\D/g, '')).filter(Boolean).join(' ')
const vide = (v) => (v == null ? '' : String(v))

/** Les options de la liste, à partir des fiches du carnet (avec leurs `interlocuteurs`). */
export function optionsCarnet(entreprises = []) {
  return entreprises.flatMap((e) => {
    const lieu = [e.code_postal, e.ville].filter(Boolean).join(' ')
    const adresse = [e.adresse, lieu].filter(Boolean).join(', ')
    const personnes = (e.interlocuteurs ?? []).map((i) => {
      const telephone = i.telephone || e.telephone
      const email = i.email || e.email
      return {
        cle: `i:${i.id}`, type: 'personne',
        titre: [i.prenom, i.nom].filter(Boolean).join(' ') || e.raison_sociale,
        detail: [e.raison_sociale, i.fonction, telephone, email].filter(Boolean).join(' · '),
        champs: {
          prenom: vide(i.prenom), nom: vide(i.nom), fonction: vide(i.fonction),
          organisation: vide(e.raison_sociale), adresse, telephone: vide(telephone), email: vide(email),
        },
        texte: norm([i.prenom, i.nom, i.fonction, i.telephone, i.email, e.raison_sociale, e.adresse, lieu, e.telephone, e.email].join(' ')),
        chiffres: chiffres(i.telephone, e.telephone, e.code_postal),
      }
    })
    const fiche = {
      cle: `e:${e.id}`, type: 'organisation',
      titre: e.raison_sociale,
      detail: [adresse, e.telephone, e.email].filter(Boolean).join(' · '),
      // Une organisation ne remplace pas la personne déjà saisie
      champs: { organisation: vide(e.raison_sociale), adresse, telephone: vide(e.telephone), email: vide(e.email) },
      texte: norm([e.raison_sociale, e.adresse, lieu, e.telephone, e.email, e.siret].join(' ')),
      chiffres: chiffres(e.telephone, e.code_postal, e.siret),
    }
    return [...personnes, fiche]
  })
}

const debutDeMot = (texte, mot) => texte.startsWith(mot) || texte.includes(` ${mot}`)

/**
 * Les options qui répondent à la saisie, les mieux placées d'abord : celles
 * dont les mots tapés commencent un mot, puis l'ordre alphabétique. Sans
 * saisie, toutes.
 */
export function filtrerOptions(options = [], requete = '', max = 60) {
  const mots = norm(requete).split(' ').filter(Boolean)
  const correspond = (o, mot) => {
    if (o.texte.includes(mot)) return true
    const n = mot.replace(/\D/g, '')
    return n.length >= 2 && n.length === mot.replace(/[\s.\-/]/g, '').length && o.chiffres.replace(/ /g, '|').split('|').some((c) => c.includes(n))
  }
  return options
    .filter((o) => mots.every((m) => correspond(o, m)))
    .map((o) => ({ o, score: mots.filter((m) => debutDeMot(o.texte, m)).length }))
    .sort((a, b) => b.score - a.score || norm(a.o.titre).localeCompare(norm(b.o.titre)))
    .slice(0, max)
    .map((x) => x.o)
}

/** Le formulaire rempli par l'option choisie. */
export function remplirDepuis(option, form = {}) {
  return { ...form, ...option.champs }
}
