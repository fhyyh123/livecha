-- Welcome flow fields (LiveChat-like onboarding)

create table if not exists tenant_onboarding (
    tenant_id varchar primary key,
    website varchar,
    company_size varchar,
    integrations clob,
    updated_at timestamp not null default current_timestamp,
    constraint fk_tenant_onboarding_tenant foreign key (tenant_id) references tenant(id) on delete cascade
);

create index if not exists idx_tenant_onboarding_updated on tenant_onboarding(updated_at desc);
