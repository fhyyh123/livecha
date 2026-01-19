-- Welcome flow fields (LiveChat-like onboarding)

create table if not exists tenant_onboarding (
    tenant_id text primary key references tenant(id) on delete cascade,
    website text,
    company_size text,
    integrations text,
    updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_onboarding_updated on tenant_onboarding(updated_at desc);
