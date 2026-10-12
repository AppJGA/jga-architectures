# Échéances partagées avec Notion — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** relier dans les deux sens les cartes « ECHEANCES RENDUS » du Planning hebdomadaire Notion et les échéances de l'app (calendrier des rendus, plannings d'étude et de chantier).

**Architecture :** un passeur serveur (`api/notion.js`) seul détenteur du jeton ; un registre en base (`notion_echeances`, migration 071) qui relie chaque date de carte à une échéance ; une logique pure qui lit les cartes et calcule, par comparaison, ce qu'il faut créer, déplacer ou supprimer de chaque côté ; un orchestrateur appelé par le calendrier et par chaque planning.

**Tech Stack :** React 19, Supabase (PostgREST), fonctions Vercel (Node), API Notion version `2025-09-03`, tests `node --test`.

**Spec :** `docs/superpowers/specs/2026-10-12-echeances-notion-design.md`

## Global Constraints

- Français partout : commentaires, noms, messages ; commits `feat:` / `fix:` / `test:` / `docs:` avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- À l'écran, « échéance », jamais « jalon » ; le code garde « jalon ».
- **Dépôt public** : aucun texte réel de carte Notion, aucun identifiant de base Notion, aucun nom réel dans le code ni les tests. Les identifiants des sources vont dans les variables Vercel `NOTION_PLANNING_SOURCE` et `NOTION_ATELIER_SOURCE`.
- Le jeton `NOTION_TOKEN` n'est lu que dans `api/` (jamais de variable `VITE_`).
- La structure de Notion ne change jamais : noms utilisés tels quels — titre `N° Affaire`, multi-sélection `Jour`, date `Semaine`, option `ECHEANCES RENDUS` ; base Atelier : titre `Référence`.
- Sans la migration 071, la synchronisation est éteinte (table absente : `PGRST205` / `42P01`), sans message d'erreur.
- Supabase ne lève pas d'exception : lire `{ error }`. Un refus RLS sur `update` / `delete` ne rend pas d'erreur.
- Styles inline ; couleurs de la gestion d'agence par `ACCENT` (`src/gestion/manifest.js`).
- Une fenêtre ne se ferme jamais au clic à côté.
- `npm test` et `npm run build` passent avant chaque commit ; `npx eslint src` ne doit pas ajouter de problème (comparer au nombre de départ, ~71).
- Dates : calculs en UTC (`Date.UTC`), jamais `Math.floor` sur un écart en millisecondes.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/071_echeances_notion.sql` (créé) | registre `notion_echeances`, `modifie_le` sur les deux tables d'échéances |
| `src/shared/notion/echeancesNotionLogique.js` (créé) | lecture d'une carte (numéro, dates, libellés), titres, réécriture d'une date, dates d'étude |
| `src/shared/notion/synchroNotionLogique.js` (créé) | `planSynchro` : la comparaison et la liste des opérations |
| `src/shared/notion/notionApiLogique.js` (créé) | forme des requêtes et réponses de l'API Notion (partagé avec `api/notion.js`) |
| `api/_agence.js` (créé) | vérification de session agence, commune aux fonctions serveur |
| `api/notion.js` (créé) | passeur : `lire`, `ecrire` |
| `api/transcrire.js` (modifié) | importe `verifierAgence` depuis `_agence.js` |
| `src/shared/notion/echeancesNotion.js` (créé) | appels au passeur, registre, orchestrateur `synchroniser`, échéances des affaires absentes de l'app |
| `src/shared/notion/MarqueNotion.jsx` (créé) | petite marque « N » |
| `src/shared/notion/useEcheancesNotion.js` (créé) | crochet des plannings : synchronisation à l'ouverture et après changement, liens et verrous |
| `src/gestion/gestionLogique.js` (modifié) | `rendusNotion`, `marquerNotion`, `aDater`, `affairesNotionSeules` |
| `src/gestion/gestionDonnees.js` (modifié) | `chargerCalendrier` lit aussi le registre |
| `src/gestion/CalendrierRendus.jsx` (modifié) | actualiser, marques, « À dater », affaires Notion |
| `src/gestion/ModaleJalon.jsx` (modifié) | lecture seule (plusieurs dates), échéances d'affaires absentes de l'app |
| `src/shared/planning/positionsPetales.js` (modifié) | `actionsJalon(ancre, verrouNotion)` |
| `src/modules/chantier/planning/GanttChart.jsx`, `GanttTimeline.jsx`, `JalonModal.jsx` (modifiés) | marque, verrou, synchronisation |
| `src/modules/etude/planning/GanttEtude.jsx`, `GanttEtudeTimeline.jsx`, `JalonEtudeModal.jsx` (modifiés) | idem |
| `tests/echeances-notion.test.js` (créé) | lecture des cartes, `planSynchro`, forme des requêtes |
| `tests/gestion.test.js`, `tests/menu-radial.test.js` (modifiés) | nouvelles fonctions du calendrier, roue |
| `CLAUDE.md` (modifié) | section « Échéances partagées avec Notion » |

---

### Task 1 : Migration 071

**Files :**
- Create : `supabase/migrations/071_echeances_notion.sql`

**Interfaces :**
- Produces : table `notion_echeances` (colonnes ci-dessous) ; colonne `modifie_le timestamptz` sur `planning_jalons` et `planning_etude_jalons`.

- [ ] **Step 1 : écrire la migration**

```sql
-- Migration 071 : échéances partagées avec Notion
--
-- Conception : docs/superpowers/specs/2026-10-12-echeances-notion-design.md.
-- Le registre relie chaque date lue dans une carte « ECHEANCES RENDUS » du
-- Planning hebdomadaire Notion à une échéance d'un planning de l'app — ou à
-- rien, quand l'affaire n'existe que dans Notion. `date_synchro` est la date
-- sur laquelle les deux côtés étaient d'accord au dernier passage : c'est en
-- la comparant aux deux côtés qu'on sait lequel a bougé. `libelle` est le
-- texte vu dans Notion, `libelle_app` celui de l'échéance : chacun change de
-- son côté sans écraser l'autre au premier rapprochement.
--
-- `modifie_le` sur les échéances départage les deux côtés quand les deux ont
-- changé (le plus récent l'emporte).
--
-- Rejouable. Suppose les migrations 050, 060, 068 (est_agence,
-- peut_modifier_affaire, acces_gestion).

create table if not exists notion_echeances (
  id uuid primary key,
  page_id text,
  rang integer not null default 0,
  numero text,
  reference text,
  affaire_id uuid references affaires(id) on delete set null,
  origine text check (origine in ('etude', 'chantier')),
  jalon_id bigint,
  libelle text,
  libelle_app text,
  date_synchro date,
  texte_carte text,
  nb_dates integer not null default 1,
  notion_modifie_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origine, jalon_id)
);

create index if not exists notion_echeances_page on notion_echeances (page_id);
create index if not exists notion_echeances_numero on notion_echeances (numero);

create or replace function notion_echeances_maj() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists notion_echeances_maj on notion_echeances;
create trigger notion_echeances_maj before update on notion_echeances
  for each row execute function notion_echeances_maj();

alter table notion_echeances enable row level security;
drop policy if exists "Agence" on notion_echeances;
create policy "Agence" on notion_echeances for all to authenticated
  using (public.est_agence()) with check (public.est_agence());
-- Comme toute table d'une affaire (060) : on n'écrit que pour une affaire
-- qu'on peut modifier ; une ligne sans affaire (affaire absente de l'app)
-- reste ouverte à toute l'agence.
drop policy if exists "Collaborateurs : écriture" on notion_echeances;
create policy "Collaborateurs : écriture" on notion_echeances as restrictive for all to authenticated
  using (affaire_id is null or public.peut_modifier_affaire(affaire_id) or public.acces_gestion())
  with check (affaire_id is null or public.peut_modifier_affaire(affaire_id) or public.acces_gestion());

-- Heure de modification des échéances
alter table planning_jalons add column if not exists modifie_le timestamptz not null default now();
alter table planning_etude_jalons add column if not exists modifie_le timestamptz not null default now();

create or replace function jalons_modifie_le() returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;
drop trigger if exists planning_jalons_modifie_le on planning_jalons;
create trigger planning_jalons_modifie_le before update on planning_jalons
  for each row execute function jalons_modifie_le();
drop trigger if exists planning_etude_jalons_modifie_le on planning_etude_jalons;
create trigger planning_etude_jalons_modifie_le before update on planning_etude_jalons
  for each row execute function jalons_modifie_le();

notify pgrst, 'reload schema';
```

- [ ] **Step 2 : relire** — rejouable (`if not exists`, `drop … if exists`), aucune donnée réelle, fonctions `est_agence`, `peut_modifier_affaire`, `acces_gestion` existantes (`grep -l "function acces_gestion" supabase/migrations/068*`).

- [ ] **Step 3 : commit**

```bash
git add supabase/migrations/071_echeances_notion.sql
git commit -m "feat: migration 071 — registre des échéances partagées avec Notion"
```

---

### Task 2 : lecture des cartes (logique pure)

**Files :**
- Create : `src/shared/notion/codesAffaire.js`
- Create : `src/shared/notion/echeancesNotionLogique.js`
- Create : `tests/echeances-notion.test.js`

**Interfaces :**
- Consumes : `vendrediSemaineIso(semaine, annee)`, `semaineIso(dateIso)` de `src/gestion/gestionLogique.js`.
- Produces :
  - `COLONNE_ECHEANCES = 'ECHEANCES RENDUS'`
  - `numeroAffaire(texte) → '2699' | null`
  - `codeCarte(code) → '2699 ABC'`
  - `datesDuTexte(texte, creeLe) → [{ date, texte, debut, fin, avecAnnee, anneeCourte }]`
  - `lireCarte(titre, creeLe) → { numero, dates: [{ date, texte, debut, fin, avecAnnee, anneeCourte, rang, libelle }], aDater }`
  - `formatDateCarte(iso) → '16/10/26'`
  - `titreCarte({ code, libelle, date }) → '2699 ABC – Rendu PRO 16/10/26'`
  - `remplacerDate(titre, d, nouvelleIso) → string` (d : une date rendue par `lireCarte`)
  - `remplacerLibelle(titre, ancien, nouveau) → string | null` (null si l'ancien n'y est pas exactement une fois)
  - `dateEtude(semaine, annee, dateReference) → 'YYYY-MM-DD'`
  - `memePosition(jalon, dateIso) → boolean`, `dateDuJalon(jalon, dateReference) → 'YYYY-MM-DD'`, `champsJalon(origine, dateIso) → { date } | { semaine, annee }`
  - `nomAffaireNotion(numero, references) → string | null` (references : `[{ numero, reference }]`)

- [ ] **Step 1 : écrire les tests qui échouent** (`tests/echeances-notion.test.js`)

```js
// Échéances partagées avec Notion : lecture des cartes « ECHEANCES RENDUS »
// et calcul de la synchronisation. Cartes INVENTÉES : le dépôt est public,
// aucun texte réel de Notion n'y entre.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  numeroAffaire, codeCarte, datesDuTexte, lireCarte, titreCarte, formatDateCarte,
  remplacerDate, remplacerLibelle, dateEtude, memePosition, dateDuJalon, champsJalon, nomAffaireNotion,
} from '../src/shared/notion/echeancesNotionLogique.js'

test('numéro d’affaire : premier nombre de 4 chiffres, pas une année de date', () => {
  assert.equal(numeroAffaire('!!! 2699 ABC : Rendu PRO 16/10/2026'), '2699')
  assert.equal(numeroAffaire('2698-XYZ- Réunion'), '2698')
  assert.equal(numeroAffaire('Rendu 16/10/2026 sans numéro'), null)
  assert.equal(numeroAffaire('Point agence'), null)
  assert.equal(numeroAffaire('12345 trop long'), null)
})

test('code de carte : numéro et premier mot', () => {
  assert.equal(codeCarte('2699-ABC'), '2699 ABC')
  assert.equal(codeCarte('2697 - Exemple Long'), '2697 Exemple')
  assert.equal(codeCarte('2696'), '2696')
})

