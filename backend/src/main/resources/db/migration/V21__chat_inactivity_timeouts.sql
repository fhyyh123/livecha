-- Per-tenant chat inactivity timeout settings.
-- visitor_idle_minutes: used by agent UI to show an "idle" marker when the visitor hasn't sent a message.
-- inactivity_archive_minutes: used by backend scheduler to auto-archive conversations after long inactivity.

create table if not exists chat_inactivity_timeouts (
    tenant_id varchar(64) not null,
    visitor_idle_minutes int not null,
    inactivity_archive_minutes int not null,
    updated_at timestamp not null default now(),
    primary key (tenant_id)
);
