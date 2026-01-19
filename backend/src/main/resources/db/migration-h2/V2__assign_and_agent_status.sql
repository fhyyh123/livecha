create table if not exists agent_assign_cursor (
    tenant_id varchar(64) not null,
    group_key varchar(128) not null,
    last_agent_user_id varchar(64),
    updated_at timestamp not null default current_timestamp,
    primary key (tenant_id, group_key),
    constraint fk_cursor_tenant foreign key (tenant_id) references tenant(id)
);
