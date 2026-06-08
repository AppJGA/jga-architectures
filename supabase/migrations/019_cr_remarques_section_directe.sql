-- Remarques directement dans une section (sans sous-section obligatoire)
alter table cr_remarques
  add column if not exists section_id uuid
    references cr_sections(id) on delete cascade;

alter table cr_remarques
  alter column sous_section_id drop not null;
