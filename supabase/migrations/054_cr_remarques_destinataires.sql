-- Migration 054 : remarques rangées par destinataire, suites avec statut
--
-- Refonte des comptes rendus, chantier 1. Les remarques des parties VI et VII
-- ne se rangent plus à la main : leur destinataire décide de la section.
--   · `equipe`      (VI)  — remarques à un interlocuteur de l'affaire
--   · `entreprises` (VII) — remarques à un lot
-- Le regroupement par rôle ou par lot se calcule à l'affichage.
--
-- Une sous-remarque (suite ▶, `parent_id` renseigné) a désormais son propre
-- statut et sa propre échéance : `est_clos` et `date_cloture` s'en déduisent
-- comme pour une remarque. Elle ne reçoit toujours ni numéro ni `suivi_id`.
--
-- Rejouable.

alter table cr_sections drop constraint if exists cr_sections_type_section_check;
alter table cr_sections
  add constraint cr_sections_type_section_check
  check (type_section in ('general', 'interlocuteurs', 'intervenants', 'equipe', 'entreprises'));

-- Sections VI et VII des brouillons existants (modèle JGA). Un CR émis est
-- verrouillé (migration 037) : il garde sa présentation d'origine.
update cr_sections set type_section = 'equipe'
where numero_romain = 'VI' and type_section in ('general', 'interlocuteurs')
  and cr_id in (select id from comptes_rendus where statut <> 'emis');
update cr_sections set type_section = 'entreprises'
where numero_romain = 'VII' and type_section in ('general', 'interlocuteurs')
  and cr_id in (select id from comptes_rendus where statut <> 'emis');

create or replace function cr_remarque_suivi() returns trigger
language plpgsql as $$
begin
  if new.parent_id is null and tg_op = 'INSERT' then
    new.suivi_id := coalesce(new.suivi_id, new.id);
    if new.numero is null and new.affaire_id is not null then
      -- Deux remarques créées au même instant ne doivent pas prendre le même numéro
      perform pg_advisory_xact_lock(hashtext('cr_remarques_numero:' || new.affaire_id::text));
      select coalesce(max(numero), 0) + 1 into new.numero
      from cr_remarques where affaire_id = new.affaire_id;
    end if;
  end if;

  -- La case « clos » ne compte que si elle vient d'être cochée (onglet ouvert
  -- avant la mise à jour) ; sinon le statut fait foi. Vaut pour une suite comme
  -- pour une remarque.
  new.statut := cr_statut_normalise(new.statut,
    case when tg_op = 'INSERT' then new.est_clos else new.est_clos and not old.est_clos end);
  new.est_clos := new.statut in ('fait', 'annule');
  if new.est_clos then
    if tg_op = 'INSERT' or not old.est_clos then
      new.date_cloture := coalesce(case when tg_op = 'INSERT' then new.date_cloture end, current_date);
    else
      new.date_cloture := coalesce(new.date_cloture, old.date_cloture, current_date);
    end if;
  else
    new.date_cloture := null;
    if new.parent_id is null then new.cloture_reportee := false; end if;
  end if;
  return new;
end $$;

drop trigger if exists cr_remarques_suivi on cr_remarques;
create trigger cr_remarques_suivi
  before insert or update on cr_remarques
  for each row execute function cr_remarque_suivi();

-- Anciennes suites closes par la case : elles deviennent « Fait ». Celles d'un
-- CR émis restent telles quelles (verrou).
update cr_remarques set statut = 'fait'
where parent_id is not null and est_clos and statut <> 'fait'
  and cr_id in (select id from comptes_rendus where statut <> 'emis');

notify pgrst, 'reload schema';
