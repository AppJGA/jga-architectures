-- Migration 067 : associés de l'agence
--
-- Conception : docs/superpowers/specs/2026-10-09-gestion-agence-design.md.
-- Les associés ont accès à « Gestion d'agence » (calendrier des rendus, suivi
-- des tâches, …). Une case sur le compte, que seul un associé peut changer —
-- ou l'éditeur SQL de Supabase, pour désigner les premiers.
--
-- Rejouable.

alter table profiles add column if not exists est_associe boolean not null default false;

create or replace function public.est_associe() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.est_associe and p.type_compte = 'agence' from public.profiles p where p.id = auth.uid()), false)
$$;

grant execute on function public.est_associe() to authenticated;

-- Personne ne se fait associé lui-même
create or replace function public.profils_verrou_associe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Sans session (éditeur SQL, clé de service) : c'est l'administrateur
  if auth.uid() is null then return new; end if;
  if new.est_associe is distinct from old.est_associe and not public.est_associe() then
    raise exception 'Seul un associé désigne les associés.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_verrou_associe on profiles;
create trigger profiles_verrou_associe
  before update on profiles
  for each row execute function public.profils_verrou_associe();

-- Un compte ne modifie que sa propre fiche (migration 003) : désigner un
-- autre associé passe par cette fonction, qui ne touche que la case. On ne
-- se retire pas soi-même, pour ne pas perdre l'accès d'un geste.
create or replace function public.designer_associe(compte uuid, valeur boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_associe() then
    raise exception 'Seul un associé désigne les associés.' using errcode = 'P0001';
  end if;
  if compte = auth.uid() and not valeur then
    raise exception 'Un associé ne se retire pas lui-même.' using errcode = 'P0001';
  end if;
  if valeur and not exists (select 1 from public.profiles p where p.id = compte and p.type_compte = 'agence') then
    raise exception 'Seul un compte de l''agence peut être associé.' using errcode = 'P0001';
  end if;
  update public.profiles set est_associe = valeur where id = compte;
end $$;

revoke all on function public.designer_associe(uuid, boolean) from public;
grant execute on function public.designer_associe(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Pour désigner les premiers associés, dans l'éditeur SQL (adresses à
-- remplacer ; jamais dans ce fichier, le dépôt est public) :
--
--   update profiles set est_associe = true
--   where email in ('premier.associe@exemple.fr', 'second.associe@exemple.fr');