test('dates : avec ou sans année, heure ignorée, dates impossibles écartées', () => {
  const d = datesDuTexte('Rendu 16/10 11h, dépôt 20/11/26, oral 3/2/2027, faux 31/02, PRO/DCE', '2026-09-27T16:00:00Z')
  assert.deepEqual(d.map((x) => x.date), ['2026-10-16', '2026-11-20', '2027-02-03'])
  assert.equal(d[0].texte, '16/10')
  assert.equal(d[1].anneeCourte, true)
})

test('année absente : la plus proche de la création de la carte', () => {
  assert.equal(datesDuTexte('Rendu 05/01', '2026-12-20T10:00:00Z')[0].date, '2027-01-05')
  assert.equal(datesDuTexte('Rendu 30/09', '2026-10-05T10:00:00Z')[0].date, '2026-09-30')
})

test('carte à une date : libellé = le texte sans le numéro, le code ni la date', () => {
  const c = lireCarte('!!! 2699 ABC AB CT : Rendu PRO/DCE 30/10/26', '2026-09-27T00:00:00Z')
  assert.equal(c.numero, '2699')
  assert.equal(c.dates.length, 1)
  assert.equal(c.dates[0].libelle, 'AB CT : Rendu PRO/DCE')
  assert.equal(c.aDater, false)
})

test('carte à plusieurs dates : un libellé par morceau', () => {
  const c = lireCarte('2698 XYZ - AB CT : Rendu PC 09/10/26 - Rendu PRO 09/10/26 - Rendu DCE 20/11/26', '2026-09-27T00:00:00Z')
  assert.deepEqual(c.dates.map((d) => [d.rang, d.date, d.libelle]), [
    [0, '2026-10-09', 'AB CT : Rendu PC'], [1, '2026-10-09', 'Rendu PRO'], [2, '2026-11-20', 'Rendu DCE'],
  ])
})

test('carte sans date lisible : à dater', () => {
  const c = lireCarte('2697 QRS : Rendu PC fin novembre', '2026-09-27T00:00:00Z')
  assert.equal(c.aDater, true)
  assert.equal(c.numero, '2697')
})

test('titre d’une carte de l’app, relu à l’identique', () => {
  const titre = titreCarte({ code: '2699-ABC', libelle: 'Rendu PRO', date: '2026-10-16' })
  assert.equal(titre, '2699 ABC – Rendu PRO 16/10/26')
  const c = lireCarte(titre, '2026-10-12T00:00:00Z')
  assert.equal(c.dates[0].libelle, 'Rendu PRO')
  assert.equal(c.dates[0].date, '2026-10-16')
  assert.equal(formatDateCarte('2027-01-05'), '05/01/27')
})

test('remplacer une date : même format, reste intact', () => {
  const titre = '!!2699 ABC : Rendu  APD 16/10 - présentation'
  const c = lireCarte(titre, '2026-10-01T00:00:00Z')
  assert.equal(remplacerDate(titre, c.dates[0], '2026-10-23'), '!!2699 ABC : Rendu  APD 23/10 - présentation')
  const t2 = '2699 ABC – Rendu PRO 16/10/2026'
  assert.equal(remplacerDate(t2, lireCarte(t2, '2026-10-01T00:00:00Z').dates[0], '2027-01-08'), '2699 ABC – Rendu PRO 08/01/2027')
})

test('remplacer un libellé : seulement s’il est là une fois', () => {
  assert.equal(remplacerLibelle('2699 ABC – Rendu PRO 16/10/26', 'Rendu PRO', 'Rendu PRO/DCE'), '2699 ABC – Rendu PRO/DCE 16/10/26')
  assert.equal(remplacerLibelle('PRO et PRO', 'PRO', 'X'), null)
  assert.equal(remplacerLibelle('abc', 'zzz', 'X'), null)
})

test('date d’étude : garde le jour de la semaine de référence, vendredi sinon', () => {
  assert.equal(dateEtude(42, 2026, null), '2026-10-16')
  assert.equal(dateEtude(43, 2026, '2026-10-14'), '2026-10-21') // mercredi → mercredi
})

test('position d’une échéance : jour au chantier, semaine à l’étude', () => {
  assert.equal(memePosition({ origine: 'chantier', date: '2026-10-14' }, '2026-10-14'), true)
  assert.equal(memePosition({ origine: 'etude', semaine: 42, annee: 2026 }, '2026-10-12'), true)
  assert.equal(memePosition({ origine: 'etude', semaine: 42, annee: 2026 }, '2026-10-19'), false)
  assert.equal(dateDuJalon({ origine: 'etude', semaine: 43, annee: 2026 }, '2026-10-14'), '2026-10-21')
  assert.deepEqual(champsJalon('etude', '2026-10-14'), { semaine: 42, annee: 2026 })
  assert.deepEqual(champsJalon('chantier', '2026-10-14'), { date: '2026-10-14' })
})

test('nom d’une affaire absente de l’app : la référence de la base des affaires', () => {
  const refs = [{ numero: '2697', reference: '2697 - QRS Exemple' }]
  assert.equal(nomAffaireNotion('2697', refs), '2697 - QRS Exemple')
  assert.equal(nomAffaireNotion('2600', refs), null)
})
```

- [ ] **Step 2 : lancer et voir échouer**

Run : `node --import ./tests/resolve-src.mjs --test tests/echeances-notion.test.js`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : écrire `src/shared/notion/echeancesNotionLogique.js`**

```js
// ─── Échéances partagées avec Notion : lecture des cartes ────────────────────
//
// Conception : docs/superpowers/specs/2026-10-12-echeances-notion-design.md.
// L'agence note ses rendus sur des cartes en texte libre (« 2699 ABC : Rendu
// PRO 16/10 ») dans la colonne « ECHEANCES RENDUS » du Planning hebdomadaire
// Notion, dont la structure ne doit pas changer. On y lit donc le numéro
// d'affaire et les dates dans le texte. Positions gardées sur le texte brut :
// une date se réécrit sans toucher au reste de la carte. Dates en UTC : un
// calcul à l'heure locale perdrait un jour au passage à l'heure d'été.
// Testé sans navigateur (tests/echeances-notion.test.js).

import { vendrediSemaineIso, semaineIso } from '../../gestion/gestionLogique.js'
import { numeroAffaire, codeCarte } from './codesAffaire.js'

export const COLONNE_ECHEANCES = 'ECHEANCES RENDUS'

const JOUR = 86400000
const msIso = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const isoMs = (m) => new Date(m).toISOString().slice(0, 10)

export { numeroAffaire, codeCarte }

const MOTIF_DATE = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g

/**
 * Dates écrites dans un texte. Sans année, celle qui place la date au plus
 * près de la création de la carte : « 05/01 » noté en décembre vise janvier.
 */
export function datesDuTexte(texte, creeLe) {
  const t = String(texte ?? '')
  const reference = msIso(String(creeLe ?? new Date().toISOString()).slice(0, 10))
  const anneeReference = new Date(reference).getUTCFullYear()
  const trouvees = []
  for (const m of t.matchAll(MOTIF_DATE)) {
    const jour = +m[1]
    const mois = +m[2]
    const annees = m[3] ? [m[3].length === 2 ? 2000 + +m[3] : +m[3]] : [anneeReference - 1, anneeReference, anneeReference + 1]
    const valides = annees
      .map((a) => Date.UTC(a, mois - 1, jour))
      .filter((ms) => mois >= 1 && mois <= 12 && new Date(ms).getUTCDate() === jour && new Date(ms).getUTCMonth() === mois - 1)
    if (valides.length === 0) continue
    valides.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference))
    trouvees.push({
      date: isoMs(valides[0]), texte: m[0], debut: m.index, fin: m.index + m[0].length,
      avecAnnee: !!m[3], anneeCourte: m[3]?.length === 2,
    })
  }
  return trouvees
}

const SEPARATEUR = /\s+[-–+]\s+/g
const BORDS = /^[\s\-–:+,]+|[\s\-–:+,]+$/g

// En tête de carte : marques d'urgence, numéro, puis le code en capitales
// (« ABC », « H&H », « GENdarmerie ») — l'affaire s'affiche déjà à part
function sansEntete(texte, numero) {
  let t = texte.replace(/^[\s!?]+/, '')
  if (!numero || !t.startsWith(numero)) return t
  t = t.slice(numero.length).replace(/^[\s\-–:]+/, '')
  return t.replace(/^[A-Z&]{2,}[\p{L}&]*(?=[\s\-–:]|$)/u, '').replace(/^[\s\-–:]+/, '')
}

function libelleAutour(titre, d, plusieurs, numero) {
  let debut = 0
  let fin = titre.length
  if (plusieurs) {
    for (const s of titre.matchAll(SEPARATEUR)) {
      if (s.index + s[0].length <= d.debut) debut = s.index + s[0].length
      else if (s.index >= d.fin) { fin = s.index; break }
    }
  }
  let morceau = titre.slice(debut, d.debut) + titre.slice(d.fin, fin)
  if (debut === 0) morceau = sansEntete(morceau, numero)
  return morceau.replace(/\s+/g, ' ').replace(BORDS, '').trim()
}

/** Une carte : son affaire, ses dates (chacune avec son libellé), ou « à dater ». */
export function lireCarte(titre, creeLe) {
  const texte = String(titre ?? '')
  const numero = numeroAffaire(texte)
  const trouvees = datesDuTexte(texte, creeLe)
  const plusieurs = trouvees.length > 1
  const dates = trouvees.map((d, rang) => ({ ...d, rang, libelle: libelleAutour(texte, d, plusieurs, numero) || 'Échéance' }))
  return { numero, dates, aDater: dates.length === 0 }
}

export const formatDateCarte = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** Carte créée par l'app, au format de l'agence : « 2699 ABC – Rendu PRO 16/10/26 ». */
export function titreCarte({ code, libelle, date }) {
  return `${codeCarte(code)} – ${String(libelle ?? '').trim() || 'Échéance'} ${formatDateCarte(date)}`
}

function formatComme(d, iso) {
  const jm = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (!d.avecAnnee) return jm
  return `${jm}/${d.anneeCourte ? iso.slice(2, 4) : iso.slice(0, 4)}`
}

/** Remplace une date lue par `lireCarte`, dans le format où elle était écrite. */
export function remplacerDate(titre, d, nouvelleIso) {
  return titre.slice(0, d.debut) + formatComme(d, nouvelleIso) + titre.slice(d.fin)
}

/** Null si l'ancien libellé n'apparaît pas exactement une fois : on ne devine pas. */
export function remplacerLibelle(titre, ancien, nouveau) {
  if (!ancien || titre.split(ancien).length !== 2) return null
  return titre.replace(ancien, nouveau)
}

/** Date d'une échéance d'étude : sa semaine, le jour de la semaine de la référence (vendredi sinon). */
export function dateEtude(semaine, annee, dateReference = null) {
  const lundi = msIso(vendrediSemaineIso(semaine, annee)) - 4 * JOUR
  const rangJour = dateReference ? (new Date(msIso(dateReference)).getUTCDay() + 6) % 7 : 4
  return isoMs(lundi + rangJour * JOUR)
}

export function champsJalon(origine, dateIso) {
  if (origine !== 'etude') return { date: dateIso }
  const { semaine, annee } = semaineIso(dateIso)
  return { semaine, annee }
}

export function memePosition(jalon, dateIso) {
  if (jalon.origine !== 'etude') return jalon.date === dateIso
  const { semaine, annee } = semaineIso(dateIso)
  return jalon.semaine === semaine && jalon.annee === annee
}

export function dateDuJalon(jalon, dateReference = null) {
  return jalon.origine === 'etude' ? dateEtude(jalon.semaine, jalon.annee, dateReference) : jalon.date
}

export function nomAffaireNotion(numero, references) {
  return (references ?? []).find((r) => r.numero === numero)?.reference ?? null
}
```

Et `src/shared/notion/codesAffaire.js`, sans aucun import : `gestionLogique.js` s'en sert aussi (Task 6), et `echeancesNotionLogique.js` importe déjà `gestionLogique.js` — passer par ce petit module évite un import circulaire.

```js
// ─── Codes d'affaire, côté Notion et côté app ────────────────────────────────
//
// Seuls les 4 chiffres relient une affaire de l'app à une carte Notion : les
// lettres diffèrent parfois d'un côté à l'autre. Aucun import : ce module est
// lu par la gestion d'agence comme par la synchronisation.

