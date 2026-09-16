-- Migration 050 : comptes extérieurs — les portes fermées en base
--
-- Jusqu'ici, presque toutes les tables portaient la même règle : « tout
-- utilisateur connecté a le droit ». Le tri par affaire n'existait qu'à
-- l'écran. Un compte extérieur (BET, confrère) lirait donc le suivi financier
-- de toutes les affaires.
--
-- Cette migration ne change rien pour l'agence. Elle pose :
--   · le type de compte (agence / extérieur), extérieur par défaut ;
--   · l'auteur d'une remarque, d'une photo, d'une pastille ;
--   · les règles qui ferment à un extérieur tout ce qui ne le regarde pas
--     (finances, FTM, plannings, OPR, carnet d'adresses, outils) et limitent
--     le reste aux affaires où il est invité.
--
-- Un extérieur n'écrit encore nulle part : ses propres remarques viendront
-- avec le lot suivant. Fermer d'abord, ouvrir ensuite.

-- ─── 1. Type de compte ────────────────────────────────────────────────────────
--
-- « extérieur » par défaut : un compte créé et oublié ne voit rien. Les
-- comptes déjà là sont ceux de l'agence — la reprise n'a lieu qu'à la
-- création de la colonne, pour ne pas repasser un extérieur en agence si la
-- migration est rejouée.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'type_compte'
  ) then
    alter table profiles
      add column type_compte text not null default 'exterieur'
        check (type_compte in ('agence', 'exterieur'));
    update profiles set type_compte = 'agence';
  end if;
end $$;

-- Un intervenant extérieur est un collaborateur de l'affaire, avec ce rôle
alter table affaire_collaborateurs drop constraint if exists affaire_collaborateurs_role_check;
alter table affaire_collaborateurs
  add constraint affaire_collaborateurs_role_check
  check (role in ('proprietaire', 'collaborateur', 'exterieur'));

-- ─── 2. De quoi écrire les règles ─────────────────────────────────────────────
--
-- `security definer` : ces fonctions lisent `profiles` et
-- `affaire_collaborateurs` sans que l'utilisateur ait besoin d'y accéder, et
-- sans relancer les règles de ces tables (ce qui tournerait en rond).

create or replace function public.est_agence() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.type_compte = 'agence' from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.membre_affaire(cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.affaire_collaborateurs ac
    where ac.affaire_id = cible and ac.user_id = auth.uid()
  )
$$;

