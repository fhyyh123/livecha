alter table widget_config add column if not exists widget_language text default 'en' not null;
alter table widget_config add column if not exists widget_phrases_json text;
