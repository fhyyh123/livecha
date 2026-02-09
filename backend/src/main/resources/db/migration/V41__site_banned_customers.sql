-- Banned customers (by IP) per site.

create table if not exists site_banned_customer (
    id text primary key,
    site_id text not null references site(id) on delete cascade,
    ip text not null,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    created_by text,
    unique (site_id, ip)
);

create index if not exists idx_site_banned_customer_site on site_banned_customer(site_id);
create index if not exists idx_site_banned_customer_site_ip on site_banned_customer(site_id, ip);
create index if not exists idx_site_banned_customer_expires_at on site_banned_customer(expires_at);
