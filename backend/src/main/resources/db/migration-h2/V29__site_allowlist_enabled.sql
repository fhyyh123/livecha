-- Toggle for trusted domains (site allowlist enforcement)

alter table site
    add column if not exists allowlist_enabled boolean not null default true;
