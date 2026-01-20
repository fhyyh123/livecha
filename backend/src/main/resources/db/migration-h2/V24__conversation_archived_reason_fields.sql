-- Persist archive reason/details on conversation for fast list rendering.

alter table conversation
    add column if not exists last_archived_reason varchar(255);

alter table conversation
    add column if not exists last_archived_inactivity_minutes int;
