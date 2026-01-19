-- Normalize legacy conversation.status='open' into the current product model (H2).

update conversation
set status = 'queued'
where status = 'open'
  and assigned_agent_user_id is null;

update conversation
set status = 'assigned'
where status = 'open'
  and assigned_agent_user_id is not null;

alter table conversation alter column status set default 'queued';
