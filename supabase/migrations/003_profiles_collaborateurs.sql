-- Migration 003 : Profils collaborateurs et associations aux affaires

-- ─── Table profiles ───────────────────────────────────────────────────────────
-- Extension de auth.users : prénom, nom, email dénormalisé
create table if not exists profiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  email   text,
  prenom  text,
  nom     text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Lecture de tous les profils" on profiles
  for select to authenticated using (true);

create policy "Mise à jour de son propre profil" on profiles
  for update to authenticated using (auth.uid() = id);

-- Trigger : créer automatiquement le profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Table affaire_collaborateurs ─────────────────────────────────────────────
create table if not exists affaire_collaborateurs (
  id         uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete cascade not null,
  role       text not null default 'collaborateur'
               check (role in ('proprietaire', 'collaborateur')),
  added_by   uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(affaire_id, user_id)
);

alter table affaire_collaborateurs enable row level security;

create policy "Lecture des collaborateurs" on affaire_collaborateurs
  for select to authenticated using (true);

create policy "Ajout de collaborateurs" on affaire_collaborateurs
  for insert to authenticated
  with check (
    auth.uid() = added_by
    or auth.uid() = user_id
    or auth.uid() in (
      select user_id from affaire_collaborateurs ac2
      where ac2.affaire_id = affaire_collaborateurs.affaire_id
        and ac2.role = 'proprietaire'
    )
  );

create policy "Suppression de collaborateurs" on affaire_collaborateurs
  for delete to authenticated using (
    auth.uid() in (
      select user_id from affaire_collaborateurs ac2
      where ac2.affaire_id = affaire_collaborateurs.affaire_id
        and ac2.role = 'proprietaire'
    )
  );

-- ─── NOTE ─────────────────────────────────────────────────────────────────────
-- Après votre première connexion, exécutez dans Supabase SQL Editor pour
-- assigner les affaires de test à votre compte :
--
--   INSERT INTO affaire_collaborateurs (affaire_id, user_id, role)
--   SELECT id, auth.uid(), 'proprietaire' FROM affaires
--   ON CONFLICT DO NOTHING;
