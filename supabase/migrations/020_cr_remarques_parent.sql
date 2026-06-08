-- Sous-remarques / fil de suivi
alter table cr_remarques
  add column if not exists parent_id uuid
    references cr_remarques(id) on delete cascade;
