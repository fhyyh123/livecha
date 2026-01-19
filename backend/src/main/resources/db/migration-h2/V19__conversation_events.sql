create table if not exists conversation_event (
    id varchar(80) primary key,
    tenant_id varchar(64) not null,
    conversation_id varchar(80) not null,
    event_key varchar(64) not null,
    data_jsonb clob not null,
    created_at timestamp not null default current_timestamp,
    constraint fk_conversation_event_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_conversation_event_conv foreign key (conversation_id) references conversation(id)
);

create index if not exists idx_conversation_event_tenant_conv_created
    on conversation_event(tenant_id, conversation_id, created_at);
