# État des lieux — Lot 1 « Préparer » — plan de travail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importer les plans de l'existant d'une affaire (DXF ou PDF vectorisé, DWG refusé), en tirer les étages et les pièces (contours lus dans le DXF, sinon proposés par Claude), les corriger à l'écran et les consulter sans réseau.

**Architecture:** module `src/modules/etude/etat-des-lieux/` déclaré dans le manifeste (phase Étude). Toute la logique se tient dans des fichiers purs testés sous `node --test` (format, lecture DXF, pièces, étages, géométrie, PDF, demande à Claude) ; le navigateur ne fait que lire les fichiers, dessiner les images, appeler la fonction serveur `api/edl-pieces.js` (SDK Anthropic) et écrire dans Supabase (migration 077, bucket privé `edl`). L'écran réutilise `VisionneusePlan` (zoom, pincement) avec un calque SVG pour les contours.

**Tech Stack:** React 19, Vite, Supabase, pdf.js 3, fflate (gzip), `@anthropic-ai/sdk` (fonction serveur Vercel, Node), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` (§ 2, 3, 4, 8, 9, 10).

## Global Constraints

- Français partout : commentaires, messages de commit, noms métier, textes d'écran. Commits `feat:` / `fix:` / `test:` / `chore:` / `docs:`, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Styles inline, couleurs par variables CSS ; dans une affaire, l'accent est `var(--affaire-accent)` (orange à l'étude).
- Une fenêtre ne se ferme jamais au clic à côté (✕, Annuler, Échap seulement).
- Les commentaires expliquent pourquoi, pas quoi.
- **Aucun plan réel dans le dépôt** (public) : les tests utilisent des plans inventés. Les exemples réels sont dans `~/Desktop/PERSO/Exemples dxf/` (hors dépôt) et ne servent qu'aux vérifications manuelles.
- Toute table créée reçoit `grant select, insert, update, delete … to authenticated;` et `… to service_role;`, la règle « Agence » (`est_agence()`) et les trois règles restrictives `peut_modifier_affaire(affaire_id)` (modèle : migration 073).
- Un chemin de stockage commence toujours par `<affaire_id>/`.
- Supabase ne lève pas d'exception : tester `{ error }` ; un refus RLS sur `update` / `delete` ne rend pas d'erreur → compter les lignes (`.select()`).
- Rien de ce qui est enregistré ne se calcule dans un `setState(prev => …)`.
- Clé `ANTHROPIC_API_KEY` côté serveur seulement, jamais `VITE_`. Modèle `claude-opus-5-5`.
- Message de refus du DWG, mot pour mot : « Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF dans AutoCAD ou ArchiCAD (Fichier → Enregistrer sous → DXF), ou importez-le en PDF vectorisé. »
- `npm test` et `npm run build` passent avant chaque commit ; `npx eslint src` : ne pas ajouter de problème (≈ 71 préexistants).

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/077_etat_des_lieux.sql` | tables `edl_etats`, `edl_niveaux`, `edl_pieces`, bucket `edl`, droits, fichiers orphelins |
| `src/modules/etude/etat-des-lieux/formatPlanEdl.js` | format d'un fichier d'après ses premiers octets, messages de refus (pur) |
| `…/geometrieEdl.js` | aire, point dans polygone, boîte, cadrage mètres ↔ pixels, édition de contour (pur) |
| `…/dxfLecture.js` | décodage et lecture d'un DXF texte, blocs déployés, MTEXT nettoyés (pur) |
| `…/piecesDxfLogique.js` | calque des pièces, unité, nom / numéro / surface / HP de chaque pièce (pur) |
| `…/niveauxLogique.js` | étages proposés (noms de calques et de blocs, sinon grappes), unité par défaut (pur) |
| `…/pdfPlanLogique.js` | échelle lue, mètres par point, PDF vectoriel ou non (pur) |
| `…/piecesIaLogique.js` | demande à Claude (consignes, schéma), lecture et conversion de la réponse (pur, partagé avec `api/`) |
| `api/edl-pieces.js` | fonction serveur : compte agence vérifié, appel Claude (SDK), réponse JSON |
| `…/piecesIa.js` | appel de `api/edl-pieces` depuis le navigateur |
| `…/renduNiveau.js` | dessin d'un étage DXF en image, encodage, image réduite pour Claude (navigateur) |
| `…/lecturePdfEdl.js` | pdf.js : pages, rendu, textes, découpe d'un étage (navigateur) |
| `…/edlDonnees.js` | lectures / écritures Supabase et stockage |
| `…/importerPlans.js` | enchaînement d'un import DXF ou PDF (navigateur) |
| `…/useEtatDesLieux.js` | état chargé + actions |
| `…/ImportEdl.jsx` | écran d'import |
| `…/EditeurPieces.jsx` | écran de correction des pièces d'un étage |
| `…/index.jsx` | module |
| `src/modules/chantier/comptes-rendus/VisionneusePlan.jsx` | + prop `calque` |
| `src/modules/manifest.js`, `src/affaire/AffairePage.jsx`, `src/admin/gestionAppLogique.js`, `vercel.json`, `CLAUDE.md` | déclaration, icône, stockage, durée de la fonction, documentation |
| `tests/etat-des-lieux.test.js` | tests de toute la logique pure |

---

### Task 1 : Migration 077

**Files:**
- Create: `supabase/migrations/077_etat_des_lieux.sql`

**Interfaces:**
- Produces : tables `edl_etats(id, affaire_id unique, created_at, created_by)`, `edl_niveaux(id, etat_id, affaire_id, nom, ordre, format, source_nom, source_page, chemin_source, chemin, chemin_apercu, largeur, hauteur, cadrage jsonb, unites_par_metre, echelle, textes jsonb, created_at)`, `edl_pieces(id, niveau_id, affaire_id, nom, numero, contour jsonb, surface_lue, hsp_lue, origine, a_verifier, ordre, fiche jsonb, created_at, updated_at)` ; bucket privé `edl`.

- [ ] **Step 1 : écrire la migration**

```sql
-- Migration 077 : état des lieux d'un bâtiment existant — lot 1 (préparer)
--
-- Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md.
-- Un état des lieux par affaire ; ses étages (image du plan, cadrage
-- mètres ↔ pixels, textes du plan) et ses pièces (contour en mètres, dans le
-- repère du plan d'origine). Fichiers dans le stockage privé `edl`, rangés
-- par affaire : images des étages et plan source compressé (gzip), gardé
-- pour l'export du lot 4.
--
-- Agence seule ; écriture réservée aux collaborateurs de l'affaire (règle
-- de la migration 060). Rejouable.

create table if not exists edl_etats (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null unique references affaires(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

create table if not exists edl_niveaux (
  id                uuid primary key default gen_random_uuid(),
  etat_id           uuid not null references edl_etats(id) on delete cascade,
  affaire_id        uuid not null references affaires(id) on delete cascade,
  nom               text not null,
  ordre             integer not null default 0,
  format            text not null check (format in ('dxf', 'pdf')),
  source_nom        text,
  source_page       integer,
  chemin_source     text,
  chemin            text not null,
  chemin_apercu     text not null,
  largeur           integer not null,
  hauteur           integer not null,
  -- { x0, y0, x1, y1 (mètres), pxParMetre, largeur, hauteur }
  cadrage           jsonb not null,
  unites_par_metre  numeric,
  echelle           integer,
  -- [{ texte, pos: [x, y] (mètres) }] : relus pour proposer les pièces plus tard
  textes            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

create table if not exists edl_pieces (
  id           uuid primary key default gen_random_uuid(),
  niveau_id    uuid not null references edl_niveaux(id) on delete cascade,
  affaire_id   uuid not null references affaires(id) on delete cascade,
  nom          text not null default '',
  numero       text,
  -- [[x, y], …] en mètres, repère du plan d'origine
  contour      jsonb not null,
  surface_lue  numeric,
  hsp_lue      numeric,
  origine      text not null check (origine in ('dxf', 'ia', 'main')),
  a_verifier   boolean not null default false,
  ordre        integer not null default 0,
  -- fiche de la pièce (sol, murs, plafond…) : remplie à partir du lot 3
  fiche        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus d'office une nouvelle
-- table à l'API : sans ces droits, « permission denied ». Pas d'anon.
grant select, insert, update, delete on public.edl_etats   to authenticated;
grant select, insert, update, delete on public.edl_etats   to service_role;
grant select, insert, update, delete on public.edl_niveaux to authenticated;
grant select, insert, update, delete on public.edl_niveaux to service_role;
grant select, insert, update, delete on public.edl_pieces  to authenticated;
grant select, insert, update, delete on public.edl_pieces  to service_role;

create index if not exists edl_niveaux_etat on edl_niveaux(etat_id, ordre);
create index if not exists edl_pieces_niveau on edl_pieces(niveau_id, ordre);
create index if not exists edl_pieces_affaire on edl_pieces(affaire_id);

create or replace function edl_pieces_touche() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists edl_pieces_touche on edl_pieces;
create trigger edl_pieces_touche before update on edl_pieces
  for each row execute function edl_pieces_touche();

do $$
declare t text;
begin
  foreach t in array array['edl_etats', 'edl_niveaux', 'edl_pieces'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Agence" on %I', t);
    execute format('create policy "Agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
    execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
    execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
    execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
    execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
    execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id)) with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
    execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  end loop;
end $$;

-- ─── Stockage privé `edl` ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edl', 'edl', false, 52428800,
        array['image/webp', 'image/jpeg', 'application/gzip', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Agence edl" on storage.objects;
create policy "Agence edl" on storage.objects
  for all to authenticated
  using (bucket_id = 'edl' and public.est_agence())
  with check (bucket_id = 'edl' and public.est_agence());

-- Règles restrictives de la migration 060, rejouées avec `edl` dans la liste
-- des espaces rangés par affaire
do $$
declare
  condition text := 'bucket_id not in (''cr-photos'', ''cr-plans'', ''cr-archives'', ''audio-temporaire'', ''edl'')'
    || ' or not public.est_agence() or public.peut_modifier_affaire(public.affaire_du_chemin(name))';
begin
  execute 'drop policy if exists "Collaborateurs : dépôt" on storage.objects';
  execute 'drop policy if exists "Collaborateurs : modification" on storage.objects';
  execute 'drop policy if exists "Collaborateurs : suppression" on storage.objects';
  execute format('create policy "Collaborateurs : dépôt" on storage.objects as restrictive for insert to authenticated with check (%s)', condition);
  execute format('create policy "Collaborateurs : modification" on storage.objects as restrictive for update to authenticated using (%s) with check (%s)', condition, condition);
  execute format('create policy "Collaborateurs : suppression" on storage.objects as restrictive for delete to authenticated using (%s)', condition);
end $$;

-- ─── Fichiers inutilisés : fonction de la 075 + le stockage `edl` ────────────
create or replace function fichiers_orphelins()
returns table (bucket text, chemin text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.created_at < now() - interval '1 hour'
    and (
      (o.bucket_id = 'cr-photos'
        and not exists (select 1 from public.cr_photos p where p.chemin = o.name or p.chemin_miniature = o.name)
        and not exists (select 1 from public.opr_photos p where p.chemin = o.name or p.chemin_miniature = o.name))
      or
      (o.bucket_id = 'cr-plans' and not exists (
        select 1 from public.affaire_plan_versions v where v.chemin = o.name or v.chemin_apercu = o.name))
      or
      (o.bucket_id = 'cr-archives'
        and not exists (select 1 from public.cr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_pv v where v.chemin = o.name))
      or
      (o.bucket_id = 'affaires-photos' and not exists (
        select 1 from public.affaires a
        where split_part(split_part(a.photo_url, '/affaires-photos/', 2), '?', 1) = o.name))
      or
      (o.bucket_id = 'edl' and not exists (
        select 1 from public.edl_niveaux n
        where n.chemin = o.name or n.chemin_apercu = o.name or n.chemin_source = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2 : relire contre la 073, la 060 et la 075**

Run: `diff <(sed -n '/do \$\$/,/end \$\$;/p' supabase/migrations/073_dpgf.sql) <(sed -n '/do \$\$/,/end \$\$;/p' supabase/migrations/077_etat_des_lieux.sql | head -20)`
Expected : seules diffèrent la boucle sur trois tables et la liste des noms. Vérifier aussi à l'œil que le bloc `fichiers_orphelins` reprend la 075 à l'identique avant la branche `edl`.

- [ ] **Step 3 : commit**

```bash
git add supabase/migrations/077_etat_des_lieux.sql
git commit -m "feat: état des lieux — migration 077 (étages, pièces, stockage edl)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

La migration est passée à la main par l'agence dans le SQL Editor de Supabase ; le code doit tolérer son absence (Task 10).

---

### Task 2 : Format d'un plan (DWG refusé)

**Files:**
- Create: `src/modules/etude/etat-des-lieux/formatPlanEdl.js`
- Create: `tests/etat-des-lieux.test.js`

**Interfaces:**
- Produces : `formatPlan(octets: Uint8Array) → 'dwg' | 'dxf' | 'dxf-binaire' | 'pdf' | 'inconnu'` ; `verdictFormat(format) → { ok: boolean, message: string | null }` ; `MESSAGES_FORMAT` (clés `dwg`, `dxf-binaire`, `inconnu`, `pdf-scan`) ; `FORMATS_ACCEPTES = 'DXF ou PDF vectorisé'`.

- [ ] **Step 1 : test qui échoue**

```js
// État des lieux : logique pure (format, DXF, pièces, étages, géométrie, PDF,
// demande à Claude). Plans inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from '../src/modules/etude/etat-des-lieux/formatPlanEdl.js'

const octets = (s) => new TextEncoder().encode(s)

describe('format du plan', () => {
  test('un DWG se reconnaît à son en-tête, quelle que soit l’extension', () => {
    assert.equal(formatPlan(octets('AC1032\0\0\0\0\0\0\0')), 'dwg')
    assert.equal(formatPlan(octets('AC1018xxxxx')), 'dwg')
  })
  test('DXF texte, avec retours Windows, commentaire 999 ou marque UTF-8', () => {
    assert.equal(formatPlan(octets('  0\nSECTION\n  2\nHEADER\n')), 'dxf')
    assert.equal(formatPlan(octets('0\r\nSECTION\r\n2\r\nHEADER\r\n')), 'dxf')
    assert.equal(formatPlan(octets('999\nArchiCAD\n  0\nSECTION\n')), 'dxf')
    assert.equal(formatPlan(new Uint8Array([0xef, 0xbb, 0xbf, ...octets('  0\nSECTION\n')])), 'dxf')
  })
  test('PDF, DXF binaire, inconnu', () => {
    assert.equal(formatPlan(octets('%PDF-1.7\n')), 'pdf')
    assert.equal(formatPlan(octets('AutoCAD Binary DXF\r\n\x1a\0')), 'dxf-binaire')
    assert.equal(formatPlan(octets('PK\x03\x04')), 'inconnu')
  })
  test('verdict : DXF et PDF acceptés, DWG refusé avec le message de l’agence', () => {
    assert.deepEqual(verdictFormat('dxf'), { ok: true, message: null })
    assert.deepEqual(verdictFormat('pdf'), { ok: true, message: null })
    const dwg = verdictFormat('dwg')
    assert.equal(dwg.ok, false)
    assert.equal(dwg.message, 'Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF dans AutoCAD ou ArchiCAD (Fichier → Enregistrer sous → DXF), ou importez-le en PDF vectorisé.')
    assert.equal(verdictFormat('zip').message, MESSAGES_FORMAT.inconnu)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npm test -- --test-name-pattern="format du plan"` — en pratique `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux.test.js`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : implémentation**

```js
// ─── Format d'un plan importé dans l'état des lieux ──────────────────────────
//
// Reconnu au contenu (premiers octets), pas à l'extension : un DWG renommé en
// « .dxf » doit recevoir le message qui dit quoi faire.

export const FORMATS_ACCEPTES = 'DXF ou PDF vectorisé'

export const MESSAGES_FORMAT = {
  dwg: 'Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF dans AutoCAD ou ArchiCAD (Fichier → Enregistrer sous → DXF), ou importez-le en PDF vectorisé.',
  'dxf-binaire': 'Ce DXF est enregistré en binaire. Enregistrez-le en DXF texte (ASCII) dans AutoCAD ou ArchiCAD, ou importez le plan en PDF vectorisé.',
  inconnu: 'Format non reconnu. L’état des lieux accepte les plans en DXF ou en PDF vectorisé.',
  'pdf-scan': 'Ce PDF ne contient pas de dessin vectoriel (plan scanné ?). Importez le plan en DXF, ou en PDF exporté directement du logiciel de dessin.',
}

export function formatPlan(octets) {
  const marque = octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf ? 3 : 0
  const debut = String.fromCharCode(...octets.slice(marque, marque + 512))
  if (/^AC10\d\d/.test(debut)) return 'dwg'
  if (debut.startsWith('%PDF-')) return 'pdf'
  if (debut.startsWith('AutoCAD Binary DXF')) return 'dxf-binaire'
  if (/^\s*(999\r?\n[^\n]*\n\s*)?0\r?\n\s*SECTION/.test(debut)) return 'dxf'
  return 'inconnu'
}

export function verdictFormat(format) {
  if (format === 'dxf' || format === 'pdf') return { ok: true, message: null }
  return { ok: false, message: MESSAGES_FORMAT[format] ?? MESSAGES_FORMAT.inconnu }
}
```

- [ ] **Step 4 : vérifier le succès** — même commande, Expected : PASS (4 tests).

- [ ] **Step 5 : commit** — `git add src/modules/etude/etat-des-lieux/formatPlanEdl.js tests/etat-des-lieux.test.js` puis `git commit -m "feat: état des lieux — format du plan reconnu, DWG refusé" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 3 : Géométrie (aire, cadrage, édition de contour)

**Files:**
- Create: `src/modules/etude/etat-des-lieux/geometrieEdl.js`
- Modify: `tests/etat-des-lieux.test.js` (ajouter un `describe`)

**Interfaces:**
- Produces : `aire(pts)`, `pointDansPolygone([x,y], pts)`, `boite(points) → [x0,y0,x1,y1]`, `dansBoite(p, b)`, `centre(pts)`, `mediane(valeurs)`, `SEUIL_ECART = 0.05`, `ecartSurface(contour, surfaceLue) → number | null`, `cadrage(boite, { marge, pxMax, pixelsMax }) → { x0, y0, x1, y1, pxParMetre, largeur, hauteur }`, `versPixels(c, [x,y])`, `versMetres(c, [px,py])`, `deplacerSommet(contour, i, p)`, `insererSommet(contour, apres, p)`, `retirerSommet(contour, i)`, `arrondirContour(contour)` (au mm). Points = tableaux `[x, y]`.

- [ ] **Step 1 : tests**

```js
import {
  aire, pointDansPolygone, boite, cadrage, versPixels, versMetres, ecartSurface,
  deplacerSommet, insererSommet, retirerSommet, arrondirContour, mediane,
} from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'

