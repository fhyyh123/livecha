-- Agent workbench features: tags, notes, canned replies

create table if not exists conversation_tag (
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id) on delete cascade,
    tag text not null,
    created_by text references user_account(id),
    created_at timestamptz not null default now(),
    primary key (conversation_id, tag)
);

create index if not exists idx_conversation_tag_tenant_tag on conversation_tag(tenant_id, tag);
create index if not exists idx_conversation_tag_tenant_conversation on conversation_tag(tenant_id, conversation_id);

create table if not exists conversation_note (
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id) on delete cascade,
    user_id text not null references user_account(id) on delete cascade,
    note text,
    updated_at timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_note_tenant_user on conversation_note(tenant_id, user_id, updated_at desc);

create table if not exists quick_reply (
    id text primary key,
    tenant_id text not null references tenant(id),
    title text not null,
    content text not null,
    created_by text references user_account(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_quick_reply_tenant_updated on quick_reply(tenant_id, updated_at desc);
