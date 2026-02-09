-- Add agent no-reply transfer settings for inactivity timeouts.

alter table chat_inactivity_timeouts
    add column if not exists agent_no_reply_transfer_enabled boolean not null default true;

alter table chat_inactivity_timeouts
    add column if not exists agent_no_reply_transfer_minutes int not null default 3;
