-- Migration 068 : statut d'administrateur, invisible
--
-- Un compte de l'agence qui doit tout voir de Gestion d'agence (veiller sur
-- l'application) sans être associé : mêmes accès qu'un associé, mais jamais
-- présenté ni compté comme tel (liste des associés, tuile, calendrier).
-- La case ne se coche que depuis l'éditeur SQL de Supabase : personne ne se
-- l'attribue depuis l'application, associés compris.
--
-- Rejouable. Suppose la migration 067.

alter table profiles add column if not exists est_admin boolean not null default false;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.est_admin and p.type_compte = 'agence' from public.profiles p where p.id = auth.uid()), false)
$$;

-- Qui entre dans Gestion d'agence : les associés et l'administrateur
create or replace function public.acces_gestion() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_associe() or public.est_admin()
$$;

grant execute on function public.est_admin(), public.acces_gestion() to authenticated;

-- La case d'administrateur : éditeur SQL seulement
create or replace function public.profils_verrou_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.est_admin is distinct from old.est_admin then
    raise exception 'Le statut d''administrateur ne se change pas depuis l''application.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_verrou_admin on profiles;
create trigger profiles_verrou_admin
  before update on profiles
  for each row execute function public.profils_verrou_admin();

-- L'administrateur désigne aussi les associés (067 : réservé aux associés)
create or replace function public.profils_verrou_associe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.est_associe is distinct from old.est_associe and not public.acces_gestion() then
    raise exception 'Seul un associé désigne les associés.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.designer_associe(compte uuid, valeur boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.acces_gestion() then
    raise exception 'Seul un associé désigne les associés.' using errcode = 'P0001';
  end if;
  if compte = auth.uid() and not valeur and public.est_associe() then
    raise exception 'Un associé ne se retire pas lui-même.' using errcode = 'P0001';
  end if;
  if valeur and not exists (select 1 from public.profiles p where p.id = compte and p.type_compte = 'agence') then
    raise exception 'Seul un compte de l''agence peut être associé.' using errcode = 'P0001';
  end if;
  update public.profiles set est_associe = valeur where id = compte;
end $$;

notify pgrst, 'reload schema';

-- Désigner l'administrateur, dans l'éditeur SQL (adresse à remplacer ;
-- jamais dans ce fichier, le dépôt est public) :
--
--   update profiles set est_admin = true, est_associe = false
--   where email = 'administrateur@exemple.fr';
