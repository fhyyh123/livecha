create table if not exists tenant (
    id varchar(64) primary key,
    name varchar(255) not null,
    created_at timestamp not null default current_timestamp
);

create table if not exists user_account (
    id varchar(64) primary key,
    tenant_id varchar(64) not null,
    type varchar(16) not null,
    username varchar(64) not null,
    phone varchar(32),
    email varchar(128),
    password_hash varchar(200) not null,
    status varchar(16) not null default 'active',
    created_at timestamp not null default current_timestamp,
    unique (tenant_id, username),
    constraint fk_user_tenant foreign key (tenant_id) references tenant(id)
);

create table if not exists agent_profile (
    user_id varchar(64) primary key,
    status varchar(16) not null default 'offline',
    max_concurrent int not null default 3,
    display_name varchar(128),
    created_at timestamp not null default current_timestamp,
    constraint fk_agent_user foreign key (user_id) references user_account(id)
);

create table if not exists skill_group (
    id varchar(64) primary key,
    tenant_id varchar(64) not null,
    name varchar(128) not null,
    enabled boolean not null default true,
    created_at timestamp not null default current_timestamp,
    constraint fk_group_tenant foreign key (tenant_id) references tenant(id)
);

create table if not exists skill_group_member (
    group_id varchar(64) not null,
    agent_user_id varchar(64) not null,
    weight int not null default 0,
    created_at timestamp not null default current_timestamp,
    primary key (group_id, agent_user_id),
    constraint fk_member_group foreign key (group_id) references skill_group(id),
    constraint fk_member_user foreign key (agent_user_id) references user_account(id)
);

create table if not exists conversation (
    id varchar(80) primary key,
    tenant_id varchar(64) not null,
    customer_user_id varchar(64) not null,
    channel varchar(16) not null,
    skill_group_id varchar(64),
    assigned_agent_user_id varchar(64),
    subject varchar(255),
    status varchar(16) not null default 'open',
    created_at timestamp not null default current_timestamp,
    last_msg_at timestamp not null default current_timestamp,
    closed_at timestamp,
    constraint fk_conv_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_conv_customer foreign key (customer_user_id) references user_account(id)
);

create index if not exists idx_conversation_agent_status_lastmsg on conversation(assigned_agent_user_id, status, last_msg_at);

create table if not exists message (
    id varchar(80) primary key,
    tenant_id varchar(64) not null,
    conversation_id varchar(80) not null,
    sender_type varchar(16) not null,
    sender_id varchar(64) not null,
    client_msg_id varchar(80),
    content_type varchar(32) not null,
    content_jsonb clob not null,
    created_at timestamp not null default current_timestamp,
    constraint fk_msg_tenant foreign key (tenant_id) references tenant(id),
    constraint fk_msg_conv foreign key (conversation_id) references conversation(id)
);

create index if not exists idx_message_conversation_id_id on message(conversation_id, id);

create table if not exists message_state (
    conversation_id varchar(80) not null,
    user_id varchar(64) not null,
    last_recv_msg_id varchar(80),
    last_read_msg_id varchar(80),
    updated_at timestamp not null default current_timestamp,
    primary key (conversation_id, user_id),
    constraint fk_state_conv foreign key (conversation_id) references conversation(id),
    constraint fk_state_user foreign key (user_id) references user_account(id)
);

insert into tenant(id, name)
values ('t1', 'Default Tenant');

-- password is "admin123" and "customer123" (bcrypt hashes)
merge into user_account key(id)
values
('u_admin', 't1', 'admin', 'admin', null, null, '$2b$12$ANOhyTLm911wAWdq8iv9SO4pBVCgYuUsMx5U0mnrmS2mYRkCQhCe.', 'active', current_timestamp),
('u_cust1', 't1', 'customer', 'customer1', null, null, '$2b$12$alqLrBqLt2qZqnwWlmsE.eFGAmpTEi03EXD.xV1i1eLEa4t/8GWzG', 'active', current_timestamp);
