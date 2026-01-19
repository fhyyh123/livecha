create table if not exists conversation_mark (
    tenant_id varchar(64) not null,
    conversation_id varchar(80) not null,
    user_id varchar(64) not null,
    starred boolean not null default false,
    updated_at timestamp not null default current_timestamp,
    primary key (conversation_id, user_id),
    constraint fk_conv_mark_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_conv_mark_conv foreign key (conversation_id) references conversation(id) on delete cascade,
    constraint fk_conv_mark_user foreign key (user_id) references user_account(id) on delete cascade
);

create index if not exists idx_conversation_mark_tenant_user_starred on conversation_mark(tenant_id, user_id, starred);
create index if not exists idx_conversation_mark_tenant_conversation on conversation_mark(tenant_id, conversation_id);
