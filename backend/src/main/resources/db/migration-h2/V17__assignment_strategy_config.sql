create table if not exists assignment_strategy_config (
    tenant_id varchar(64) not null,
    group_key varchar(128) not null,
    strategy_key varchar(64) not null,
    updated_at timestamp not null default current_timestamp,
    primary key (tenant_id, group_key)
);
