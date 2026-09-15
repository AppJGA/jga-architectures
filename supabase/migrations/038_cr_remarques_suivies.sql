-- Migration 038 : remarques suivies d'une visite à l'autre
--
-- 1. Statuts fixes (8 codes, 4 couleurs). Le statut décide seul de la clôture :
--    `est_clos` en est déduit. Les anciens statuts en texte libre sont convertis.
-- 2. Numéro et suivi : chaque remarque a un numéro dans l'affaire, et toutes ses
--    copies de visite en visite partagent le même `suivi_id`. Les remarques
--    existantes sont reliées quand leur texte est identique d'une visite à la
--    suivante.
-- 3. Clôture : `date_cloture` date le passage à Fait / Annulé ; une remarque
--    close revient une seule fois à la visite suivante, sa copie étant marquée
--    `cloture_reportee`.
--
-- La correspondance des anciens statuts doit rester alignée sur
-- `statutNormalise` (src/modules/chantier/comptes-rendus/crLogique.js).

alter table cr_remarques
  add column if not exists numero           integer,
  add column if not exists suivi_id         uuid,
  add column if not exists date_cloture     date,
  add column if not exists cloture_reportee boolean not null default false;

create index if not exists cr_remarques_suivi_idx on cr_remarques (suivi_id);
create index if not exists cr_remarques_affaire_numero_idx on cr_remarques (affaire_id, numero);

-- ── Conversion des statuts ────────────────────────────────────────────────────
create or replace function cr_statut_normalise(p_statut text, p_clos boolean) returns text
language plpgsql immutable as $$
declare
  t text := lower(translate(coalesce(p_statut, ''),
    'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc'));
  code text := 'en_cours';
begin
  if p_statut in ('a_faire', 'urgent', 'en_cours', 'en_attente', 'pour_memoire', 'a_prevoir', 'fait', 'annule') then
    code := p_statut;
  elsif t ~ 'annul' then code := 'annule';
  elsif t ~ '\mfaits?\M' or t ~ 'sold' or t ~ 'clos' or t ~ 'clotur' or t ~ '\mleve' then code := 'fait';
  elsif t ~ 'urgent' then code := 'urgent';
  elsif t ~ 'prevoir' or t ~ 'programm' then code := 'a_prevoir';
  elsif t ~ 'faire' then code := 'a_faire';
  elsif t ~ 'attente' then code := 'en_attente';
  elsif t ~ 'memoire' or t ~ 'info' then code := 'pour_memoire';
  end if;
  if coalesce(p_clos, false) and code not in ('fait', 'annule') then code := 'fait'; end if;
  return code;
end $$;

-- Les comptes rendus émis sont verrouillés (migration 037) : le verrou est levé
-- le temps de convertir leurs statuts, sans rien y changer d'autre.
alter table cr_remarques disable trigger cr_remarques_verrou_emis;

update cr_remarques r set affaire_id = c.affaire_id
from comptes_rendus c
where r.cr_id = c.id and r.affaire_id is null;

alter table cr_remarques drop constraint if exists cr_remarques_statut_check;

-- Remarques principales : statut converti, clôture déduite. Les suivis
-- (sous-remarques) gardent leur case « clos » et prennent un statut neutre.
update cr_remarques set
  statut       = cr_statut_normalise(statut, est_clos),
  est_clos     = cr_statut_normalise(statut, est_clos) in ('fait', 'annule'),
  date_cloture = case
    when cr_statut_normalise(statut, est_clos) in ('fait', 'annule')
      then coalesce(date_cloture, updated_at::date, created_at::date)
  end
where parent_id is null;

update cr_remarques set statut = cr_statut_normalise(statut, false)
where parent_id is not null;

-- ── Numéros et suivi des remarques existantes ────────────────────────────────
-- Parcours visite par visite : une remarque dont le texte existait mot pour mot
-- dans la visite précédente de l'affaire en est la suite ; sinon elle ouvre un
-- nouveau suivi avec le numéro suivant.
do $$
declare
  r record;
  v_prec uuid;
  v_suivi uuid;
  v_numero integer;
begin
  for r in
    select rm.id, rm.cr_id, rm.affaire_id, rm.description, c.numero as cr_numero
    from cr_remarques rm
    join comptes_rendus c on c.id = rm.cr_id
    left join cr_sections s on s.id = rm.section_id
    left join cr_sous_sections ss on ss.id = rm.sous_section_id
    where rm.parent_id is null and rm.suivi_id is null
    order by rm.affaire_id, c.numero, s.ordre nulls last, ss.ordre nulls last, rm.ordre, rm.created_at
  loop
    select id into v_prec from comptes_rendus
    where affaire_id = r.affaire_id and numero < r.cr_numero
    order by numero desc limit 1;

    v_suivi := null;
    if v_prec is not null then
      select p.suivi_id, p.numero into v_suivi, v_numero
      from cr_remarques p
      where p.cr_id = v_prec and p.parent_id is null and p.suivi_id is not null
        and trim(p.description) = trim(r.description)
        and not exists (
          select 1 from cr_remarques x
          where x.cr_id = r.cr_id and x.suivi_id = p.suivi_id
        )
      order by p.ordre
      limit 1;
    end if;

    if v_suivi is null then
      v_suivi := r.id;
      select coalesce(max(numero), 0) + 1 into v_numero
      from cr_remarques where affaire_id = r.affaire_id;
    end if;

    update cr_remarques set suivi_id = v_suivi, numero = v_numero where id = r.id;
  end loop;
end $$;

-- Une remarque déjà close dans la visite précédente a fait son unique retour
update cr_remarques r set cloture_reportee = true
from comptes_rendus c
where r.cr_id = c.id and r.parent_id is null and r.est_clos
  and exists (
    select 1 from cr_remarques p
    join comptes_rendus pc on pc.id = p.cr_id
    where p.suivi_id = r.suivi_id and p.id <> r.id and p.est_clos
      and pc.affaire_id = c.affaire_id and pc.numero < c.numero
  );

alter table cr_remarques enable trigger cr_remarques_verrou_emis;

alter table cr_remarques alter column statut set default 'a_faire';
alter table cr_remarques add constraint cr_remarques_statut_check check (
  statut is null or statut in ('a_faire', 'urgent', 'en_cours', 'en_attente', 'pour_memoire', 'a_prevoir', 'fait', 'annule')
);

-- ── Tenue à jour à chaque écriture ────────────────────────────────────────────
-- Numéro et suivi attribués à la création ; clôture déduite du statut.
create or replace function cr_remarque_suivi() returns trigger
language plpgsql as $$
begin
  if new.parent_id is not null then return new; end if;

  if tg_op = 'INSERT' then
    new.suivi_id := coalesce(new.suivi_id, new.id);
    if new.numero is null and new.affaire_id is not null then
      -- Deux remarques créées au même instant ne doivent pas prendre le même numéro
      perform pg_advisory_xact_lock(hashtext('cr_remarques_numero:' || new.affaire_id::text));
      select coalesce(max(numero), 0) + 1 into new.numero
      from cr_remarques where affaire_id = new.affaire_id;
    end if;
  end if;

  -- La case « clos » ne compte que si elle vient d'être cochée (onglet ouvert
  -- avant la mise à jour) ; sinon le statut fait foi.
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
    new.cloture_reportee := false;
  end if;
  return new;
end $$;

drop trigger if exists cr_remarques_suivi on cr_remarques;
create trigger cr_remarques_suivi
  before insert or update on cr_remarques
  for each row execute function cr_remarque_suivi();

notify pgrst, 'reload schema';
