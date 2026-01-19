-- Add job_title to agent_profile
alter table agent_profile
    add column if not exists job_title varchar(255);
