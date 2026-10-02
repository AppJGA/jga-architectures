-- Migration 055 : généralités des comptes rendus (parties I à V)
--
-- Refonte des comptes rendus, chantier 2. Les parties I à V (mise au point
-- administrative, coordination SPS, mise au point technique, respect, plans et
-- documents) ne sont pas des remarques : elles se répètent presque à
-- l'identique d'un CR à l'autre et d'une affaire à l'autre. Elles se saisissent
-- donc une fois par affaire, s'importent d'une autre affaire, et s'impriment
-- dans chaque compte rendu.
--
-- `contenu` : { "parties": [{ id, numero_romain, titre, paragraphes: [...],
--   rubriques: [{ id, code, titre, paragraphes: [{ id, date, texte, suite }] }] }] }
-- La forme est tenue par l'application (generalitesLogique.js).
--
-- Un CR émis en garde une copie (`comptes_rendus.generalites`), faite à
-- l'émission comme l'avancement des lots (migration 049) : modifier ensuite les
-- généralités de l'affaire ne change pas un compte rendu déjà diffusé.
--
-- Droits (migration 050) : les membres de l'affaire lisent (un intervenant
-- extérieur voit les généralités des CR qu'il consulte), l'agence seule écrit.
--
-- Rejouable.

create table if not exists affaire_generalites (
  affaire_id uuid primary key references affaires(id) on delete cascade,
  contenu    jsonb not null default '{"parties": []}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table affaire_generalites enable row level security;

drop policy if exists "Lecture des membres" on affaire_generalites;
create policy "Lecture des membres" on affaire_generalites
  for select to authenticated using (public.acces_affaire(affaire_id));

drop policy if exists "Écriture agence" on affaire_generalites;
create policy "Écriture agence" on affaire_generalites
  for all to authenticated using (public.est_agence()) with check (public.est_agence());

drop trigger if exists affaire_generalites_updated_at on affaire_generalites;
create trigger affaire_generalites_updated_at
  before update on affaire_generalites
  for each row execute function update_updated_at();

alter table comptes_rendus add column if not exists generalites jsonb;

notify pgrst, 'reload schema';
