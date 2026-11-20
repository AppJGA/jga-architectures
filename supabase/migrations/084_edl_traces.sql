-- Migration 084 : état des lieux — liaisons interrupteur → luminaire et cotes
--
-- À passer dans le SQL Editor de Supabase. Sans elle, l'app masque « Relier »
-- et « Coter » dans la visite, et tout le reste marche comme avant.
--
-- Plan : docs/superpowers/plans/2026-11-20-etat-des-lieux-liaisons-cotes.md.
-- Une trace est dessinée sur le plan d'un étage, à côté des points :
--   · sorte 'commande' : un interrupteur (point_a) relié au luminaire qu'il
--     commande (point_b) ; supprimer l'un des deux points emporte la liaison ;
--   · sorte 'cote'     : une cote entre deux angles d'une pièce, en mètres,
--     repère du plan d'origine (xa, ya) → (xb, yb), comme les points ; sa
--     valeur est le texte dit ou tapé (« 3,45 m »), nulle tant que personne
--     ne l'a donnée.
-- Un geste à la main crée la trace tout de suite depuis la tablette, souvent
-- sans réseau : l'identifiant est décidé sur l'appareil (aucun défaut), un
-- envoi rejoué écrit la même ligne. Claude propose à l'analyse des liaisons
-- (origine 'ia') et la valeur des cotes restées sans valeur (`a_valider`),
-- écrites dans la même transaction que la fiche (edl_ecrire_analyse).
--
-- Le journal de la visite note aussi les touchers (un point, un angle) et
-- les traces posées ou supprimées : quatre types de plus dans edl_evenements.
--
-- Aucun fichier : fichiers_orphelins() ne change pas. Agence seule ;
-- écriture réservée aux collaborateurs (règle 060). Rejouable.

create table if not exists edl_traces (
  id          uuid primary key,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  -- Visite supprimée : la trace reste, comme ce qu'elle a relevé
  visite_id   uuid references edl_visites(id) on delete set null,
  niveau_id   uuid not null references edl_niveaux(id) on delete cascade,
  -- Pièce corrigée ou supprimée au bureau : la trace reste, rattachée à l'étage
  piece_id    uuid references edl_pieces(id) on delete set null,
  sorte       text not null check (sorte in ('commande', 'cote')),
  -- commande : l'interrupteur puis le luminaire
  point_a     uuid references edl_points(id) on delete cascade,
  point_b     uuid references edl_points(id) on delete cascade,
  -- cote : les deux angles, en mètres
  xa          double precision,
  ya          double precision,
  xb          double precision,
  yb          double precision,
  -- cote : tel que dit ou tapé, « 3,45 m »
  valeur      text,
  origine     text not null default 'main' check (origine in ('main', 'ia')),
  -- proposition de Claude pas encore relue (liaison, ou valeur d'une cote)
  a_valider   boolean not null default false,
  -- mots entendus, montrés à la relecture pour juger la proposition
  extrait     text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint edl_traces_forme check (
    (sorte = 'commande' and point_a is not null and point_b is not null)
    or (sorte = 'cote' and xa is not null and ya is not null and xb is not null and yb is not null)
  )
);

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus d'office une nouvelle
-- table à l'API : sans ces droits, « permission denied ». Pas d'anon.
grant select, insert, update, delete on public.edl_traces to authenticated;
grant select, insert, update, delete on public.edl_traces to service_role;

create index if not exists edl_traces_affaire on edl_traces(affaire_id);
create index if not exists edl_traces_piece on edl_traces(piece_id);
-- La suppression d'un point cherche ses liaisons (cascade)
create index if not exists edl_traces_point_a on edl_traces(point_a);
create index if not exists edl_traces_point_b on edl_traces(point_b);

create or replace function edl_traces_touche() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists edl_traces_touche on edl_traces;
create trigger edl_traces_touche before update on edl_traces
  for each row execute function edl_traces_touche();

-- Même bloc que la 079 et la 082 : la règle « Agence » et les trois
-- restrictives des collaborateurs (060). Aucune autre règle permissive : une
-- seule survivante annulerait tout le reste.
do $$
declare t text;
begin
  foreach t in array array['edl_traces'] loop
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

-- ─── Journal : touchers et traces ───────────────────────────────────────────
-- Les onze types de la 079, plus : un point touché, un angle touché (ce que
-- Claude rapproche de la phrase dite à la même heure), une trace posée ou
-- modifiée, une trace supprimée. La contrainte de la 079 est nommée par
-- PostgreSQL : on retire toute contrainte de vérification qui porte sur
-- `type`, quel que soit son nom, avant de poser la nouvelle.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.edl_evenements'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.edl_evenements drop constraint %I', c);
  end loop;
