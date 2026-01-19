-- Widget 安装/验证：widget.js 通过 ping.gif 上报最后一次加载信息
create table if not exists site_installation (
    site_id varchar primary key,
    last_seen_at timestamp not null default now(),
    last_origin varchar,
    last_page_url varchar,
    last_user_agent varchar,
    last_ip varchar,
    constraint fk_site_installation_site foreign key (site_id) references site(id) on delete cascade
);

create index if not exists idx_site_installation_last_seen on site_installation(last_seen_at);
