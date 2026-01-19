-- Email verification via 6-digit confirmation code

create table if not exists email_verification_code (
    id text primary key,
    user_id text not null references user_account(id) on delete cascade,
    code_hash text not null,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_email_verification_code_user_expires
    on email_verification_code(user_id, expires_at desc);

create index if not exists idx_email_verification_code_user_used
    on email_verification_code(user_id, used_at, created_at desc);