describe('géométrie', () => {
  const carre = [[0, 0], [4, 0], [4, 5], [0, 5]]
  test('aire, point dans un polygone (pièce en L comprise)', () => {
    assert.equal(aire(carre), 20)
    const enL = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]
    assert.equal(aire(enL), 12)
    assert.equal(pointDansPolygone([1, 3], enL), true)
    assert.equal(pointDansPolygone([3, 3], enL), false)
    assert.deepEqual(boite(enL), [0, 0, 4, 4])
    assert.equal(mediane([3, 1, 2]), 2)
    assert.equal(mediane([4, 1, 2, 3]), 2.5)
  })
  test('cadrage : y du plan vers le haut, y de l’image vers le bas, aller-retour exact', () => {
    const c = cadrage([0, 0, 10, 5], { marge: 0, pxMax: 1000 })
    assert.equal(c.pxParMetre, 100)
    assert.equal(c.largeur, 1000)
    assert.equal(c.hauteur, 500)
    assert.deepEqual(versPixels(c, [0, 5]), [0, 0])
    assert.deepEqual(versPixels(c, [10, 0]), [1000, 500])
    assert.deepEqual(versMetres(c, versPixels(c, [3.2, 1.7])).map((v) => Math.round(v * 1000) / 1000), [3.2, 1.7])
  })
  test('cadrage : marge et plafond de pixels de l’iPad', () => {
    const c = cadrage([0, 0, 100, 100], { marge: 0.05, pxMax: 6000, pixelsMax: 16_000_000 })
    assert.equal(c.x0, -5)
    assert.ok(c.largeur * c.hauteur <= 16_000_000)
  })
  test('écart de surface et édition du contour', () => {
    assert.equal(ecartSurface(carre, 20), 0)
    assert.ok(Math.abs(ecartSurface(carre, 25) + 0.2) < 1e-9)
    assert.equal(ecartSurface(carre, null), null)
    assert.deepEqual(deplacerSommet(carre, 1, [5, 0])[1], [5, 0])
    assert.deepEqual(insererSommet(carre, 0, [2, 0]), [[0, 0], [2, 0], [4, 0], [4, 5], [0, 5]])
    assert.equal(retirerSommet(carre, 0).length, 3)
    assert.equal(retirerSommet(retirerSommet(carre, 0), 0).length, 3) // jamais moins de trois sommets
    assert.deepEqual(arrondirContour([[1.23456, 2.0004]]), [[1.235, 2]])
  })
})
```

- [ ] **Step 2 : échec attendu** (module introuvable).

- [ ] **Step 3 : implémentation**

```js
// ─── Géométrie de l'état des lieux ───────────────────────────────────────────
//
// Les contours sont en mètres, dans le repère du plan d'origine (y vers le
// haut) ; l'image d'un étage a son y vers le bas. `cadrage` fait le lien : la
// même fonction sert au dessin, aux gestes et à l'export.

export function aire(pts) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function pointDansPolygone([x, y], pts) {
  let dedans = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans
  }
  return dedans
}

export function boite(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

export const dansBoite = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1

export function centre(pts) {
  const n = pts.length || 1
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
}

export function mediane(valeurs) {
  const s = [...valeurs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Au-delà, la surface dessinée et la surface écrite ne parlent plus de la
// même pièce (contour mal placé, ou échelle fausse si toutes s'écartent)
export const SEUIL_ECART = 0.05

export function ecartSurface(contour, surfaceLue) {
  if (!surfaceLue) return null
  return aire(contour) / surfaceLue - 1
}

export function cadrage([x0, y0, x1, y1], { marge = 0.03, pxMax = 6000, pixelsMax = 16_000_000 } = {}) {
  const m = Math.max(x1 - x0, y1 - y0) * marge
  const b = [x0 - m, y0 - m, x1 + m, y1 + m]
  const largeurM = b[2] - b[0]
  const hauteurM = b[3] - b[1]
  const pxParMetre = Math.min(pxMax / Math.max(largeurM, hauteurM), Math.sqrt(pixelsMax / (largeurM * hauteurM)))
  return {
    x0: b[0], y0: b[1], x1: b[2], y1: b[3], pxParMetre,
    largeur: Math.round(largeurM * pxParMetre), hauteur: Math.round(hauteurM * pxParMetre),
  }
}

export const versPixels = (c, [x, y]) => [(x - c.x0) * c.pxParMetre, (c.y1 - y) * c.pxParMetre]
export const versMetres = (c, [px, py]) => [c.x0 + px / c.pxParMetre, c.y1 - py / c.pxParMetre]

export const deplacerSommet = (contour, i, p) => contour.map((q, k) => (k === i ? p : q))
export const insererSommet = (contour, apres, p) => [...contour.slice(0, apres + 1), p, ...contour.slice(apres + 1)]
export const retirerSommet = (contour, i) => (contour.length <= 3 ? contour : contour.filter((_, k) => k !== i))
export const arrondirContour = (contour) => contour.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
```

- [ ] **Step 4 : succès attendu.**
- [ ] **Step 5 : commit** `feat: état des lieux — géométrie (cadrage mètres ↔ pixels, contours)`.

---

### Task 4 : Lecture d'un DXF

**Files:**
- Create: `src/modules/etude/etat-des-lieux/dxfLecture.js`
- Modify: `tests/etat-des-lieux.test.js`

**Interfaces:**
- Produces : `decoderDxf(octets) → string` (UTF-8 à partir d'AC1021, Windows-1252 avant) ; `nettoyerMtext(brut) → string` (lignes séparées par `\n`) ; `lireDxf(texte) → { version, unites, traits: [{ calque, bloc, ferme, pts }], textes: [{ calque, bloc, texte, pos, hauteur }] }` en unités du dessin. `bloc` = nom du bloc de premier niveau qui contient l'élément (null hors bloc). Un élément du calque `0` dans un bloc prend le calque de l'insertion.

- [ ] **Step 1 : tests (DXF inventés, construits par de petites fonctions)**

```js
import { lireDxf, decoderDxf, nettoyerMtext } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'

// DXF inventés
const P = (c, v) => `${String(c).padStart(3)}\n${v}\n`
const section = (nom, contenu) => P(0, 'SECTION') + P(2, nom) + contenu + P(0, 'ENDSEC')
const dxf = ({ entete = '', blocs = '', entites = '' }) =>
  section('HEADER', entete) + section('BLOCKS', blocs) + section('ENTITIES', entites) + P(0, 'EOF')
const ligne = (calque, x1, y1, x2, y2, papier = false) =>
  P(0, 'LINE') + (papier ? P(67, 1) : '') + P(8, calque) + P(10, x1) + P(20, y1) + P(11, x2) + P(21, y2)
const lwpoly = (calque, pts, ferme = true) =>
  P(0, 'LWPOLYLINE') + P(8, calque) + P(90, pts.length) + P(70, ferme ? 1 : 0) + pts.map(([x, y]) => P(10, x) + P(20, y)).join('')
const polyline = (calque, pts, ferme = true) =>
  P(0, 'POLYLINE') + P(8, calque) + P(66, 1) + P(70, ferme ? 1 : 0) + P(10, 0) + P(20, 0)
  + pts.map(([x, y]) => P(0, 'VERTEX') + P(8, calque) + P(10, x) + P(20, y)).join('') + P(0, 'SEQEND')
const mtext = (calque, x, y, t, h = 0.2) => P(0, 'MTEXT') + P(8, calque) + P(10, x) + P(20, y) + P(40, h) + P(1, t)
const texte = (calque, x, y, t, h = 0.2) => P(0, 'TEXT') + P(8, calque) + P(10, x) + P(20, y) + P(40, h) + P(1, t)
const insert = (nom, calque, x, y, sx = 1, sy = 1, rot = 0) =>
  P(0, 'INSERT') + P(8, calque) + P(2, nom) + P(10, x) + P(20, y) + P(41, sx) + P(42, sy) + P(50, rot)
const bloc = (nom, bx, by, contenu) =>
  P(0, 'BLOCK') + P(8, '0') + P(2, nom) + P(70, 0) + P(10, bx) + P(20, by) + contenu + P(0, 'ENDBLK')
const rond = (pts) => pts.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6))

describe('lecture DXF', () => {
  test('lignes, polylignes fermées, version et unités', () => {
    const l = lireDxf(dxf({
      entete: P(9, '$ACADVER') + P(1, 'AC1032') + P(9, '$INSUNITS') + P(70, 6),
      entites: ligne('MURS', 0, 0, 5, 0) + lwpoly('PIECES', [[0, 0], [4, 0], [4, 5], [0, 5]]) + polyline('ZONES', [[1, 1], [2, 1], [2, 2]]),
    }))
    assert.equal(l.version, 'AC1032')
    assert.equal(l.unites, 6)
    assert.deepEqual(l.traits.map((t) => [t.calque, t.ferme, t.pts.length]), [['MURS', false, 2], ['PIECES', true, 4], ['ZONES', true, 3]])
  })
  test('bloc inséré : déplacé, agrandi, tourné ; calque 0 → calque de l’insertion', () => {
    const l = lireDxf(dxf({
      blocs: bloc('VUE_RDC', 0, 0, ligne('0', 0, 0, 1, 0)),
      entites: insert('VUE_RDC', 'MURS', 10, 5, 2, 2, 90),
    }))
    assert.equal(l.traits.length, 1)
    assert.equal(l.traits[0].calque, 'MURS')
    assert.equal(l.traits[0].bloc, 'VUE_RDC')
    assert.deepEqual(rond(l.traits[0].pts), [[10, 5], [10, 7]])
  })
  test('blocs imbriqués : le bloc retenu est celui du premier niveau, point de base compris', () => {
    const l = lireDxf(dxf({
      blocs: bloc('PORTE', 1, 1, ligne('PORTES', 1, 1, 2, 1)) + bloc('VUE_SSOL', 0, 0, insert('PORTE', 'PORTES', 5, 5)),
      entites: insert('VUE_SSOL', '0', 100, 0),
    }))
    assert.equal(l.traits[0].bloc, 'VUE_SSOL')
    assert.deepEqual(rond(l.traits[0].pts), [[105, 5], [106, 5]])
  })
  test('espace papier ignoré quand l’espace objet porte le dessin, lu sinon', () => {
    const objet = Array.from({ length: 60 }, (_, i) => ligne('MURS', i, 0, i, 1)).join('')
    const cadre = ligne('CADRE', 0, 0, 500, 0, true)
    assert.equal(lireDxf(dxf({ entites: objet + cadre })).traits.some((t) => t.calque === 'CADRE'), false)
    assert.equal(lireDxf(dxf({ entites: cadre })).traits[0].calque, 'CADRE')
  })
  test('arc et cercle approchés par des segments', () => {
    const arc = P(0, 'ARC') + P(8, 'A') + P(10, 0) + P(20, 0) + P(40, 1) + P(50, 0) + P(51, 90)
    const cercle = P(0, 'CIRCLE') + P(8, 'C') + P(10, 0) + P(20, 0) + P(40, 2)
    const l = lireDxf(dxf({ entites: arc + cercle }))
    assert.deepEqual(rond([l.traits[0].pts[0], l.traits[0].pts.at(-1)]), [[1, 0], [0, 1]])
    assert.equal(l.traits[1].ferme, true)
  })
  test('textes : MTEXT nettoyé (codes d’ArchiCAD, ^J, \\P), TEXT, hauteur mise à l’échelle', () => {
    const l = lireDxf(dxf({
      blocs: bloc('B', 0, 0, mtext('0', 1, 1, '{\\fArial|b0|i0|c0|p34;Pièce}^JS=22.9 m²\\PHP:2.47 m', 0.2)),
      entites: insert('B', 'TEXTE', 0, 0, 10, 10) + texte('COTES', 3, 3, '2.54'),
    }))
    assert.equal(l.textes[0].texte, 'Pièce\nS=22.9 m²\nHP:2.47 m')
    assert.equal(l.textes[0].hauteur, 2)
    assert.deepEqual(l.textes[0].pos, [10, 10])
    assert.equal(l.textes[1].texte, '2.54')
  })
  test('nettoyage MTEXT', () => {
    assert.equal(nettoyerMtext('\\A1;68,1996'), '68,1996')
    assert.equal(nettoyerMtext('{\\H2.5x;\\C1;Couloir}'), 'Couloir')
    assert.equal(nettoyerMtext('Hauteur\\~2,50\\U+00B2'), 'Hauteur 2,50²')
  })
  test('décodage : Windows-1252 avant AC1021, UTF-8 ensuite', () => {
    const ancien = new Uint8Array([...new TextEncoder().encode('  9\n$ACADVER\n  1\nAC1014\nS=4 m'), 0xb2])
    assert.ok(decoderDxf(ancien).endsWith('S=4 m²'))
    const recent = new TextEncoder().encode('  9\n$ACADVER\n  1\nAC1032\nS=4 m²')
    assert.ok(decoderDxf(recent).endsWith('S=4 m²'))
  })
})
```

- [ ] **Step 2 : échec attendu.**

- [ ] **Step 3 : implémentation**

```js
// ─── Lire un DXF texte, sur l'appareil ───────────────────────────────────────
//
// Rend traits et textes en coordonnées du dessin, blocs déployés : ArchiCAD
// range tout le plan dans des blocs de vues (un par étage et par sorte de
// dessin), le géomètre écrit directement dans l'espace objet. L'espace papier
// porte cadre et cartouche : on ne le lit que si l'espace objet est presque
// vide. Les cotes (DIMENSION), hachures et points sont laissés de côté : ils
// n'aident ni à reconnaître les pièces ni à lire le plan sur la tablette.

const SEGMENTS_CERCLE = 32
const PROFONDEUR_MAX = 12
const MIN_TRAITS_OBJET = 50

export function decoderDxf(octets) {
  const entete = new TextDecoder('latin1').decode(octets.slice(0, 4000))
  const version = entete.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/)
  const utf8 = version ? Number(version[1]) >= 1021 : true
  return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(octets)
}

function lirePaires(texte) {
  const lignes = texte.split(/\r?\n/)
  const paires = []
  for (let i = 0; i + 1 < lignes.length; i += 2) {
    const code = parseInt(lignes[i].trim(), 10)
    if (!Number.isNaN(code)) paires.push([code, lignes[i + 1].replace(/^\s+|\s+$/g, '')])
  }
  return paires
}

function lireSections(paires) {
  const sections = {}
  for (let i = 0; i < paires.length; i++) {
    if (paires[i][0] !== 0 || paires[i][1] !== 'SECTION') continue
    const nom = paires[i + 1]?.[1]
    const debut = i + 2
    let fin = debut
    while (fin < paires.length && !(paires[fin][0] === 0 && paires[fin][1] === 'ENDSEC')) fin++
    sections[nom] = paires.slice(debut, fin)
    i = fin
  }
  return sections
}

function decouperEntites(paires) {
  const entites = []
  let e = null
  for (const [code, valeur] of paires) {
    if (code === 0) { e = { type: valeur, g: [] }; entites.push(e) } else if (e) e.g.push([code, valeur])
  }
  return entites
}

const val = (e, code) => e.g.find(([c]) => c === code)?.[1]
const nombre = (e, code, defaut = 0) => { const v = val(e, code); return v === undefined ? defaut : parseFloat(v) }
const entier = (e, code) => parseInt(val(e, code) ?? '0', 10) || 0
const tous = (e, code) => e.g.filter(([c]) => c === code).map(([, v]) => v)

function lireEntete(paires) {
  let courant = null
  const entete = { version: null, unites: null }
  for (const [code, valeur] of paires) {
    if (code === 9) courant = valeur
    else if (courant === '$ACADVER' && code === 1) entete.version = valeur
    else if (courant === '$INSUNITS' && code === 70) entete.unites = parseInt(valeur, 10)
  }
  return entete
}

function lireBlocs(entites) {
  const blocs = new Map()
  let courant = null
  for (const e of entites) {
    if (e.type === 'BLOCK') {
      courant = { nom: val(e, 2), base: [nombre(e, 10), nombre(e, 20)], entites: [] }
      if (courant.nom) blocs.set(courant.nom, courant)
    } else if (e.type === 'ENDBLK') courant = null
    else if (courant) courant.entites.push(e)
  }
  return blocs
}

// Matrices affines [a, b, c, d, e, f] : x' = a·x + c·y + e ; y' = b·x + d·y + f
const IDENTITE = [1, 0, 0, 1, 0, 0]
const composer = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const appliquer = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const echelleDe = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))

function matriceInsertion(e, base) {
  const r = (nombre(e, 50) * Math.PI) / 180
  const sx = nombre(e, 41, 1)
  const sy = nombre(e, 42, 1)
  const a = Math.cos(r) * sx, b = Math.sin(r) * sx, c = -Math.sin(r) * sy, d = Math.cos(r) * sy
  const px = nombre(e, 10), py = nombre(e, 20)
  return [a, b, c, d, px - a * base[0] - c * base[1], py - b * base[0] - d * base[1]]
}

