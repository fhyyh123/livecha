-- Agent avatar storage (S3/MinIO)
alter table agent_profile add column if not exists avatar_bucket varchar(255);
alter table agent_profile add column if not exists avatar_object_key varchar(1024);
alter table agent_profile add column if not exists avatar_content_type varchar(128);
alter table agent_profile add column if not exists avatar_updated_at timestamp;
