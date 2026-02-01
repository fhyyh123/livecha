-- Store visitor client info for Technology panel (LiveChat-style)
alter table visitor add column if not exists last_ip text;
alter table visitor add column if not exists last_user_agent text;

create index if not exists idx_visitor_last_seen on visitor(last_seen_at desc);