function pointsArc(e, cercle) {
  const cx = nombre(e, 10), cy = nombre(e, 20), r = nombre(e, 40)
  const debut = cercle ? 0 : nombre(e, 50)
  let fin = cercle ? 360 : nombre(e, 51)
  if (fin <= debut) fin += 360
  const n = Math.max(4, Math.ceil((SEGMENTS_CERCLE * (fin - debut)) / 360))
  const pts = []
  for (let i = 0; i <= (cercle ? n - 1 : n); i++) {
    const a = ((debut + ((fin - debut) * i) / n) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

const decoderUnicode = (s) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
const codesPourcent = (s) => s.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '')

export function nettoyerMtext(brut) {
  return codesPourcent(decoderUnicode(brut))
    .replace(/\\\\/g, '\u0000')
    .replace(/\^J/g, '\n')
    .replace(/\\P/g, '\n')
    .replace(/\\[Ss]([^;]*?)[#^/]([^;]*);/g, '$1/$2')
    .replace(/\\[ACcFfHhQqTtWw][^;\\]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\u0000/g, '\\')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

function deployer(entites, blocs) {
  const traits = []
  const textes = []

  const parcourir = (liste, m, calqueParent, blocRacine, profondeur) => {
    let poly = null
    for (const e of liste) {
      const brut = val(e, 8) ?? '0'
      const calque = brut === '0' && calqueParent ? calqueParent : brut
      switch (e.type) {
        case 'POLYLINE': {
          // Maillages 3D (drapeaux 16 et 64) : sans intérêt pour un plan
          const drapeaux = entier(e, 70)
          poly = drapeaux & 80 ? { ignore: true } : { calque, bloc: blocRacine, ferme: (drapeaux & 1) === 1, pts: [] }
          break
        }
        case 'VERTEX':
          if (poly && !poly.ignore) poly.pts.push(appliquer(m, [nombre(e, 10), nombre(e, 20)]))
          break
        case 'SEQEND':
          if (poly && !poly.ignore && poly.pts.length >= 2) traits.push(poly)
          poly = null
          break
        case 'LINE':
          traits.push({ calque, bloc: blocRacine, ferme: false, pts: [appliquer(m, [nombre(e, 10), nombre(e, 20)]), appliquer(m, [nombre(e, 11), nombre(e, 21)])] })
          break
        case 'LWPOLYLINE': {
          const xs = tous(e, 10), ys = tous(e, 20)
          const pts = xs.map((x, i) => appliquer(m, [parseFloat(x), parseFloat(ys[i])]))
          if (pts.length >= 2) traits.push({ calque, bloc: blocRacine, ferme: (entier(e, 70) & 1) === 1, pts })
          break
        }
        case 'ARC':
        case 'CIRCLE':
          traits.push({ calque, bloc: blocRacine, ferme: e.type === 'CIRCLE', pts: pointsArc(e, e.type === 'CIRCLE').map((p) => appliquer(m, p)) })
          break
        case 'TEXT': {
          const t = codesPourcent(decoderUnicode(val(e, 1) ?? '')).trim()
          const aligne = (entier(e, 72) || entier(e, 73)) && val(e, 11) !== undefined
          const pos = aligne ? [nombre(e, 11), nombre(e, 21)] : [nombre(e, 10), nombre(e, 20)]
          if (t) textes.push({ calque, bloc: blocRacine, texte: t, pos: appliquer(m, pos), hauteur: nombre(e, 40) * echelleDe(m) })
          break
        }
        case 'MTEXT': {
          // Le texte long arrive en morceaux (code 3) avant le dernier (code 1)
          const brutTexte = e.g.filter(([c]) => c === 1 || c === 3).map(([, v]) => v).join('')
          const t = nettoyerMtext(brutTexte)
          if (t) textes.push({ calque, bloc: blocRacine, texte: t, pos: appliquer(m, [nombre(e, 10), nombre(e, 20)]), hauteur: nombre(e, 40) * echelleDe(m) })
          break
        }
        case 'INSERT': {
          const b = blocs.get(val(e, 2))
          if (!b || profondeur >= PROFONDEUR_MAX) break
          parcourir(b.entites, composer(m, matriceInsertion(e, b.base)), calque, blocRacine ?? b.nom, profondeur + 1)
          break
        }
        default:
          break
      }
    }
  }

  parcourir(entites, IDENTITE, null, null, 0)
  return { traits, textes }
}

export function lireDxf(texte) {
  const sections = lireSections(lirePaires(texte))
  const entete = lireEntete(sections.HEADER ?? [])
  const blocs = lireBlocs(decouperEntites(sections.BLOCKS ?? []))
  const entites = decouperEntites(sections.ENTITIES ?? [])
  const objet = deployer(entites.filter((e) => val(e, 67) !== '1'), blocs)
  if (objet.traits.length >= MIN_TRAITS_OBJET) return { ...entete, ...objet }
  const papier = deployer(entites.filter((e) => val(e, 67) === '1'), blocs)
  return { ...entete, traits: [...objet.traits, ...papier.traits], textes: [...objet.textes, ...papier.textes] }
}
```

Note : les attributs (`ATTRIB`) des blocs sont ignorés (`default`).

- [ ] **Step 4 : succès attendu.**
- [ ] **Step 5 : commit** `feat: état des lieux — lecture des DXF (blocs déployés, textes nettoyés)`.

---

### Task 5 : Pièces lues dans un DXF

**Files:**
- Create: `src/modules/etude/etat-des-lieux/piecesDxfLogique.js`
- Modify: `tests/etat-des-lieux.test.js`

**Interfaces:**
- Consumes : `lireDxf` (Task 4), `aire`, `pointDansPolygone`, `boite`, `dansBoite`, `mediane` (Task 3).
- Produces : `detecterPieces({ traits, textes }) → { calque: string|null, unitesParMetre: number|null, pieces: [{ nom, numero, surfaceLue, hspLue, calque, bloc, contour (m) }] }` ; `lireSurface(texte, { seulAccepte })`, `lireHsp(texte)`, `lireNumero(texte)`, `estNom(texte)`, `arrondirUnite(u)`.

- [ ] **Step 1 : tests**

```js
import { detecterPieces, lireSurface, lireHsp, lireNumero, estNom } from '../src/modules/etude/etat-des-lieux/piecesDxfLogique.js'

const rect = (calque, x, y, l, h) => ({ calque, bloc: null, ferme: true, pts: [[x, y], [x + l, y], [x + l, y + h], [x, y + h]] })
const txt = (calque, x, y, texte) => ({ calque, bloc: null, texte, pos: [x, y], hauteur: 0.2 })

describe('pièces d’un DXF', () => {
  test('textes : surface, hauteur sous plafond (HP, pas Hp ni HSP), numéro, nom', () => {
    assert.equal(lireSurface('Pièce\nS=22.9 m²\nHP:2.47 m'), 22.9)
    assert.equal(lireSurface('Salon\nS=16.0 m carrés'), 16)
    assert.equal(lireSurface('4.40'), 4.4)
    assert.equal(lireSurface('4.40', { seulAccepte: false }), null)
    assert.equal(lireSurface('2.54 m'), null)
    assert.equal(lireHsp('Pièce\nS=22.9 m²\nHP:2.47 m'), 2.47)
    assert.equal(lireHsp('Hp:2.10'), null)
    assert.equal(lireHsp('HSP:2.49m'), null)
    assert.equal(lireNumero('0001'), '0001')
    assert.equal(lireNumero('ET008'), 'ET008')
    assert.equal(lireNumero('Chambre'), null)
    assert.equal(estNom('Ch. 1 lit'), true)
    assert.equal(estNom('SU'), false)
    assert.equal(estNom('02_RDC'), false)
    assert.equal(estNom('S=4.0 m²'), false)
  })

  test('plan de géomètre (mètres) : calque des pièces trouvé, contour englobant écarté, cote ignorée', () => {
    const traits = [
      rect('PIECES', 0, 0, 4, 5), rect('PIECES', 4, 0, 3, 3), rect('PIECES', 4, 3, 2, 4),
      rect('PIECES', -1, -1, 9, 9), // contour du bâtiment : aucun texte à lui
      rect('MOBILIER', 0.5, 0.5, 1, 1),
    ]
    const textes = [
      txt('TEXTE', 2, 2.5, 'Salon\nS=20.0 m²\nHP:2.50 m'),
      txt('COTES', 1, 1, '4.00'),
      txt('TEXTE', 5.5, 1.5, 'Cuisine\nS=9.0 m²\nHP:2.40 m'),
      txt('TEXTE', 5, 5, 'Bains\nS=8.0 m²'),
    ]
    const r = detecterPieces({ traits, textes })
    assert.equal(r.calque, 'PIECES')
    assert.equal(r.unitesParMetre, 1)
    assert.deepEqual(r.pieces.map((p) => [p.nom, p.surfaceLue, p.hspLue]), [['Salon', 20, 2.5], ['Cuisine', 9, 2.4], ['Bains', 8, null]])
  })

  test('zones d’ArchiCAD (centimètres) : tampon de zone, unité déduite, contour converti en mètres', () => {
    const traits = [rect('S-SURFACES_RDC', 0, 0, 400, 500), rect('S-SURFACES_RDC', 400, 0, 300, 300), rect('S-SURFACES_RDC', 400, 300, 200, 400)]
    const tampon = (x, y, numero, nom, surface) => ['02_RDC', 'SU', numero, nom, surface].map((t, i) => txt('S-SURFACES_RDC', x, y - i * 10, t))
    const textes = [...tampon(200, 250, '0001', 'Chambre', '20.00'), ...tampon(550, 150, '0002', 'Bureau', '9.00'), ...tampon(500, 500, '0003', 'Douche', '8.00')]
    const r = detecterPieces({ traits, textes })
    assert.equal(r.unitesParMetre, 100)
    assert.deepEqual(r.pieces[0], { nom: 'Chambre', numero: '0001', surfaceLue: 20, hspLue: null, calque: 'S-SURFACES_RDC', bloc: null, contour: [[0, 0], [4, 0], [4, 5], [0, 5]] })
  })

  test('une pièce dont la surface s’écarte reste, les autres fixent l’unité', () => {
    const traits = [rect('P', 0, 0, 4, 5), rect('P', 4, 0, 3, 3), rect('P', 4, 3, 2, 4), rect('P', 10, 0, 2, 2)]
    const textes = [txt('T', 2, 2, 'A\nS=20 m²'), txt('T', 5, 1, 'B\nS=9 m²'), txt('T', 5, 5, 'C\nS=8 m²'), txt('T', 11, 1, 'D\nS=6 m²')]
    const r = detecterPieces({ traits, textes })
    assert.equal(r.unitesParMetre, 1)
    assert.equal(r.pieces.length, 4)
  })

  test('aucun calque de pièces : rien de proposé', () => {
    const r = detecterPieces({ traits: [rect('MURS', 0, 0, 1, 1)], textes: [] })
    assert.deepEqual(r, { calque: null, unitesParMetre: null, pieces: [] })
  })
})
```

- [ ] **Step 2 : échec attendu.**

- [ ] **Step 3 : implémentation**

```js
// ─── Les pièces dessinées dans un DXF ────────────────────────────────────────
//
// On ne reconstruit pas les pièces à partir des murs (plans plus ou moins
// précis : trop fragile). Les plans de l'agence portent déjà leurs contours :
// zones d'ArchiCAD, calque des pièces du géomètre. Le bon calque est celui
// dont les polylignes fermées contiennent une surface écrite qui correspond à
// la surface dessinée — le rapport des deux donne en plus l'unité du dessin
// (m, cm, mm). Aucune IA ici.

import { aire, pointDansPolygone, boite, dansBoite, mediane } from './geometrieEdl'

const TOLERANCE_RAPPORT = 0.1
const MIN_PIECES = 3
// Unités par mètre : m, dm, cm, mm, pouce, pied
const UNITES_CONNUES = [1, 10, 100, 1000, 39.37007874, 3.280839895]

const nombre = (s) => parseFloat(s.replace(',', '.'))
const premiereLigne = (t) => t.split('\n')[0].trim()

/**
 * Surface écrite dans un texte. « S=22.9 m² » ou « 16.0 m carrés » partout ;
 * un nombre seul (« 4.40 », tampon de zone ArchiCAD) seulement si
 * `seulAccepte` — sinon une cote prise dans la pièce passerait pour sa surface.
 */
export function lireSurface(texte, { seulAccepte = true } = {}) {
  const ecrite = texte.match(/\bS\s*=\s*(\d+(?:[.,]\d+)?)/i) ?? texte.match(/(\d+(?:[.,]\d+)?)\s*m\s*(?:²|2(?!\d)|carr)/i)
  if (ecrite) return nombre(ecrite[1])
  if (!seulAccepte) return null
  const seul = texte.trim().match(/^(\d{1,4}[.,]\d{1,2})$/)
  return seul ? nombre(seul[1]) : null
}

// « HP » du géomètre = hauteur sous plafond ; « Hp » (sous porte) et « HSP »
// (sous poutre) n'en sont pas : la casse compte
export function lireHsp(texte) {
  const m = texte.match(/\bHP\s*[:=]\s*(\d+(?:[.,]\d+)?)/)
  return m ? nombre(m[1]) : null
}

export function lireNumero(texte) {
  const t = texte.trim()
  return /^[A-Z]{0,3}\d{2,5}[A-Z]?$/.test(t) ? t : null
}

export function estNom(texte) {
  const premiere = premiereLigne(texte)
  if (!premiere || premiere.includes('_')) return false // « 02_RDC » : code de niveau ArchiCAD
  if (/^(S\s*=|HP\b|HSP\b|Hp\b|Hf\b)/.test(premiere)) return false
  return (premiere.match(/\p{L}/gu) ?? []).length >= 3
}

export function arrondirUnite(u) {
  for (const c of UNITES_CONNUES) if (Math.abs(u / c - 1) < 0.02) return c
  return u
}

// Chaque texte va au plus petit contour qui le contient : le contour du
// bâtiment, dessiné sur le même calque, ne vole pas le nom des pièces
function textesParPolygone(polys, textes) {
  const boites = polys.map((p) => boite(p.pts))
  const aires = polys.map((p) => aire(p.pts))
  const propres = polys.map(() => [])
  for (const t of textes) {
    let choisi = -1
    for (let i = 0; i < polys.length; i++) {
      if (!dansBoite(t.pos, boites[i]) || !pointDansPolygone(t.pos, polys[i].pts)) continue
      if (choisi < 0 || aires[i] < aires[choisi]) choisi = i
    }
    if (choisi >= 0) propres[choisi].push(t)
  }
  return propres
}

function lirePiece(poly, propres) {
  const memeCalque = propres.filter((t) => t.calque === poly.calque)
  const sources = memeCalque.length ? memeCalque : propres
  let surfaceLue = null, hspLue = null, numero = null, nom = ''
  for (const t of sources) {
    surfaceLue ??= lireSurface(t.texte, { seulAccepte: memeCalque.length > 0 })
    hspLue ??= lireHsp(t.texte)
    numero ??= lireNumero(t.texte)
    if (!nom && estNom(t.texte)) nom = premiereLigne(t.texte)
  }
  return { nom, numero, surfaceLue, hspLue }
}

export function detecterPieces({ traits, textes }) {
  const parCalque = new Map()
  for (const t of traits) {
    if (!t.ferme || t.pts.length < 3) continue
    if (!parCalque.has(t.calque)) parCalque.set(t.calque, [])
    parCalque.get(t.calque).push(t)
  }

  let meilleur = null
  for (const [calque, polys] of parCalque) {
    if (polys.length < MIN_PIECES) continue
    const propres = textesParPolygone(polys, textes)
    const lues = polys.map((poly, i) => ({ poly, nbTextes: propres[i].length, aireBrute: aire(poly.pts), ...lirePiece(poly, propres[i]) }))
    const rapports = lues.filter((l) => l.surfaceLue > 0).map((l) => l.aireBrute / l.surfaceLue)
    if (rapports.length < MIN_PIECES) continue
    const med = mediane(rapports)
    const accord = rapports.filter((r) => Math.abs(r / med - 1) <= TOLERANCE_RAPPORT).length
    if (accord < MIN_PIECES || accord < rapports.length / 2) continue
    if (!meilleur || accord > meilleur.accord) meilleur = { calque, lues, med, accord }
  }
  if (!meilleur) return { calque: null, unitesParMetre: null, pieces: [] }

  const u = arrondirUnite(Math.sqrt(meilleur.med))
  const pieces = meilleur.lues
    .filter((l) => l.nbTextes > 0 && (l.nom || l.surfaceLue || l.numero))
    .map((l) => ({
      nom: l.nom, numero: l.numero, surfaceLue: l.surfaceLue, hspLue: l.hspLue,
      calque: l.poly.calque, bloc: l.poly.bloc ?? null,
      contour: l.poly.pts.map(([x, y]) => [x / u, y / u]),
    }))
  return { calque: meilleur.calque, unitesParMetre: u, pieces }
}
```

- [ ] **Step 4 : succès attendu.** Si le test « zones d'ArchiCAD » échoue sur `contour`, vérifier que la division `x / u` donne des entiers exacts (400 / 100) — elle les donne.
- [ ] **Step 5 : commit** `feat: état des lieux — pièces lues dans le DXF (calque, unité, tampons)`.

---

### Task 6 : Étages proposés

**Files:**
- Create: `src/modules/etude/etat-des-lieux/niveauxLogique.js`
- Modify: `tests/etat-des-lieux.test.js`

**Interfaces:**
- Consumes : `boite`, `dansBoite`, `centre`, `aire` (Task 3) ; sortie de `lireDxf` et de `detecterPieces`.
- Produces : `niveauDeNom(nom) → { cle, nom, ordre } | null` ; `uniteParDefaut(lecture) → number` ; `grappes(traits, cellule) → traits[][]` ; `proposerNiveaux(lecture, detection, unitesParMetre, nomFichier) → [{ nom, traits (m), textes (m), pieces, boite (m), aProposer }]`.

- [ ] **Step 1 : tests**

```js
import { niveauDeNom, uniteParDefaut, proposerNiveaux } from '../src/modules/etude/etat-des-lieux/niveauxLogique.js'

describe('étages', () => {
  test('niveau reconnu au nom d’un calque ou d’un bloc', () => {
    assert.equal(niveauDeNom('S-SURFACES_RDC').cle, 'RDC')
    assert.equal(niveauDeNom('----_RDC_PRO_----__2D_').cle, 'RDC')
    assert.equal(niveauDeNom('----_SSOL_EDL_----__3D_').cle, 'SS')
    assert.equal(niveauDeNom('M-SOUS-SOL').nom, 'Sous-sol')
    assert.equal(niveauDeNom('Plan R+1').cle, 'R+1')
    assert.equal(niveauDeNom('2EME ETAGE').cle, 'R+2')
    assert.equal(niveauDeNom('Combles').cle, 'COMBLES')
    assert.equal(niveauDeNom('24073-RDC.dxf').cle, 'RDC')
    assert.equal(niveauDeNom('PARS'), null)
    assert.equal(niveauDeNom('00_MURS'), null)
    assert.equal(niveauDeNom(null), null)
  })

  test('unité par défaut : $INSUNITS, sinon d’après la taille du dessin', () => {
    assert.equal(uniteParDefaut({ unites: 4, traits: [] }), 1000)
    assert.equal(uniteParDefaut({ unites: 5, traits: [] }), 100)
    const dessin = (pas) => ({ unites: null, traits: [{ pts: Array.from({ length: 21 }, (_, i) => [i * pas, i * pas]) }] })
    assert.equal(uniteParDefaut(dessin(150)), 100) // 30 m dessinés en centimètres
    assert.equal(uniteParDefaut(dessin(1.5)), 1)
  })

  // Traits qui partent tous du même coin : une seule grappe par dessin
  const traitsDe = (bloc, calque, n, dx = 0) => Array.from({ length: n }, (_, i) => ({ calque, bloc, ferme: false, pts: [[dx, 0], [dx + 59, i * 0.25]] }))

  test('étages superposés (ArchiCAD) : séparés par le nom des blocs, sous-sol d’abord', () => {
    const lecture = { traits: [...traitsDe('VUE_RDC', 'M-RDC', 60), ...traitsDe('VUE_SSOL', 'M-SOUS-SOL', 60), ...traitsDe('GROUPE-1', 'GENERAL', 3)], textes: [{ calque: 'P', bloc: 'VUE_SSOL', texte: 'LOCAL', pos: [1, 1], hauteur: 1 }] }
    const piece = { nom: 'Chambre', calque: 'S-SURFACES_RDC', bloc: 'VUE_RDC', contour: [[0, 0], [1, 0], [1, 1]] }
    const n = proposerNiveaux(lecture, { pieces: [piece] }, 1, 'plan.dxf')
    assert.deepEqual(n.map((x) => [x.nom, x.traits.length, x.pieces.length, x.aProposer]), [['Sous-sol', 60, 0, true], ['Rez-de-chaussée', 60, 1, false]])
    assert.equal(n[0].textes[0].texte, 'LOCAL')
  })

  test('un seul étage parmi d’autres dessins (géomètre) : la grappe qui porte les pièces, nommée d’après le fichier', () => {
    const batiment = traitsDe(null, 'MURS', 60, 0)
    const ailleurs = traitsDe(null, 'CADRE', 60, 10_000)
    const piece = { nom: 'Salon', calque: 'PIECES', bloc: null, contour: [[1, 1], [5, 1], [5, 5], [1, 5]] }
    const n = proposerNiveaux({ traits: [...batiment, ...ailleurs], textes: [] }, { pieces: [piece] }, 1, '24073-RDC.dxf')
    assert.equal(n.length, 1)
    assert.equal(n[0].nom, 'Rez-de-chaussée')
    assert.equal(n[0].traits.length, 60)
    assert.deepEqual(n[0].boite, [0, 0, 59, 14.75])
  })

  test('mise en mètres des traits, textes et boîte', () => {
    const lecture = { traits: traitsDe(null, 'MURS', 60).map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x * 100, y * 100]) })), textes: [] }
    const n = proposerNiveaux(lecture, { pieces: [] }, 100, 'x.dxf')
    assert.deepEqual(n[0].traits[1].pts, [[0, 0], [59, 0.25]])
    assert.equal(n[0].nom, 'Niveau 1')
    assert.equal(n[0].aProposer, true)
  })
})
```

- [ ] **Step 2 : échec attendu.**

- [ ] **Step 3 : implémentation**

```js
// ─── Les étages d'un DXF ─────────────────────────────────────────────────────
//
// ArchiCAD superpose les étages au même endroit (le sous-sol sous le rez-de-
// chaussée) : on les distingue par le nom des blocs de vues et des calques
// (« ----_SSOL_EDL_----__3D_ », « M-RDC »). Faute de noms, un fichier de
// géomètre mêle le bâtiment à d'autres dessins (plan de division, cartouche) :
// on regroupe les traits proches, et l'étage est la grappe qui porte les
// pièces. L'utilisateur relit, renomme ou écarte avant l'import.

