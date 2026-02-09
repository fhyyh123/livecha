create table if not exists widget_welcome_group_config (
    site_id varchar(64) not null,
    skill_group_id varchar(128) not null,
    welcome_text clob null,
    show_welcome_screen boolean not null default true,
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    primary key (site_id, skill_group_id)
);

create index if not exists idx_widget_welcome_group_config_site_id
    on widget_welcome_group_config(site_id);
