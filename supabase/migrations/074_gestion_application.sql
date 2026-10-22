-- Migration 074 : « Gestion de l'application » — lectures de l'administrateur
--
-- Le tableau de bord de l'administrateur (profiles.est_admin, migration 068)
-- montre la place occupée (fichiers, base) et les comptes. Ces chiffres ne se
-- lisent pas avec les droits ordinaires : stockage brut, taille de la base,
-- auth.users. D'où trois fonctions `security definer`, qui refusent tout
-- autre appelant que l'administrateur.
--
-- Aucune table : la règle des droits d'API de Supabase du 2026-10-30 ne
-- concerne pas cette migration.
--
-- Rejouable.

-- Fichiers par dossier de stockage et par affaire : le premier dossier d'un
-- chemin est l'identifiant de l'affaire (règle de la migration 050) ; un
-- chemin rangé autrement compte sans affaire.
create or replace function public.admin_stockage()
returns table (bucket text, affaire_id uuid, fichiers bigint, octets bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select o.bucket_id::text,
           case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(o.name, '/', 1)::uuid end,
           count(*)::bigint,
           coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
    group by 1, 2;
end $$;

-- Taille de la base (l'offre gratuite en permet 500 Mo)
create or replace function public.admin_base()
returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  return pg_catalog.pg_database_size(pg_catalog.current_database());
end $$;

-- Comptes : tous ceux de l'authentification, même sans fiche de profil (un
-- compte sans profil ne voit rien : c'est ce qu'il faut repérer)
create or replace function public.admin_comptes()
returns table (
  id uuid, email text, prenom text, nom text, type_compte text,
  est_associe boolean, est_admin boolean,
  cree_le timestamptz, derniere_connexion timestamptz, a_un_profil boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.prenom, p.nom, p.type_compte,
           coalesce(p.est_associe, false), coalesce(p.est_admin, false),
           u.created_at, u.last_sign_in_at, p.id is not null
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.last_sign_in_at desc nulls last;
end $$;

revoke all on function public.admin_stockage(), public.admin_base(), public.admin_comptes() from public, anon;
grant execute on function public.admin_stockage(), public.admin_base(), public.admin_comptes() to authenticated;

notify pgrst, 'reload schema';
