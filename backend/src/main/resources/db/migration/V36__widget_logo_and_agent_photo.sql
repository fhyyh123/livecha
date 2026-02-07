-- Widget logo (header icon) + optional agent photo launcher behavior

alter table widget_config
    add column if not exists show_logo boolean not null default false;

alter table widget_config
    add column if not exists logo_bucket text;

alter table widget_config
    add column if not exists logo_object_key text;

alter table widget_config
    add column if not exists logo_content_type text;

alter table widget_config
    add column if not exists logo_updated_at timestamptz;

alter table widget_config
    add column if not exists show_agent_photo boolean not null default false;
