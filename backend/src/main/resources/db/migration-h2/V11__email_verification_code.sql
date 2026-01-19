-- Email verification via 6-digit confirmation code (H2)

create table if not exists email_verification_code (
    id varchar(80) primary key,
    user_id varchar(64) not null,
    code_hash varchar(128) not null,
    expires_at timestamp not null,
    used_at timestamp,
    created_at timestamp not null default current_timestamp,
    constraint fk_email_verif_code_user foreign key (user_id) references user_account(id) on delete cascade
);

create index if not exists idx_email_verification_code_user_expires
    on email_verification_code(user_id, expires_at);

create index if not exists idx_email_verification_code_user_used
    on email_verification_code(user_id, used_at, created_at);
