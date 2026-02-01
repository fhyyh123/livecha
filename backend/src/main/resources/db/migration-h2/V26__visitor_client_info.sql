-- Store visitor client info for Technology panel (LiveChat-style)
alter table visitor add column if not exists last_ip varchar;
alter table visitor add column if not exists last_user_agent varchar;
