-- Persist archive reason/details on conversation for fast list rendering (H2-friendly; avoids JSON ops).

alter table conversation
    add column if not exists last_archived_reason text;

alter table conversation
    add column if not exists last_archived_inactivity_minutes int;
