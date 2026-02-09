create table if not exists chat_file_sharing_settings (
    tenant_id varchar(64) primary key,
    visitor_file_enabled boolean not null default true,
    agent_file_enabled boolean not null default true,
    updated_at timestamp not null default current_timestamp
);
