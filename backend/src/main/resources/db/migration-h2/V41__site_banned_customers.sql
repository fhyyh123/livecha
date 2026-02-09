-- Banned customers (by IP) per site.

create table if not exists site_banned_customer (
    id varchar primary key,
    site_id varchar not null,
    ip varchar not null,
    expires_at timestamp,
    created_at timestamp not null default now(),
    created_by varchar,
    constraint fk_site_banned_customer_site foreign key (site_id) references site(id) on delete cascade,
    constraint uq_site_banned_customer_site_ip unique (site_id, ip)
);

create index if not exists idx_site_banned_customer_site on site_banned_customer(site_id);
create index if not exists idx_site_banned_customer_site_ip on site_banned_customer(site_id, ip);
create index if not exists idx_site_banned_customer_expires_at on site_banned_customer(expires_at);
