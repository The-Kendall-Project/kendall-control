-- Kendall Control Plane — registry backend (apply to the kendall-control Supabase
-- project, ref vfynyknpqiigfjynomaa — NOT on any product's own DB).
--
-- The server-side counterpart to @kendall/ops-core/registry: the ONE cross-system
-- registry every Kendall product (ops/foundry/dwellguide) reads + writes via the
-- publishable (anon) key. Writes go through SECURITY DEFINER RPCs; reads are RLS-gated
-- SELECTs. audit_events + part_number_sequences are deliberately NOT anon-readable.
--
-- CONVENTIONS (kept consistent with the live migrations, incl. modules-registry):
--   * part_number_sequences uses column `next_value`.
--   * registries carry `owning_system_id NOT NULL`, `part_number` UNIQUE, and a
--     UNIQUE(owning_system_id, slug) natural key; register RPCs upsert on that key.
--   * register RPCs are SECURITY DEFINER, `returns table(...)`, use
--     `#variable_conflict use_column` (so `slug` etc. resolve to the column, never
--     the RETURNS-TABLE variable), raise on an unknown owning-system key, and
--     coalesce nullable fields on update.
--   * status is a CHECK enum: draft | in_review | certified | deprecated | retired.
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
  prefix     text primary key,     -- "KF-AGT" | "KF-SKL" | "KF-MOD"
  next_value integer not null default 1
);
insert into public.part_number_sequences (prefix, next_value) values
  ('KF-AGT', 1), ('KF-SKL', 1), ('KF-MOD', 1)
on conflict (prefix) do nothing;

-- ── Registries ──────────────────────────────────────────────────────────────
create table if not exists public.agent_registry (
  id               uuid primary key default gen_random_uuid(),
  part_number      text not null unique,
  name             text not null,
  slug             text not null,
  owning_system_id uuid not null references public.systems(id),
  current_version  text not null default '0.1.0',
  status           text not null default 'draft'
    check (status = any (array['draft','in_review','certified','deprecated','retired'])),
  risk_tier        integer,
  agent_story      text not null default '',
  layer            text,
  description      text,
  repo_url         text,
  spec_ref         text,
  bom              jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owning_system_id, slug)
);

create table if not exists public.skills_registry (
  id               uuid primary key default gen_random_uuid(),
  part_number      text not null unique,
  name             text not null,
  slug             text not null,
  owning_system_id uuid not null references public.systems(id),
  current_version  text not null default '0.1.0',
  status           text not null default 'draft'
    check (status = any (array['draft','in_review','certified','deprecated','retired'])),
  repo_url         text,
  spec_ref         text,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owning_system_id, slug)
);

create table if not exists public.modules_registry (
  id               uuid primary key default gen_random_uuid(),
  part_number      text not null unique,
  name             text not null,
  slug             text not null,
  owning_system_id uuid not null references public.systems(id),
  current_version  text not null default '0.1.0',
  status           text not null default 'draft'
    check (status = any (array['draft','in_review','certified','deprecated','retired'])),
  repo_url         text,
  spec_ref         text,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owning_system_id, slug)
);

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
set search_path to 'public'
as $$
declare v_next integer;
begin
  insert into public.part_number_sequences (prefix, next_value)
  values (p_prefix, 2)
  on conflict (prefix) do update set next_value = part_number_sequences.next_value + 1
  returning next_value - 1 into v_next;
  return p_prefix || '-' || lpad(v_next::text, 3, '0');  -- e.g. KF-AGT-001
end;
$$;

