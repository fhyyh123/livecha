-- Site (tenant 下的站点/项目)
create table if not exists site (
    id varchar primary key,
    tenant_id varchar not null,
    name varchar not null,
    public_key varchar not null,
    status varchar not null default 'active',
    created_at timestamp not null default now(),
    constraint fk_site_tenant foreign key (tenant_id) references tenant(id),
    unique (public_key)
);

create index if not exists idx_site_tenant on site(tenant_id);

-- 站点允许嵌入的域名白名单（精确匹配 host，不含 scheme/path）
create table if not exists site_domain_allowlist (
    site_id varchar not null,
    domain varchar not null,
    created_at timestamp not null default now(),
    constraint fk_allowlist_site foreign key (site_id) references site(id) on delete cascade,
    primary key (site_id, domain)
);

create index if not exists idx_site_domain_allowlist_domain on site_domain_allowlist(domain);

-- Widget 配置（MVP）
create table if not exists widget_config (
    site_id varchar primary key,
    anonymous_enabled boolean not null default true,
    theme_color varchar,
    welcome_text varchar,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    constraint fk_widget_config_site foreign key (site_id) references site(id) on delete cascade
);

-- Visitor 主体
create table if not exists visitor (
    id varchar primary key,
    site_id varchar not null,
    name varchar,
    email varchar,
    created_at timestamp not null default now(),
    last_seen_at timestamp not null default now(),
    constraint fk_visitor_site foreign key (site_id) references site(id) on delete cascade
);

create index if not exists idx_visitor_site on visitor(site_id);
create index if not exists idx_visitor_site_last_seen on visitor(site_id, last_seen_at);

-- conversation 增加 site/visitor 维度
alter table conversation add column if not exists site_id varchar;
alter table conversation add column if not exists visitor_id varchar;

alter table conversation add constraint if not exists fk_conversation_site foreign key (site_id) references site(id);
alter table conversation add constraint if not exists fk_conversation_visitor foreign key (visitor_id) references visitor(id);

create index if not exists idx_conversation_site on conversation(site_id);
create index if not exists idx_conversation_site_visitor on conversation(site_id, visitor_id);

-- seed demo site (dev)
merge into site key(id) values ('site_demo', 't1', 'Demo Site', 'pk_demo_change_me', 'active', now());
merge into site_domain_allowlist key(site_id, domain) values ('site_demo', 'localhost', now());
merge into site_domain_allowlist key(site_id, domain) values ('site_demo', '127.0.0.1', now());
merge into widget_config key(site_id) values ('site_demo', true, '#2563eb', '你好！有什么可以帮你？', now(), now());
