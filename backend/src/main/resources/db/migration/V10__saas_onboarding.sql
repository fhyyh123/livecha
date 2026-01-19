-- SaaS onboarding: email verification + agent invites + global username uniqueness

-- Keep login stable by enforcing globally-unique usernames.
create unique index if not exists uq_user_account_username on user_account(username);

alter table user_account add column if not exists email_verified boolean not null default false;

create table if not exists email_verification_token (
    id text primary key,
    user_id text not null references user_account(id) on delete cascade,
    token_hash text not null,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now(),
    unique (token_hash)
);

create index if not exists idx_email_verification_user_expires on email_verification_token(user_id, expires_at desc);

create table if not exists agent_invite (
    id text primary key,
    tenant_id text not null references tenant(id) on delete cascade,
    email text not null,
    role text not null default 'agent' check (role in ('agent','admin')),
    inviter_user_id text references user_account(id),
    token_hash text not null,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    accepted_user_id text references user_account(id),
    created_at timestamptz not null default now(),
    unique (token_hash)
);

create index if not exists idx_agent_invite_tenant_email on agent_invite(tenant_id, email, created_at desc);
