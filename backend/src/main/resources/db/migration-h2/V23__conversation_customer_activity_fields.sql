-- Track last visitor/customer activity for idle system events.

alter table conversation
    add column if not exists last_customer_msg_at timestamp;

alter table conversation
    add column if not exists last_idle_event_at timestamp;

create index if not exists idx_conversation_tenant_status_last_customer
    on conversation(tenant_id, status, last_customer_msg_at);
