-- Migration 082 : état des lieux — lot 3 (analyser)
--
-- Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md, § 6.
-- Ce que la visite a dit, transcrit morceau par morceau et horodaté, et ce
-- que Claude en tire pour chaque pièce : sa fiche (sol, murs, plafond…) et
-- ses éléments relevés (prises, menuiseries…), proposés puis validés au bureau.
--
--   edl_enregistrements : un morceau audio transcrit. L'identifiant est celui
--                         du morceau sur l'appareil : une transcription
--                         rejouée réécrit la même ligne. Le son n'est jamais
--                         gardé, seulement le texte et ses phrases horodatées ;
--   edl_elements        : un élément relevé. Identifiant décidé sur l'appareil
--                         (une réanalyse ratée puis relancée réécrit les mêmes
--                         lignes). `a_valider` tant que l'agence ne l'a pas
--                         relu ; une réanalyse ne remplace que celles-là ;
--   edl_pieces          : quand la pièce a été analysée, le motif d'un échec,
--                         et la fiche proposée par Claude pas encore relue.
--
-- Aucun fichier : fichiers_orphelins() ne change pas. Agence seule ;
-- écriture réservée aux collaborateurs (règle 060). Rejouable.

create table if not exists edl_enregistrements (
  id          text primary key,
  visite_id   uuid not null references edl_visites(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  -- heure de l'appareil au début du morceau : une phrase se date par
  -- `debut` + son `debut_s`, et se rapproche ainsi des gestes du journal
  debut       timestamptz not null,
  duree_s     numeric,
  -- [{ debut_s, fin_s, texte }], secondes depuis `debut`
  segments    jsonb not null default '[]'::jsonb,
  texte       text not null default '',
  -- faux si Mistral n'a rendu que le texte : un seul segment couvre le morceau
  horodate    boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists edl_elements (
  id          uuid primary key,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  niveau_id   uuid references edl_niveaux(id) on delete cascade,
  piece_id    uuid references edl_pieces(id) on delete cascade,
  -- Point supprimé en visite ou au bureau : l'élément relevé reste
  point_id    uuid references edl_points(id) on delete set null,
  calque      text not null,
  type        text,
  libelle     text not null default '',
  cotes       text,
  -- mots entendus, montrés à la relecture pour juger la proposition
  extrait     text,
  a_valider   boolean not null default true,
  a_verifier  boolean not null default false,
  origine     text not null default 'ia' check (origine in ('ia', 'main')),
  valide_le   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table edl_pieces
  add column if not exists analyse_le timestamptz,
  add column if not exists analyse_erreur text,
  add column if not exists fiche_a_valider boolean not null default false;

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus d'office une nouvelle
-- table à l'API : sans ces droits, « permission denied ». Pas d'anon.
grant select, insert, update, delete on public.edl_enregistrements to authenticated;
grant select, insert, update, delete on public.edl_enregistrements to service_role;
grant select, insert, update, delete on public.edl_elements        to authenticated;
grant select, insert, update, delete on public.edl_elements        to service_role;

create index if not exists edl_enregistrements_visite on edl_enregistrements(visite_id, debut);
create index if not exists edl_enregistrements_affaire on edl_enregistrements(affaire_id);
create index if not exists edl_elements_piece on edl_elements(piece_id);
create index if not exists edl_elements_affaire on edl_elements(affaire_id);

create or replace function edl_elements_touche() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists edl_elements_touche on edl_elements;
create trigger edl_elements_touche before update on edl_elements
  for each row execute function edl_elements_touche();

-- Même bloc que la 079 : la règle « Agence » et les trois restrictives des
-- collaborateurs (060). Aucune autre règle permissive : une seule survivante
-- annulerait tout le reste.
do $$
declare t text;
begin
  foreach t in array array['edl_enregistrements', 'edl_elements'] loop
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

notify pgrst, 'reload schema';
