-- assignment cursor for round-robin
create table if not exists agent_assign_cursor (
    tenant_id text not null references tenant(id),
    group_key text not null,
    last_agent_user_id text,
    updated_at timestamptz not null default now(),
    primary key (tenant_id, group_key)
);

-- extend agent_profile.status to include busy (existing check constraint is unnamed)
do $$
declare
    c_name text;
begin
    select conname into c_name
    from pg_constraint
    where conrelid = 'agent_profile'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%in%online%away%offline%'
    limit 1;

    if c_name is not null then
        execute 'alter table agent_profile drop constraint ' || quote_ident(c_name);
    end if;

    begin
        alter table agent_profile
            add constraint chk_agent_profile_status
                check (status in ('online','away','busy','offline'));
    exception when duplicate_object then
        -- already exists
        null;
    end;
end $$;
