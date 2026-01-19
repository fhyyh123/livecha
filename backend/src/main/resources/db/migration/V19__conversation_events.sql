create table if not exists conversation_event (
    id text primary key,
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id),
    event_key text not null,
    data_jsonb jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_conversation_event_tenant_conv_created
    on conversation_event(tenant_id, conversation_id, created_at);
