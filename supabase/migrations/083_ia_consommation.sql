-- Migration 083 : consommation des crédits API Claude
--
-- Anthropic ne donne ni le solde des crédits par API, ni les dépenses d'une
-- organisation individuelle (son API d'administration leur est fermée). Chaque
-- fonction serveur qui appelle Claude (api/analyser-visite.js, api/edl-*.js,
-- api/analyser-edl.js) note ici le `usage` de la réponse, avec le jeton de
-- l'appelant : la page « Gestion de l'application » en déduit le coût
-- (src/admin/consommationIaLogique.js). Rien d'autre que des compteurs : ni
-- texte envoyé, ni réponse.
--
-- Écriture : tout compte agence (c'est lui qui déclenche l'appel). Lecture :
-- l'administrateur seul. Ni modification ni suppression.
--
-- Table créée après le 2026-10-30 : droits d'API donnés ici.
--
-- Rejouable.

create table if not exists public.ia_consommation (
  id              uuid primary key default gen_random_uuid(),
  cree_le         timestamptz not null default now(),
  fonction        text not null,
  modele          text not null,
  usage           jsonb not null default '{}'::jsonb,
  utilisateur_id  uuid default auth.uid()
);

create index if not exists ia_consommation_cree_le on public.ia_consommation (cree_le);

alter table public.ia_consommation enable row level security;

drop policy if exists "Agence : ajout" on public.ia_consommation;
create policy "Agence : ajout" on public.ia_consommation
  for insert to authenticated
  with check (public.est_agence());

drop policy if exists "Administrateur : lecture" on public.ia_consommation;
create policy "Administrateur : lecture" on public.ia_consommation
  for select to authenticated
  using (public.est_admin());

grant select, insert on public.ia_consommation to authenticated;
grant select, insert, update, delete on public.ia_consommation to service_role;
