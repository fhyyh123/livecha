alter table widget_config
    add column if not exists show_welcome_screen boolean not null default true;
