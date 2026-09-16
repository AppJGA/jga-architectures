-- Migration 047 : zones sur les remarques et les réserves
--
-- Les zones sont celles du planning de chantier (`planning_zones` : bâtiment,
-- niveau, secteur…). Comme pour le destinataire d'une remarque, le nom de la
-- zone est recopié à chaque écriture : supprimer une zone du planning ne vide
-- pas les anciens comptes rendus.

alter table cr_remarques
  add column if not exists zone_id uuid references planning_zones(id) on delete set null,
  add column if not exists copie_zone text;

alter table opr_reserves
  add column if not exists zone_id uuid references planning_zones(id) on delete set null,
  add column if not exists copie_zone text;

create index if not exists cr_remarques_zone_idx on cr_remarques (zone_id);
create index if not exists opr_reserves_zone_idx on opr_reserves (zone_id);

-- Nom de la zone tenu à jour par la base, comme `copie_destinataire`
create or replace function copie_zone() returns trigger
language plpgsql as $$
begin
  if new.zone_id is not null then
    select z.nom into new.copie_zone from planning_zones z where z.id = new.zone_id;
  elsif tg_op = 'UPDATE' and pg_trigger_depth() = 1 and old.zone_id is not null then
    new.copie_zone := null;
  end if;
  return new;
end $$;

do $$ declare t text;
begin
  foreach t in array array['cr_remarques', 'opr_reserves'] loop
    execute format('drop trigger if exists %I on %I', t || '_copie_zone', t);
    execute format('create trigger %I before insert or update on %I for each row execute function copie_zone()', t || '_copie_zone', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
