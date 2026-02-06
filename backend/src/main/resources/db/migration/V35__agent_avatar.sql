-- Agent avatar storage (S3/MinIO)
alter table agent_profile
    add column if not exists avatar_bucket text;

alter table agent_profile
    add column if not exists avatar_object_key text;

alter table agent_profile
    add column if not exists avatar_content_type text;

alter table agent_profile
    add column if not exists avatar_updated_at timestamptz;