end $$;

alter table edl_evenements add constraint edl_evenements_type_check check (type in (
  'debut', 'fin', 'entree', 'sortie', 'point', 'point-modifie', 'point-supprime',
  'photo', 'pause', 'reprise', 'coupure',
  'point-touche', 'angle-touche', 'trace', 'trace-supprimee'));

-- ─── Écriture d'une analyse : la 082, plus les traces ───────────────────────
-- Même corps que la 082 ; seul s'ajoute `p_traces` (dernier paramètre, nul
-- par défaut : un appel sans lui fait exactement ce que faisait la 082).
-- L'ancienne signature à six paramètres est retirée d'abord : deux versions
-- rendraient un appel sans `p_traces` ambigu.
--
-- `p_traces` : [{ id, sorte: 'commande', visite_id, point_a, point_b, extrait }]
-- pour une liaison proposée (ajoutée « à valider »), et [{ id, sorte: 'cote',
-- valeur, extrait }] pour la valeur proposée d'une cote existante de la
-- pièce (désignée par son id). Quand il est donné :
--   · les liaisons proposées et pas encore relues de la pièce sont remplacées ;
--   · les valeurs proposées et pas encore relues sont retirées, puis les
--     nouvelles écrites — seulement sur une cote encore sans valeur : une
--     valeur tapée ou validée n'est jamais remplacée ;
--   · une liaison qui existe déjà entre les deux mêmes points, ou dont un
--     point a disparu, n'est pas ajoutée (rien ne fait échouer l'analyse).
drop function if exists public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean);

create or replace function public.edl_ecrire_analyse(
  p_piece uuid,
  p_version timestamptz,
  p_fiche jsonb,
  p_elements jsonb,
  p_analyse_le timestamptz,
  p_garder_fiche boolean default false,
  p_traces jsonb default null
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
  v_traces_remplacees integer := 0;
  v_traces_ajoutees integer := 0;
  v_cotes_lues integer := 0;
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

  if p_traces is not null then
    delete from edl_traces
     where piece_id = p_piece and origine = 'ia' and a_valider;
    get diagnostics v_traces_remplacees = row_count;

    -- Valeurs proposées par une analyse précédente, pas encore relues : la
    -- nouvelle analyse les remplace (la cote, posée à la main, reste)
    update edl_traces set valeur = null, extrait = null, a_valider = false
     where piece_id = p_piece and sorte = 'cote' and origine = 'main' and a_valider;

    insert into edl_traces (
      id, affaire_id, visite_id, niveau_id, piece_id, sorte, point_a, point_b, extrait, origine, a_valider
    )
    select t.id, v_piece.affaire_id, t.visite_id, v_piece.niveau_id, p_piece, 'commande',
           t.point_a, t.point_b, t.extrait, 'ia', true
      from jsonb_to_recordset(p_traces) as t(
        id uuid, sorte text, visite_id uuid, point_a uuid, point_b uuid, extrait text
      )
     where t.sorte = 'commande'
       and t.point_a is not null and t.point_b is not null and t.point_a <> t.point_b
       and exists (select 1 from edl_points p where p.id = t.point_a)
       and exists (select 1 from edl_points p where p.id = t.point_b)
       and not exists (
         select 1 from edl_traces x
          where x.sorte = 'commande' and x.point_a = t.point_a and x.point_b = t.point_b)
    on conflict (id) do nothing;
    get diagnostics v_traces_ajoutees = row_count;

    update edl_traces c set
      valeur = t.valeur,
      extrait = t.extrait,
      a_valider = true
      from jsonb_to_recordset(p_traces) as t(id uuid, sorte text, valeur text, extrait text)
     where t.sorte = 'cote'
       and c.id = t.id
       and c.piece_id = p_piece
       and c.sorte = 'cote'
       and c.valeur is null
       and nullif(btrim(t.valeur), '') is not null;
    get diagnostics v_cotes_lues = row_count;
  end if;

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

  return jsonb_build_object(
    'statut', 'ok', 'updated_at', v_version, 'remplaces', v_remplaces, 'ajoutes', v_ajoutes,
    'traces_remplacees', v_traces_remplacees, 'traces_ajoutees', v_traces_ajoutees, 'cotes_lues', v_cotes_lues
  );
end $$;

grant execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean, jsonb) to authenticated;
grant execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean, jsonb) to service_role;
revoke execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean, jsonb) from public, anon;

notify pgrst, 'reload schema';
