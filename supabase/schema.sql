-- Star Rating app: database schema for Supabase (Postgres). Run once in the SQL editor of your project.
-- Roles: 'pending' (just signed up, no access), 'inspector' (own assessments), 'admin' (everything + user management).
-- The very first user to sign up automatically becomes admin.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('pending','inspector','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''),
          case when not exists (select 1 from public.profiles) then 'admin' else 'pending' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.assessments (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  owner_name text,
  facility_name text,
  facility_kind text,
  region text,
  target_star int,
  result_star int,
  compliant_958 boolean,
  complete boolean,
  points int,
  threshold int,
  assessed_on date,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessments_owner_idx on public.assessments(owner_id);
create index if not exists assessments_name_idx on public.assessments(lower(facility_name));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('inspector','admin'));
$$;

alter table public.profiles enable row level security;
alter table public.assessments enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete" on public.profiles for delete using (public.is_admin());

drop policy if exists "assessments read" on public.assessments;
create policy "assessments read" on public.assessments for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "assessments insert" on public.assessments;
create policy "assessments insert" on public.assessments for insert with check (public.is_active() and owner_id = auth.uid());
drop policy if exists "assessments update" on public.assessments;
create policy "assessments update" on public.assessments for update using (public.is_active() and (owner_id = auth.uid() or public.is_admin()));
drop policy if exists "assessments delete" on public.assessments;
create policy "assessments delete" on public.assessments for delete using (owner_id = auth.uid() or public.is_admin());

-- Summary view without the heavy JSON payload (used by the registry list).
create or replace view public.assessments_summary with (security_invoker = true) as
  select id, owner_id, owner_name, facility_name, facility_kind, region, target_star, result_star,
         compliant_958, complete, points, threshold, assessed_on, created_at, updated_at
  from public.assessments;
