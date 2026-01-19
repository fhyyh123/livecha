create table if not exists attachment (
    id text primary key,
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id),
    uploader_user_id text not null references user_account(id),
    bucket text not null,
    object_key text not null,
    filename text,
    content_type text,
    size_bytes bigint not null,
    status text not null default 'pending' check (status in ('pending','linked')),
    linked_msg_id text references message(id),
    created_at timestamptz not null default now(),
    unique (bucket, object_key)
);

create index if not exists idx_attachment_conversation_created_at on attachment(conversation_id, created_at);
create index if not exists idx_attachment_tenant_created_at on attachment(tenant_id, created_at);
