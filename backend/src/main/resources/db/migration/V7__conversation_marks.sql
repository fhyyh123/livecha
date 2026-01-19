create table if not exists conversation_mark (
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id) on delete cascade,
    user_id text not null references user_account(id) on delete cascade,
    starred boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_mark_tenant_user_starred on conversation_mark(tenant_id, user_id, starred);
create index if not exists idx_conversation_mark_tenant_conversation on conversation_mark(tenant_id, conversation_id);