export const COULEUR_NOTION = '#6B7280'

// Une année de date (« 16/10/2026 ») n'est pas un numéro d'affaire
export function numeroAffaire(texte) {
  const m = /(?:^|[^\d/])(\d{4})(?![\d/])/.exec(String(texte ?? ''))
  return m ? m[1] : null
}

/** « 2699-ABC » ou « 2697 - Exemple Long » → « 2699 ABC », « 2697 Exemple ». */
export function codeCarte(code) {
  const t = String(code ?? '').trim()
  const m = /^(\d{4})[\s\-–]*(\S+)?/.exec(t)
  if (!m) return t
  return m[2] ? `${m[1]} ${m[2]}` : m[1]
}
```

- [ ] **Step 4 : lancer les tests**

Run : `node --import ./tests/resolve-src.mjs --test tests/echeances-notion.test.js`
Expected : PASS. Corriger le code (pas les tests) jusqu'au vert ; si un test révèle une attente fausse, le dire avant de le modifier.

- [ ] **Step 5 : commit**

```bash
git add src/shared/notion/codesAffaire.js src/shared/notion/echeancesNotionLogique.js tests/echeances-notion.test.js
git commit -m "feat: échéances Notion — lecture des cartes (numéro, dates, libellés) et réécriture d'une date"
```

---

### Task 3 : `planSynchro` (logique pure)

**Files :**
- Create : `src/shared/notion/synchroNotionLogique.js`
- Modify : `tests/echeances-notion.test.js` (ajout)

**Interfaces :**
- Consumes : Task 2 ; `periodeAffaire(phase)` de `src/affaire/phaseAffaire.js`.
- Produces : `planSynchro(entree) → plan`, `COULEUR_NOTION = '#6B7280'`.

```
entree = {
  cartes: [{ id, titre, creeLe, modifieLe }],            // lues dans Notion (portée)
  lectureComplete: boolean,
  registre: [ligne],                                     // lignes de notion_echeances
  jalons: [{ origine, id, affaire_id, label, date?, semaine?, annee?, ancre, modifie_le }],
  affaires: [{ id, code_affaire, phase }],
  references: [{ numero, reference }],
  numero: '2699' | null,                                 // portée d'un planning ; null = tout
  aujourdhui: 'YYYY-MM-DD',
  nouvelId: () => string,
}
plan = {
  jalons: [
    { action: 'creer', ligneId, origine, affaire_id, label, date? | semaine?, annee? },
    { action: 'deplacer', origine, id, date? | semaine?, annee?, decrocher: boolean },
    { action: 'renommer', origine, id, label },
    { action: 'supprimer', origine, id },
  ],
  cartes: [
    { action: 'creer', ligneId, titre, semaine },
    { action: 'modifier', pageId, titre, semaine },
    { action: 'corbeille', pageId },
  ],
  registre: { ecrire: [{ ligne, nouvelle: boolean }], supprimer: [id] },
}
```

Ordre d'application (Task 5) : `registre.supprimer`, puis `jalons` (les `creer` rendent l'id à reporter dans la ligne `ligneId`), puis `registre.ecrire`, puis `cartes` (les `creer` rendent le `page_id` à reporter dans la ligne `ligneId`).

- [ ] **Step 1 : ajouter les tests qui échouent** (à la fin de `tests/echeances-notion.test.js`)

```js
import { planSynchro } from '../src/shared/notion/synchroNotionLogique.js'

const AFF = [
  { id: 'a-etude', code_affaire: '2699-ABC', phase: 'apd' },
  { id: 'a-chantier', code_affaire: '2698-XYZ', phase: 'chantier' },
]
const REFS = [{ numero: '2697', reference: '2697 - QRS Exemple' }]
let compteur = 0
const base = (extra = {}) => ({
  cartes: [], lectureComplete: true, registre: [], jalons: [], affaires: AFF, references: REFS,
  numero: null, aujourdhui: '2026-10-12', nouvelId: () => `n${++compteur}`, ...extra,
})
const carte = (id, titre, modifieLe = '2026-10-10T10:00:00Z') => ({ id, titre, creeLe: '2026-10-01T08:00:00Z', modifieLe })
const ligne = (extra) => ({
  id: 'l1', page_id: 'p1', rang: 0, numero: '2698', reference: null, affaire_id: 'a-chantier', origine: 'chantier',
  jalon_id: 7, libelle: 'Rendu', libelle_app: 'Rendu', date_synchro: '2026-10-20', texte_carte: '', nb_dates: 1,
  notion_modifie_le: null, ...extra,
})
const jalonC = (extra) => ({ origine: 'chantier', id: 7, affaire_id: 'a-chantier', label: 'Rendu', date: '2026-10-20', ancre: false, modifie_le: '2026-10-01T00:00:00Z', ...extra })

test('synchro : carte nouvelle d’une affaire de l’app → échéance de son planning (étude à la semaine)', () => {
  const p = planSynchro(base({ cartes: [carte('p9', '2699 ABC : Rendu APD 14/10')] }))
  assert.equal(p.jalons.length, 1)
  assert.deepEqual({ ...p.jalons[0], ligneId: undefined }, { action: 'creer', ligneId: undefined, origine: 'etude', affaire_id: 'a-etude', label: 'Rendu APD', semaine: 42, annee: 2026 })
  const { ligne: l, nouvelle } = p.registre.ecrire[0]
  assert.equal(nouvelle, true)
  assert.equal(l.id, p.jalons[0].ligneId)
  assert.equal(l.date_synchro, '2026-10-14')
  assert.equal(l.page_id, 'p9')
  assert.deepEqual(p.cartes, [])
})

test('synchro : affaire absente de l’app → ligne seule, nommée d’après la base des affaires', () => {
  const p = planSynchro(base({ cartes: [carte('p8', '2697 QRS : Dépôt PC 16/10')] }))
  assert.deepEqual(p.jalons, [])
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.affaire_id, null)
  assert.equal(l.reference, '2697 - QRS Exemple')
  assert.equal(l.date_synchro, '2026-10-16')
})

test('synchro : échéance de l’app à venir, sans carte → carte créée au format de l’agence', () => {
  const p = planSynchro(base({ jalons: [jalonC({ label: 'OPR' })] }))
  assert.equal(p.cartes.length, 1)
  assert.equal(p.cartes[0].action, 'creer')
  assert.equal(p.cartes[0].titre, '2698 XYZ – OPR 20/10/26')
  assert.equal(p.cartes[0].semaine, '2026-10-20')
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.page_id, null)
  assert.equal(l.id, p.cartes[0].ligneId)
  assert.equal(l.jalon_id, 7)
})

test('synchro : échéance passée sans carte → rien', () => {
  const p = planSynchro(base({ jalons: [jalonC({ date: '2026-09-01' })] }))
  assert.deepEqual(p.cartes, [])
  assert.deepEqual(p.registre.ecrire, [])
})

test('synchro : même affaire, même date des deux côtés → reliées, rien de créé', () => {
  const p = planSynchro(base({ jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Réception 20/10/26')] }))
  assert.deepEqual(p.jalons, [])
  assert.deepEqual(p.cartes, [])
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.page_id, 'p1')
  assert.equal(l.jalon_id, 7)
  assert.equal(l.libelle, 'Réception')
  assert.equal(l.libelle_app, 'Rendu')
})

test('synchro : date changée dans Notion → l’échéance suit, décrochée si accrochée', () => {
  const p = planSynchro(base({
    registre: [ligne()], jalons: [jalonC({ ancre: true })], cartes: [carte('p1', '2698 XYZ : Rendu 23/10/26')],
  }))
  assert.deepEqual(p.jalons, [{ action: 'deplacer', origine: 'chantier', id: 7, date: '2026-10-23', decrocher: true }])
  assert.equal(p.registre.ecrire[0].ligne.date_synchro, '2026-10-23')
})

test('synchro : date changée dans l’app → la date est réécrite dans la carte', () => {
  const p = planSynchro(base({
    registre: [ligne({ libelle: 'Rendu suite' })], jalons: [jalonC({ date: '2026-10-27' })], cartes: [carte('p1', '!! 2698 XYZ : Rendu 20/10/26 suite')],
  }))
  assert.deepEqual(p.cartes, [{ action: 'modifier', pageId: 'p1', titre: '!! 2698 XYZ : Rendu 27/10/26 suite', semaine: '2026-10-27' }])
  assert.equal(p.registre.ecrire[0].ligne.date_synchro, '2026-10-27')
})

test('synchro : changée des deux côtés → la plus récente l’emporte', () => {
  const entree = (modifApp) => base({
    registre: [ligne()], jalons: [jalonC({ date: '2026-10-27', modifie_le: modifApp })],
    cartes: [carte('p1', '2698 XYZ : Rendu 23/10/26', '2026-10-11T10:00:00Z')],
  })
  assert.equal(planSynchro(entree('2026-10-11T12:00:00Z')).cartes[0]?.action, 'modifier')
  assert.equal(planSynchro(entree('2026-10-11T08:00:00Z')).jalons[0]?.action, 'deplacer')
})

test('synchro : carte à plusieurs dates → Notion fait foi, l’échéance est remise', () => {
  const p = planSynchro(base({
    registre: [ligne({ nb_dates: 2 }), ligne({ id: 'l2', rang: 1, jalon_id: 8, date_synchro: '2026-11-20', libelle: 'DCE', libelle_app: 'DCE' })],
    jalons: [jalonC({ date: '2026-10-27', modifie_le: '2026-10-12T00:00:00Z' }), jalonC({ id: 8, label: 'DCE', date: '2026-11-20' })],
    cartes: [carte('p1', '2698 XYZ - Rendu 20/10/26 - DCE 20/11/26')],
  }))
  assert.deepEqual(p.cartes, [])
  assert.deepEqual(p.jalons, [{ action: 'deplacer', origine: 'chantier', id: 7, date: '2026-10-20', decrocher: false }])
})

test('synchro : libellé changé dans Notion → l’échéance est renommée', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC()], cartes: [carte('p1', '2698 XYZ : Réception 20/10/26')] }))
  assert.deepEqual(p.jalons, [{ action: 'renommer', origine: 'chantier', id: 7, label: 'Réception' }])
})

