-- Migration 044 : diffusion des comptes rendus par la messagerie
--
-- 1. Archives : un PDF d'émission (destinataire vide) ou une version pour une
--    entreprise ou un interlocuteur (destinataire « lot:<id> » / « interlo:<id> »),
--    fabriquée au premier envoi et réutilisée pour la même émission.
-- 2. Historique des e-mails préparés. Le logiciel ouvre la messagerie de
--    l'utilisateur : il sait que l'e-mail a été préparé, pas qu'il est parti.

alter table cr_archives
  add column if not exists destinataire text,
  add column if not exists version_pour text;

create index if not exists cr_archives_version_idx on cr_archives (cr_id, destinataire, emis_le);

create table if not exists cr_diffusions (
  id           uuid primary key default gen_random_uuid(),
  affaire_id   uuid not null references affaires(id) on delete cascade,
  cr_id        uuid not null references comptes_rendus(id) on delete cascade,
  archive_id   uuid references cr_archives(id) on delete set null,
  mode         text not null check (mode in ('tous', 'entreprise')),
  destinataire text,
  libelle      text,
  adresses     text[] not null default '{}',
  objet        text,
  prepare_le   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

create index if not exists cr_diffusions_cr_idx on cr_diffusions (cr_id, prepare_le desc);

alter table cr_diffusions enable row level security;
drop policy if exists "Authenticated" on cr_diffusions;
create policy "Authenticated" on cr_diffusions for all using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