import { boite, dansBoite, centre } from './geometrieEdl'

const MIN_TRAITS_NIVEAU = 50
const CELLULES_MAX_PAR_TRAIT = 4000

const normaliser = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export function niveauDeNom(nom) {
  const n = normaliser(nom)
  if (!n) return null
  if (/SOUS[-_ ]?SOL|(^|[^A-Z])S[-_]SOL|(^|[^A-Z])SSOL([^A-Z]|$)/.test(n)) return { cle: 'SS', nom: 'Sous-sol', ordre: -1 }
  if (/(^|[^A-Z])RDC([^A-Z]|$)|REZ[-_ ]?DE[-_ ]?CHAUSSEE/.test(n)) return { cle: 'RDC', nom: 'Rez-de-chaussée', ordre: 0 }
  const etage = n.match(/R\s*\+\s*(\d)/) ?? n.match(/ETAGE[-_ ]?(\d)/) ?? n.match(/(\d)\s*(?:ER|EME|E)[-_ ]?ETAGE/)
  if (etage) return { cle: `R+${etage[1]}`, nom: `R+${etage[1]}`, ordre: Number(etage[1]) }
  if (/COMBLES?/.test(n)) return { cle: 'COMBLES', nom: 'Combles', ordre: 50 }
  return null
}

const PAR_CODE = { 1: 39.37007874, 2: 3.280839895, 4: 1000, 5: 100, 6: 1 }

export function uniteParDefaut(lecture) {
  if (PAR_CODE[lecture.unites]) return PAR_CODE[lecture.unites]
  const xs = [], ys = []
  for (const t of lecture.traits) for (const [x, y] of t.pts) { xs.push(x); ys.push(y) }
  if (!xs.length) return 1
  const quantile = (a, f) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(f * (s.length - 1))] }
  const etendue = Math.max(quantile(xs, 0.95) - quantile(xs, 0.05), quantile(ys, 0.95) - quantile(ys, 0.05))
  if (etendue > 50_000) return 1000
  if (etendue > 500) return 100
  return 1
}

export function grappes(traits, cellule) {
  const parent = traits.map((_, i) => i)
  const racine = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const grille = new Map()
  traits.forEach((t, i) => {
    const [x0, y0, x1, y1] = boite(t.pts)
    const cx0 = Math.floor(x0 / cellule), cx1 = Math.floor(x1 / cellule)
    const cy0 = Math.floor(y0 / cellule), cy1 = Math.floor(y1 / cellule)
    // Un grand cadre relierait tout ce qu'il entoure
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > CELLULES_MAX_PAR_TRAIT) return
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cle = `${cx},${cy}`
        const autre = grille.get(cle)
        if (autre === undefined) grille.set(cle, i)
        else parent[racine(i)] = racine(autre)
      }
    }
  })
  const groupes = new Map()
  traits.forEach((t, i) => {
    const r = racine(i)
    if (!groupes.has(r)) groupes.set(r, [])
    groupes.get(r).push(t)
  })
  return [...groupes.values()]
}

const surfaceBoite = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0)

