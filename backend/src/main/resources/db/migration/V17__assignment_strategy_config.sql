-- Configure assignment strategy per tenant and (optional) skill group.
-- group_key:
--   - exact skill_group_id value, or
--   - '__default__' for conversations with no skill group, or
--   - '*' wildcard for all groups under a tenant

create table if not exists assignment_strategy_config (
    tenant_id varchar(64) not null,
    group_key varchar(128) not null,
    strategy_key varchar(64) not null,
    updated_at timestamp not null default now(),
    primary key (tenant_id, group_key)
);
