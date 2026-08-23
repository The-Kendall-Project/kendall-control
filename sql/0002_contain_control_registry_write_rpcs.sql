-- Kendall Control production migration 20260811151948.
-- Applied to project vfynyknpqiigfjynomaa on 2026-08-11.
--
-- Emergency containment: registry writes fail closed until the Context
-- Warehouse Authority Gateway is deployed and verified. This migration is
-- signature-independent because production contains historical overloads that
-- are not represented by sql/0001_control_plane_registry.sql.

do $containment$
declare
  target_function regprocedure;
begin
  for target_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'issue_part_number',
        'register_agent',
        'register_skill',
        'register_module'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target_function
    );
    execute format(
      'grant execute on function %s to service_role',
      target_function
    );
  end loop;
end
$containment$;

-- New postgres-owned functions in public are private unless deliberately
-- exposed by a later reviewed migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;