-- ── RPC: register (upsert) an agent ─────────────────────────────────────────
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
returns table(id uuid, part_number text, name text, slug text, current_version text, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_system_id uuid;
  v_row public.agent_registry%rowtype;
begin
  select s.id into v_system_id from public.systems s where s.key = p_owning_system_key;
  if v_system_id is null then
    raise exception 'Unknown owning system key: %', p_owning_system_key;
  end if;

  insert into public.agent_registry as a (
    part_number, name, slug, owning_system_id, current_version, status,
    risk_tier, agent_story, layer, description, repo_url, spec_ref, bom
  )
  values (
    p_part_number, p_name, p_slug, v_system_id, p_current_version, p_status,
    p_risk_tier, coalesce(p_agent_story, ''), p_layer, p_description, p_repo_url, p_spec_ref, coalesce(p_bom, '{}'::jsonb)
  )
  on conflict (owning_system_id, slug) do update
    set part_number = excluded.part_number,
        name = excluded.name,
        current_version = excluded.current_version,
        status = excluded.status,
        risk_tier = excluded.risk_tier,
        -- never clobber an existing story with an empty one
        agent_story = case when excluded.agent_story <> '' then excluded.agent_story else a.agent_story end,
        layer = excluded.layer,
        description = excluded.description,
        repo_url = coalesce(excluded.repo_url, a.repo_url),
        spec_ref = coalesce(excluded.spec_ref, a.spec_ref),
        bom = excluded.bom,
        updated_at = now()
  returning a.* into v_row;

  return query select v_row.id, v_row.part_number, v_row.name, v_row.slug, v_row.current_version, v_row.status;
end;
$function$;

-- ── RPC: register (upsert) a skill ──────────────────────────────────────────
create or replace function public.register_skill(
  p_part_number text,
  p_name text,
  p_slug text,
  p_owning_system_key text,
  p_current_version text default '0.1.0',
  p_status text default 'draft',
  p_repo_url text default null,
  p_spec_ref text default null,
  p_description text default null
)
returns table(id uuid, part_number text, name text, slug text, current_version text, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_system_id uuid;
  v_row public.skills_registry%rowtype;
begin
  select s.id into v_system_id from public.systems s where s.key = p_owning_system_key;
  if v_system_id is null then
    raise exception 'Unknown owning system key: %', p_owning_system_key;
  end if;

  insert into public.skills_registry as m (
    part_number, name, slug, owning_system_id, current_version, status, repo_url, spec_ref, description
  )
  values (
    p_part_number, p_name, p_slug, v_system_id, p_current_version, p_status, p_repo_url, p_spec_ref, p_description
  )
  on conflict (owning_system_id, slug) do update
    set part_number = excluded.part_number,
        name = excluded.name,
        current_version = excluded.current_version,
        status = excluded.status,
        repo_url = coalesce(excluded.repo_url, m.repo_url),
        spec_ref = coalesce(excluded.spec_ref, m.spec_ref),
        description = coalesce(excluded.description, m.description),
        updated_at = now()
  returning m.* into v_row;

  return query select v_row.id, v_row.part_number, v_row.name, v_row.slug, v_row.current_version, v_row.status;
end;
$function$;

-- ── RPC: register (upsert) a software module (KF-MOD) ───────────────────────
create or replace function public.register_module(
  p_part_number text,
  p_name text,
  p_slug text,
  p_owning_system_key text,
  p_current_version text default '0.1.0',
  p_status text default 'draft',
  p_repo_url text default null,
  p_spec_ref text default null,
  p_description text default null
)
returns table(id uuid, part_number text, name text, slug text, current_version text, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_system_id uuid;
  v_row public.modules_registry%rowtype;
begin
  select s.id into v_system_id from public.systems s where s.key = p_owning_system_key;
  if v_system_id is null then
    raise exception 'Unknown owning system key: %', p_owning_system_key;
  end if;

  insert into public.modules_registry as m (
    part_number, name, slug, owning_system_id, current_version, status, repo_url, spec_ref, description
  )
  values (
    p_part_number, p_name, p_slug, v_system_id, p_current_version, p_status, p_repo_url, p_spec_ref, p_description
  )
  on conflict (owning_system_id, slug) do update
    set part_number = excluded.part_number,
        name = excluded.name,
        current_version = excluded.current_version,
        status = excluded.status,
        repo_url = coalesce(excluded.repo_url, m.repo_url),
        spec_ref = coalesce(excluded.spec_ref, m.spec_ref),
        description = coalesce(excluded.description, m.description),
        updated_at = now()
  returning m.* into v_row;

  return query select v_row.id, v_row.part_number, v_row.name, v_row.slug, v_row.current_version, v_row.status;
end;
$function$;

-- ── Grants + RLS ─────────────────────────────────────────────────────────────
-- Reads: publishable key can SELECT systems + the three registries.
alter table public.systems           enable row level security;
alter table public.agent_registry    enable row level security;
alter table public.skills_registry   enable row level security;
alter table public.modules_registry  enable row level security;
-- No anon read on these (enable RLS, add NO permissive policy → denied):
alter table public.audit_events           enable row level security;
alter table public.part_number_sequences  enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='systems' and policyname='public read systems') then
    create policy "public read systems" on public.systems for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='agent_registry' and policyname='public read agent_registry') then
    create policy "public read agent_registry" on public.agent_registry for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='skills_registry' and policyname='public read skills_registry') then
    create policy "public read skills_registry" on public.skills_registry for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modules_registry' and policyname='public read modules_registry') then
    create policy "public read modules_registry" on public.modules_registry for select to anon, authenticated using (true);
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.systems, public.agent_registry, public.skills_registry, public.modules_registry to anon, authenticated;

-- Writes go ONLY through the SECURITY DEFINER RPCs (no direct table write grant).
grant execute on function public.issue_part_number(text) to anon, authenticated;
grant execute on function public.register_agent(text,text,text,text,text,text,integer,text,text,jsonb,text,text,text) to anon, authenticated;
grant execute on function public.register_skill(text,text,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.register_module(text,text,text,text,text,text,text,text,text) to anon, authenticated;