test('synchro : libellé changé dans l’app → réécrit dans la carte', () => {
  const p = planSynchro(base({ registre: [ligne()], jalons: [jalonC({ label: 'Réception' })], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')] }))
  assert.equal(p.cartes[0].titre, '2698 XYZ : Réception 20/10/26')
})

test('synchro : carte disparue → échéance à venir supprimée, passée gardée ; lecture partielle → rien', () => {
  const futur = planSynchro(base({ registre: [ligne()], jalons: [jalonC()] }))
  assert.deepEqual(futur.jalons, [{ action: 'supprimer', origine: 'chantier', id: 7 }])
  assert.deepEqual(futur.registre.supprimer, ['l1'])
  const passe = planSynchro(base({ registre: [ligne({ date_synchro: '2026-09-01' })], jalons: [jalonC({ date: '2026-09-01' })] }))
  assert.deepEqual(passe.jalons, [])
  assert.deepEqual(passe.registre.supprimer, ['l1'])
  const partielle = planSynchro(base({ lectureComplete: false, registre: [ligne()], jalons: [jalonC()] }))
  assert.deepEqual(partielle.jalons, [])
  assert.deepEqual(partielle.registre.supprimer, [])
})

test('synchro : échéance supprimée dans l’app → carte à la corbeille', () => {
  const p = planSynchro(base({ registre: [ligne()], cartes: [carte('p1', '2698 XYZ : Rendu 20/10/26')] }))
  assert.deepEqual(p.cartes, [{ action: 'corbeille', pageId: 'p1' }])
  assert.deepEqual(p.registre.supprimer, ['l1'])
})

test('synchro : carte sans date lisible → ligne « à dater »', () => {
  const p = planSynchro(base({ cartes: [carte('p5', '2697 QRS : Rendu PC fin novembre')] }))
  const l = p.registre.ecrire[0].ligne
  assert.equal(l.date_synchro, null)
  assert.equal(l.nb_dates, 0)
  assert.equal(l.texte_carte, '2697 QRS : Rendu PC fin novembre')
})

test('synchro : étude déplacée d’une semaine dans l’app → la carte garde son jour', () => {
  const p = planSynchro(base({
    registre: [ligne({ numero: '2699', affaire_id: 'a-etude', origine: 'etude', date_synchro: '2026-10-14' })],
    jalons: [{ origine: 'etude', id: 7, affaire_id: 'a-etude', label: 'Rendu', semaine: 43, annee: 2026, ancre: false, modifie_le: '2026-10-12T00:00:00Z' }],
    cartes: [carte('p1', '2699 ABC : Rendu 14/10')],
  }))
  assert.equal(p.cartes[0].titre, '2699 ABC : Rendu 21/10')
})

test('synchro d’un planning : rien hors de son affaire', () => {
  const p = planSynchro(base({
    numero: '2699', lectureComplete: true,
    registre: [ligne()], jalons: [jalonC()], cartes: [carte('p7', '2697 QRS : Dépôt 16/10')],
  }))
  assert.deepEqual(p, { jalons: [], cartes: [], registre: { ecrire: [], supprimer: [] } })
})
```

- [ ] **Step 2 : lancer et voir échouer**

Run : `node --import ./tests/resolve-src.mjs --test tests/echeances-notion.test.js`
Expected : FAIL (module `synchroNotionLogique.js` introuvable).

- [ ] **Step 3 : écrire `src/shared/notion/synchroNotionLogique.js`**

```js
// ─── Échéances partagées avec Notion : la comparaison ────────────────────────
//
// On ne guette pas chaque geste : on compare Notion, le registre et les
// plannings, et on en déduit ce qu'il faut faire de chaque côté. Ainsi aucun
// chemin de modification n'est oublié (glissement, Décaler, ⌘Z…) et un envoi
// raté est rattrapé au passage suivant. `date_synchro` est la date sur
// laquelle les deux côtés étaient d'accord : celui qui s'en écarte a bougé.
// Règles : docs/superpowers/specs/2026-10-12-echeances-notion-design.md, §3.
// Rien n'est écrit ici (tests/echeances-notion.test.js).

import { periodeAffaire } from '../../affaire/phaseAffaire.js'
import {
  lireCarte, numeroAffaire, codeCarte, titreCarte, remplacerDate, remplacerLibelle,
  champsJalon, memePosition, dateDuJalon, nomAffaireNotion,
} from './echeancesNotionLogique.js'
import { COULEUR_NOTION } from './codesAffaire.js'

export { COULEUR_NOTION }

const cle = (origine, id) => `${origine}:${id}`

// Une date retrouvée dans la carte : même date d'abord, puis même rang (une
// date changée dans Notion garde sa place ; une date ajoutée au milieu ne
// décale pas les autres)
function apparier(dates, lignes) {
  const restantes = [...lignes]
  const paires = []
  const sansDate = []
  for (const d of dates) {
    const i = restantes.findIndex((l) => l.date_synchro === d.date)
    if (i >= 0) paires.push([d, restantes.splice(i, 1)[0]])
    else sansDate.push(d)
  }
  const nouvelles = []
  for (const d of sansDate) {
    const i = restantes.findIndex((l) => l.rang === d.rang)
    if (i >= 0) paires.push([d, restantes.splice(i, 1)[0]])
    else nouvelles.push(d)
  }
  return { paires, nouvelles, disparues: restantes }
}

const CHAMPS_COMPARES = ['page_id', 'rang', 'numero', 'reference', 'affaire_id', 'origine', 'jalon_id', 'libelle', 'libelle_app', 'date_synchro', 'texte_carte', 'nb_dates']

export function planSynchro({
  cartes = [], lectureComplete = false, registre = [], jalons = [], affaires = [], references = [],
  numero = null, aujourdhui, nouvelId,
}) {
  const plan = { jalons: [], cartes: [], registre: { ecrire: [], supprimer: [] } }
  const dansPortee = (n) => !numero || n === numero

  const affaireParId = new Map(affaires.map((a) => [a.id, a]))
  const affaireParNumero = new Map()
  for (const a of affaires) {
    const n = numeroAffaire(a.code_affaire)
    if (n && !affaireParNumero.has(n)) affaireParNumero.set(n, a)
  }
  const jalonParCle = new Map(jalons.map((j) => [cle(j.origine, j.id), j]))
  const lignes = registre.filter((l) => dansPortee(l.numero))
  const parPage = new Map()
  for (const l of lignes) {
    if (!l.page_id) continue
    if (!parPage.has(l.page_id)) parPage.set(l.page_id, [])
    parPage.get(l.page_id).push(l)
  }
  const referenceDe = (n, titre) => nomAffaireNotion(n, references) ?? codeCarte(String(titre ?? '').replace(/^[\s!?]+/, ''))

  const ecrire = (ligne, avant = null) => {
    if (avant && CHAMPS_COMPARES.every((c) => (avant[c] ?? null) === (ligne[c] ?? null))) return
    plan.registre.ecrire.push({ ligne, nouvelle: !avant })
  }
  // Une date retirée de Notion : l'échéance à venir disparaît, une passée
  // reste (un ménage dans Notion n'efface pas l'historique des plannings)
  const retirer = (l) => {
    plan.registre.supprimer.push(l.id)
    const j = l.jalon_id != null ? jalonParCle.get(cle(l.origine, l.jalon_id)) : null
    if (j && l.date_synchro && l.date_synchro >= aujourdhui) plan.jalons.push({ action: 'supprimer', origine: j.origine, id: j.id })
  }

  const notionLibres = []
  const pagesVues = new Set()
  const jalonsLies = new Set()

  for (const carte of cartes) {
    const lue = lireCarte(carte.titre, carte.creeLe)
    if (!lue.numero || !dansPortee(lue.numero)) continue
    pagesVues.add(carte.id)
    const existantes = parPage.get(carte.id) ?? []
    const aDaterAvant = existantes.find((l) => !l.date_synchro)
    const actives = existantes.filter((l) => l.date_synchro)
    const affaire = affaireParNumero.get(lue.numero) ?? null
    const commun = {
      page_id: carte.id, numero: lue.numero, reference: referenceDe(lue.numero, carte.titre),
      texte_carte: carte.titre, notion_modifie_le: carte.modifieLe ?? null,
    }

    if (lue.aDater) {
      actives.forEach(retirer)
      ecrire({
        ...(aDaterAvant ?? { id: nouvelId() }), ...commun, rang: 0, affaire_id: affaire?.id ?? null,
        origine: null, jalon_id: null, libelle: null, libelle_app: null, date_synchro: null, nb_dates: 0,
      }, aDaterAvant ?? null)
      continue
    }
    if (aDaterAvant) plan.registre.supprimer.push(aDaterAvant.id)

    const { paires, nouvelles, disparues } = apparier(lue.dates, actives)
    disparues.forEach(retirer)
    const plusieurs = lue.dates.length > 1

    for (const [d, l] of paires) {
      const ligneCarte = { ...l, ...commun, rang: d.rang, nb_dates: lue.dates.length }
      const j = l.jalon_id != null ? jalonParCle.get(cle(l.origine, l.jalon_id)) : null
      if (j) jalonsLies.add(cle(j.origine, j.id))

      if (!j) {
        // Supprimée dans l'app : la carte part à la corbeille — sauf une
        // carte à plusieurs dates, où Notion fait foi
        if (l.jalon_id != null && affaire && !plusieurs) {
          plan.cartes.push({ action: 'corbeille', pageId: carte.id })
          plan.registre.supprimer.push(l.id)
          continue
        }
        if (affaire) {
          const origine = periodeAffaire(affaire.phase)
          plan.jalons.push({ action: 'creer', ligneId: l.id, origine, affaire_id: affaire.id, label: d.libelle, ...champsJalon(origine, d.date) })
          ecrire({ ...ligneCarte, affaire_id: affaire.id, origine, jalon_id: null, libelle: d.libelle, libelle_app: d.libelle, date_synchro: d.date }, l)
          continue
        }
        ecrire({ ...ligneCarte, affaire_id: null, origine: null, jalon_id: null, libelle: d.libelle, libelle_app: null, date_synchro: d.date }, l)
        continue
      }

      const notionBouge = d.date !== l.date_synchro
      const appBouge = !memePosition(j, l.date_synchro)
      const libelleNotionBouge = d.libelle !== l.libelle
      const libelleAppBouge = j.label !== l.libelle_app
      const notionChange = notionBouge || libelleNotionBouge
      const appChange = appBouge || libelleAppBouge
      const notionPlusRecent = !j.modifie_le || (carte.modifieLe ?? '') >= j.modifie_le
      const notionGagne = plusieurs || !appChange || (notionChange && notionPlusRecent)

      if (notionGagne) {
        if (!memePosition(j, d.date)) plan.jalons.push({ action: 'deplacer', origine: j.origine, id: j.id, ...champsJalon(j.origine, d.date), decrocher: !!j.ancre })
        // Le libellé de Notion ne remplace celui de l'app que s'il a changé
        const label = libelleNotionBouge ? d.libelle : j.label
        if (label !== j.label) plan.jalons.push({ action: 'renommer', origine: j.origine, id: j.id, label })
        ecrire({ ...ligneCarte, libelle: d.libelle, libelle_app: label, date_synchro: d.date }, l)
        continue
      }

      const nouvelleDate = dateDuJalon(j, l.date_synchro)
      let titre = nouvelleDate !== d.date ? remplacerDate(carte.titre, d, nouvelleDate) : carte.titre
      let libelle = d.libelle
      if (libelleAppBouge) {
        titre = remplacerLibelle(titre, d.libelle, j.label)
          ?? titreCarte({ code: affaire?.code_affaire ?? l.reference ?? lue.numero, libelle: j.label, date: nouvelleDate })
        libelle = j.label
      }
      if (titre !== carte.titre) plan.cartes.push({ action: 'modifier', pageId: carte.id, titre, semaine: nouvelleDate })
      ecrire({ ...ligneCarte, texte_carte: titre, libelle, libelle_app: j.label, date_synchro: nouvelleDate }, l)
    }

    for (const d of nouvelles) notionLibres.push({ carte, lue, d, commun, affaire })
  }

  // Cartes disparues (corbeille, archivées, sorties de la colonne) : seulement
  // si toute la colonne a été lue, sinon une lecture coupée effacerait tout
  if (lectureComplete) {
    for (const [pageId, ls] of parPage) {
      if (pagesVues.has(pageId)) continue
      for (const l of ls) (l.date_synchro ? retirer(l) : plan.registre.supprimer.push(l.id))
    }
  }

  // Échéances de l'app sans carte : d'abord une date de carte libre de même
  // affaire et même jour (même semaine à l'étude), sinon une carte à créer
  const enAttente = new Map(lignes.filter((l) => !l.page_id && l.jalon_id != null).map((l) => [cle(l.origine, l.jalon_id), l]))
  for (const j of jalons) {
    const k = cle(j.origine, j.id)
    if (jalonsLies.has(k)) continue
    const lieeAilleurs = lignes.some((l) => l.page_id && l.jalon_id === j.id && l.origine === j.origine)
    if (lieeAilleurs) continue
    const affaire = affaireParId.get(j.affaire_id)
    const n = numeroAffaire(affaire?.code_affaire)
    if (!n || !dansPortee(n)) continue
    const attente = enAttente.get(k) ?? null
    const i = notionLibres.findIndex((x) => x.lue.numero === n && memePosition(j, x.d.date))
    if (i >= 0) {
      const { lue, d, commun } = notionLibres.splice(i, 1)[0]
      ecrire({
        ...(attente ?? { id: nouvelId() }), ...commun, rang: d.rang, nb_dates: lue.dates.length, affaire_id: affaire.id,
        origine: j.origine, jalon_id: j.id, libelle: d.libelle, libelle_app: j.label, date_synchro: d.date,
      }, attente)
      continue
    }
    const date = dateDuJalon(j, null)
    if (date < aujourdhui) {
      if (attente) plan.registre.supprimer.push(attente.id)
      continue
    }
    const titre = titreCarte({ code: affaire.code_affaire, libelle: j.label, date })
    const nouvelle = {
      ...(attente ?? { id: nouvelId() }), page_id: null, rang: 0, numero: n, reference: null, affaire_id: affaire.id,
      origine: j.origine, jalon_id: j.id, libelle: j.label, libelle_app: j.label, date_synchro: date,
      texte_carte: titre, nb_dates: 1, notion_modifie_le: null,
    }
    ecrire(nouvelle, attente)
    plan.cartes.push({ action: 'creer', ligneId: nouvelle.id, titre, semaine: date })
  }

  // Dates de cartes restées libres : une échéance du planning si l'affaire
  // est dans l'app, sinon une ligne seule (affaire absente de l'app)
  for (const { lue, d, commun, affaire } of notionLibres) {
    const id = nouvelId()
    const ligneCarte = { id, ...commun, rang: d.rang, nb_dates: lue.dates.length, libelle: d.libelle, date_synchro: d.date }
    if (affaire) {
      const origine = periodeAffaire(affaire.phase)
      plan.jalons.push({ action: 'creer', ligneId: id, origine, affaire_id: affaire.id, label: d.libelle, ...champsJalon(origine, d.date) })
      ecrire({ ...ligneCarte, affaire_id: affaire.id, origine, jalon_id: null, libelle_app: d.libelle })
    } else {
      ecrire({ ...ligneCarte, affaire_id: null, origine: null, jalon_id: null, libelle_app: null })
    }
  }

  return plan
}
```

- [ ] **Step 4 : lancer les tests**

Run : `node --import ./tests/resolve-src.mjs --test tests/echeances-notion.test.js`
Expected : PASS. Ordre des clés dans `deepEqual` : seul le contenu compte. En cas d'échec, corriger le code ; ne modifier un test qu'en expliquant pourquoi son attente était fausse.

- [ ] **Step 5 : commit**

```bash
git add src/shared/notion/synchroNotionLogique.js tests/echeances-notion.test.js
git commit -m "feat: échéances Notion — comparaison des deux côtés (planSynchro)"
```

---

### Task 4 : passeur Notion (`api/notion.js`)

**Files :**
- Create : `src/shared/notion/notionApiLogique.js`
- Create : `api/_agence.js`
- Create : `api/notion.js`
- Modify : `api/transcrire.js` (retirer `verifierAgence`, l'importer)
- Modify : `tests/echeances-notion.test.js` (ajout)

**Interfaces :**
- Produces (HTTP) : `POST /api/notion`, en-tête `Authorization: Bearer <jeton Supabase>`, corps JSON :
  - `{ action: 'lire', numero?: '2699' }` → `200 { cartes: [{ id, titre, creeLe, modifieLe }], references: [{ numero, reference }], complete: boolean }`
  - `{ action: 'ecrire', operations: [{ action: 'creer', titre, semaine } | { action: 'modifier', pageId, titre, semaine } | { action: 'corbeille', pageId }] }` (10 au plus) → `200 { resultats: [{ ok: true, id, modifieLe } | { ok: false, erreur }] }`
  - erreurs : `401 { erreur: 'session' }`, `403 { erreur: 'agence-seule' }`, `503 { erreur: 'notion-non-configure' }`, `502 { erreur: 'notion', statut, detail }`, `400 { erreur: 'requete' }`.
- Produces (pur) : `filtreEcheances(numero)`, `carteDepuisPage(page)`, `referenceDepuisPage(page)`, `proprietesCarte({ titre, semaine })`, `PROPRIETES`.

- [ ] **Step 1 : tests de la forme des requêtes** (ajout à `tests/echeances-notion.test.js`)

```js
import { filtreEcheances, carteDepuisPage, referenceDepuisPage, proprietesCarte } from '../src/shared/notion/notionApiLogique.js'

test('API Notion : filtre de la colonne, avec ou sans numéro', () => {
  assert.deepEqual(filtreEcheances(null), { property: 'Jour', multi_select: { contains: 'ECHEANCES RENDUS' } })
  assert.deepEqual(filtreEcheances('2699'), { and: [
    { property: 'Jour', multi_select: { contains: 'ECHEANCES RENDUS' } },
    { property: 'N° Affaire', title: { contains: '2699' } },
  ] })
})

test('API Notion : page lue en carte, en référence ; carte écrite', () => {
  const page = {
    id: 'p1', created_time: '2026-10-01T08:00:00.000Z', last_edited_time: '2026-10-02T08:00:00.000Z',
    properties: { 'N° Affaire': { type: 'title', title: [{ plain_text: '2699 ABC : ' }, { plain_text: 'Rendu 16/10' }] } },
  }
  assert.deepEqual(carteDepuisPage(page), { id: 'p1', titre: '2699 ABC : Rendu 16/10', creeLe: '2026-10-01T08:00:00.000Z', modifieLe: '2026-10-02T08:00:00.000Z' })
  assert.deepEqual(referenceDepuisPage({ properties: { 'Référence': { title: [{ plain_text: '2697 - QRS' }] } } }), { numero: '2697', reference: '2697 - QRS' })
  assert.deepEqual(proprietesCarte({ titre: 'T', semaine: '2026-10-16' }), {
    'N° Affaire': { title: [{ type: 'text', text: { content: 'T' } }] },
    Semaine: { date: { start: '2026-10-16' } },
  })
})
```

- [ ] **Step 2 : lancer, voir échouer** — `node --import ./tests/resolve-src.mjs --test tests/echeances-notion.test.js` → FAIL (module introuvable).

- [ ] **Step 3 : écrire `src/shared/notion/notionApiLogique.js`**

```js
// ─── Forme des échanges avec l'API Notion ────────────────────────────────────
//
// Partagé par le passeur (api/notion.js) et les tests. Les noms des colonnes
// sont ceux du Planning hebdomadaire et de la base des affaires de l'agence :
// la structure de Notion ne change pas, l'app s'y adapte.

import { COLONNE_ECHEANCES, numeroAffaire } from './echeancesNotionLogique.js'

export const PROPRIETES = { titre: 'N° Affaire', jour: 'Jour', semaine: 'Semaine', reference: 'Référence' }

const colonne = { property: PROPRIETES.jour, multi_select: { contains: COLONNE_ECHEANCES } }

export function filtreEcheances(numero) {
  if (!numero) return colonne
  return { and: [colonne, { property: PROPRIETES.titre, title: { contains: numero } }] }
}

const texteTitre = (prop) => (prop?.title ?? []).map((t) => t.plain_text ?? '').join('')

export function carteDepuisPage(page) {
  return { id: page.id, titre: texteTitre(page.properties?.[PROPRIETES.titre]), creeLe: page.created_time, modifieLe: page.last_edited_time }
}

export function referenceDepuisPage(page) {
  const reference = texteTitre(page.properties?.[PROPRIETES.reference]).trim()
  return { numero: numeroAffaire(reference), reference }
}

/** Titre et Semaine ; la colonne Jour ne s'écrit qu'à la création. */
export function proprietesCarte({ titre, semaine }) {
  return {
    [PROPRIETES.titre]: { title: [{ type: 'text', text: { content: titre } }] },
    [PROPRIETES.semaine]: { date: semaine ? { start: semaine } : null },
  }
}

export const proprietesNouvelleCarte = (valeurs) => ({
  ...proprietesCarte(valeurs),
  [PROPRIETES.jour]: { multi_select: [{ name: COLONNE_ECHEANCES }] },
})
```

- [ ] **Step 4 : `api/_agence.js`** (un fichier commençant par `_` n'est pas une fonction Vercel)

```js
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
```

Dans `api/transcrire.js` : supprimer la fonction locale `verifierAgence` et ajouter `import { verifierAgence } from './_agence.js'` en tête.

- [ ] **Step 5 : `api/notion.js`**

```js
/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Passeur vers Notion : échéances partagées ───────────────────────────────
//
// Seul détenteur du jeton Notion (variable Vercel NOTION_TOKEN) ; les
// identifiants des deux sources (Planning hebdomadaire, base des affaires)
// sont aussi des variables : le dépôt est public. Réservé à l'agence. Il ne
// décide de rien : l'app calcule (synchroNotionLogique.js) et lui demande de
// lire ou d'écrire. Conception : docs/superpowers/specs/2026-10-12-echeances-notion-design.md.

import { verifierAgence, jetonDe } from './_agence.js'
import {
  filtreEcheances, carteDepuisPage, referenceDepuisPage, proprietesCarte, proprietesNouvelleCarte,
} from '../src/shared/notion/notionApiLogique.js'

const NOTION = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const PAGES_MAX = 20            // 2 000 cartes : au-delà, la lecture est déclarée incomplète
const OPERATIONS_MAX = 10
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function appelNotion(jeton, chemin, { methode = 'GET', corps } = {}) {
  const envoyer = () => fetch(`${NOTION}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  let reponse = await envoyer()
  // Notion admet 3 requêtes par seconde : on attend ce qu'il demande, une fois
  if (reponse.status === 429) {
    await pause(Math.min(5000, 1000 * Number(reponse.headers.get('retry-after') ?? 1)))
    reponse = await envoyer()
  }
  return reponse
}

async function toutLire(jeton, source, filtre) {
  const pages = []
  let curseur
  for (let i = 0; i < PAGES_MAX; i++) {
    const r = await appelNotion(jeton, `/data_sources/${source}/query`, {
      methode: 'POST', corps: { page_size: 100, ...(filtre ? { filter: filtre } : {}), ...(curseur ? { start_cursor: curseur } : {}) },
    })
    if (!r.ok) throw Object.assign(new Error('notion'), { statut: r.status, detail: (await r.text().catch(() => '')).slice(0, 300) })
    const json = await r.json()
    pages.push(...(json.results ?? []))
    if (!json.has_more) return { pages, complete: true }
    curseur = json.next_cursor
  }
  return { pages, complete: false }
}

async function executer(jeton, source, op) {
  let r
  if (op.action === 'creer') {
    r = await appelNotion(jeton, '/pages', { methode: 'POST', corps: { parent: { type: 'data_source_id', data_source_id: source }, properties: proprietesNouvelleCarte(op) } })
  } else if (op.action === 'modifier') {
    r = await appelNotion(jeton, `/pages/${op.pageId}`, { methode: 'PATCH', corps: { properties: proprietesCarte(op) } })
  } else if (op.action === 'corbeille') {
    r = await appelNotion(jeton, `/pages/${op.pageId}`, { methode: 'PATCH', corps: { in_trash: true } })
    // Déjà partie : le but est atteint
    if (r.status === 404) return { ok: true, id: op.pageId, modifieLe: null }
  } else {
    return { ok: false, erreur: 'action' }
  }
  if (!r.ok) return { ok: false, erreur: `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}` }
  const page = await r.json()
  return { ok: true, id: page.id, modifieLe: page.last_edited_time ?? null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return }
  const url = process.env.VITE_SUPABASE_URL
  const cleSupabase = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cleSupabase) { res.status(500).json({ erreur: 'supabase-non-configure' }); return }
  const acces = await verifierAgence(url, cleSupabase, jetonDe(req))
  if (acces !== 200) { res.status(acces).json({ erreur: acces === 401 ? 'session' : 'agence-seule' }); return }

  const jeton = process.env.NOTION_TOKEN
  const planning = process.env.NOTION_PLANNING_SOURCE
  const atelier = process.env.NOTION_ATELIER_SOURCE
  if (!jeton || !planning || !atelier) { res.status(503).json({ erreur: 'notion-non-configure' }); return }

  const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  try {
    if (corps.action === 'lire') {
      const numero = /^\d{4}$/.test(corps.numero ?? '') ? corps.numero : null
      const [cartes, affaires] = await Promise.all([toutLire(jeton, planning, filtreEcheances(numero)), toutLire(jeton, atelier, null)])
      res.status(200).json({
        cartes: cartes.pages.filter((p) => !p.in_trash && !p.archived).map(carteDepuisPage),
        references: affaires.pages.map(referenceDepuisPage).filter((r) => r.numero),
        complete: cartes.complete,
      })
      return
    }
    if (corps.action === 'ecrire' && Array.isArray(corps.operations) && corps.operations.length <= OPERATIONS_MAX) {
      const resultats = []
      for (const op of corps.operations) {
        resultats.push(await executer(jeton, planning, op))
        await pause(350)
      }
      res.status(200).json({ resultats })
      return
    }
    res.status(400).json({ erreur: 'requete' })
  } catch (e) {
    res.status(502).json({ erreur: 'notion', statut: e?.statut ?? null, detail: e?.detail ?? String(e?.message ?? e).slice(0, 300) })
  }
}
```

- [ ] **Step 6 : vérifier** — `npm test` (tout vert), `npm run build` (passe), `npx eslint api src/shared/notion` (aucun nouveau problème).

- [ ] **Step 7 : commit**

```bash
git add src/shared/notion/notionApiLogique.js api/_agence.js api/notion.js api/transcrire.js tests/echeances-notion.test.js
git commit -m "feat: échéances Notion — passeur serveur (lecture de la colonne, écriture des cartes)"
```

---

### Task 5 : données et orchestrateur (`echeancesNotion.js`)

**Files :**
- Create : `src/shared/notion/echeancesNotion.js`

**Interfaces :**
- Consumes : Tasks 2–4 ; `supabase` (`src/core/supabase/client.js`) ; `estAncre` (`src/shared/planning/ancrage.js`) ; `CHAMPS_DETACHE` (`src/modules/chantier/planning/jalonsAncres.js`), `CHAMPS_DETACHE_ETUDE` (`src/modules/etude/planning/jalonsAncresEtude.js`).
- Produces :
  - `lireRegistre({ numero? }) → Promise<ligne[] | null>` (null = migration 071 absente)
  - `synchroniser({ affaireId? }) → Promise<{ etat: 'ok' | 'hors-ligne' | 'indisponible' | 'injoignable', lectureLe?, changementsApp?, erreurs? }>`
  - `creerEcheanceNotionSeule({ numero, reference, libelle, date }) → Promise<void>`
  - `modifierEcheanceNotionSeule(ligne, { libelle, date }) → Promise<void>`
  - `supprimerEcheanceNotionSeule(ligne) → Promise<void>`
  - `lienCarte(pageId) → 'https://www.notion.so/<id sans tirets>'`

- [ ] **Step 1 : écrire le fichier**

```js
// ─── Échéances partagées avec Notion : lectures, écritures, orchestration ────
//
// `synchroniser` lit Notion par le passeur (api/notion.js), lit le registre et
// les échéances, calcule le plan (synchroNotionLogique.js) puis l'applique :
// registre retiré, échéances, registre écrit, cartes. Une seule
// synchronisation à la fois sur l'appareil (Web Locks). Sans réseau, sans la
// migration 071 ou sans Notion, rien ne part et rien ne crie : le passage
// suivant rattrape (conception, §5.4).

import { supabase } from '../../core/supabase/client'
import { estAncre } from '../planning/ancrage'
import { CHAMPS_DETACHE } from '../../modules/chantier/planning/jalonsAncres'
import { CHAMPS_DETACHE_ETUDE } from '../../modules/etude/planning/jalonsAncresEtude'
import { titreCarte, lireCarte, remplacerDate, remplacerLibelle } from './echeancesNotionLogique'
import { numeroAffaire, codeCarte, COULEUR_NOTION } from './codesAffaire'
import { planSynchro } from './synchroNotionLogique'

const TABLE = { etude: 'planning_etude_jalons', chantier: 'planning_jalons' }
const DETACHE = { etude: CHAMPS_DETACHE_ETUDE, chantier: CHAMPS_DETACHE }
const absente = (error) => error?.code === 'PGRST205' || error?.code === '42P01'
const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const lienCarte = (pageId) => `https://www.notion.so/${String(pageId).replace(/-/g, '')}`

async function appelerNotion(corps) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Object.assign(new Error('Pas de réseau'), { code: 'hors-ligne' })
  const { data } = await supabase.auth.getSession()
  const reponse = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token ?? ''}` },
    body: JSON.stringify(corps),
  })
  const json = await reponse.json().catch(() => ({}))
  if (!reponse.ok) throw Object.assign(new Error(json.erreur ?? `HTTP ${reponse.status}`), { code: json.erreur ?? 'notion' })
  return json
}

export async function lireRegistre({ numero = null } = {}) {
  let requete = supabase.from('notion_echeances').select('*')
  if (numero) requete = requete.eq('numero', numero)
  const { data, error } = await requete
  if (absente(error)) return null
  if (error) throw error
  return data ?? []
}

async function ecrireCartes(operations) {
  const resultats = []
  for (let i = 0; i < operations.length; i += 10) {
    const { resultats: r } = await appelerNotion({ action: 'ecrire', operations: operations.slice(i, i + 10) })
    resultats.push(...r)
  }
  return resultats
}

let chaine = Promise.resolve()
function avecVerrou(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('jga-notion', action)
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

async function appliquer(plan) {
  const erreurs = []
  let changementsApp = 0
  if (plan.registre.supprimer.length) {
    const { error } = await supabase.from('notion_echeances').delete().in('id', plan.registre.supprimer)
    if (error) erreurs.push(error.message)
  }

  const jalonCree = new Map()   // ligneId → id de l'échéance créée
  for (const op of plan.jalons) {
    const table = TABLE[op.origine]
    let reponse
    if (op.action === 'creer') {
      const champs = { affaire_id: op.affaire_id, label: op.label, couleur: COULEUR_NOTION, ordre: 0 }
      if (op.origine === 'etude') Object.assign(champs, { semaine: op.semaine, annee: op.annee })
      else champs.date = op.date
      reponse = await supabase.from(table).insert(champs).select('id').single()
      if (!reponse.error) jalonCree.set(op.ligneId, reponse.data.id)
    } else if (op.action === 'deplacer') {
      const champs = op.origine === 'etude' ? { semaine: op.semaine, annee: op.annee } : { date: op.date }
      reponse = await supabase.from(table).update({ ...champs, ...(op.decrocher ? DETACHE[op.origine] : {}) }).eq('id', op.id)
    } else if (op.action === 'renommer') {
      reponse = await supabase.from(table).update({ label: op.label }).eq('id', op.id)
    } else {
      reponse = await supabase.from(table).delete().eq('id', op.id)
    }
    if (reponse.error) erreurs.push(reponse.error.message)
    else changementsApp++
  }

  const echecsCreation = new Set(plan.jalons.filter((o) => o.action === 'creer' && !jalonCree.has(o.ligneId)).map((o) => o.ligneId))
  const reservees = new Set()
  const existantes = []
  for (const { ligne, nouvelle } of plan.registre.ecrire) {
    // Échéance pas créée : la ligne attend le passage suivant
    if (echecsCreation.has(ligne.id)) continue
    const l = jalonCree.has(ligne.id) ? { ...ligne, jalon_id: jalonCree.get(ligne.id) } : ligne
    if (!nouvelle) { existantes.push(l); continue }
    const { error } = await supabase.from('notion_echeances').insert(l)
    // 23505 : un autre appareil a déjà réservé cette échéance ; il crée la carte
    if (error && error.code !== '23505') erreurs.push(error.message)
    if (!error) reservees.add(l.id)
  }
  if (existantes.length) {
    const { error } = await supabase.from('notion_echeances').upsert(existantes, { onConflict: 'id' })
    if (error) erreurs.push(error.message)
    else existantes.forEach((l) => reservees.add(l.id))
  }

  const cartes = plan.cartes.filter((c) => c.action !== 'creer' || reservees.has(c.ligneId))
  if (cartes.length) {
    const resultats = await ecrireCartes(cartes)
    for (let i = 0; i < cartes.length; i++) {
      const c = cartes[i]
      const r = resultats[i]
      if (!r?.ok) { erreurs.push(r?.erreur ?? 'carte'); continue }
      if (c.action === 'creer') {
        const { error } = await supabase.from('notion_echeances').update({ page_id: r.id, notion_modifie_le: r.modifieLe }).eq('id', c.ligneId)
        if (error) erreurs.push(error.message)
      }
    }
  }
  return { erreurs, changementsApp }
}

/** Compare Notion et l'app, pour toute l'agence ou une affaire, et met les deux d'accord. */
export function synchroniser({ affaireId = null } = {}) {
  return avecVerrou(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { etat: 'hors-ligne' }
    let requeteAffaires = supabase.from('affaires').select('id, code_affaire, phase')
    if (affaireId) requeteAffaires = requeteAffaires.eq('id', affaireId)
    const { data: affaires, error: errAffaires } = await requeteAffaires
    if (errAffaires) return { etat: 'injoignable', erreurs: [errAffaires.message] }
    const numero = affaireId ? numeroAffaire(affaires?.[0]?.code_affaire) : null
    if (affaireId && !numero) return { etat: 'ok', lectureLe: new Date().toISOString(), changementsApp: 0, erreurs: [] }

    const registre = await lireRegistre({ numero })
    if (registre === null) return { etat: 'indisponible' }

    let notion
    try { notion = await appelerNotion({ action: 'lire', numero }) } catch (e) {
      return { etat: e.code === 'hors-ligne' ? 'hors-ligne' : 'injoignable', erreurs: [e.message] }
    }

    const lire = (table) => {
      let q = supabase.from(table).select('*')
      if (affaireId) q = q.eq('affaire_id', affaireId)
      return q
    }
    const [chantier, etude] = await Promise.all([lire('planning_jalons'), lire('planning_etude_jalons')])
    if (chantier.error || etude.error) return { etat: 'injoignable', erreurs: [(chantier.error ?? etude.error).message] }
    const jalons = [
      ...(chantier.data ?? []).filter((j) => j.date).map((j) => ({ ...j, origine: 'chantier', ancre: estAncre(j) })),
      ...(etude.data ?? []).filter((j) => j.semaine && j.annee).map((j) => ({ ...j, origine: 'etude', ancre: estAncre(j) })),
    ]

    const plan = planSynchro({
      cartes: notion.cartes, lectureComplete: notion.complete, registre, jalons, affaires: affaires ?? [],
      references: notion.references, numero, aujourdhui: aujourdhui(), nouvelId: () => crypto.randomUUID(),
    })
    try {
      const { erreurs, changementsApp } = await appliquer(plan)
      return { etat: 'ok', lectureLe: new Date().toISOString(), changementsApp, erreurs, references: notion.references }
    } catch (e) {
      return { etat: e.code === 'hors-ligne' ? 'hors-ligne' : 'injoignable', erreurs: [e.message] }
    }
  })
}

// ─── Affaires absentes de l'app (calendrier des rendus) ──────────────────────
//
// Leur échéance n'existe que dans une carte et une ligne du registre.

export async function creerEcheanceNotionSeule({ numero, reference, libelle, date }) {
  const titre = titreCarte({ code: reference || numero, libelle, date })
  const [r] = await ecrireCartes([{ action: 'creer', titre, semaine: date }])
  if (!r?.ok) throw new Error(r?.erreur ?? 'Notion n’a pas créé la carte')
  const { error } = await supabase.from('notion_echeances').insert({
    id: crypto.randomUUID(), page_id: r.id, rang: 0, numero, reference, affaire_id: null, origine: null, jalon_id: null,
    libelle, libelle_app: null, date_synchro: date, texte_carte: titre, nb_dates: 1, notion_modifie_le: r.modifieLe,
  })
  if (error) throw error
}

export async function modifierEcheanceNotionSeule(ligne, { libelle, date }) {
  const lue = lireCarte(ligne.texte_carte, ligne.created_at)
  const d = lue.dates.find((x) => x.rang === ligne.rang) ?? lue.dates[0]
  let titre = d && date !== ligne.date_synchro ? remplacerDate(ligne.texte_carte, d, date) : ligne.texte_carte
  if (libelle !== ligne.libelle) titre = remplacerLibelle(titre, ligne.libelle, libelle) ?? titreCarte({ code: codeCarte(ligne.reference || ligne.numero), libelle, date })
  const [r] = await ecrireCartes([{ action: 'modifier', pageId: ligne.page_id, titre, semaine: date }])
  if (!r?.ok) throw new Error(r?.erreur ?? 'Notion n’a pas modifié la carte')
  const { error } = await supabase.from('notion_echeances').update({ libelle, date_synchro: date, texte_carte: titre, notion_modifie_le: r.modifieLe }).eq('id', ligne.id)
  if (error) throw error
}

export async function supprimerEcheanceNotionSeule(ligne) {
  const [r] = await ecrireCartes([{ action: 'corbeille', pageId: ligne.page_id }])
  if (!r?.ok) throw new Error(r?.erreur ?? 'Notion n’a pas retiré la carte')
  const { error } = await supabase.from('notion_echeances').delete().eq('id', ligne.id)
  if (error) throw error
}
```

Remarque : `created_at` de la ligne sert de référence d'année pour relire une carte sans année ; c'est la date de la première lecture, proche de la création de la carte.

- [ ] **Step 2 : vérifier** — `npm run build` passe ; `npx eslint src/shared/notion` sans nouveau problème ; `npm test` vert.

- [ ] **Step 3 : commit**

```bash
git add src/shared/notion/echeancesNotion.js
git commit -m "feat: échéances Notion — orchestrateur de synchronisation et échéances des affaires absentes de l'app"
```

---

### Task 6 : calendrier des rendus

**Files :**
- Modify : `src/gestion/gestionLogique.js` (ajout de 4 fonctions)
- Modify : `tests/gestion.test.js` (ajout)
- Modify : `src/gestion/gestionDonnees.js` (`chargerCalendrier` lit le registre)
- Create : `src/shared/notion/MarqueNotion.jsx`
- Modify : `src/gestion/CalendrierRendus.jsx`, `src/gestion/ModaleJalon.jsx`

**Interfaces :**
- Consumes : Task 5 (`synchroniser`, `lireRegistre`, `creerEcheanceNotionSeule`, `modifierEcheanceNotionSeule`, `supprimerEcheanceNotionSeule`, `lienCarte`), Task 2 (`codeCarte`, `numeroAffaire`), `COULEUR_NOTION`.
- Produces (pur, `gestionLogique.js`) :
  - `marquerNotion(evenements, registre) → evenements` (ajoute `notion: { ligne, nbDates, pageId }` aux échéances liées)
  - `rendusNotion(registre, affaires) → evenements` (échéances des affaires absentes de l'app : `origine: 'notion'`, `affaire: { id: 'notion-<numero>', code_affaire, nom, horsApp: true }`)
  - `aDater(registre) → [{ id, texte, pageId, reference }]`
  - `affairesNotionSeules(references, affaires) → [{ id: 'notion-<numero>', code_affaire, nom, horsApp: true, numero, reference }]`

- [ ] **Step 1 : tests** (ajout à `tests/gestion.test.js`, importer les 4 fonctions)

```js
test('Notion : échéances liées marquées, affaires absentes de l’app en plus, cartes à dater', () => {
  const registre = [
    { id: 'r1', origine: 'chantier', jalon_id: 1, affaire_id: 'a2', page_id: 'p1', nb_dates: 2, date_synchro: '2026-10-20', numero: '2606' },
    { id: 'r2', origine: null, jalon_id: null, affaire_id: null, page_id: 'p2', nb_dates: 1, date_synchro: '2026-10-22', numero: '2697', reference: '2697 - QRS', libelle: 'Dépôt PC' },
    { id: 'r3', origine: null, jalon_id: null, affaire_id: null, page_id: 'p3', nb_dates: 0, date_synchro: null, numero: '2697', reference: '2697 - QRS', texte_carte: '2697 QRS fin novembre' },
  ]
  const ev = marquerNotion(rendus([{ id: 1, affaire_id: 'a2', label: 'OPR', date: '2026-10-20' }], [], affaires), registre)
  assert.equal(ev[0].notion.nbDates, 2)
  assert.equal(ev[0].notion.pageId, 'p1')
  const seules = rendusNotion(registre, affaires)
  assert.equal(seules.length, 1)
  assert.equal(seules[0].origine, 'notion')
  assert.equal(seules[0].affaire.horsApp, true)
  assert.equal(seules[0].affaire.code_affaire, '2697 QRS')
  assert.equal(seules[0].libelle, 'Dépôt PC')
  assert.deepEqual(aDater(registre).map((x) => x.id), ['r3'])
  const choix = affairesNotionSeules([{ numero: '2697', reference: '2697 - QRS' }, { numero: '2618', reference: '2618 - LVV' }], affaires)
  assert.deepEqual(choix.map((a) => a.id), ['notion-2697'])
})
```

- [ ] **Step 2 : lancer, voir échouer** — `npm test` → FAIL sur ce test.

- [ ] **Step 3 : implémenter dans `gestionLogique.js`** (à la fin ; importer `codeCarte`, `numeroAffaire`, `COULEUR_NOTION` depuis `../shared/notion/codesAffaire.js` — jamais depuis `echeancesNotionLogique.js`, qui importe `gestionLogique.js` : ce serait un import circulaire)

```js
// ─── Échéances partagées avec Notion (migration 071) ─────────────────────────

/** Ajoute aux échéances des plannings ce que le registre sait de leur carte. */
export function marquerNotion(evenements, registre) {
  const parJalon = new Map((registre ?? []).filter((l) => l.jalon_id != null && l.page_id).map((l) => [`${l.origine}-${l.jalon_id}`, l]))
  return evenements.map((e) => {
    const l = parJalon.get(`${e.origine}-${e.jalonId}`)
    return l ? { ...e, notion: { ligne: l, nbDates: l.nb_dates, pageId: l.page_id } } : e
  })
}

/** Échéances des affaires qui n'existent que dans Notion. */
export function rendusNotion(registre, affaires) {
  const numeros = new Set((affaires ?? []).map((a) => numeroAffaire(a.code_affaire)).filter(Boolean))
  return (registre ?? [])
    .filter((l) => !l.affaire_id && l.date_synchro && l.page_id && !numeros.has(l.numero))
    .map((l) => ({
      id: `notion-${l.id}`, date: l.date_synchro, libelle: l.libelle || 'Échéance', couleur: COULEUR_NOTION, origine: 'notion',
      affaire: { id: `notion-${l.numero}`, code_affaire: codeCarte(l.reference || l.numero), nom: l.reference ?? '', horsApp: true },
      notion: { ligne: l, nbDates: l.nb_dates, pageId: l.page_id },
    }))
}

/** Cartes dont aucune date n'a pu être lue. */
export function aDater(registre) {
  return (registre ?? []).filter((l) => !l.date_synchro && l.page_id)
    .map((l) => ({ id: l.id, texte: l.texte_carte ?? '', pageId: l.page_id, reference: l.reference ?? l.numero }))
}

/** Affaires de la base Notion absentes de l'app, pour « + Échéance ». */
export function affairesNotionSeules(references, affaires) {
  const numeros = new Set((affaires ?? []).map((a) => numeroAffaire(a.code_affaire)).filter(Boolean))
  const vus = new Set()
  return (references ?? [])
    .filter((r) => r.numero && !numeros.has(r.numero) && !vus.has(r.numero) && vus.add(r.numero))
    .map((r) => ({ id: `notion-${r.numero}`, code_affaire: codeCarte(r.reference), nom: r.reference, horsApp: true, numero: r.numero, reference: r.reference }))
}
```

Lancer `npm test` → PASS.

- [ ] **Step 4 : `gestionDonnees.js`** — dans `chargerCalendrier`, ajouter `lireRegistre()` (importé de `../shared/notion/echeancesNotion`) au `Promise.all` et rendre `registre` (`null` si la migration manque) :

```js
  const [[affaires, collaborateurs], jalonsChantier, jalonsEtude, profils, registre] = await Promise.all([
    affairesEtCollaborateurs(),
    supabase.from('planning_jalons').select('*'),
    supabase.from('planning_etude_jalons').select('*'),
    supabase.from('profiles').select('*').eq('type_compte', 'agence'),
    lireRegistre().catch(() => null),
  ])
  return {
    affaires: verifier(affaires), collaborateurs: verifier(collaborateurs),
    jalonsChantier: verifier(jalonsChantier), jalonsEtude: verifier(jalonsEtude), profils: verifier(profils),
    registre,
  }
```

- [ ] **Step 5 : `src/shared/notion/MarqueNotion.jsx`**

```jsx
// Petite marque d'une échéance liée à une carte Notion : un « N » dans un
// carré, lisible à 12 px, sans le logo de la marque (aucun dessin de tiers).
export function MarqueNotion({ size = 12, title = 'Liée à Notion' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" role="img" aria-label={title} style={{ flexShrink: 0 }}>
      <title>{title}</title>
      <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="white" stroke="#37352F" />
      <path d="M3.5 9V3l5 6V3" fill="none" stroke="#37352F" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
```

- [ ] **Step 6 : `CalendrierRendus.jsx`**

1. Imports : `MarqueNotion`, `synchroniser`, `lienCarte` ; `marquerNotion`, `rendusNotion`, `aDater`, `affairesNotionSeules` ; icône `RefreshCw` de lucide.
2. État : `const [notion, setNotion] = useState({ etat: 'attente', lectureLe: null, references: [] })`.
3. Synchronisation à l'ouverture puis rechargement :

```jsx
  const actualiserNotion = useCallback(async () => {
    setNotion((n) => ({ ...n, etat: 'encours' }))
    const r = await synchroniser()
    setNotion((n) => ({ etat: r.etat, lectureLe: r.lectureLe ?? n.lectureLe, references: r.references ?? n.references }))
    if (r.etat === 'ok') recharger()
  }, [])
  useEffect(() => { actualiserNotion() }, [actualiserNotion])
```

(`recharger` doit devenir un `useCallback` stable, ou être appelé via une ref ; garder la règle du projet : ne pas mettre d'objet neuf dans les dépendances.)

4. `evenements` : partir de `marquerNotion(rendus(...), donnees.registre)`, concaténer `rendusNotion(donnees.registre, donnees.affaires)` triés par date, filtre `origines[e.origine] ?? true` ; « Mes affaires » écarte les `horsApp`.
5. Dans `Jalon` : après le code d'affaire, `{ev.notion && <MarqueNotion size={compact ? 10 : 12} title={ev.notion.nbDates > 1 ? 'Carte Notion à plusieurs dates · à modifier dans Notion' : 'Liée à une carte Notion'} />}` ; le `title` du bouton ajoute `' · carte Notion à plusieurs dates, à modifier dans Notion'` quand `nbDates > 1`.
6. En-tête de la grille, avant « Échéance » : bouton « Actualiser depuis Notion » (icône `RefreshCw`, désactivé pendant `encours`) et, en petit, l'état : `encours` → « Lecture de Notion… », `ok` → « Notion lu à 14:32 », `injoignable` → « Notion injoignable » (rouge `#B8412C`), `hors-ligne` → « Hors ligne », `indisponible` → rien (bouton masqué : migration 071 absente).
7. Sous la grille (dans la `section`), si `aDater(donnees.registre).length` : un bloc « À dater » — titre, phrase « Cartes de la colonne ECHEANCES RENDUS dont la date n’a pas pu être lue. », puis une ligne par carte : texte, lien « Ouvrir dans Notion » (`<a href={lienCarte(pageId)} target="_blank" rel="noreferrer">`).
8. `ModaleJalon` reçoit `affaires={[...donnees.affaires, ...affairesNotionSeules(notion.references, donnees.affaires)]}` et, après `onEnregistre`, lance `actualiserNotion()` (qui recharge).
9. `allerAuPlanning` : rien pour un `horsApp`.
10. `exportCalendrier.js` : vérifier qu'un événement `origine: 'notion'` s'imprime (libellé du planning : « Notion ») — adapter la ligne qui affiche « planning d’étude / chantier » dans le détail et dans l'aside du calendrier : `ev.origine === 'notion' ? 'Notion' : …`.

- [ ] **Step 7 : `ModaleJalon.jsx`**

1. Imports : `creerEcheanceNotionSeule`, `modifierEcheanceNotionSeule`, `supprimerEcheanceNotionSeule`, `lienCarte`, `MarqueNotion`.
2. Dérivés :

```jsx
  const affaireChoisie = affaires.find((a) => a.id === affaireId)
  const horsApp = !!(evenement?.affaire.horsApp || affaireChoisie?.horsApp)
  const verrouNotion = (evenement?.notion?.nbDates ?? 0) > 1
```

3. `verrouNotion` : la fenêtre affiche libellé, date et affaire en lecture, la mention « Cette échéance vient d’une carte Notion qui porte plusieurs dates : elle se modifie dans Notion. », le lien « Ouvrir la carte dans Notion », et un seul bouton « Fermer » (ni Enregistrer, ni Supprimer).
4. `horsApp` : le choix du planning et des couleurs est masqué (texte : « Affaire absente de l’app : l’échéance vit dans Notion. ») ; `enregistrer` :

```jsx
      if (horsApp && creation) await creerEcheanceNotionSeule({ numero: affaireChoisie.numero, reference: affaireChoisie.reference, libelle: libelle.trim(), date })
      else if (horsApp) await modifierEcheanceNotionSeule(evenement.notion.ligne, { libelle: libelle.trim(), date })
      else if (creation) await creerJalon(affaireId, origine, valeurs)
      else await modifierJalon(evenement, valeurs)
```

et la suppression : `horsApp ? supprimerEcheanceNotionSeule(evenement.notion.ligne) : supprimerJalon(evenement)`.
5. Une échéance liée (`evenement?.notion`, une seule date) montre `MarqueNotion` et « Liée à une carte Notion » avec le lien : rien d'autre ne change (la synchronisation suit).
6. `expliquer` : `e.code === 'notion-non-configure' || e.code === 'injoignable'` → « Notion ne répond pas : rien n’a été modifié. »

- [ ] **Step 8 : vérifier** — `npm test`, `npm run build`, `npx eslint src/gestion src/shared/notion` (pas de nouveau problème). Contrôle à l'écran (`npm run dev`, compte associé, `/gestion-agence/calendrier`) : sans migration 071, le calendrier s'affiche comme avant, sans bouton Notion.

- [ ] **Step 9 : commit**

```bash
git add src/gestion src/shared/notion/MarqueNotion.jsx tests/gestion.test.js
git commit -m "feat: calendrier des rendus — échéances Notion, affaires absentes de l'app, « À dater », actualiser"
```

---

### Task 7 : plannings d'étude et de chantier

**Files :**
- Modify : `src/shared/planning/positionsPetales.js`, `tests/menu-radial.test.js`
- Create : `src/shared/notion/useEcheancesNotion.js`
- Modify : `src/modules/chantier/planning/GanttChart.jsx`, `GanttTimeline.jsx`, `JalonModal.jsx`
- Modify : `src/modules/etude/planning/GanttEtude.jsx`, `GanttEtudeTimeline.jsx`, `JalonEtudeModal.jsx`

**Interfaces :**
- Consumes : Task 5 (`synchroniser`, `lireRegistre`, `lienCarte`), `MarqueNotion`, `numeroAffaire`.
- Produces :
  - `actionsJalon(ancre, verrouNotion = false)` : verrouillée → `['params']`.
  - `useEcheancesNotion({ affaireId, codeAffaire, origine, jalons, pret, onChangementsApp }) → { lies: Set<id>, verrouilles: Set<id> }`.

- [ ] **Step 1 : test de la roue** (`tests/menu-radial.test.js`, dans le test existant d'`actionsJalon`)

```js
    assert.deepEqual(actionsJalon(false, true), ['params'])
    assert.deepEqual(actionsJalon(true, true), ['params'])
```

Lancer `npm test` → FAIL, puis dans `positionsPetales.js` :

```js
// Couronne d'un jalon. Accroché, il suit sa barre : le déplacer à la main ou
// le raccrocher ailleurs passe d'abord par « Détacher », jamais par mégarde.
// Venu d'une carte Notion à plusieurs dates, il se modifie dans Notion : il
// ne reste que ses réglages (lecture).
export function actionsJalon(ancre, verrouNotion = false) {
  if (verrouNotion) return ['params']
  return ancre ? ['params', 'detacher', 'del'] : ['params', 'move', 'accrocher', 'del']
}
```

`npm test` → PASS.

- [ ] **Step 2 : `src/shared/notion/useEcheancesNotion.js`**

```js
import { useEffect, useRef, useState } from 'react'
import { synchroniser, lireRegistre } from './echeancesNotion'
import { numeroAffaire } from './codesAffaire'

// ─── Échéances Notion dans un planning ──────────────────────────────────────
//
// À l'ouverture, puis 3 s après tout changement des échéances (quel qu'en
// soit le chemin : glissement, fiche, Décaler, ⌘Z — on compare après coup,
// comme le recalage des échéances accrochées), l'affaire est synchronisée
// avec Notion. Une synchronisation qui a changé des échéances de l'app
// demande au planning de les relire (`onChangementsApp`). La signature des
// échéances évite de relancer après cette relecture.
const signature = (jalons) => jalons.map((j) => `${j.id}:${j.date ?? `${j.semaine}/${j.annee}`}:${j.label}`).sort().join('|')

export function useEcheancesNotion({ affaireId, codeAffaire, origine, jalons, pret, onChangementsApp }) {
  const [liens, setLiens] = useState({ lies: new Set(), verrouilles: new Set() })
  const derniere = useRef(null)
  const rappel = useRef(onChangementsApp)
  rappel.current = onChangementsApp
  const numero = numeroAffaire(codeAffaire)

  useEffect(() => {
    if (!pret || !numero) return
    const sig = signature(jalons)
    if (sig === derniere.current) return
    const premiere = derniere.current === null
    const minuteur = setTimeout(async () => {
      derniere.current = sig
      const r = await synchroniser({ affaireId })
      const registre = await lireRegistre({ numero }).catch(() => null)
      if (registre) {
        const miens = registre.filter((l) => l.origine === origine && l.jalon_id != null && l.page_id)
        setLiens({ lies: new Set(miens.map((l) => l.jalon_id)), verrouilles: new Set(miens.filter((l) => l.nb_dates > 1).map((l) => l.jalon_id)) })
      }
      if (r.etat === 'ok' && r.changementsApp > 0) rappel.current?.()
    }, premiere ? 0 : 3000)
    return () => clearTimeout(minuteur)
  }, [affaireId, numero, origine, jalons, pret])

  return liens
}
```

- [ ] **Step 3 : planning chantier (`GanttChart.jsx`)**

1. Importer `useEcheancesNotion`.
2. Après la déclaration des jalons et de `fetchAllData` :

```jsx
  // Échéances partagées avec Notion (migration 071) : synchronisées à
  // l'ouverture et après chaque changement ; une carte à plusieurs dates
  // verrouille son échéance (elle se modifie dans Notion)
  const notion = useEcheancesNotion({
    affaireId, codeAffaire: affaire?.code_affaire, origine: 'chantier', jalons,
    pret: !isLoading && !lectureSeule, onChangementsApp: fetchAllData,
  })
  const jalonsAffiches = useMemo(() => jalons.map((j) => ({
    ...j, notion: notion.lies.has(j.id), notionVerrou: notion.verrouilles.has(j.id),
  })), [jalons, notion])
```

(adapter les noms `affaire`, `lectureSeule`, `isLoading` à ceux du composant : `grep -n "lectureSeule\|const affaire\|affaire =" src/modules/chantier/planning/GanttChart.jsx`.)
3. Passer `jalonsAffiches` (au lieu de `jalons`) à `GanttTimeline` seulement ; passer `jalons.filter((j) => !notion.verrouilles.has(j.id))` à `DecalagePlanningModal` ; passer `verrouilles={notion.verrouilles}` à `JalonModal`.

- [ ] **Step 4 : `GanttTimeline.jsx`**

1. Roue : `actions={actionsJalon(jalonSelectionne.ancre, jalonSelectionne.notionVerrou)}`.
2. Étiquette d'une échéance (près de `{jalon.fixe_direction && <IconeDirection />}`) : `{jalon.notion && <MarqueNotion size={10} title={jalon.notionVerrou ? 'Carte Notion à plusieurs dates · à modifier dans Notion' : 'Liée à une carte Notion'} />}` ; le `title` ajoute `${jalon.notion ? ' · liée à Notion' : ''}${jalon.notionVerrou ? ' (plusieurs dates : à modifier dans Notion)' : ''}`.

- [ ] **Step 5 : `JalonModal.jsx`** — prop `verrouilles = new Set()` transmise à `JalonRow` (`verrou={verrouilles.has(j.id)}`) ; une ligne verrouillée n'affiche ni crayon ni corbeille, mais une petite mention « à modifier dans Notion » avec `MarqueNotion`.

- [ ] **Step 6 : planning d'étude** — mêmes trois étapes dans `GanttEtude.jsx` (`origine: 'etude'`, `pret: !loading && !lectureSeule`, `onChangementsApp: refetch`), `GanttEtudeTimeline.jsx` (roue ligne 1190, étiquette près de l'`IconeDirection` ligne 971) et `JalonEtudeModal.jsx` (prop `verrouilles`). Pas de « Décaler » à l'étude.

- [ ] **Step 7 : vérifier** — `npm test`, `npm run build`, `npx eslint src` (comparer au nombre de départ). À l'écran (`npm run dev`) : un planning s'ouvre et fonctionne comme avant quand la migration 071 n'est pas passée (aucune requête à `/api/notion`, aucun message).

- [ ] **Step 8 : commit**

```bash
git add src/shared/planning/positionsPetales.js tests/menu-radial.test.js src/shared/notion/useEcheancesNotion.js src/modules/chantier/planning src/modules/etude/planning
git commit -m "feat: plannings — échéances synchronisées avec Notion, verrou des cartes à plusieurs dates"
```

---

### Task 8 : documentation, mise en service, livraison

**Files :**
- Modify : `CLAUDE.md`

- [ ] **Step 1 : `CLAUDE.md`**
  - Ligne `npm test` : nouveau nombre de tests (relever le total affiché par `npm test`) et « échéances Notion » dans la liste.
  - Base : « 71 fichiers ».
  - Gestion d'agence : remplacer « L'envoi des jalons vers Notion reste prévu, à part » par un renvoi vers la nouvelle section.
  - Nouvelle section `## Échéances partagées avec Notion` : conception, cartes « ECHEANCES RENDUS » en texte libre (structure Notion intouchable), affaire par les 4 chiffres, `lireCarte` / `planSynchro` / passeur / registre 071 (`date_synchro`, `libelle` / `libelle_app`), règles (plusieurs dates = lecture seule, suppression seulement à venir, lecture partielle n'efface rien, plus récent l'emporte, jour de semaine gardé à l'étude, pas de doublon), déclencheurs (calendrier, planning à l'ouverture et 3 s après), variables Vercel `NOTION_TOKEN`, `NOTION_PLANNING_SOURCE`, `NOTION_ATELIER_SOURCE`, tests sur cartes inventées, ancienne synchro des phases (`useNotionSync`) inopérante et laissée en l'état.

- [ ] **Step 2 : vérification finale** — `npm test` (tout vert, nombre relevé), `npm run build`, `npx eslint src api` (comparer).

- [ ] **Step 3 : commit et push**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — échéances partagées avec Notion"
git push
```

- [ ] **Step 4 : mise en service (avec Victor, hors dépôt)**
  1. Donner à Victor, dans la conversation seulement, les deux identifiants de source à ajouter dans Vercel (Production) : `NOTION_PLANNING_SOURCE` et `NOTION_ATELIER_SOURCE` (les `collection://…` relevés le 2026-10-12, sans le préfixe). Puis redéployer.
  2. Victor passe `supabase/migrations/071_echeances_notion.sql` dans l'éditeur SQL.
  3. Vérifier que la connexion « Application JGA » voit la page (première ouverture du calendrier : pas de « Notion injoignable »).
  4. Première synchronisation : relire « À dater » et quelques cartes créées ; contrôler qu'aucun doublon n'est apparu.