-- Accès à une affaire : l'agence les voit toutes, un extérieur seulement les siennes
create or replace function public.acces_affaire(cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_agence() or public.membre_affaire(cible)
$$;

-- L'affaire d'un compte rendu, pour les tables qui ne portent que `cr_id`
create or replace function public.affaire_du_cr(cible uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select cr.affaire_id from public.comptes_rendus cr where cr.id = cible
$$;

grant execute on function public.est_agence(), public.membre_affaire(uuid),
  public.acces_affaire(uuid), public.affaire_du_cr(uuid) to authenticated;

-- Un extérieur ne se promeut pas lui-même
create or replace function public.profils_verrou_type() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Sans session (éditeur SQL de Supabase, clé de service), c'est
  -- l'administrateur qui écrit : c'est ainsi qu'on désigne un compte extérieur.
  if auth.uid() is null then return new; end if;
  if new.type_compte is distinct from old.type_compte and not public.est_agence() then
    raise exception 'Le type de compte ne se change pas depuis l''application.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_verrou_type on profiles;
create trigger profiles_verrou_type
  before update on profiles
  for each row execute function public.profils_verrou_type();

-- ─── 3. Auteur des contenus rédigés ───────────────────────────────────────────
--
-- Renseigné par défaut à l'écriture. Les lignes déjà là restent sans auteur :
-- ce sont celles de l'agence, et `est_agence()` suffit à les protéger.

alter table cr_remarques add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table cr_photos    add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table cr_pastilles add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table cr_remarques alter column created_by set default auth.uid();
alter table cr_photos    alter column created_by set default auth.uid();
alter table cr_pastilles alter column created_by set default auth.uid();

create index if not exists cr_remarques_auteur_idx on cr_remarques (created_by);

-- ─── 4. Les portes fermées ────────────────────────────────────────────────────
--
-- Tout ce qui ne concerne pas les comptes rendus : réservé à l'agence.

do $$
declare t text;
begin
  foreach t in array array[
    'lignes_financieres', 'estimations_lots', 'suivi_financier_etude', 'ftm',
    'planning', 'planning_jalons', 'planning_segments', 'planning_dependances',
    'planning_etude_phases', 'planning_etude_jalons', 'planning_etude_segments',
    'periodes_bloquees',
    'opr_visites', 'opr_reserves', 'opr_constats', 'opr_photos', 'opr_pastilles',
    'opr_presences', 'opr_archives', 'opr_diffusions', 'opr_pv',
    'heures', 'todos', 'rapports_chantier', 'cr_sections_template', 'remarques_types',
    'cr_diffusions'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format('drop policy if exists "Authenticated users" on %I', t);
    execute format('drop policy if exists "Agence" on %I', t);
    execute format(
      'create policy "Agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
  end loop;
end $$;

-- Le carnet d'adresses : l'agence entière, et pour un extérieur seulement les
-- entreprises et interlocuteurs qui interviennent sur ses affaires (une
-- feuille de présence les nomme).
do $$
declare t text;
begin
  foreach t in array array['entreprises', 'interlocuteurs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format('drop policy if exists "Authenticated users" on %I', t);
    execute format('drop policy if exists "Agence" on %I', t);
    execute format('drop policy if exists "Agence écrit" on %I', t);
    execute format('create policy "Agence écrit" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
  end loop;
end $$;

drop policy if exists "Lecture des entreprises de ses affaires" on entreprises;
create policy "Lecture des entreprises de ses affaires" on entreprises
  for select to authenticated using (
    public.est_agence() or exists (
      select 1 from lot_entreprises le
      where le.entreprise_id = entreprises.id and public.membre_affaire(le.affaire_id)
    )
  );

drop policy if exists "Lecture des interlocuteurs de ses affaires" on interlocuteurs;
create policy "Lecture des interlocuteurs de ses affaires" on interlocuteurs
  for select to authenticated using (
    public.est_agence() or exists (
      select 1 from lot_entreprises le
      where le.interlocuteur_id = interlocuteurs.id and public.membre_affaire(le.affaire_id)
    )
  );

-- ─── 5. Les affaires et leurs comptes rendus ──────────────────────────────────
--
-- Lecture ouverte aux membres de l'affaire, écriture réservée à l'agence : un
-- extérieur consulte, il n'écrit pas encore.

do $$
declare t text;
begin
  foreach t in array array[
    'comptes_rendus', 'cr_remarques', 'cr_photos', 'cr_pastilles', 'cr_archives',
    'affaire_plans', 'affaire_interlocuteurs', 'lots', 'lot_entreprises', 'planning_zones'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format('drop policy if exists "Authenticated users" on %I', t);
    execute format('drop policy if exists "Lecture des membres" on %I', t);
    execute format('drop policy if exists "Écriture agence" on %I', t);
    execute format(
      'create policy "Lecture des membres" on %I for select to authenticated using (public.acces_affaire(affaire_id))', t);
    execute format(
      'create policy "Écriture agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
  end loop;
end $$;

-- Les tables qui ne portent que le compte rendu (ou le plan) : même règle, en
-- remontant d'un cran.
do $$
declare t text;
begin
  foreach t in array array['cr_sections', 'cr_sous_sections', 'cr_presences'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format('drop policy if exists "Authenticated users" on %I', t);
    execute format('drop policy if exists "Lecture des membres" on %I', t);
    execute format('drop policy if exists "Écriture agence" on %I', t);
    execute format(
      'create policy "Lecture des membres" on %I for select to authenticated using (public.acces_affaire(public.affaire_du_cr(cr_id)))', t);
    execute format(
      'create policy "Écriture agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
  end loop;
end $$;

alter table affaire_plan_versions enable row level security;
drop policy if exists "Authenticated" on affaire_plan_versions;
drop policy if exists "Lecture des membres" on affaire_plan_versions;
drop policy if exists "Écriture agence" on affaire_plan_versions;
create policy "Lecture des membres" on affaire_plan_versions
  for select to authenticated using (
    exists (select 1 from affaire_plans p where p.id = affaire_plan_versions.plan_id and public.acces_affaire(p.affaire_id))
  );
create policy "Écriture agence" on affaire_plan_versions
  for all to authenticated using (public.est_agence()) with check (public.est_agence());

-- L'affaire elle-même : un extérieur ne voit que les siennes, et n'y touche pas.
-- Les anciens noms de règles sont tous retirés : il suffit qu'une règle
-- permissive d'avant survive pour que tout ce qui précède ne serve à rien.
drop policy if exists "Lecture affaires authentifiées" on affaires;
drop policy if exists "Authenticated" on affaires;
drop policy if exists "Authenticated users" on affaires;
drop policy if exists "Enable read access for all users" on affaires;
drop policy if exists "Enable insert for authenticated users only" on affaires;
drop policy if exists "Lecture des affaires accessibles" on affaires;
create policy "Lecture des affaires accessibles" on affaires
  for select to authenticated using (public.acces_affaire(id));

drop policy if exists "Création affaire authentifiée" on affaires;
create policy "Création affaire authentifiée" on affaires
  for insert to authenticated with check (public.est_agence());

-- Modification et suppression : l'agence, propriétaire de l'affaire (une
-- affaire sans propriétaire déclaré reste modifiable, comme avant).
drop policy if exists "Modification par propriétaire" on affaires;
create policy "Modification par propriétaire" on affaires
  for update to authenticated using (
    public.est_agence() and (
      exists (select 1 from affaire_collaborateurs ac where ac.affaire_id = affaires.id and ac.user_id = auth.uid() and ac.role = 'proprietaire')
      or not exists (select 1 from affaire_collaborateurs ac where ac.affaire_id = affaires.id and ac.role = 'proprietaire')
    )
  );

drop policy if exists "Suppression par propriétaire" on affaires;
create policy "Suppression par propriétaire" on affaires
  for delete to authenticated using (
    public.est_agence() and exists (
      select 1 from affaire_collaborateurs ac
      where ac.affaire_id = affaires.id and ac.user_id = auth.uid() and ac.role = 'proprietaire'
    )
  );

-- Les collaborateurs : chacun voit les lignes de ses affaires, l'agence gère
drop policy if exists "Lecture des collaborateurs" on affaire_collaborateurs;
create policy "Lecture des collaborateurs" on affaire_collaborateurs
  for select to authenticated using (public.acces_affaire(affaire_id));
drop policy if exists "Ajout de collaborateurs" on affaire_collaborateurs;
create policy "Ajout de collaborateurs" on affaire_collaborateurs
  for insert to authenticated with check (public.est_agence());
drop policy if exists "Suppression de collaborateurs" on affaire_collaborateurs;
create policy "Suppression de collaborateurs" on affaire_collaborateurs
  for delete to authenticated using (public.est_agence());

-- Les profils : lisibles (une remarque porte le nom de son auteur), mais
-- chacun ne modifie que le sien.
drop policy if exists "Lecture de tous les profils" on profiles;
create policy "Lecture de tous les profils" on profiles
  for select to authenticated using (true);

-- ─── 6. Les fichiers ──────────────────────────────────────────────────────────
--
-- Photos, plans et archives PDF sont rangés sous l'identifiant de l'affaire
-- (`<affaire_id>/…`) : le premier dossier du chemin dit à qui le fichier
-- appartient. C'est ce qui permet de fermer le stockage comme les tables.

do $$
declare b text;
begin
  foreach b in array array['cr-photos', 'cr-plans', 'cr-archives'] loop
    execute format('drop policy if exists %I on storage.objects', 'Auth read ' || b);
    execute format('drop policy if exists %I on storage.objects', 'Auth upload ' || b);
    execute format('drop policy if exists %I on storage.objects', 'Auth delete ' || b);
    execute format('drop policy if exists %I on storage.objects', 'Lecture ' || b);
    execute format('drop policy if exists %I on storage.objects', 'Écriture agence ' || b);
    execute format(
      'create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.acces_affaire(nullif(split_part(name, ''/'', 1), '''')::uuid))',
      'Lecture ' || b, b);
    execute format(
      'create policy %I on storage.objects for all to authenticated using (bucket_id = %L and public.est_agence()) with check (bucket_id = %L and public.est_agence())',
      'Écriture agence ' || b, b, b);
  end loop;
end $$;

notify pgrst, 'reload schema';
