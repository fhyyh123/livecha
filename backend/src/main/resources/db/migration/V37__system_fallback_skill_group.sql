-- Add system/fallback metadata to skill_group.

alter table skill_group
    add column if not exists group_type text not null default 'user' check (group_type in ('user','system'));

alter table skill_group
    add column if not exists is_fallback boolean not null default false;

alter table skill_group
    add column if not exists system_key text;

-- Fallback group must be a system group.
do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where c.conname = 'ck_skill_group_fallback_is_system'
          and t.relname = 'skill_group'
          and n.nspname = current_schema()
    ) then
        alter table skill_group
            add constraint ck_skill_group_fallback_is_system
                check ((not is_fallback) or (group_type = 'system'));
    end if;
end$$;

-- Ensure one fallback group per tenant.
create unique index if not exists uq_skill_group_fallback_per_tenant
    on skill_group(tenant_id)
    where is_fallback;

-- Ensure system_key is unique per tenant (when provided).
create unique index if not exists uq_skill_group_system_key_per_tenant
    on skill_group(tenant_id, system_key)
    where system_key is not null;

-- Create fallback group (General) for existing tenants.
insert into skill_group(id, tenant_id, name, enabled, group_type, is_fallback, system_key, created_at)
select 'sg_' || gen_random_uuid()::text, t.id, 'General', true, 'system', true, 'general', now()
from tenant t
where not exists (
    select 1
    from skill_group g
    where g.tenant_id = t.id
      and g.is_fallback = true
);

-- Ensure all tenant agents/admins are members of the fallback group.
insert into skill_group_member(group_id, agent_user_id, weight, created_at)
select g.id, u.id, 0, now()
from skill_group g
join user_account u on u.tenant_id = g.tenant_id
where g.is_fallback = true
  and u.status = 'active'
  and u.type in ('agent','admin')
on conflict (group_id, agent_user_id) do nothing;
