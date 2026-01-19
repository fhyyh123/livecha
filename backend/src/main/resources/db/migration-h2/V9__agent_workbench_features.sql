-- Agent workbench features: tags, notes, canned replies (H2)

create table if not exists conversation_tag (
    tenant_id varchar(64) not null,
    conversation_id varchar(80) not null,
    tag varchar(128) not null,
    created_by varchar(64),
    created_at timestamp not null default current_timestamp,
    primary key (conversation_id, tag),
    constraint fk_conv_tag_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_conv_tag_conv foreign key (conversation_id) references conversation(id) on delete cascade,
    constraint fk_conv_tag_created_by foreign key (created_by) references user_account(id)
);

create index if not exists idx_conversation_tag_tenant_tag on conversation_tag(tenant_id, tag);
create index if not exists idx_conversation_tag_tenant_conversation on conversation_tag(tenant_id, conversation_id);

create table if not exists conversation_note (
    tenant_id varchar(64) not null,
    conversation_id varchar(80) not null,
    user_id varchar(64) not null,
    note clob,
    updated_at timestamp not null default current_timestamp,
    primary key (conversation_id, user_id),
    constraint fk_conv_note_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_conv_note_conv foreign key (conversation_id) references conversation(id) on delete cascade,
    constraint fk_conv_note_user foreign key (user_id) references user_account(id) on delete cascade
);

create index if not exists idx_conversation_note_tenant_user_updated on conversation_note(tenant_id, user_id, updated_at);

create table if not exists quick_reply (
    id varchar(80) primary key,
    tenant_id varchar(64) not null,
    title varchar(255) not null,
    content clob not null,
    created_by varchar(64),
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    constraint fk_quick_reply_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_quick_reply_created_by foreign key (created_by) references user_account(id)
);

create index if not exists idx_quick_reply_tenant_updated on quick_reply(tenant_id, updated_at);
