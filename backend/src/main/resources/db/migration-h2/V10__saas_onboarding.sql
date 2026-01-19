-- SaaS onboarding: email verification + agent invites + global username uniqueness (H2)

create unique index if not exists uq_user_account_username on user_account(username);

alter table user_account add column if not exists email_verified boolean not null default false;

create table if not exists email_verification_token (
    id varchar(80) primary key,
    user_id varchar(64) not null,
    token_hash varchar(128) not null,
    expires_at timestamp not null,
    used_at timestamp,
    created_at timestamp not null default current_timestamp,
    constraint fk_evt_user foreign key (user_id) references user_account(id) on delete cascade,
    unique (token_hash)
);

create index if not exists idx_email_verification_user_expires on email_verification_token(user_id, expires_at);

create table if not exists agent_invite (
    id varchar(80) primary key,
    tenant_id varchar(64) not null,
    email varchar(255) not null,
    role varchar(16) not null default 'agent',
    inviter_user_id varchar(64),
    token_hash varchar(128) not null,
    expires_at timestamp not null,
    accepted_at timestamp,
    accepted_user_id varchar(64),
    created_at timestamp not null default current_timestamp,
    constraint fk_ai_tenant foreign key (tenant_id) references tenant(id) on delete cascade,
    constraint fk_ai_inviter foreign key (inviter_user_id) references user_account(id),
    constraint fk_ai_accepted_user foreign key (accepted_user_id) references user_account(id),
    unique (token_hash)
);

create index if not exists idx_agent_invite_tenant_email on agent_invite(tenant_id, email, created_at);
