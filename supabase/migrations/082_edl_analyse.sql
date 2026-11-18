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
-- écriture réservée aux collaborateurs (règle 060). Rejouable. Une fonction,
-- edl_ecrire_analyse, écrit le résultat d'une analyse en une transaction.

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

-- Écriture du résultat d'une analyse, en une seule transaction : la pièce
-- est verrouillée, puis ses propositions de Claude remplacées et sa fiche
-- écrite ensemble — ou rien, si la pièce a bougé depuis la version réservée
-- par l'appareil (`p_version` = updated_at rendu par la réservation). Deux
-- analyses d'une même pièce ne mélangent ainsi jamais la fiche de l'une et
-- les éléments de l'autre. `security invoker` : les règles RLS de
-- l'appelant s'appliquent (« Agence » et les restrictives des
-- collaborateurs) ; un refus fait tout annuler.
--
-- Rend { statut: 'ok', updated_at, remplaces, ajoutes }, { statut:
-- 'conflit', updated_at } (rien d'écrit), ou { statut: 'introuvable' } (pièce
-- supprimée, ou que les règles ne laissent pas modifier).
-- `p_garder_fiche` : la fiche a été corrigée ou validée au bureau pendant
-- l'appel ; elle reste, sa marque « à valider » aussi.
create or replace function public.edl_ecrire_analyse(
  p_piece uuid,
  p_version timestamptz,
  p_fiche jsonb,
  p_elements jsonb,
  p_analyse_le timestamptz,
  p_garder_fiche boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_piece edl_pieces%rowtype;
  v_version timestamptz;
  v_remplaces integer;
  v_ajoutes integer;
begin
  -- `for update` applique aussi les règles de modification : une pièce
  -- qu'on ne peut pas modifier n'est pas trouvée
  select * into v_piece from edl_pieces where id = p_piece for update;
  if not found then
    return jsonb_build_object('statut', 'introuvable');
  end if;
  if v_piece.updated_at is distinct from p_version then
    return jsonb_build_object('statut', 'conflit', 'updated_at', v_piece.updated_at);
  end if;

  delete from edl_elements
   where piece_id = p_piece and origine = 'ia' and a_valider;
  get diagnostics v_remplaces = row_count;

  -- Un identifiant déjà en base (élément validé entre deux essais) reste tel quel
  insert into edl_elements (
    id, affaire_id, niveau_id, piece_id, point_id, calque, "type", libelle, cotes, extrait,
    a_valider, a_verifier, origine, valide_le
  )
  select e.id, v_piece.affaire_id, v_piece.niveau_id, p_piece, e.point_id, e.calque, e."type",
         coalesce(e.libelle, ''), e.cotes, e.extrait, true, coalesce(e.a_verifier, false), 'ia', null
    from jsonb_to_recordset(coalesce(p_elements, '[]'::jsonb)) as e(
      id uuid, point_id uuid, calque text, "type" text, libelle text, cotes text, extrait text, a_verifier boolean
    )
  on conflict (id) do nothing;
  get diagnostics v_ajoutes = row_count;

  update edl_pieces set
    fiche = case when p_garder_fiche then fiche else coalesce(p_fiche, '{}'::jsonb) end,
    fiche_a_valider = case when p_garder_fiche then fiche_a_valider else true end,
    analyse_le = p_analyse_le,
    analyse_erreur = null
   where id = p_piece
  returning updated_at into v_version;
  if not found then
    -- Refus des règles sur la pièce : les éléments ne doivent pas rester seuls
    raise exception 'edl_ecrire_analyse : écriture de la pièce refusée' using errcode = '42501';
  end if;

  return jsonb_build_object('statut', 'ok', 'updated_at', v_version, 'remplaces', v_remplaces, 'ajoutes', v_ajoutes);
end $$;

grant execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean) to authenticated;
grant execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean) to service_role;
revoke execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean) from public, anon;

notify pgrst, 'reload schema';
