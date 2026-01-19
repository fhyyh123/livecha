create table if not exists agent_session (
    session_id text primary key,
    tenant_id text not null references tenant(id),
    user_id text not null references user_account(id),
    created_at timestamp not null default current_timestamp,
    last_seen_at timestamp not null default current_timestamp,
    expires_at timestamp not null
);

create index if not exists idx_agent_session_user_expires on agent_session(user_id, expires_at);
create index if not exists idx_agent_session_tenant_expires on agent_session(tenant_id, expires_at);
