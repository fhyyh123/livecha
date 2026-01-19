-- Add enable switches for inactivity timeouts.

alter table chat_inactivity_timeouts
    add column if not exists visitor_idle_enabled boolean not null default true;

alter table chat_inactivity_timeouts
    add column if not exists inactivity_archive_enabled boolean not null default true;
