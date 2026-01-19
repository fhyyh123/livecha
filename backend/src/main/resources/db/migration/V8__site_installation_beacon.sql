-- Widget 安装/验证：widget.js 通过 ping.gif 上报最后一次加载信息
create table if not exists site_installation (
    site_id text primary key references site(id) on delete cascade,
    last_seen_at timestamptz not null default now(),
    last_origin text,
    last_page_url text,
    last_user_agent text,
    last_ip text
);

create index if not exists idx_site_installation_last_seen on site_installation(last_seen_at);
