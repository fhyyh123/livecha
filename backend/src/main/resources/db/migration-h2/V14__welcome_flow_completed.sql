-- Mark welcome flow completion (H2)

alter table tenant_onboarding
    add column if not exists completed_at timestamp;

create index if not exists idx_tenant_onboarding_completed_at on tenant_onboarding(completed_at);
