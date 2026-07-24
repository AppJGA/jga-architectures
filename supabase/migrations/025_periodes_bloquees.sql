-- Migration 025 : Périodes bloquées (congés, ponts, fermetures d'entreprises)

create table if not exists periodes_bloquees (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  label text not null,
  -- ex: "Congés été 2025", "Pont du 8 mai"
  date_debut date not null,
  date_fin date not null,
  couleur text default '#B8412C',
  created_at timestamptz default now()
);

alter table periodes_bloquees enable row level security;
create policy "Authenticated" on periodes_bloquees
  for all using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
