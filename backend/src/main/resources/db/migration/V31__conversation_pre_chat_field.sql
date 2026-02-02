-- Persist pre-chat form submissions per conversation
create table if not exists conversation_pre_chat_field (
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id) on delete cascade,
    field_key text not null,
    field_label text,
    field_type text,
    value_json text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, conversation_id, field_key)
);

create index if not exists idx_conv_pre_chat_field_tenant_conv
    on conversation_pre_chat_field(tenant_id, conversation_id);
