-- Kendall Control Plane — registry backend (apply to the kendall-control Supabase project).
-- The server-side counterpart to @kendall/ops-core/registry: the ONE cross-system
-- registry every Kendall product (ops/foundry/dwellguide) reads + writes via the
-- publishable (anon) key. Writes go through SECURITY DEFINER RPCs; reads are RLS-gated
-- SELECTs. audit_events + part_number_sequences are deliberately NOT anon-readable.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE) so it's safe to re-apply.

-- ── Systems of record ───────────────────────────────────────────────────────
create table if not exists public.systems (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,             -- "ops" | "foundry" | "dwellguide"
  name       text not null,
  kind       text not null default 'product',  -- product | venture | internal
  status     text not null default 'active',
  created_at timestamptz not null default now()
);

insert into public.systems (key, name, kind) values
  ('ops', 'Kendall Ops', 'product'),
  ('foundry', 'Kendall Foundry', 'product'),
  ('dwellguide', 'DwellGuide', 'product')
on conflict (key) do nothing;

-- ── Part-number sequences (atomic, gap-free) ────────────────────────────────
create table if not exists public.part_number_sequences (
  prefix   text primary key,     -- "KF-AGT" | "KF-SKL"
  next_val integer not null default 1
);

-- ── Agent registry ──────────────────────────────────────────────────────────
create table if not exists public.agent_registry (
  id               uuid primary key default gen_random_uuid(),
  part_number      text unique not null,
  name             text not null,
  slug             text not null,
  current_version  text not null default '0.1.0',
  status           text not null default 'draft',
  risk_tier        integer,
  agent_story      text not null default '',
  layer            text,
  description      text,
  repo_url         text,
  spec_ref         text,
  bom              jsonb not null default '{}',
  owning_system_id uuid references public.systems(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists agent_registry_owning_system_idx on public.agent_registry (owning_system_id);

-- ── Skills registry ─────────────────────────────────────────────────────────
create table if not exists public.skills_registry (
  id               uuid primary key default gen_random_uuid(),
  part_number      text unique not null,
  name             text not null,
  slug             text not null,
  current_version  text not null default '0.1.0',
  status           text not null default 'draft',
  description      text,
  repo_url         text,
  spec_ref         text,
  owning_system_id uuid references public.systems(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists skills_registry_owning_system_idx on public.skills_registry (owning_system_id);

-- ── Audit events (cross-system) — NOT anon-readable ─────────────────────────
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null default '',
  action      text not null,
  target_type text not null default '',
  target_id   text not null default '',
  result      text not null default 'SUCCESS',
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── RPC: issue the next part number for a prefix (atomic) ────────────────────
create or replace function public.issue_part_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_next integer;
begin
  insert into public.part_number_sequences (prefix, next_val)
  values (p_prefix, 2)
  on conflict (prefix) do update set next_val = part_number_sequences.next_val + 1
  returning next_val - 1 into v_next;
  return p_prefix || '-' || lpad(v_next::text, 3, '0');  -- e.g. KF-AGT-001
end;
$$;

-- ── RPC: register (upsert) an agent into the shared registry ─────────────────
create or replace function public.register_agent(
  p_part_number text,
  p_name text,
  p_slug text,
  p_owning_system_key text,
  p_current_version text default '0.1.0',
  p_status text default 'draft',
  p_risk_tier integer default null,
  p_repo_url text default null,
  p_spec_ref text default null,
  p_bom jsonb default '{}',
  p_agent_story text default '',
  p_layer text default null,
  p_description text default null
)
returns setof public.agent_registry
language plpgsql
security definer
set search_path = public
as $$
declare v_system_id uuid;
begin
  select id into v_system_id from public.systems where key = p_owning_system_key;
  return query
  insert into public.agent_registry
    (part_number, name, slug, current_version, status, risk_tier, agent_story, layer, description, repo_url, spec_ref, bom, owning_system_id)
  values
    (p_part_number, p_name, p_slug, p_current_version, p_status, p_risk_tier, coalesce(p_agent_story, ''), p_layer, p_description, p_repo_url, p_spec_ref, coalesce(p_bom, '{}'::jsonb), v_system_id)
  on conflict (part_number) do update set
    name = excluded.name,
    slug = excluded.slug,
    current_version = excluded.current_version,
    status = excluded.status,
    risk_tier = excluded.risk_tier,
    -- never clobber an existing story with an empty one
    agent_story = case when excluded.agent_story <> '' then excluded.agent_story else agent_registry.agent_story end,
    layer = excluded.layer,
    description = excluded.description,
    repo_url = excluded.repo_url,
    spec_ref = excluded.spec_ref,
    bom = excluded.bom,
    owning_system_id = coalesce(excluded.owning_system_id, agent_registry.owning_system_id),
    updated_at = now()
  returning *;
end;
$$;

-- ── RPC: register (upsert) a skill into the shared registry ──────────────────
create or replace function public.register_skill(
  p_part_number text,
  p_name text,
  p_slug text,
  p_owning_system_key text,
  p_current_version text default '0.1.0',
  p_status text default 'draft',
  p_repo_url text default null,
  p_spec_ref text default null
)
returns setof public.skills_registry
language plpgsql
security definer
set search_path = public
as $$
declare v_system_id uuid;
begin
  select id into v_system_id from public.systems where key = p_owning_system_key;
  return query
  insert into public.skills_registry
    (part_number, name, slug, current_version, status, repo_url, spec_ref, owning_system_id)
  values
    (p_part_number, p_name, p_slug, p_current_version, p_status, p_repo_url, p_spec_ref, v_system_id)
  on conflict (part_number) do update set
    name = excluded.name,
    slug = excluded.slug,
    current_version = excluded.current_version,
    status = excluded.status,
    repo_url = excluded.repo_url,
    spec_ref = excluded.spec_ref,
    owning_system_id = coalesce(excluded.owning_system_id, skills_registry.owning_system_id),
    updated_at = now()
  returning *;
end;
$$;

-- ── Grants + RLS ─────────────────────────────────────────────────────────────
-- Reads: publishable key can SELECT systems + the two registries (RLS: allow all).
alter table public.systems         enable row level security;
alter table public.agent_registry  enable row level security;
alter table public.skills_registry enable row level security;
-- No anon read on these two (enable RLS, add NO permissive policy → denied):
alter table public.audit_events           enable row level security;
alter table public.part_number_sequences  enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='systems' and policyname='systems_read') then
    create policy systems_read on public.systems for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='agent_registry' and policyname='agent_registry_read') then
    create policy agent_registry_read on public.agent_registry for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='skills_registry' and policyname='skills_registry_read') then
    create policy skills_registry_read on public.skills_registry for select to anon, authenticated using (true);
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.systems, public.agent_registry, public.skills_registry to anon, authenticated;

-- Writes go ONLY through the SECURITY DEFINER RPCs (no direct table write grant).
grant execute on function public.issue_part_number(text) to anon, authenticated;
grant execute on function public.register_agent(text,text,text,text,text,text,integer,text,text,jsonb,text,text,text) to anon, authenticated;
grant execute on function public.register_skill(text,text,text,text,text,text,text,text) to anon, authenticated;
