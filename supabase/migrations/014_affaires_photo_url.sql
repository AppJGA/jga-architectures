-- Colonne photo de couverture
alter table affaires
  add column if not exists photo_url text;

-- Bucket Storage public
insert into storage.buckets (id, name, public)
values ('affaires-photos', 'affaires-photos', true)
on conflict do nothing;

-- Policies Storage
do $$ begin
  drop policy if exists "Public read affaires-photos"  on storage.objects;
  drop policy if exists "Auth upload affaires-photos"  on storage.objects;
  drop policy if exists "Auth delete affaires-photos"  on storage.objects;
  drop policy if exists "Auth update affaires-photos"  on storage.objects;
exception when others then null;
end $$;

create policy "Public read affaires-photos"
  on storage.objects for select
  using (bucket_id = 'affaires-photos');

create policy "Auth upload affaires-photos"
  on storage.objects for insert
  with check (
    bucket_id = 'affaires-photos' and
    auth.role() = 'authenticated'
  );

create policy "Auth update affaires-photos"
  on storage.objects for update
  using (
    bucket_id = 'affaires-photos' and
    auth.role() = 'authenticated'
  );

create policy "Auth delete affaires-photos"
  on storage.objects for delete
  using (
    bucket_id = 'affaires-photos' and
    auth.role() = 'authenticated'
  );
