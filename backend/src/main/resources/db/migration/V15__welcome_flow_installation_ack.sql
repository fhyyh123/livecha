-- Track that the user acknowledged the installation step

alter table tenant_onboarding
    add column if not exists installation_ack_at timestamptz;

create index if not exists idx_tenant_onboarding_installation_ack_at on tenant_onboarding(installation_ack_at desc);
