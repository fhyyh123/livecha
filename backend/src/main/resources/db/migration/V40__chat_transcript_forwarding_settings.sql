create table if not exists chat_transcript_forwarding_settings (
    tenant_id varchar(64) primary key,
    forward_to_email varchar(256),
    updated_at timestamp not null default current_timestamp
);
