-- Migration 046 : procès-verbaux de réception
--
-- Un PV par visite, par lot et par type (PV des OPR, propositions du maître
-- d'œuvre, décision de réception, PV de réception en marché privé, levée des
-- réserves). Les champs saisis sont gardés en JSON ; le dernier PDF généré est
-- archivé dans le stockage `cr-archives`, sous le dossier de l'affaire.

create table if not exists opr_pv (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  visite_id     uuid not null references opr_visites(id) on delete cascade,
  lot_id        uuid references lots(id) on delete set null,
  copie_lot     text,
  type          text not null check (type in ('public_opr', 'public_propositions', 'public_decision', 'prive_reception', 'levee')),
  champs        jsonb not null default '{}',
  chemin        text,
  taille_octets integer,
  genere_le     timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists opr_pv_unique on opr_pv (visite_id, lot_id, type);
create index if not exists opr_pv_affaire_idx on opr_pv (affaire_id);

alter table opr_pv enable row level security;
drop policy if exists "Authenticated" on opr_pv;
create policy "Authenticated" on opr_pv for all using (auth.role() = 'authenticated');

create or replace function opr_pv_maj() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists opr_pv_maj on opr_pv;
create trigger opr_pv_maj before update on opr_pv
  for each row execute function opr_pv_maj();

-- ── Fichiers inutilisés : PDF des PV compris ──────────────────────────────────
create or replace function fichiers_orphelins()
returns table (bucket text, chemin text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.created_at < now() - interval '1 hour'
    and (
      (o.bucket_id = 'cr-photos'
        and not exists (select 1 from public.cr_photos p where p.chemin = o.name or p.chemin_miniature = o.name)
        and not exists (select 1 from public.opr_photos p where p.chemin = o.name or p.chemin_miniature = o.name))
      or
      (o.bucket_id = 'cr-plans' and not exists (
        select 1 from public.affaire_plan_versions v where v.chemin = o.name or v.chemin_apercu = o.name))
      or
      (o.bucket_id = 'cr-archives'
        and not exists (select 1 from public.cr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_pv v where v.chemin = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
