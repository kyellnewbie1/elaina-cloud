-- ELAINA CLOUD schema for Supabase PostgreSQL
-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.domain_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (label ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  ip_address inet not null,
  status text not null default 'pending' check (status in ('pending','approved','provisioning','active','rejected','failed')),
  fqdn text,
  cloudflare_record_id text,
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists domain_requests_user_id_idx on public.domain_requests(user_id);
create index if not exists domain_requests_status_idx on public.domain_requests(status);
create unique index if not exists domain_requests_reserved_label_idx
  on public.domain_requests(label)
  where status in ('pending','approved','provisioning','active');

-- Create profile automatically after Supabase Auth signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data ->> 'display_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep email synced when auth email changes.
create or replace function public.handle_user_email_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email,''), updated_at = now() where id = new.id;
  return new;
end;
$$;
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated after update of email on auth.users
for each row execute procedure public.handle_user_email_update();

alter table public.profiles enable row level security;
alter table public.domain_requests enable row level security;

-- Profiles: users can read/update their own basic profile, but cannot change role.
drop policy if exists "Profiles readable by owner" on public.profiles;
create policy "Profiles readable by owner" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Profiles update own basic info" on public.profiles;
create policy "Profiles update own basic info" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Block role changes from the public client; only trusted server/admin SQL can change role.
create or replace function public.prevent_profile_role_escalation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Changing profile role is not allowed';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_profile_role_escalation_trigger on public.profiles;
create trigger prevent_profile_role_escalation_trigger
before update on public.profiles
for each row execute procedure public.prevent_profile_role_escalation();

-- Users can read their own requests. Mutations are done through server-side API only.
drop policy if exists "Read own domain requests" on public.domain_requests;
create policy "Read own domain requests" on public.domain_requests for select to authenticated using (auth.uid() = user_id);

-- Admin role must be assigned manually by a trusted operator, never through public signup.
-- After signing up, replace the email below with the exact admin email:
-- update public.profiles set role = 'admin' where email = 'you@example.com';
-- Make sure the email belongs to your account and use this only in Supabase SQL Editor.

-- Global announcements and editable dashboard banner (run this updated schema).
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_created_at_idx on public.announcements(created_at desc);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.is_current_user_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'); $$;

alter table public.announcements enable row level security;
alter table public.site_settings enable row level security;
drop policy if exists "Signed in users read announcements" on public.announcements;
create policy "Signed in users read announcements" on public.announcements for select to authenticated using (true);
drop policy if exists "Admins create announcements" on public.announcements;
create policy "Admins create announcements" on public.announcements for insert to authenticated with check (public.is_current_user_admin() and created_by = auth.uid());
drop policy if exists "Admins delete announcements" on public.announcements;
create policy "Admins delete announcements" on public.announcements for delete to authenticated using (public.is_current_user_admin());
drop policy if exists "Signed in users read site settings" on public.site_settings;
create policy "Signed in users read site settings" on public.site_settings for select to authenticated using (true);
drop policy if exists "Admins insert site settings" on public.site_settings;
create policy "Admins insert site settings" on public.site_settings for insert to authenticated with check (public.is_current_user_admin() and updated_by = auth.uid());
drop policy if exists "Admins update site settings" on public.site_settings;
create policy "Admins update site settings" on public.site_settings for update to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin() and updated_by = auth.uid());


-- Public banner images: only admins may upload/update/delete, all visitors can read published assets.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;
drop policy if exists "Public read site assets" on storage.objects;
create policy "Public read site assets" on storage.objects for select using (bucket_id = 'site-assets');
drop policy if exists "Admins upload site assets" on storage.objects;
create policy "Admins upload site assets" on storage.objects for insert to authenticated with check (bucket_id = 'site-assets' and public.is_current_user_admin());
drop policy if exists "Admins update site assets" on storage.objects;
create policy "Admins update site assets" on storage.objects for update to authenticated using (bucket_id = 'site-assets' and public.is_current_user_admin()) with check (bucket_id = 'site-assets' and public.is_current_user_admin());
drop policy if exists "Admins delete site assets" on storage.objects;
create policy "Admins delete site assets" on storage.objects for delete to authenticated using (bucket_id = 'site-assets' and public.is_current_user_admin());


-- Admin-managed API registry. Public endpoints are routed only to preconfigured HTTPS targets.
create table if not exists public.api_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'tools',
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  method text not null default 'GET' check (method in ('GET','POST','PUT','DELETE')),
  path text generated always as ('/api/v1/' || category || '/' || slug) stored,
  target_url text not null,
  input_schema jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  locked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists api_registry_enabled_idx on public.api_registry(enabled, category);
alter table public.api_registry enable row level security;
drop policy if exists "Public can read enabled API metadata" on public.api_registry;
create policy "Public can read enabled API metadata" on public.api_registry
  for select to anon, authenticated using (enabled = true and locked = false);
drop policy if exists "Admins manage API registry" on public.api_registry;
create policy "Admins manage API registry" on public.api_registry
  for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());

-- Flexible DNS request records. Actual provider integration remains server-side and approval-gated.
alter table public.domain_requests add column if not exists dns_type text not null default 'A';
alter table public.domain_requests add column if not exists dns_name text not null default '@';
alter table public.domain_requests add column if not exists dns_value text;
alter table public.domain_requests add column if not exists dns_ttl integer not null default 1;
alter table public.domain_requests add column if not exists dns_proxied boolean not null default false;
alter table public.domain_requests add column if not exists target_provider text not null default 'vps';
alter table public.domain_requests add column if not exists provider_notes text;
