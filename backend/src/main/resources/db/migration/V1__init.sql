create extension if not exists pgcrypto;

create table if not exists tenant (
    id text primary key,
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists user_account (
    id text primary key,
    tenant_id text not null references tenant(id),
    type text not null check (type in ('customer','agent','admin')),
    username text not null,
    phone text,
    email text,
    password_hash text not null,
    status text not null default 'active' check (status in ('active','disabled')),
    created_at timestamptz not null default now(),
    unique (tenant_id, username)
);

create table if not exists agent_profile (
    user_id text primary key references user_account(id),
    status text not null default 'offline' check (status in ('online','away','offline')),
    max_concurrent int not null default 3,
    display_name text,
    created_at timestamptz not null default now()
);

create table if not exists skill_group (
    id text primary key,
    tenant_id text not null references tenant(id),
    name text not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists skill_group_member (
    group_id text not null references skill_group(id),
    agent_user_id text not null references user_account(id),
    weight int not null default 0,
    created_at timestamptz not null default now(),
    primary key (group_id, agent_user_id)
);

create table if not exists conversation (
    id text primary key,
    tenant_id text not null references tenant(id),
    customer_user_id text not null references user_account(id),
    channel text not null check (channel in ('web','mp','app')),
    skill_group_id text references skill_group(id),
    assigned_agent_user_id text references user_account(id),
    subject text,
    status text not null default 'open' check (status in ('open','queued','assigned','closed')),
    created_at timestamptz not null default now(),
    last_msg_at timestamptz not null default now(),
    closed_at timestamptz
);

create index if not exists idx_conversation_agent_status_lastmsg on conversation(assigned_agent_user_id, status, last_msg_at);

create table if not exists message (
    id text primary key,
    tenant_id text not null references tenant(id),
    conversation_id text not null references conversation(id),
    sender_type text not null check (sender_type in ('customer','agent','system')),
    sender_id text not null,
    client_msg_id text,
    content_type text not null,
    content_jsonb jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_message_conversation_id_id on message(conversation_id, id);
create unique index if not exists uq_message_client_msg on message(client_msg_id, sender_id) where client_msg_id is not null;

create table if not exists message_state (
    conversation_id text not null references conversation(id),
    user_id text not null references user_account(id),
    last_recv_msg_id text,
    last_read_msg_id text,
    updated_at timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

-- seed minimal tenant + demo users (dev only)
insert into tenant(id, name)
values ('t1', 'Default Tenant')
on conflict do nothing;

-- password is "admin123" and "customer123" (bcrypt hashes)
insert into user_account(id, tenant_id, type, username, password_hash, status)
values
('u_admin', 't1', 'admin', 'admin', '$2b$12$ANOhyTLm911wAWdq8iv9SO4pBVCgYuUsMx5U0mnrmS2mYRkCQhCe.', 'active'),
('u_cust1', 't1', 'customer', 'customer1', '$2b$12$alqLrBqLt2qZqnwWlmsE.eFGAmpTEi03EXD.xV1i1eLEa4t/8GWzG', 'active')
on conflict do nothing;