export function proposerNiveaux(lecture, detection, unitesParMetre, nomFichier = '') {
  const u = unitesParMetre
  const tagDe = (el) => niveauDeNom(el.bloc) ?? niveauDeNom(el.calque)

  const parCle = new Map()
  for (const t of lecture.traits) {
    const n = tagDe(t)
    if (!n) continue
    if (!parCle.has(n.cle)) parCle.set(n.cle, { ...n, traits: [] })
    parCle.get(n.cle).traits.push(t)
  }
  const seuil = Math.max(MIN_TRAITS_NIVEAU, lecture.traits.length * 0.01)
  const parNom = [...parCle.values()].filter((g) => g.traits.length >= seuil).sort((a, b) => a.ordre - b.ordre)

  let niveaux
  if (parNom.length >= 2) {
    niveaux = parNom.map((g) => ({
      nom: g.nom,
      traits: g.traits,
      textes: lecture.textes.filter((t) => tagDe(t)?.cle === g.cle),
      pieces: detection.pieces.filter((p) => tagDe(p)?.cle === g.cle),
    }))
  } else {
    const groupes = grappes(lecture.traits, u).map((traits) => ({ traits, boite: boite(traits.flatMap((t) => t.pts)), pieces: [] }))
    // Une pièce va à la plus petite grappe qui la contient
    for (const p of detection.pieces) {
      const c = centre(p.contour).map((v) => v * u)
      const candidats = groupes.filter((g) => dansBoite(c, g.boite))
      if (candidats.length) candidats.reduce((a, b) => (surfaceBoite(b.boite) < surfaceBoite(a.boite) ? b : a)).pieces.push(p)
    }
    let retenus = groupes.filter((g) => g.pieces.length > 0)
    if (!retenus.length) retenus = groupes.filter((g) => g.traits.length >= lecture.traits.length * 0.1).slice(0, 6)
    retenus.sort((a, b) => b.boite[3] - a.boite[3])
    const nomFichierNiveau = niveauDeNom(nomFichier)?.nom
    niveaux = retenus.map((g, i) => ({
      nom: retenus.length === 1 ? (nomFichierNiveau ?? 'Niveau 1') : `Niveau ${i + 1}`,
      traits: g.traits,
      textes: lecture.textes.filter((t) => dansBoite(t.pos, g.boite)),
      pieces: g.pieces,
    }))
  }

  return niveaux.map((n) => {
    const traits = n.traits.map((t) => ({ calque: t.calque, ferme: t.ferme, pts: t.pts.map(([x, y]) => [x / u, y / u]) }))
    return {
      nom: n.nom,
      traits,
      textes: n.textes.map((t) => ({ texte: t.texte, hauteur: t.hauteur / u, pos: [t.pos[0] / u, t.pos[1] / u] })),
      pieces: n.pieces,
      boite: boite(traits.flatMap((t) => t.pts)),
      aProposer: n.pieces.length === 0,
    }
  })
}
```

- [ ] **Step 4 : succès attendu.**

- [ ] **Step 5 : vérification sur les deux plans réels (hors dépôt, rien n'est commité)**

Script de vérification hors dépôt (dans `$TMPDIR`), lancé depuis la racine du dépôt :

```bash
cat > "$TMPDIR/verif-dxf.mjs" <<'EOF'
import fs from 'node:fs'
import path from 'node:path'
const racine = process.cwd()
const { decoderDxf, lireDxf } = await import(path.join(racine, 'src/modules/etude/etat-des-lieux/dxfLecture.js'))
const { detecterPieces } = await import(path.join(racine, 'src/modules/etude/etat-des-lieux/piecesDxfLogique.js'))
const { proposerNiveaux, uniteParDefaut } = await import(path.join(racine, 'src/modules/etude/etat-des-lieux/niveauxLogique.js'))
const { aire } = await import(path.join(racine, 'src/modules/etude/etat-des-lieux/geometrieEdl.js'))
for (const f of process.argv.slice(2)) {
  const lecture = lireDxf(decoderDxf(new Uint8Array(fs.readFileSync(f))))
  const det = detecterPieces(lecture)
  const u = det.unitesParMetre ?? uniteParDefaut(lecture)
  const niveaux = proposerNiveaux(lecture, det, u, path.basename(f))
  const ecarts = det.pieces.filter((p) => p.surfaceLue && Math.abs(aire(p.contour) / p.surfaceLue - 1) > 0.05).length
  console.log(path.basename(f), { traits: lecture.traits.length, calque: det.calque, u, pieces: det.pieces.length, ecarts })
  for (const n of niveaux) console.log('   ', n.nom, { traits: n.traits.length, pieces: n.pieces.length, aProposer: n.aProposer, boite: n.boite.map((v) => Math.round(v)) })
  console.log('    exemples :', det.pieces.slice(0, 4).map((p) => `${p.numero ?? ''} ${p.nom} ${p.surfaceLue ?? ''} m² HP ${p.hspLue ?? '-'}`))
}
EOF
node --import ./tests/resolve-src.mjs "$TMPDIR/verif-dxf.mjs" ~/Desktop/PERSO/"Exemples dxf"/*.dxf
```

Expected (ordres de grandeur constatés à la conception) :
- `24073-RDC.dxf` : calque `00_PIÈCE`, `u` = 1, environ 18 à 22 pièces (Salon 16 m², Pièce 46,1 m²…), quelques HP lus, **un** niveau « Rez-de-chaussée », pas à proposer.
- `Batiment 3 sous sol RDC 100°.dxf` : calque `S-SURFACES_RDC`, `u` = 100, environ 200 pièces, **deux** niveaux : « Sous-sol » (0 pièce, `aProposer: true`) puis « Rez-de-chaussée » (≈ 200 pièces).

Si un résultat diffère : corriger la logique **et** ajouter au test de la task concernée un cas inventé qui reproduit l'écart (sans données réelles), puis relancer `npm test`.

- [ ] **Step 6 : commit** `feat: état des lieux — étages proposés (noms des blocs et calques, sinon grappes)`.

---

### Task 7 : PDF — échelle et dessin vectoriel

**Files:**
- Create: `src/modules/etude/etat-des-lieux/pdfPlanLogique.js`
- Modify: `tests/etat-des-lieux.test.js`

**Interfaces:**
- Produces : `lireEchelle(textes: string[]) → number | null`, `METRES_PAR_POINT`, `metresParPoint(echelle)`, `MIN_CHEMINS_VECTORIELS = 30`, `compterChemins(fnArray, OPS)`, `estVectoriel(fnArray, OPS)`.

- [ ] **Step 1 : tests**

```js
import { lireEchelle, metresParPoint, estVectoriel } from '../src/modules/etude/etat-des-lieux/pdfPlanLogique.js'

describe('PDF', () => {
  test('échelle lue dans le cartouche', () => {
    assert.equal(lireEchelle(['Document créé le 23/01/26', 'Echelle:1/100°']), 100)
    assert.equal(lireEchelle(['ÉCHELLE : 1 / 50']), 50)
    assert.equal(lireEchelle(['PLAN DU RDC']), null)
  })
  test('un point du papier au 1/100 vaut 3,53 cm', () => {
    assert.ok(Math.abs(metresParPoint(100) - 0.035278) < 1e-5)
  })
  test('vectoriel : au moins 30 chemins dessinés', () => {
    const OPS = { constructPath: 91, paintImageXObject: 85 }
    assert.equal(estVectoriel(Array(30).fill(91), OPS), true)
    assert.equal(estVectoriel([85, 91], OPS), false)
  })
})
```

- [ ] **Step 2 : échec attendu.**

- [ ] **Step 3 : implémentation**

```js
// ─── Un plan en PDF ──────────────────────────────────────────────────────────
//
// Un PDF vectorisé est dessiné au papier : 1 point = 1/72 de pouce. À
// l'échelle du cartouche (« Echelle:1/100° »), on sait combien de mètres vaut
// un point. Un PDF sans chemins dessinés est un scan : refusé (pas de pièces
// fiables, pas d'export DXF possible).

export function lireEchelle(textes) {
  for (const t of textes) {
    const m = String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/ECHELLE\s*:?\s*1\s*\/\s*(\d{1,4})/)
    if (m) return Number(m[1])
  }
  return null
}

export const METRES_PAR_POINT = 0.0254 / 72
export const metresParPoint = (echelle) => METRES_PAR_POINT * echelle

export const MIN_CHEMINS_VECTORIELS = 30

export function compterChemins(fnArray, OPS) {
  let n = 0
  for (const f of fnArray) if (f === OPS.constructPath) n++
  return n
}

export const estVectoriel = (fnArray, OPS) => compterChemins(fnArray, OPS) >= MIN_CHEMINS_VECTORIELS
```

- [ ] **Step 4 : succès attendu.** — **Step 5 : commit** `feat: état des lieux — échelle et dessin vectoriel d'un PDF`.

---

### Task 8 : Demande à Claude et fonction serveur

**Files:**
- Create: `src/modules/etude/etat-des-lieux/piecesIaLogique.js`
- Create: `api/edl-pieces.js`
- Create: `src/modules/etude/etat-des-lieux/piecesIa.js`
- Modify: `vercel.json`, `package.json` (dépendance), `tests/etat-des-lieux.test.js`

**Interfaces:**
- Consumes : `aire` (Task 3).
- Produces : `MODELE_PIECES = 'claude-opus-5-5'`, `TAILLE_IMAGE_IA = 2000`, `TEXTES_MAX = 800`, `SCHEMA_PIECES`, `CONSIGNES_PIECES`, `construireDemandePieces({ image, largeur, hauteur, textes: [{ texte, x, y }], niveauUnique }) → { system, messages, output_config }`, `lirePropositionsPieces(resultat, { largeur, hauteur }) → { niveaux: [{ nom, cadre }], pieces: [{ niveau, nom, numero, surface, contour }] }` (pixels de l'image envoyée), `versPiecesEdl(pieces, convertir) → [{ nom, numero, surfaceLue, hspLue: null, contour, origine: 'ia', aVerifier: true }]`. Navigateur : `proposerPiecesIa(demande) → Promise<{ niveaux, pieces }>`, classe `ErreurPiecesIa(code, message)`.

- [ ] **Step 1 : tests**

```js
import { construireDemandePieces, lirePropositionsPieces, versPiecesEdl, SCHEMA_PIECES, TEXTES_MAX } from '../src/modules/etude/etat-des-lieux/piecesIaLogique.js'

describe('demande à Claude', () => {
  test('image puis textes positionnés, schéma imposé', () => {
    const textes = Array.from({ length: TEXTES_MAX + 5 }, (_, i) => ({ texte: `T${i}  x`, x: i + 0.4, y: 2 }))
    const d = construireDemandePieces({ image: 'QUJD', largeur: 2000, hauteur: 1400, textes, niveauUnique: true })
    assert.equal(d.messages[0].content[0].type, 'image')
    assert.equal(d.messages[0].content[0].source.media_type, 'image/jpeg')
    const texte = d.messages[0].content[1].text
    assert.match(texte, /2000 × 1400/)
    assert.match(texte, /un seul étage/)
    assert.match(texte, /\n0\t2\tT0 x/)
    assert.equal(texte.split('\n').filter((l) => /^\d+\t/.test(l)).length, TEXTES_MAX)
    assert.equal(d.output_config.format.schema, SCHEMA_PIECES)
  })
  test('réponse relue : bornée à l’image, contours trop petits écartés, niveau par défaut', () => {
    const r = lirePropositionsPieces({
      niveaux: [],
      pieces: [
        { niveau: 3, nom: ' Cuisine ', numero: '', surface: 0, contour: [[-5, 0], [100, 0], [100, 80], [0, 80]] },
        { niveau: 0, nom: 'Miette', numero: '', surface: 0, contour: [[0, 0], [1, 0], [1, 1]] },
        { niveau: 0, nom: 'Ligne', numero: '', surface: 0, contour: [[0, 0], [5, 5]] },
      ],
    }, { largeur: 1000, hauteur: 800 })
    assert.deepEqual(r.niveaux, [{ nom: 'Niveau 1', cadre: [0, 0, 1000, 800] }])
    assert.deepEqual(r.pieces, [{ niveau: 0, nom: 'Cuisine', numero: null, surface: null, contour: [[0, 0], [100, 0], [100, 80], [0, 80]] }])
  })
  test('pièces converties en mètres, marquées à vérifier', () => {
    const [p] = versPiecesEdl([{ niveau: 0, nom: 'Salon', numero: '0004', surface: 12.5, contour: [[0, 0], [10, 0], [10, 10]] }], ([x, y]) => [x / 10, y / 10 + 1])
    assert.deepEqual(p, { nom: 'Salon', numero: '0004', surfaceLue: 12.5, hspLue: null, contour: [[0, 1], [1, 1], [1, 2]], origine: 'ia', aVerifier: true })
  })
})
```

- [ ] **Step 2 : échec attendu.**

- [ ] **Step 3 : logique pure** (`piecesIaLogique.js` ; importée aussi par `api/` : imports **avec** l'extension `.js`)

```js
// ─── Faire proposer les pièces par Claude ────────────────────────────────────
//
// Pour un PDF, ou un étage de DXF sans contours de pièces (le sous-sol d'un
// plan ArchiCAD sans zones) : Claude reçoit l'image de l'étage et les textes
// du plan à leur position exacte, et propose étages et contours. Moins précis
// que des contours dessinés : les pièces arrivent « à vérifier » et
// l'utilisateur les corrige avant la visite. Fichier partagé avec la fonction
// serveur api/edl-pieces.js : les consignes et le schéma ne se décident pas
// dans le navigateur.

import { aire } from './geometrieEdl.js'

export const MODELE_PIECES = 'claude-opus-5-5'
export const TAILLE_IMAGE_IA = 2000
export const TEXTES_MAX = 800

const sommets = { type: 'array', items: { type: 'array', items: { type: 'number' } } }

export const SCHEMA_PIECES = {
  type: 'object',
  additionalProperties: false,
  required: ['niveaux', 'pieces'],
  properties: {
    niveaux: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'cadre'],
        properties: { nom: { type: 'string' }, cadre: { type: 'array', items: { type: 'number' } } },
      },
    },
    pieces: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['niveau', 'nom', 'numero', 'surface', 'contour'],
        properties: {
          niveau: { type: 'integer' }, nom: { type: 'string' }, numero: { type: 'string' },
          surface: { type: 'number' }, contour: sommets,
        },
      },
    },
  },
}

export const CONSIGNES_PIECES = `Tu reçois l'image d'un plan d'architecte d'un bâtiment existant (vue en plan) et la liste des textes du plan avec leur position en pixels dans l'image (origine en haut à gauche, x vers la droite, y vers le bas).

Ta tâche : repérer les étages dessinés et le contour de chaque pièce, pour un état des lieux.

Règles :
- Un niveau = un étage dessiné. « cadre » = [x0, y0, x1, y1] en pixels : le rectangle qui contient tout l'étage, sans le cartouche ni la légende. Nomme l'étage d'après le plan (« Rez-de-chaussée », « Sous-sol », « R+1 »…).
- Une pièce = un espace fermé par des murs ou des cloisons. Son nom est écrit dedans (« CHAMBRE 14 », « Cuisine ») ; un numéro et une surface l'accompagnent parfois.
- « contour » : les sommets du contour intérieur de la pièce, dans l'ordre, en pixels de l'image. Quatre sommets pour une pièce rectangulaire, davantage pour une pièce en L ou biaise. Le contour suit la face intérieure des murs, sans déborder sur la pièce voisine.
- Sers-toi de la position des textes : le nom d'une pièce est à l'intérieur de son contour.
- Ne crée pas de pièce sans nom, sauf un espace fermé évident (nom vide alors).
- « niveau » : indice (0, 1…) de l'étage dans « niveaux ». « numero » : le numéro écrit, sinon "". « surface » : la surface écrite en m², sinon 0.
- Réponds uniquement par le JSON demandé.`

export function construireDemandePieces({ image, largeur, hauteur, textes = [], niveauUnique = false }) {
  const lignes = textes
    .filter((t) => String(t.texte ?? '').trim())
    .slice(0, TEXTES_MAX)
    .map((t) => `${Math.round(t.x)}\t${Math.round(t.y)}\t${String(t.texte).replace(/\s+/g, ' ').trim()}`)
  const consigne = [
    `Image : ${largeur} × ${hauteur} pixels.`,
    niveauUnique
      ? 'Cette image ne montre qu’un seul étage : un seul niveau, dont le cadre est toute l’image.'
      : 'L’image peut montrer plusieurs étages : un niveau par étage dessiné.',
    `Textes du plan (x, y, texte) — ${lignes.length} :`,
    ...lignes,
  ].join('\n')
  return {
    system: CONSIGNES_PIECES,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: consigne },
      ],
    }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_PIECES } },
  }
}

export function lirePropositionsPieces(resultat, { largeur, hauteur }) {
  const borne = ([x, y]) => [Math.min(Math.max(Number(x) || 0, 0), largeur), Math.min(Math.max(Number(y) || 0, 0), hauteur)]
  let niveaux = (resultat?.niveaux ?? [])
    .filter((n) => Array.isArray(n?.cadre) && n.cadre.length === 4)
    .map((n) => {
      const a = borne([n.cadre[0], n.cadre[1]])
      const b = borne([n.cadre[2], n.cadre[3]])
      return { nom: String(n.nom ?? '').trim() || 'Niveau', cadre: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] }
    })
    .filter((n) => n.cadre[2] - n.cadre[0] > 10 && n.cadre[3] - n.cadre[1] > 10)
  if (!niveaux.length) niveaux = [{ nom: 'Niveau 1', cadre: [0, 0, largeur, hauteur] }]
  const aireMin = largeur * hauteur * 0.00002
  const pieces = (resultat?.pieces ?? [])
    .map((p) => ({
      niveau: Number.isInteger(p?.niveau) && p.niveau >= 0 && p.niveau < niveaux.length ? p.niveau : 0,
      nom: String(p?.nom ?? '').trim(),
      numero: String(p?.numero ?? '').trim() || null,
      surface: Number(p?.surface) > 0 ? Number(p.surface) : null,
      contour: (Array.isArray(p?.contour) ? p.contour : []).filter((q) => Array.isArray(q) && q.length >= 2).map(borne),
    }))
    .filter((p) => p.contour.length >= 3 && aire(p.contour) >= aireMin)
  return { niveaux, pieces }
}

export const versPiecesEdl = (pieces, convertir) => pieces.map((p) => ({
  nom: p.nom, numero: p.numero, surfaceLue: p.surface, hspLue: null,
  contour: p.contour.map(convertir), origine: 'ia', aVerifier: true,
}))
```

- [ ] **Step 4 : succès attendu** (`npm test`).

- [ ] **Step 5 : dépendance et fonction serveur**

Run: `npm install @anthropic-ai/sdk`

`api/edl-pieces.js` :

```js
/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Proposer les étages et les pièces d'un plan ─────────────────────────────
//
// Le navigateur envoie l'image d'un plan (JPEG ≤ 2 000 px) et ses textes
// positionnés ; Claude rend étages et contours de pièces en JSON (schéma
// imposé). La clé Anthropic ne vit qu'ici (variable Vercel ANTHROPIC_API_KEY,
// organisation « JGA's Individual Org » : crédits mensuels du forfait Max).
// Consignes et schéma viennent de piecesIaLogique.js : depuis le navigateur,
// on n'envoie que des données. Réservé à l'agence.

import Anthropic from '@anthropic-ai/sdk'
import { verifierAgence, jetonDe } from './_agence.js'
import { construireDemandePieces, MODELE_PIECES } from '../src/modules/etude/etat-des-lieux/piecesIaLogique.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erreur: 'methode' }); return }
  const url = process.env.VITE_SUPABASE_URL
  const cleSupabase = process.env.VITE_SUPABASE_ANON_KEY
  const cleAnthropic = process.env.ANTHROPIC_API_KEY
  if (!url || !cleSupabase) { res.status(500).json({ erreur: 'supabase-non-configure' }); return }

  const acces = await verifierAgence(url, cleSupabase, jetonDe(req))
  if (acces !== 200) { res.status(acces).json({ erreur: acces === 401 ? 'session' : 'agence-seule' }); return }
  if (!cleAnthropic) { res.status(503).json({ erreur: 'analyse-non-configuree' }); return }

  const corps = req.body ?? {}
  const { image, largeur, hauteur, textes, niveauUnique } = corps
  if (typeof image !== 'string' || !image || !(largeur > 0) || !(hauteur > 0)) { res.status(400).json({ erreur: 'demande' }); return }

  const client = new Anthropic({ apiKey: cleAnthropic })
  try {
    // En flux : la réponse (réflexion comprise) peut être longue sur un grand
    // étage, et une requête non suivie buterait sur les délais du SDK
    const message = await client.beta.messages.stream({
      model: MODELE_PIECES,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...construireDemandePieces({ image, largeur, hauteur, textes: Array.isArray(textes) ? textes : [], niveauUnique: !!niveauUnique }),
    }).finalMessage()
    if (message.stop_reason === 'refusal') { res.status(422).json({ erreur: 'refus' }); return }
    if (message.stop_reason === 'max_tokens') { res.status(502).json({ erreur: 'reponse-tronquee' }); return }
    const texte = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    res.status(200).json({ resultat: JSON.parse(texte) })
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      res.status(502).json({ erreur: 'anthropic', statut: e.status, detail: String(e.message).slice(0, 300) })
    } else {
      res.status(502).json({ erreur: 'reseau', detail: String(e?.message ?? e).slice(0, 300) })
    }
  }
}
```

`vercel.json`, dans `functions` :

```json
    "api/edl-pieces.js": {
      "maxDuration": 300
    }
```

`src/modules/etude/etat-des-lieux/piecesIa.js` :

```js
// Appel de api/edl-pieces depuis le navigateur (compte agence, réseau requis)

import { supabase } from '../../../core/supabase/client'
import { lirePropositionsPieces } from './piecesIaLogique'

export class ErreurPiecesIa extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const MESSAGES = {
  'analyse-non-configuree': 'L’analyse par Claude n’est pas configurée (clé ANTHROPIC_API_KEY dans Vercel).',
  session: 'Session expirée : reconnectez-vous.',
  'agence-seule': 'Réservé aux comptes de l’agence.',
  refus: 'Claude n’a pas accepté d’analyser ce plan.',
  'reponse-tronquee': 'La réponse de Claude était trop longue pour cet étage.',
}

export async function proposerPiecesIa(demande) {
  if (!navigator.onLine) throw new ErreurPiecesIa('reseau', 'Pas de réseau.')
  const { data } = await supabase.auth.getSession()
  const jeton = data?.session?.access_token
  if (!jeton) throw new ErreurPiecesIa('session', MESSAGES.session)
  let reponse
  try {
    reponse = await fetch('/api/edl-pieces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(demande),
    })
  } catch (err) {
    throw new ErreurPiecesIa('reseau', `Réseau : ${err?.message ?? err}`)
  }
  const json = await reponse.json().catch(() => null)
  if (!reponse.ok) {
    throw new ErreurPiecesIa(json?.erreur ?? 'erreur', MESSAGES[json?.erreur] ?? `L’analyse a échoué (${json?.detail ?? reponse.status}).`)
  }
  return lirePropositionsPieces(json?.resultat, { largeur: demande.largeur, hauteur: demande.hauteur })
}
```

- [ ] **Step 6 : vérifier** — `npm test` (PASS) et `npm run build` (PASS).
- [ ] **Step 7 : commit** `feat: état des lieux — pièces proposées par Claude (fonction serveur, SDK Anthropic)`.

---

### Task 9 : Dessin des étages et lecture des PDF (navigateur)

**Files:**
- Create: `src/modules/etude/etat-des-lieux/renduNiveau.js`
- Create: `src/modules/etude/etat-des-lieux/lecturePdfEdl.js`

**Interfaces:**
- Consumes : `cadrage`, `versPixels` (Task 3) ; `TAILLE_IMAGE_IA` (Task 8) ; `estVectoriel`, `lireEchelle` (Task 7) ; `encoderImage` (`comptes-rendus/compressionPhoto.js`), `dimensionsPlan`, `TAILLE_APERCU_PLAN` (`comptes-rendus/plansLogique.js`).
- Produces : `canevasBlanc(l, h) → { canvas, ctx }`, `encoderRendu(canvas) → { plan: { blob, largeur, hauteur }, apercu: {…}, extension }`, `imagePourIa(canvas) → { image (base64), largeur, hauteur, echelle }`, `imageIaDepuisUrl(url) → idem`, `rendreNiveauDxf(niveau) → { cadrage, rendu, ia }` ; `ouvrirPdfEdl(octets) → doc`, `examinerPages(doc) → [{ numero, echelle, vectoriel }]`, `rendrePage(doc, numero) → { canvas, viewport, textes: [{ texte, x, y }] }` (pixels pleine définition), `pointPdfEnMetres(viewport, [px, py], mpp) → [x, y]`, `decouperNiveau(page, cadrePx, mpp) → { cadrage, rendu }`.

Ces fichiers touchent au canevas et à pdf.js : pas de test `node --test` ; la vérification se fait à l'import réel (Task 13).

- [ ] **Step 1 : `renduNiveau.js`**

```js
// ─── Dessiner un étage en image, sur l'appareil ──────────────────────────────
//
// Un étage de DXF devient une image (6 000 px au plus, comme les plans des
// visites, plafond de l'iPad) : c'est elle que la tablette affiche, même sans
// réseau. Une copie réduite (2 000 px, JPEG) part chez Claude quand il faut
// lui faire proposer les pièces.

import { encoderImage } from '../../chantier/comptes-rendus/compressionPhoto'
import { TAILLE_APERCU_PLAN } from '../../chantier/comptes-rendus/plansLogique'
import { cadrage as calculerCadrage, versPixels } from './geometrieEdl'
import { TAILLE_IMAGE_IA } from './piecesIaLogique'

export function canevasBlanc(largeur, hauteur) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(largeur))
  canvas.height = Math.max(1, Math.round(hauteur))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

function reduire(source, max) {
  const echelle = Math.min(1, max / Math.max(source.width, source.height))
  const r = canevasBlanc(source.width * echelle, source.height * echelle)
  r.ctx.imageSmoothingQuality = 'high'
  r.ctx.drawImage(source, 0, 0, r.canvas.width, r.canvas.height)
  return { ...r, echelle: r.canvas.width / source.width }
}

export async function encoderRendu(canvas) {
  const apercu = reduire(canvas, TAILLE_APERCU_PLAN)
  const planBlob = await encoderImage(canvas, 0.85)
  const apercuBlob = await encoderImage(apercu.canvas, 0.78)
  return {
    plan: { blob: planBlob, largeur: canvas.width, hauteur: canvas.height },
    apercu: { blob: apercuBlob, largeur: apercu.canvas.width, hauteur: apercu.canvas.height },
    extension: planBlob.type === 'image/webp' ? 'webp' : 'jpg',
  }
}

export function imagePourIa(canvas) {
  const r = reduire(canvas, TAILLE_IMAGE_IA)
  const url = r.canvas.toDataURL('image/jpeg', 0.82)
  return { image: url.slice(url.indexOf(',') + 1), largeur: r.canvas.width, hauteur: r.canvas.height, echelle: r.echelle }
}

export async function imageIaDepuisUrl(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const { canvas, ctx } = canevasBlanc(img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, 0, 0)
  const ia = imagePourIa(canvas)
  canvas.width = 0
  canvas.height = 0
  return ia
}

function dessiner(niveau, c) {
  const { canvas, ctx } = canevasBlanc(c.largeur, c.hauteur)
  ctx.strokeStyle = '#1F1B17'
  ctx.lineWidth = Math.max(1, c.largeur / 4000)
  ctx.lineJoin = 'round'
  // Un seul chemin pour tout l'étage : des dizaines de milliers de traits se
  // dessinent en une fois
  ctx.beginPath()
  for (const t of niveau.traits) {
    t.pts.forEach((p, i) => {
      const [x, y] = versPixels(c, p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (t.ferme) ctx.closePath()
  }
  ctx.stroke()
  ctx.fillStyle = '#1F1B17'
  for (const t of niveau.textes) {
    const h = t.hauteur * c.pxParMetre
    if (h < 5) continue
    ctx.font = `${Math.round(h)}px Arial, sans-serif`
    const [x, y] = versPixels(c, t.pos)
    t.texte.split('\n').forEach((ligne, k) => ctx.fillText(ligne, x, y + k * h * 1.2))
  }
  return canvas
}

export async function rendreNiveauDxf(niveau) {
  const c = calculerCadrage(niveau.boite)
  const canvas = dessiner(niveau, c)
  const ia = imagePourIa(canvas)
  const rendu = await encoderRendu(canvas)
  // Libère la mémoire du grand canevas tout de suite (iPad)
  canvas.width = 0
  canvas.height = 0
  return { cadrage: c, rendu, ia }
}
```

- [ ] **Step 2 : `lecturePdfEdl.js`**

```js
// ─── Plans en PDF : pages, rendu, textes, découpe d'un étage ─────────────────

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { dimensionsPlan } from '../../chantier/comptes-rendus/plansLogique'
import { estVectoriel, lireEchelle } from './pdfPlanLogique'
import { canevasBlanc, encoderRendu } from './renduNiveau'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// pdf.js transfère le tampon à son worker : on lui en donne une copie, le
// fichier sert encore ensuite (envoi de la source)
export const ouvrirPdfEdl = (octets) => pdfjs.getDocument({ data: octets.slice() }).promise

export async function examinerPages(doc) {
  const pages = []
  for (let numero = 1; numero <= doc.numPages; numero++) {
    const page = await doc.getPage(numero)
    const ops = await page.getOperatorList()
    const contenu = await page.getTextContent()
    const textes = contenu.items.map((i) => i.str).filter(Boolean)
    pages.push({ numero, vectoriel: estVectoriel(ops.fnArray, pdfjs.OPS), echelle: lireEchelle([...textes, textes.join(' ')]) })
  }
  return pages
}

export async function rendrePage(doc, numero) {
  const page = await doc.getPage(numero)
  const base = page.getViewport({ scale: 1 })
  const cible = dimensionsPlan(base.width * 100, base.height * 100)
  const viewport = page.getViewport({ scale: cible.largeur / base.width })
  const { canvas, ctx } = canevasBlanc(Math.floor(viewport.width), Math.floor(viewport.height))
  await page.render({ canvasContext: ctx, viewport }).promise
  const contenu = await page.getTextContent()
  const textes = contenu.items
    .filter((i) => i.str?.trim())
    .map((i) => {
      const [x, y] = viewport.convertToViewportPoint(i.transform[4], i.transform[5])
      return { texte: i.str, x, y }
    })
  return { canvas, viewport, textes }
}

export function pointPdfEnMetres(viewport, [px, py], mpp) {
  const [x, y] = viewport.convertToPdfPoint(px, py)
  return [x * mpp, y * mpp]
}

export async function decouperNiveau(page, cadrePx, mpp) {
  const [x0, y0, x1, y1] = cadrePx.map((v) => Math.round(v))
  const { canvas, ctx } = canevasBlanc(x1 - x0, y1 - y0)
  ctx.drawImage(page.canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0)
  const basGauche = pointPdfEnMetres(page.viewport, [x0, y1], mpp)
  const hautDroit = pointPdfEnMetres(page.viewport, [x1, y0], mpp)
  const cadrage = {
    x0: Math.min(basGauche[0], hautDroit[0]), y0: Math.min(basGauche[1], hautDroit[1]),
    x1: Math.max(basGauche[0], hautDroit[0]), y1: Math.max(basGauche[1], hautDroit[1]),
    largeur: canvas.width, hauteur: canvas.height,
  }
  cadrage.pxParMetre = canvas.width / (cadrage.x1 - cadrage.x0)
  const rendu = await encoderRendu(canvas)
  canvas.width = 0
  canvas.height = 0
  return { cadrage, rendu }
}
```

- [ ] **Step 3 : `npm run build`** — Expected : PASS.
- [ ] **Step 4 : commit** `feat: état des lieux — dessin des étages et lecture des PDF`.

---

### Task 10 : Données (Supabase, stockage) et état chargé

**Files:**
- Create: `src/modules/etude/etat-des-lieux/edlDonnees.js`
- Create: `src/modules/etude/etat-des-lieux/useEtatDesLieux.js`

**Interfaces:**
- Consumes : `arrondirContour` (Task 3), `supabase`.
- Produces (`edlDonnees.js`) : `BUCKET_EDL = 'edl'`, `edlIndisponible(error)`, `chargerEtat(affaireId) → { indisponible } | { etat, niveaux, pieces }`, `assurerEtat(affaireId) → etat`, `envoyerSource(affaireId, octets) → chemin`, `enregistrerNiveau(affaireId, etatId, n) → ligne` avec `n = { nom, ordre, format, sourceNom, sourcePage, cheminSource, rendu, cadrage, unitesParMetre, echelle, textes }`, `enregistrerPieces(affaireId, niveauId, pieces) → lignes` avec pièce `{ nom, numero, contour, surfaceLue, hspLue, origine, aVerifier }`, `ajouterPiece(affaireId, niveauId, piece) → ligne`, `modifierPiece(id, champs)`, `supprimerPiece(id)`, `renommerNiveau(id, nom)`, `supprimerEtat(affaireId, niveaux)`.
- Produces (`useEtatDesLieux.js`) : `useEtatDesLieux(affaireId) → { charge, indisponible, etat, niveaux, pieces, erreur, setErreur, recharger, modifierPiece, ajouterPiece, supprimerPiece, renommerNiveau }`.

- [ ] **Step 1 : `edlDonnees.js`**

```js
// ─── Lectures et écritures de l'état des lieux ───────────────────────────────
//
// Tables de la migration 077, stockage privé `edl` rangé par affaire. Sans la
// migration, `chargerEtat` le dit (`indisponible`) au lieu d'échouer. Un refus
// RLS sur une modification ne rend pas d'erreur : on compte les lignes.

import { gzipSync } from 'fflate'
import { supabase } from '../../../core/supabase/client'
import { arrondirContour } from './geometrieEdl'

export const BUCKET_EDL = 'edl'
const LECTURE_SEULE = 'Lecture seule : rien n’a été modifié.'

export const edlIndisponible = (error) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /edl_\w+.*(does not exist|schema cache)/i.test(error?.message ?? '')

export async function chargerEtat(affaireId) {
  const { data: etat, error } = await supabase.from('edl_etats').select('*').eq('affaire_id', affaireId).maybeSingle()
  if (error) {
    if (edlIndisponible(error)) return { indisponible: true }
    throw error
  }
  if (!etat) return { etat: null, niveaux: [], pieces: [] }
  const [niveaux, pieces] = await Promise.all([
    supabase.from('edl_niveaux').select('*').eq('etat_id', etat.id).order('ordre'),
    supabase.from('edl_pieces').select('*').eq('affaire_id', affaireId).order('ordre'),
  ])
  if (niveaux.error) throw niveaux.error
  if (pieces.error) throw pieces.error
  return { etat, niveaux: niveaux.data ?? [], pieces: pieces.data ?? [] }
}

export async function assurerEtat(affaireId) {
  const { data, error } = await supabase.from('edl_etats').insert({ affaire_id: affaireId }).select().single()
  if (!error) return data
  if (error.code !== '23505') throw error
  const existant = await supabase.from('edl_etats').select('*').eq('affaire_id', affaireId).single()
  if (existant.error) throw existant.error
  return existant.data
}

async function envoyer(chemin, blob, contentType) {
  const { error } = await supabase.storage.from(BUCKET_EDL).upload(chemin, blob, { contentType: contentType ?? blob.type, upsert: false })
  if (error) throw error
}

async function retirer(chemins) {
  const { error } = await supabase.storage.from(BUCKET_EDL).remove(chemins.filter(Boolean))
  if (error) console.warn('État des lieux, nettoyage :', error)
}

// Le plan d'origine, compressé : l'export DXF du lot 4 repart de lui
export async function envoyerSource(affaireId, octets) {
  const chemin = `${affaireId}/edl/sources/${crypto.randomUUID()}.gz`
  await envoyer(chemin, new Blob([gzipSync(octets, { level: 6 })], { type: 'application/gzip' }), 'application/gzip')
  return chemin
}

export async function enregistrerNiveau(affaireId, etatId, n) {
  const id = crypto.randomUUID()
  const chemin = `${affaireId}/edl/${id}.${n.rendu.extension}`
  const cheminApercu = `${affaireId}/edl/${id}-apercu.${n.rendu.extension}`
  await envoyer(chemin, n.rendu.plan.blob)
  try {
    await envoyer(cheminApercu, n.rendu.apercu.blob)
  } catch (err) {
    await retirer([chemin])
    throw err
  }
  const { data, error } = await supabase.from('edl_niveaux').insert({
    id, etat_id: etatId, affaire_id: affaireId, nom: n.nom, ordre: n.ordre, format: n.format,
    source_nom: n.sourceNom ?? null, source_page: n.sourcePage ?? null, chemin_source: n.cheminSource ?? null,
    chemin, chemin_apercu: cheminApercu, largeur: n.rendu.plan.largeur, hauteur: n.rendu.plan.hauteur,
    cadrage: n.cadrage, unites_par_metre: n.unitesParMetre ?? null, echelle: n.echelle ?? null, textes: n.textes ?? [],
  }).select().single()
  if (error) {
    await retirer([chemin, cheminApercu])
    throw error
  }
  return data
}

const lignePiece = (affaireId, niveauId, p, ordre) => ({
  niveau_id: niveauId, affaire_id: affaireId, nom: p.nom ?? '', numero: p.numero ?? null,
  contour: arrondirContour(p.contour), surface_lue: p.surfaceLue ?? null, hsp_lue: p.hspLue ?? null,
  origine: p.origine, a_verifier: !!p.aVerifier, ordre,
})

export async function enregistrerPieces(affaireId, niveauId, pieces) {
  if (!pieces.length) return []
  const { data, error } = await supabase.from('edl_pieces').insert(pieces.map((p, i) => lignePiece(affaireId, niveauId, p, i))).select()
  if (error) throw error
  return data
}

export async function ajouterPiece(affaireId, niveauId, piece, ordre) {
  const { data, error } = await supabase.from('edl_pieces').insert(lignePiece(affaireId, niveauId, piece, ordre)).select().single()
  if (error) throw error
  return data
}

export async function modifierPiece(id, champs) {
  const { data, error } = await supabase.from('edl_pieces').update(champs).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

export async function supprimerPiece(id) {
  const { data, error } = await supabase.from('edl_pieces').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

export async function renommerNiveau(id, nom) {
  const { data, error } = await supabase.from('edl_niveaux').update({ nom }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
}

// Remplacer les plans : tout l'état des lieux part (étages et pièces par
// cascade), puis ses fichiers
export async function supprimerEtat(affaireId, niveaux) {
  const { data, error } = await supabase.from('edl_etats').delete().eq('affaire_id', affaireId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(LECTURE_SEULE)
  await retirer([...new Set(niveaux.flatMap((n) => [n.chemin, n.chemin_apercu, n.chemin_source]))])
}
```

- [ ] **Step 2 : `useEtatDesLieux.js`**

```js
import { useCallback, useEffect, useState } from 'react'
import * as donnees from './edlDonnees'
import { arrondirContour } from './geometrieEdl'

const VIDE = { charge: false, indisponible: false, etat: null, niveaux: [], pieces: [] }

export function useEtatDesLieux(affaireId) {
  const [etat, setEtat] = useState(VIDE)
  const [erreur, setErreur] = useState(null)

  const recharger = useCallback(async () => {
    try {
      const r = await donnees.chargerEtat(affaireId)
      setEtat({ charge: true, indisponible: !!r.indisponible, etat: r.etat ?? null, niveaux: r.niveaux ?? [], pieces: r.pieces ?? [] })
    } catch (err) {
      setErreur(err?.message ?? String(err))
      setEtat((e) => ({ ...e, charge: true }))
    }
  }, [affaireId])

  useEffect(() => { recharger() }, [recharger])

  // Appliqué à l'écran tout de suite ; un refus recharge l'état de la base
  const modifierPiece = useCallback(async (id, champs) => {
    const propres = champs.contour ? { ...champs, contour: arrondirContour(champs.contour) } : champs
    setEtat((e) => ({ ...e, pieces: e.pieces.map((p) => (p.id === id ? { ...p, ...propres } : p)) }))
    try {
      await donnees.modifierPiece(id, propres)
    } catch (err) {
      setErreur(err?.message ?? String(err))
      recharger()
    }
  }, [recharger])

  const ajouterPiece = useCallback(async (niveauId, piece) => {
    try {
      const ordre = etat.pieces.filter((p) => p.niveau_id === niveauId).length
      const ligne = await donnees.ajouterPiece(affaireId, niveauId, piece, ordre)
      setEtat((e) => ({ ...e, pieces: [...e.pieces, ligne] }))
      return ligne
    } catch (err) {
      setErreur(err?.message ?? String(err))
      return null
    }
  }, [affaireId, etat.pieces])

  const supprimerPiece = useCallback(async (id) => {
    try {
      await donnees.supprimerPiece(id)
      setEtat((e) => ({ ...e, pieces: e.pieces.filter((p) => p.id !== id) }))
    } catch (err) {
      setErreur(err?.message ?? String(err))
    }
  }, [])

  const renommerNiveau = useCallback(async (id, nom) => {
    setEtat((e) => ({ ...e, niveaux: e.niveaux.map((n) => (n.id === id ? { ...n, nom } : n)) }))
    try {
      await donnees.renommerNiveau(id, nom)
    } catch (err) {
      setErreur(err?.message ?? String(err))
      recharger()
    }
  }, [recharger])

  return { ...etat, erreur, setErreur, recharger, modifierPiece, ajouterPiece, supprimerPiece, renommerNiveau }
}
```

- [ ] **Step 3 : `npm run build`** — PASS. **Step 4 : commit** `feat: état des lieux — données (étages, pièces, stockage edl)`.

---

### Task 11 : Import (enchaînement et écran)

**Files:**
- Create: `src/modules/etude/etat-des-lieux/importerPlans.js`
- Create: `src/modules/etude/etat-des-lieux/ImportEdl.jsx`

**Interfaces:**
- Consumes : `formatPlan`, `verdictFormat`, `MESSAGES_FORMAT`, `FORMATS_ACCEPTES` (T2) ; `versPixels`, `versMetres` (T3) ; `decoderDxf`, `lireDxf` (T4) ; `detecterPieces` (T5) ; `proposerNiveaux`, `uniteParDefaut` (T6) ; `metresParPoint` (T7) ; `proposerPiecesIa`, `versPiecesEdl` (T8) ; `rendreNiveauDxf`, `imagePourIa`, `ouvrirPdfEdl`, `examinerPages`, `rendrePage`, `pointPdfEnMetres`, `decouperNiveau` (T9) ; `assurerEtat`, `envoyerSource`, `enregistrerNiveau`, `enregistrerPieces` (T10).
- Produces : `preparerFichier(fichier) → { nom, format: 'dxf', octets, niveaux, unitesParMetre, uniteLue: boolean } | { nom, format: 'pdf', octets, pages } | { nom, refus: message }` ; `importer(affaireId, preparations, surEtape) → { avertissements: string[] }` ; composant `ImportEdl({ affaireId, onTermine, onAnnuler })`.

- [ ] **Step 1 : `importerPlans.js`**

```js
// ─── Importer les plans de l'existant ────────────────────────────────────────
//
// Deux temps : `preparerFichier` lit chaque fichier sur l'appareil (format,
// étages, pièces, échelle) pour que l'utilisateur relise ; `importer` dessine,
// fait proposer ce qui manque par Claude, puis enregistre. Un échec de Claude
// n'arrête rien : l'étage est enregistré sans pièces, à dessiner à la main.

import { formatPlan, verdictFormat, MESSAGES_FORMAT } from './formatPlanEdl'
import { versPixels, versMetres } from './geometrieEdl'
import { decoderDxf, lireDxf } from './dxfLecture'
import { detecterPieces } from './piecesDxfLogique'
import { proposerNiveaux, uniteParDefaut } from './niveauxLogique'
import { metresParPoint } from './pdfPlanLogique'
import { versPiecesEdl } from './piecesIaLogique'
import { proposerPiecesIa } from './piecesIa'
import { rendreNiveauDxf, imagePourIa } from './renduNiveau'
import { ouvrirPdfEdl, examinerPages, rendrePage, pointPdfEnMetres, decouperNiveau } from './lecturePdfEdl'
import { assurerEtat, envoyerSource, enregistrerNiveau, enregistrerPieces } from './edlDonnees'

const TEXTES_GARDES = 3000

export async function preparerFichier(fichier) {
  const octets = new Uint8Array(await fichier.arrayBuffer())
  const format = formatPlan(octets.slice(0, 512))
  const verdict = verdictFormat(format)
  if (!verdict.ok) return { nom: fichier.name, refus: verdict.message }

  if (format === 'dxf') {
    const lecture = lireDxf(decoderDxf(octets))
    const detection = detecterPieces(lecture)
    const unitesParMetre = detection.unitesParMetre ?? uniteParDefaut(lecture)
    const niveaux = proposerNiveaux(lecture, detection, unitesParMetre, fichier.name)
      .map((n) => ({ ...n, garde: true }))
    return { nom: fichier.name, format, octets, lecture, detection, niveaux, unitesParMetre, uniteLue: !!detection.unitesParMetre }
  }

  const doc = await ouvrirPdfEdl(octets)
  const pages = (await examinerPages(doc)).map((p) => ({ ...p, garde: p.vectoriel, echelle: p.echelle ?? 100, echelleLue: !!p.echelle }))
  if (!pages.some((p) => p.vectoriel)) return { nom: fichier.name, refus: MESSAGES_FORMAT['pdf-scan'] }
  return { nom: fichier.name, format, octets, pages }
}

// Changer d'unité (DXF sans contours de pièces) : étages recalculés
export function changerUnite(preparation, unitesParMetre) {
  const niveaux = proposerNiveaux(preparation.lecture, preparation.detection, unitesParMetre, preparation.nom)
    .map((n, i) => ({ ...n, nom: preparation.niveaux[i]?.nom ?? n.nom, garde: preparation.niveaux[i]?.garde ?? true }))
  return { ...preparation, unitesParMetre, niveaux }
}

const textesGardes = (textes) => textes.slice(0, TEXTES_GARDES)

async function importerDxf(affaireId, etatId, prep, ordre, surEtape, avertissements) {
  const cheminSource = await envoyerSource(affaireId, prep.octets)
  for (const n of prep.niveaux.filter((x) => x.garde)) {
    surEtape(`Dessin de l’étage « ${n.nom} »…`)
    const { cadrage, rendu, ia } = await rendreNiveauDxf(n)
    const niveau = await enregistrerNiveau(affaireId, etatId, {
      nom: n.nom, ordre: ordre.valeur++, format: 'dxf', sourceNom: prep.nom, cheminSource, rendu, cadrage,
      unitesParMetre: prep.unitesParMetre, textes: textesGardes(n.textes.map((t) => ({ texte: t.texte, pos: t.pos }))),
    })
    let pieces = n.pieces.map((p) => ({ ...p, origine: 'dxf', aVerifier: false }))
    if (!pieces.length) {
      surEtape(`Claude repère les pièces de « ${n.nom} »…`)
      try {
        const textes = n.textes.map((t) => {
          const [x, y] = versPixels(cadrage, t.pos)
          return { texte: t.texte, x: x * ia.echelle, y: y * ia.echelle }
        })
        const proposition = await proposerPiecesIa({ image: ia.image, largeur: ia.largeur, hauteur: ia.hauteur, textes, niveauUnique: true })
        pieces = versPiecesEdl(proposition.pieces, ([x, y]) => versMetres(cadrage, [x / ia.echelle, y / ia.echelle]))
      } catch (err) {
        avertissements.push(`« ${n.nom} » : ${err.message} Les pièces pourront être proposées plus tard ou dessinées à la main.`)
      }
    }
    surEtape(`Enregistrement de « ${n.nom} »…`)
    await enregistrerPieces(affaireId, niveau.id, pieces)
  }
}

async function importerPdf(affaireId, etatId, prep, ordre, surEtape, avertissements) {
  const cheminSource = await envoyerSource(affaireId, prep.octets)
  const doc = await ouvrirPdfEdl(prep.octets)
  for (const p of prep.pages.filter((x) => x.garde)) {
    surEtape(`Lecture de la page ${p.numero}…`)
    const page = await rendrePage(doc, p.numero)
    const mpp = metresParPoint(p.echelle)
    const ia = imagePourIa(page.canvas)
    let proposition
    try {
      surEtape(`Claude repère les étages et les pièces de la page ${p.numero}…`)
      proposition = await proposerPiecesIa({
        image: ia.image, largeur: ia.largeur, hauteur: ia.hauteur, niveauUnique: false,
        textes: page.textes.map((t) => ({ texte: t.texte, x: t.x * ia.echelle, y: t.y * ia.echelle })),
      })
    } catch (err) {
      avertissements.push(`Page ${p.numero} : ${err.message} La page est gardée entière, les pièces pourront être dessinées à la main.`)
      proposition = { niveaux: [{ nom: `Page ${p.numero}`, cadre: [0, 0, ia.largeur, ia.hauteur] }], pieces: [] }
    }
    for (const [k, nv] of proposition.niveaux.entries()) {
      surEtape(`Enregistrement de « ${nv.nom} »…`)
      const cadrePx = nv.cadre.map((v) => v / ia.echelle)
      const { cadrage, rendu } = await decouperNiveau(page, cadrePx, mpp)
      const textes = page.textes
        .filter((t) => t.x >= cadrePx[0] && t.x <= cadrePx[2] && t.y >= cadrePx[1] && t.y <= cadrePx[3])
        .map((t) => ({ texte: t.texte, pos: pointPdfEnMetres(page.viewport, [t.x, t.y], mpp) }))
      const niveau = await enregistrerNiveau(affaireId, etatId, {
        nom: nv.nom, ordre: ordre.valeur++, format: 'pdf', sourceNom: prep.nom, sourcePage: p.numero,
        cheminSource, rendu, cadrage, echelle: p.echelle, textes: textesGardes(textes),
      })
      const pieces = versPiecesEdl(
        proposition.pieces.filter((q) => q.niveau === k),
        ([x, y]) => pointPdfEnMetres(page.viewport, [x / ia.echelle, y / ia.echelle], mpp),
      )
      await enregistrerPieces(affaireId, niveau.id, pieces)
    }
    page.canvas.width = 0
    page.canvas.height = 0
  }
}

export async function importer(affaireId, preparations, surEtape) {
  const etat = await assurerEtat(affaireId)
  const avertissements = []
  const ordre = { valeur: 0 }
  for (const prep of preparations.filter((p) => !p.refus)) {
    if (prep.format === 'dxf') await importerDxf(affaireId, etat.id, prep, ordre, surEtape, avertissements)
    else await importerPdf(affaireId, etat.id, prep, ordre, surEtape, avertissements)
  }
  return { avertissements }
}
```

- [ ] **Step 2 : `ImportEdl.jsx`**

```jsx
import { useRef, useState } from 'react'
import { Upload, FileWarning, Check } from 'lucide-react'
import { FORMATS_ACCEPTES } from './formatPlanEdl'
import { preparerFichier, changerUnite, importer } from './importerPlans'

// ─── Import des plans de l'existant ──────────────────────────────────────────
//
// Choisir les fichiers, relire ce qui a été lu (étages, nombre de pièces,
// échelle des PDF), puis importer. Les DWG et les PDF scannés sont refusés
// avec ce qu'il faut faire à la place.

const UNITES = [{ valeur: 1, libelle: 'mètre' }, { valeur: 100, libelle: 'centimètre' }, { valeur: 1000, libelle: 'millimètre' }]

const carte = { background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 16 }
const bouton = (principal) => ({
  minHeight: 44, padding: '0 18px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500,
  border: principal ? 'none' : '0.5px solid rgba(0,0,0,0.2)',
  background: principal ? 'var(--affaire-accent)' : 'white', color: principal ? 'white' : '#1F1B17',
})
const champ = { minHeight: 36, padding: '0 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 14 }

export function ImportEdl({ affaireId, onTermine, onAnnuler }) {
  const entree = useRef(null)
  const [preparations, setPreparations] = useState([])
  const [etape, setEtape] = useState(null) // texte affiché pendant un travail
  const [erreur, setErreur] = useState(null)
  const [avertissements, setAvertissements] = useState(null)

  const choisir = async (fichiers) => {
    setErreur(null)
    setEtape('Lecture des plans…')
    try {
      const lues = []
      for (const f of fichiers) lues.push(await preparerFichier(f))
      setPreparations(lues)
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setEtape(null)
    }
  }

  const modifier = (i, fn) => setPreparations((ps) => ps.map((p, k) => (k === i ? fn(p) : p)))
  const aImporter = preparations.filter((p) => !p.refus && ((p.niveaux ?? p.pages).some((x) => x.garde)))

  const lancer = async () => {
    setErreur(null)
    setEtape('Préparation…')
    try {
      const { avertissements: a } = await importer(affaireId, aImporter, setEtape)
      if (a.length) setAvertissements(a)
      else onTermine()
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setEtape(null)
    }
  }

  if (avertissements) {
    return (
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>Plans importés, avec ces remarques :</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#5E5854' }}>{avertissements.map((a) => <li key={a}>{a}</li>)}</ul>
        <div><button type="button" style={bouton(true)} onClick={onTermine}>Continuer</button></div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          Plans de l’existant : <strong>{FORMATS_ACCEPTES}</strong> — un fichier par étage, ou un fichier pour tout le bâtiment.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>
          Les DWG ne sont pas acceptés : enregistrez-les en DXF dans AutoCAD ou ArchiCAD. Un DXF donne les pièces exactes ; avec un PDF, Claude les propose et vous les corrigez.
        </p>
        <input ref={entree} type="file" accept=".dxf,.pdf" multiple hidden onChange={(e) => { choisir([...e.target.files]); e.target.value = '' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={bouton(!preparations.length)} disabled={!!etape} onClick={() => entree.current?.click()}>
            <Upload size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Choisir les plans
          </button>
          {onAnnuler && <button type="button" style={bouton(false)} disabled={!!etape} onClick={onAnnuler}>Annuler</button>}
        </div>
      </div>

      {preparations.map((p, i) => (
        <div key={`${p.nom}-${i}`} style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{p.nom}</p>
          {p.refus && (
            <p style={{ margin: 0, fontSize: 13, color: '#B42318', display: 'flex', gap: 8 }}><FileWarning size={16} style={{ flexShrink: 0 }} />{p.refus}</p>
          )}
          {p.format === 'dxf' && (
            <>
              {!p.uniteLue && (
                <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                  Unité du dessin
                  <select style={champ} value={p.unitesParMetre} onChange={(e) => modifier(i, (x) => changerUnite(x, Number(e.target.value)))}>
                    {UNITES.map((u) => <option key={u.valeur} value={u.valeur}>{u.libelle}</option>)}
                  </select>
                </label>
              )}
              {p.niveaux.map((n, k) => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="checkbox" checked={n.garde} onChange={(e) => modifier(i, (x) => ({ ...x, niveaux: x.niveaux.map((m, j) => (j === k ? { ...m, garde: e.target.checked } : m)) }))} />
                  <input style={champ} value={n.nom} onChange={(e) => modifier(i, (x) => ({ ...x, niveaux: x.niveaux.map((m, j) => (j === k ? { ...m, nom: e.target.value } : m)) }))} />
                  <span style={{ fontSize: 13, color: '#5E5854' }}>
                    {n.pieces.length ? <><Check size={14} style={{ verticalAlign: -2 }} /> {n.pieces.length} pièces lues dans le plan</> : 'Pièces proposées par Claude'}
                  </span>
                </div>
              ))}
            </>
          )}
          {p.format === 'pdf' && p.pages.map((pg, k) => (
            <div key={pg.numero} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <input type="checkbox" disabled={!pg.vectoriel} checked={pg.garde} onChange={(e) => modifier(i, (x) => ({ ...x, pages: x.pages.map((m, j) => (j === k ? { ...m, garde: e.target.checked } : m)) }))} />
              <span>Page {pg.numero}</span>
              {pg.vectoriel ? (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  échelle 1/
                  <input style={{ ...champ, width: 70 }} type="number" min="1" value={pg.echelle} onChange={(e) => modifier(i, (x) => ({ ...x, pages: x.pages.map((m, j) => (j === k ? { ...m, echelle: Number(e.target.value) || 100 } : m)) }))} />
                  {!pg.echelleLue && <span style={{ color: '#B54708' }}>non lue sur le plan : à vérifier</span>}
                </label>
              ) : <span style={{ color: '#B42318' }}>page scannée, ignorée</span>}
              <span style={{ color: '#5E5854' }}>étages et pièces proposés par Claude</span>
            </div>
          ))}
        </div>
      ))}

      {erreur && <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{erreur}</p>}
      {etape && <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>{etape}</p>}
      {aImporter.length > 0 && !etape && (
        <div><button type="button" style={bouton(true)} onClick={lancer}>Importer</button></div>
      )}
    </div>
  )
}
```

- [ ] **Step 3 : `npm run build`** — PASS. **Step 4 : commit** `feat: état des lieux — import des plans (DXF, PDF, refus clairs)`.

---

### Task 12 : Correction des pièces à l'écran

**Files:**
- Modify: `src/modules/chantier/comptes-rendus/VisionneusePlan.jsx` (prop `calque`)
- Create: `src/modules/etude/etat-des-lieux/EditeurPieces.jsx`

**Interfaces:**
- Consumes : `VisionneusePlan({ version, obtenirLiens, onToucher, calque })` où `version = { id, chemin, chemin_apercu, largeur, hauteur }` et `onToucher({ x, y })` en coordonnées relatives 0–1 (déjà le cas, via `pointSurPlan`) ; `aire`, `ecartSurface`, `SEUIL_ECART`, `versPixels`, `versMetres`, `deplacerSommet`, `insererSommet`, `retirerSommet` (T3) ; `imageIaDepuisUrl` (T9) ; `proposerPiecesIa`, `versPiecesEdl` (T8).
- Produces : `EditeurPieces({ niveau, pieces, obtenirLiens, lectureSeule, onModifier(id, champs), onAjouter(niveauId, piece), onSupprimer(id), onAjouterPlusieurs(niveauId, pieces) })`.

- [ ] **Step 1 : `VisionneusePlan` — calque superposé**

Dans la signature, ajouter `calque` :

```jsx
export function VisionneusePlan({ version, obtenirLiens, pastilles = [], idActive, onToucher, onPastille, calque }) {
```

Dans le `div` transformé, juste après l'`<img …/>` et avant `{pastilles.map(…)}` :

```jsx
          {calque?.({ largeur: bw, hauteur: bh, zoom: vue.zoom })}
```

Rien d'autre ne change : les visites et le module Plans ne passent pas `calque`.

- [ ] **Step 2 : `EditeurPieces.jsx`**

Le choix d'une pièce passe par l'appui bref de la visionneuse (`onToucher`), pas par un clic sur le polygone : les pièces couvrent tout le plan, et un polygone qui arrêterait le pointeur empêcherait de déplacer le plan au doigt. Seules les poignées des sommets captent le pointeur.

```jsx
import { useMemo, useRef, useState } from 'react'
import { Trash2, PenLine, Sparkles, X } from 'lucide-react'
import { VisionneusePlan } from '../../chantier/comptes-rendus/VisionneusePlan'
import {
  aire, pointDansPolygone, ecartSurface, SEUIL_ECART, versPixels, versMetres,
  deplacerSommet, insererSommet, retirerSommet,
} from './geometrieEdl'
import { imageIaDepuisUrl } from './renduNiveau'
import { proposerPiecesIa } from './piecesIa'
import { versPiecesEdl } from './piecesIaLogique'

// ─── Corriger les pièces d'un étage ──────────────────────────────────────────
//
// Les contours en couleur sur le plan. Toucher une pièce la choisit : ses
// sommets se déplacent au doigt, un rond au milieu d'un côté ajoute un sommet.
// « Dessiner une pièce » : toucher les angles un à un, puis « Terminer ».
// Une pièce proposée par Claude reste « à vérifier » (bleu) tant qu'on ne l'a
// pas corrigée ou confirmée ; une surface dessinée qui s'écarte de la surface
// écrite est signalée.

const COULEUR = 'var(--affaire-accent, #E8602C)'
const champ = { minHeight: 36, padding: '0 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 14, width: '100%', boxSizing: 'border-box' }
const petitBouton = { minHeight: 36, padding: '0 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.2)', background: 'white', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }

const fmtM2 = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`

export function EditeurPieces({ niveau, pieces, obtenirLiens, lectureSeule, onModifier, onAjouter, onSupprimer, onAjouterPlusieurs }) {
  const [choisie, setChoisie] = useState(null)
  const [sommet, setSommet] = useState(null) // dernier sommet touché de la pièce choisie
  const [trace, setTrace] = useState(null) // contour en cours de dessin (mètres)
  const [glisse, setGlisse] = useState(null) // { id, contour, index } pendant un déplacement
  const [attente, setAttente] = useState(null)
  const [erreur, setErreur] = useState(null)
  const svg = useRef(null)
  const c = niveau.cadrage

  const version = useMemo(() => ({ id: niveau.id, chemin: niveau.chemin, chemin_apercu: niveau.chemin_apercu, largeur: niveau.largeur, hauteur: niveau.hauteur }), [niveau])
  const tries = useMemo(() => [...pieces].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { numeric: true })), [pieces])
  const piece = pieces.find((p) => p.id === choisie)
  const contourDe = (p) => (glisse?.id === p.id ? glisse.contour : p.contour)

  const versCalque = (largeur, hauteur) => (p) => {
    const [x, y] = versPixels(c, p)
    return [(x / niveau.largeur) * largeur, (y / niveau.hauteur) * hauteur]
  }
  const depuisEvenement = (e) => {
    const r = svg.current.getBoundingClientRect()
    return versMetres(c, [((e.clientX - r.left) / r.width) * niveau.largeur, ((e.clientY - r.top) / r.height) * niveau.hauteur])
  }

  const choisir = (id) => { setChoisie(id); setSommet(null) }

  // Appui bref sur le plan : un angle de plus en dessin, sinon la plus petite
  // pièce qui contient le point
  const toucher = ({ x, y }) => {
    const point = versMetres(c, [x * niveau.largeur, y * niveau.hauteur])
    if (trace) { setTrace((t) => [...t, point]); return }
    const sous = pieces.filter((p) => pointDansPolygone(point, p.contour))
    choisir(sous.length ? sous.reduce((a, b) => (aire(b.contour) < aire(a.contour) ? b : a)).id : null)
  }

  const debutGlisse = (p, i, insertion) => (e) => {
    if (lectureSeule) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const contour = insertion ? insererSommet(p.contour, i, depuisEvenement(e)) : p.contour
    const index = insertion ? i + 1 : i
    setGlisse({ id: p.id, contour, index })
    setSommet(index)
  }
  const pendantGlisse = (e) => {
    if (!glisse) return
    e.stopPropagation()
    setGlisse((g) => ({ ...g, contour: deplacerSommet(g.contour, g.index, depuisEvenement(e)) }))
  }
  const finGlisse = (e) => {
    if (!glisse) return
    e.stopPropagation()
    const g = glisse
    setGlisse(null)
    // Un deuxième doigt (pincement) annule le geste : rien d'enregistré
    if (e.type === 'pointercancel') return
    onModifier(g.id, { contour: g.contour, a_verifier: false })
  }

  const terminerTrace = async () => {
    if (trace.length < 3) return
    const ligne = await onAjouter(niveau.id, { nom: 'Nouvelle pièce', numero: null, contour: trace, surfaceLue: null, hspLue: null, origine: 'main', aVerifier: false })
    setTrace(null)
    if (ligne) choisir(ligne.id)
  }

  const fairePropose = async () => {
    setErreur(null)
    setAttente('Claude repère les pièces…')
    try {
      const liens = await obtenirLiens([niveau.chemin_apercu])
      const ia = await imageIaDepuisUrl(liens.get(niveau.chemin_apercu))
      const textes = (niveau.textes ?? []).map((t) => {
        const [x, y] = versPixels(c, t.pos)
        return { texte: t.texte, x: (x / niveau.largeur) * ia.largeur, y: (y / niveau.hauteur) * ia.hauteur }
      })
      const proposition = await proposerPiecesIa({ image: ia.image, largeur: ia.largeur, hauteur: ia.hauteur, textes, niveauUnique: true })
      const nouvelles = versPiecesEdl(proposition.pieces, ([x, y]) => versMetres(c, [(x / ia.largeur) * niveau.largeur, (y / ia.hauteur) * niveau.hauteur]))
      await onAjouterPlusieurs(niveau.id, nouvelles)
    } catch (err) {
      setErreur(err?.message ?? String(err))
    } finally {
      setAttente(null)
    }
  }

  const calque = ({ largeur, hauteur, zoom }) => {
    const enCalque = versCalque(largeur, hauteur)
    const rayon = 9 / zoom
    const poignee = { touchAction: 'none', pointerEvents: 'auto' }
    return (
      <svg ref={svg} width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {pieces.map((p) => (
          <polygon
            key={p.id} points={contourDe(p).map(enCalque).map((q) => q.join(',')).join(' ')}
            style={{
              fill: p.a_verifier ? 'rgba(46,111,219,0.16)' : 'rgba(232,96,44,0.12)',
              stroke: p.a_verifier ? '#2E6FDB' : COULEUR, strokeWidth: (p.id === choisie ? 3 : 1.5) / zoom,
            }}
          />
        ))}
        {piece && !lectureSeule && !trace && (() => {
          const contour = contourDe(piece)
          const pts = contour.map(enCalque)
          const gestes = { onPointerMove: pendantGlisse, onPointerUp: finGlisse, onPointerCancel: finGlisse }
          return (
            <g>
              {pts.map((q, i) => {
                const suivant = pts[(i + 1) % pts.length]
                return (
                  <circle
                    key={`m${i}`} cx={(q[0] + suivant[0]) / 2} cy={(q[1] + suivant[1]) / 2} r={rayon * 0.7}
                    onPointerDown={debutGlisse({ ...piece, contour }, i, true)} {...gestes}
                    style={{ ...poignee, fill: 'white', stroke: COULEUR, strokeWidth: 1.5 / zoom, cursor: 'copy' }}
                  />
                )
              })}
              {pts.map((q, i) => (
                <circle
                  key={`s${i}`} cx={q[0]} cy={q[1]} r={rayon}
                  onPointerDown={debutGlisse({ ...piece, contour }, i, false)} {...gestes}
                  style={{ ...poignee, fill: i === sommet ? '#1F1B17' : COULEUR, stroke: 'white', strokeWidth: 2 / zoom, cursor: 'move' }}
                />
              ))}
            </g>
          )
        })()}
        {trace && (
          <polyline points={trace.map(enCalque).map((q) => q.join(',')).join(' ')} style={{ fill: 'none', stroke: COULEUR, strokeWidth: 2 / zoom, strokeDasharray: `${6 / zoom}` }} />
        )}
      </svg>
    )
  }

  const ecart = piece ? ecartSurface(piece.contour, Number(piece.surface_lue)) : null
  const enregistrerChamp = (champNom) => (e) => {
    const valeur = e.target.value.trim()
    if (valeur !== (piece[champNom] ?? '')) onModifier(piece.id, { [champNom]: valeur || (champNom === 'nom' ? '' : null), a_verifier: false })
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 520px', minHeight: 420, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
        <VisionneusePlan version={version} obtenirLiens={obtenirLiens} onToucher={toucher} calque={calque} />
        {trace && (
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 4px 12px -6px rgba(0,0,0,0.35)' }}>
            <span style={{ fontSize: 13, alignSelf: 'center' }}>Touchez les angles de la pièce ({trace.length})</span>
            <button type="button" style={petitBouton} disabled={trace.length < 3} onClick={terminerTrace}>Terminer</button>
            <button type="button" style={petitBouton} onClick={() => setTrace(null)}><X size={14} />Annuler</button>
          </div>
        )}
      </div>

      <div style={{ flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
        {!lectureSeule && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={petitBouton} disabled={!!trace} onClick={() => { choisir(null); setTrace([]) }}><PenLine size={14} />Dessiner une pièce</button>
            {pieces.length === 0 && <button type="button" style={petitBouton} disabled={!!attente} onClick={fairePropose}><Sparkles size={14} />Faire proposer par Claude</button>}
          </div>
        )}
        {attente && <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>{attente}</p>}
        {erreur && <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{erreur}</p>}

        {piece && (
          <div style={{ background: 'white', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input key={`${piece.id}-nom`} style={champ} disabled={lectureSeule} defaultValue={piece.nom} placeholder="Nom de la pièce" onBlur={enregistrerChamp('nom')} />
            <input key={`${piece.id}-numero`} style={champ} disabled={lectureSeule} defaultValue={piece.numero ?? ''} placeholder="Numéro" onBlur={enregistrerChamp('numero')} />
            <p style={{ margin: 0, fontSize: 13, color: '#5E5854' }}>
              Dessinée : {fmtM2(aire(piece.contour))}{piece.surface_lue ? ` · écrite : ${fmtM2(Number(piece.surface_lue))}` : ''}
              {piece.hsp_lue ? ` · HSP ${Number(piece.hsp_lue).toLocaleString('fr-FR')} m` : ''}
            </p>
            {ecart != null && Math.abs(ecart) > SEUIL_ECART && (
              <p style={{ margin: 0, fontSize: 13, color: '#B54708' }}>La surface dessinée s’écarte de {Math.round(Math.abs(ecart) * 100)} % de la surface écrite : contour à vérifier.</p>
            )}
            {piece.a_verifier && <p style={{ margin: 0, fontSize: 13, color: '#2E6FDB' }}>Proposée par Claude : à vérifier.</p>}
            {!lectureSeule && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {piece.a_verifier && <button type="button" style={petitBouton} onClick={() => onModifier(piece.id, { a_verifier: false })}>Contour juste</button>}
                <button
                  type="button" style={petitBouton} disabled={sommet == null || piece.contour.length <= 3}
                  onClick={() => { onModifier(piece.id, { contour: retirerSommet(piece.contour, sommet) }); setSommet(null) }}
                >Retirer le sommet</button>
                <button type="button" style={{ ...petitBouton, color: '#B42318' }} onClick={() => { onSupprimer(piece.id); choisir(null) }}><Trash2 size={14} />Supprimer</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tries.map((p) => {
            const e = ecartSurface(p.contour, Number(p.surface_lue))
            const alerte = p.a_verifier || (e != null && Math.abs(e) > SEUIL_ECART)
            return (
              <button
                key={p.id} type="button" onClick={() => choisir(p.id)}
                style={{ textAlign: 'left', minHeight: 40, padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: p.id === choisie ? 'var(--affaire-accent-light, #FCEEE7)' : 'transparent', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <span>{p.numero ? `${p.numero} · ` : ''}{p.nom || 'Sans nom'}</span>
                <span style={{ color: alerte ? '#B54708' : '#9C9591' }}>{alerte ? 'à vérifier' : fmtM2(aire(p.contour))}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3 : `npm run build`** — PASS. **Step 4 : commit** `feat: état des lieux — correction des pièces sur le plan`.

---

### Task 13 : Module, menu, hors ligne, documentation, livraison

**Files:**
- Create: `src/modules/etude/etat-des-lieux/index.jsx`
- Modify: `src/modules/manifest.js` (phase `etude`, après `pieces-ecrites`)
- Modify: `src/affaire/AffairePage.jsx` (`ICON_MAP`)
- Modify: `src/admin/gestionAppLogique.js` (`SORTES`)
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` (§ 8 : source d'un PDF)

**Interfaces:**
- Consumes : `useEtatDesLieux` (T10), `BUCKET_EDL`, `enregistrerPieces`, `supprimerEtat` (T10), `ImportEdl` (T11), `EditeurPieces` (T12), `useLiensSignes` (`comptes-rendus/useLiensSignes.js`), `garderImages` (`comptes-rendus/horsLigne/images.js`).

- [ ] **Step 1 : `index.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiensSignes } from '../../chantier/comptes-rendus/useLiensSignes'
import { garderImages } from '../../chantier/comptes-rendus/horsLigne/images'
import { useEtatDesLieux } from './useEtatDesLieux'
import { BUCKET_EDL, enregistrerPieces, supprimerEtat } from './edlDonnees'
import { ImportEdl } from './ImportEdl'
import { EditeurPieces } from './EditeurPieces'

// ─── État des lieux d'un bâtiment existant ───────────────────────────────────
//
// Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md.
// Lot 1 : importer les plans de l'existant, relire et corriger les pièces de
// chaque étage. Ouvert avec du réseau, le module recopie les images des
// étages sur l'appareil ; sans réseau, il les relit de là.

const onglet = (actif) => ({
  minHeight: 40, padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
  border: actif ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
  background: actif ? 'var(--affaire-accent)' : 'white', color: actif ? 'white' : '#1F1B17',
})

export default function EtatDesLieuxModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const edl = useEtatDesLieux(affaireId)
  const { obtenirLiens } = useLiensSignes(BUCKET_EDL)
  const [niveauId, setNiveauId] = useState(null)
  const [reimport, setReimport] = useState(false)
  const [confirmer, setConfirmer] = useState(false)

  const niveau = edl.niveaux.find((n) => n.id === niveauId) ?? edl.niveaux[0]

  useEffect(() => {
    if (!edl.charge || !navigator.onLine || !edl.niveaux.length) return
    garderImages(edl.niveaux.flatMap((n) => [n.chemin_apercu, n.chemin]), obtenirLiens).catch(() => {})
  }, [edl.charge, edl.niveaux, obtenirLiens])

  if (edl.indisponible) return <p style={{ fontSize: 13, color: '#5E5854' }}>L’état des lieux demande la migration 077 dans Supabase.</p>
  if (!edl.charge) return <p style={{ fontSize: 13, color: '#5E5854' }}>Chargement…</p>

  if (!edl.niveaux.length || reimport) {
    if (lectureSeule) return <p style={{ fontSize: 13, color: '#5E5854' }}>Aucun plan de l’existant importé pour cette affaire.</p>
    return (
      <ImportEdl
        affaireId={affaireId}
        onAnnuler={reimport ? () => setReimport(false) : null}
        onTermine={() => { setReimport(false); setNiveauId(null); edl.recharger() }}
      />
    )
  }

  const remplacer = async () => {
    setConfirmer(false)
    try {
      await supprimerEtat(affaireId, edl.niveaux)
      setReimport(true)
      edl.recharger()
    } catch (err) {
      edl.setErreur(err?.message ?? String(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 230px)', minHeight: 520 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {edl.niveaux.map((n) => (
          <button key={n.id} type="button" style={onglet(n.id === niveau?.id)} onClick={() => setNiveauId(n.id)}>
            {n.nom} · {edl.pieces.filter((p) => p.niveau_id === n.id).length}
          </button>
        ))}
        {!lectureSeule && niveau && (
          <input
            aria-label="Nom de l’étage" defaultValue={niveau.nom} key={niveau.id}
            onBlur={(e) => { const nom = e.target.value.trim(); if (nom && nom !== niveau.nom) edl.renommerNiveau(niveau.id, nom) }}
            style={{ minHeight: 36, padding: '0 10px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.2)', fontSize: 14 }}
          />
        )}
        <span style={{ flex: 1 }} />
        {!lectureSeule && !confirmer && (
          <button type="button" style={onglet(false)} onClick={() => setConfirmer(true)}>Remplacer les plans</button>
        )}
        {confirmer && (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            Les étages et les pièces corrigées seront perdus.
            <button type="button" style={{ ...onglet(true), background: '#B42318' }} onClick={remplacer}>Remplacer</button>
            <button type="button" style={onglet(false)} onClick={() => setConfirmer(false)}>Annuler</button>
          </span>
        )}
      </div>
      {edl.erreur && <p style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{edl.erreur}</p>}
      {niveau && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <EditeurPieces
            key={niveau.id}
            niveau={niveau}
            pieces={edl.pieces.filter((p) => p.niveau_id === niveau.id)}
            obtenirLiens={obtenirLiens}
            lectureSeule={lectureSeule}
            onModifier={edl.modifierPiece}
            onAjouter={edl.ajouterPiece}
            onSupprimer={edl.supprimerPiece}
            onAjouterPlusieurs={async (niveauIdCible, pieces) => { await enregistrerPieces(affaireId, niveauIdCible, pieces); edl.recharger() }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2 : manifeste, icône, stockage**

`src/modules/manifest.js`, dans `modules` de la phase `etude`, juste après l'objet `pieces-ecrites` :

```js
      {
        // Plans de l'existant, pièces repérées ; visite enregistrée et export
        // DXF aux lots suivants (docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md)
        id: 'etat-des-lieux',
        label: 'État des lieux',
        icon: 'ScanLine',
        path: 'etat-des-lieux',
        component: lazy(() => import('./etude/etat-des-lieux')),
        enabled: true,
        description: 'Plans de l’existant, pièces repérées, visite enregistrée',
      },
```

`src/affaire/AffairePage.jsx` : ajouter `ScanLine` à l'import `lucide-react` existant (ligne 3) et `ScanLine,` dans `ICON_MAP` (la tuile appelle `<Icon …/>` sans garde : une icône absente casserait la page). En attendant un dessin de l'agence dans `IconesAffaire.jsx`.

`src/admin/gestionAppLogique.js`, dans `SORTES` :

```js
  { sorte: 'etat-des-lieux', libelle: 'États des lieux', buckets: ['edl'] },
```

- [ ] **Step 3 : vérifications automatiques**

Run: `npm test` — Expected : PASS (les tests existants de `gestion-application.test.js` compris ; si l'un d'eux compte les sortes, mettre à jour l'attendu).
Run: `npm run build` — Expected : PASS.
Run: `npx eslint src/modules/etude/etat-des-lieux api/edl-pieces.js` — Expected : aucun problème nouveau.

- [ ] **Step 4 : essai réel dans l'application (avec la migration 077 passée)**

Utiliser la compétence `run` ou `npm run dev`, ouvrir une affaire de test → « État des lieux ».
1. Importer un faux `.dwg` (copier un DXF et remplacer ses premiers octets par `AC1032`) : message du DWG mot pour mot.
2. Importer `24073-RDC.dxf` : un étage « Rez-de-chaussée », ≈ 20 pièces lues, contours en orange sur le plan, surfaces dessinées ≈ surfaces écrites.
3. Remplacer par `Batiment 3 sous sol RDC 100°.dxf` : « Sous-sol » (pièces proposées par Claude, en bleu « à vérifier », si `ANTHROPIC_API_KEY` est présente en local — sinon avertissement et étage vide) et « Rez-de-chaussée » (≈ 200 pièces).
4. Déplacer un sommet, ajouter un sommet par un rond de milieu, dessiner une pièce, la renommer, la supprimer ; recharger la page : tout est resté.
5. Importer `Batiment 3 sous sol RDC 100°.pdf` (échelle 1/100 lue) : deux étages découpés, pièces proposées.
6. Couper le réseau (outils du navigateur) après une ouverture : les images des étages s'affichent encore.

Noter dans le compte rendu de fin de lot ce qui a été constaté (nombres de pièces, temps de l'analyse par Claude).

- [ ] **Step 5 : documentation**

`CLAUDE.md` : dans le tableau « Où se trouve quoi » rien ; ajouter une section après « Pièces écrites » :

```markdown
## État des lieux (`src/modules/etude/etat-des-lieux/`)

Bâtiment existant : plans de l'existant → étages et pièces → (lots 2 à 4)
visite enregistrée pièce par pièce, analyse par Claude, export DXF par
calques `EDL-` et rapport PDF. Conception :
`docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` ; plan du
lot 1 : `docs/superpowers/plans/2026-11-17-etat-des-lieux-lot1-preparer.md`.

- **Formats** (`formatPlanEdl.js`, au contenu) : DXF texte et PDF vectorisé.
  DWG refusé avec le message de l'agence (Enregistrer sous → DXF) ; DXF
  binaire et PDF scanné refusés aussi.
- **DXF** (`dxfLecture.js`) : blocs déployés (ArchiCAD range le plan dans
  des blocs de vues, un par étage), espace papier ignoré sauf si l'espace
  objet est vide, MTEXT nettoyés (`^J`, `\P`, codes de police). Fichiers
  R14 décodés en Windows-1252.
- **Pièces** (`piecesDxfLogique.js`) : **jamais reconstruites depuis les
  murs**. Le calque des pièces est celui dont les polylignes fermées
  contiennent une surface écrite égale à la surface dessinée ; le rapport
  donne l'unité (zones ArchiCAD en cm, géomètre en m). « HP » = hauteur sous
  plafond ; « Hp » (porte) et « HSP » (poutre) ignorés — la casse compte.
- **Étages** (`niveauxLogique.js`) : par nom de bloc ou de calque (RDC,
  SSOL / SOUS-SOL, R+n, Combles — les étages d'ArchiCAD sont superposés),
  sinon grappes de traits (cellule d'un mètre) et grappe qui porte les
  pièces ; nom d'après le fichier s'il n'y a qu'un étage.
- **Claude** (`piecesIaLogique.js`, `api/edl-pieces.js`, SDK Anthropic,
  `claude-opus-5-5`, sortie JSON imposée, replis `fallbacks: 'default'`) :
  seulement pour un PDF ou un étage sans contours ; reçoit l'image (2 000 px)
  et les textes positionnés ; pièces « à vérifier » (bleu). Crédits API du
  forfait Max (organisation « JGA's Individual Org »).
- **Repère** : contours en mètres dans le repère du plan d'origine (y vers
  le haut) ; `edl_niveaux.cadrage` lie mètres et pixels de l'image
  (`versPixels` / `versMetres`). Un PDF : 1 point = 0,0254 / 72 m × échelle.
- **Données** (migration 077) : `edl_etats` (un par affaire), `edl_niveaux`
  (image 6 000 px + aperçu, textes du plan, source compressée), `edl_pieces`
  (contour, surface et HP lues, origine dxf / ia / main, `a_verifier`,
  `fiche` pour le lot 3). Stockage privé `edl` (`<affaire>/edl/…`), compté
  par `fichiers_orphelins()` et la gestion de l'application. « Remplacer les
  plans » supprime tout l'état des lieux.
- **Écran** : `EditeurPieces` sur `VisionneusePlan` (nouvelle prop `calque`,
  SVG au-dessus de l'image) : sommets déplacés au doigt, rond de milieu =
  nouveau sommet, `pointercancel` = rien d'enregistré.
```

Dans la liste des migrations de `CLAUDE.md` (« 76 fichiers ») : passer à 77 ; dans la ligne `npm test` en tête : ajouter « état des lieux » à l'énumération et mettre à jour le nombre de tests d'après la sortie de `npm test`.

Spec, § 8, remplacer la phrase sur la source d'un PDF par : « ou, pour un PDF, le fichier PDF compressé : ses traits seront convertis au moment de l'export (lot 4) ».

- [ ] **Step 6 : commit et envoi**

```bash
git add src/modules/etude/etat-des-lieux src/modules/manifest.js src/affaire/AffairePage.jsx src/admin/gestionAppLogique.js CLAUDE.md docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md
git commit -m "feat: état des lieux — module, menu, copie hors ligne des étages

Lot 1 « Préparer » : plans de l'existant importés (DXF ou PDF vectorisé,
DWG refusé), étages et pièces lus ou proposés par Claude, corrigés sur le
plan. Migration 077 à passer dans Supabase.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

Prévenir l'agence : **passer la migration 077** dans le SQL Editor de Supabase ; `ANTHROPIC_API_KEY` est déjà en place dans Vercel.

---

## Revue du plan

- **Couverture de la spec (lot 1)** : formats et refus (T2, T11), DXF (T4), pièces sans IA (T5), étages (T6), PDF et échelle (T7, T9, T11), Claude pour PDF / étage sans contours (T8, T11, T12), correction à l'écran (T12), échelle contrôlée par les surfaces (T5 Step 5, T12 écart), consultation hors ligne (T13), données et stockage (T1, T10), documentation (T13). La « Préparation pour la visite » complète (journal, file hors ligne) relève du lot 2.
- **Noms** : `detecterPieces`, `proposerNiveaux`, `uniteParDefaut`, `versPixels` / `versMetres`, `proposerPiecesIa`, `versPiecesEdl`, `enregistrerPieces`, `useEtatDesLieux` — mêmes signatures partout.
- **Risques connus** : entités DXF à direction d'extrusion inversée (symétries anciennes) ignorées — à surveiller sur d'autres plans ; contours de Claude approximatifs (correction prévue) ; temps de l'analyse sur un très grand étage (fonction à 300 s).
