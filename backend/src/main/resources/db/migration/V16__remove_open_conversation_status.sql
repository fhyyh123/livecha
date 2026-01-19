-- Normalize legacy conversation.status='open' into the current product model.
--
-- We keep only 3 runtime states for agent console:
-- - queued: unassigned, waiting in queue
-- - assigned: assigned to an agent
-- - closed: archived/closed
--
-- Historically the schema allowed 'open' as a default, but the application code does not rely on it.

update conversation
set status = 'queued'
where status = 'open'
  and assigned_agent_user_id is null;

update conversation
set status = 'assigned'
where status = 'open'
  and assigned_agent_user_id is not null;

-- Make new rows default to queued.
alter table conversation alter column status set default 'queued';

-- Tighten the status constraint (Postgres names this constraint as <table>_<column>_check by default).
alter table conversation drop constraint if exists conversation_status_check;
alter table conversation
    add constraint conversation_status_check
        check (status in ('queued','assigned','closed'));
