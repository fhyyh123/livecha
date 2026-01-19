create table if not exists attachment (
    id varchar(80) primary key,
    tenant_id varchar(64) not null,
    conversation_id varchar(80) not null,
    uploader_user_id varchar(64) not null,
    bucket varchar(128) not null,
    object_key varchar(512) not null,
    filename varchar(255),
    content_type varchar(128),
    size_bytes bigint not null,
    status varchar(16) not null default 'pending',
    linked_msg_id varchar(80),
    created_at timestamp not null default current_timestamp,
    constraint fk_attachment_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_attachment_conv foreign key (conversation_id) references conversation(id),
    constraint fk_attachment_uploader foreign key (uploader_user_id) references user_account(id),
    constraint fk_attachment_msg foreign key (linked_msg_id) references message(id),
    constraint ck_attachment_status check (status in ('pending','linked')),
    unique (bucket, object_key)
);

create index if not exists idx_attachment_conversation_created_at on attachment(conversation_id, created_at);
create index if not exists idx_attachment_tenant_created_at on attachment(tenant_id, created_at);
