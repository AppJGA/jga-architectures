-- Migration 042 : remarques types, partagées par toute l'agence
--
-- Textes enregistrés pour être réutilisés pendant les visites (« Nettoyage de
-- fin de journée non réalisé »…). Les plus utilisés sont proposés en premier :
-- le compteur est incrémenté par une fonction, pour que deux personnes qui
-- utilisent le même texte au même moment ne s'écrasent pas.

create table if not exists remarques_types (
  id                   uuid primary key default gen_random_uuid(),
  texte                text not null check (length(trim(texte)) > 0),
  utilisations         integer not null default 0,
  derniere_utilisation timestamptz,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now()
);

-- Un même texte n'est enregistré qu'une fois, casse et espaces ignorés
create unique index if not exists remarques_types_texte_unique
  on remarques_types (lower(regexp_replace(trim(texte), '\s+', ' ', 'g')));

alter table remarques_types enable row level security;
drop policy if exists "Authenticated" on remarques_types;
create policy "Authenticated" on remarques_types for all using (auth.role() = 'authenticated');

create or replace function remarque_type_utilisee(p_id uuid) returns void
language sql as $$
  update remarques_types
  set utilisations = utilisations + 1, derniere_utilisation = now()
  where id = p_id
$$;

grant execute on function remarque_type_utilisee(uuid) to authenticated;

notify pgrst, 'reload schema';
