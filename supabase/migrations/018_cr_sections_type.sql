-- Ajout du type de section (général vs interlocuteurs)
alter table cr_sections
  add column if not exists type_section text not null default 'general'
  check (type_section in ('general', 'interlocuteurs'));
