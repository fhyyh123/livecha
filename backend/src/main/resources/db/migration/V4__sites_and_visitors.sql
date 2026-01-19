-- Site (tenant 下的站点/项目)
create table if not exists site (
    id text primary key,
    tenant_id text not null references tenant(id),
    name text not null,
    public_key text not null,
    status text not null default 'active' check (status in ('active','disabled')),
    created_at timestamptz not null default now(),
    unique (public_key)
);

create index if not exists idx_site_tenant on site(tenant_id);

-- 站点允许嵌入的域名白名单（精确匹配 host，不含 scheme/path）
create table if not exists site_domain_allowlist (
    site_id text not null references site(id) on delete cascade,
    domain text not null,
    created_at timestamptz not null default now(),
    primary key (site_id, domain)
);

create index if not exists idx_site_domain_allowlist_domain on site_domain_allowlist(domain);

-- Widget 配置（MVP）
create table if not exists widget_config (
    site_id text primary key references site(id) on delete cascade,
    anonymous_enabled boolean not null default true,
    theme_color text,
    welcome_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Visitor 主体（匿名也会有 visitor_id）
create table if not exists visitor (
    id text primary key,
    site_id text not null references site(id) on delete cascade,
    name text,
    email text,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index if not exists idx_visitor_site on visitor(site_id);
create index if not exists idx_visitor_site_last_seen on visitor(site_id, last_seen_at desc);

-- conversation 增加 site/visitor 维度（先保留现有 customer_user_id 逻辑，后续 public 会话再逐步迁移）
alter table conversation add column if not exists site_id text references site(id);
alter table conversation add column if not exists visitor_id text references visitor(id);

create index if not exists idx_conversation_site on conversation(site_id);
create index if not exists idx_conversation_site_visitor on conversation(site_id, visitor_id);

-- seed demo site + allowlist + widget config (dev)
insert into site(id, tenant_id, name, public_key)
values ('site_demo', 't1', 'Demo Site', 'pk_demo_change_me')
on conflict do nothing;

insert into site_domain_allowlist(site_id, domain)
values
  ('site_demo', 'localhost'),
  ('site_demo', '127.0.0.1')
on conflict do nothing;

insert into widget_config(site_id, anonymous_enabled, theme_color, welcome_text)
values ('site_demo', true, '#2563eb', '你好！有什么可以帮你？')
on conflict do nothing;
