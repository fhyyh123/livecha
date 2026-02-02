-- Persist pre-chat form submissions per conversation
create table if not exists conversation_pre_chat_field (
    tenant_id varchar not null,
    conversation_id varchar not null,
    field_key varchar not null,
    field_label varchar,
    field_type varchar,
    value_json varchar,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    primary key (tenant_id, conversation_id, field_key),
    constraint fk_conv_pre_chat_field_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_conv_pre_chat_field_conv foreign key (conversation_id) references conversation(id) on delete cascade
);

create index if not exists idx_conv_pre_chat_field_tenant_conv
    on conversation_pre_chat_field(tenant_id, conversation_id);
