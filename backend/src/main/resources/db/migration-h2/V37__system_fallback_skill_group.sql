-- Add system/fallback metadata to skill_group.

alter table skill_group
    add column if not exists group_type varchar(16) default 'user' not null;

alter table skill_group
    add column if not exists is_fallback boolean default false not null;

alter table skill_group
    add column if not exists system_key varchar(64);

-- Fallback group must be a system group.
alter table skill_group
    add constraint ck_skill_group_fallback_is_system
        check ((not is_fallback) or (group_type = 'system'));

-- Ensure system_key is unique per tenant (NULLs are allowed).
create unique index if not exists uq_skill_group_system_key_per_tenant
    on skill_group(tenant_id, system_key);

-- Create fallback group (General) for existing tenants.
insert into skill_group(id, tenant_id, name, enabled, group_type, is_fallback, system_key, created_at)
select concat('sg_', random_uuid()), t.id, 'General', true, 'system', true, 'general', current_timestamp
from tenant t
where not exists (
    select 1
    from skill_group g
    where g.tenant_id = t.id
      and g.is_fallback = true
);

-- Ensure all tenant agents/admins are members of the fallback group.
merge into skill_group_member (group_id, agent_user_id, weight, created_at)
key(group_id, agent_user_id)
select g.id, u.id, 0, current_timestamp
from skill_group g
join user_account u on u.tenant_id = g.tenant_id
where g.is_fallback = true
  and u.status = 'active'
  and u.type in ('agent','admin');
