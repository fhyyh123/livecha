-- Toggle for trusted domains (site allowlist enforcement)
-- When false, widget bootstrap will not block by origin allowlist.

alter table site
    add column if not exists allowlist_enabled boolean not null default true;
