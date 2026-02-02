-- Widget language and customizable phrases

alter table widget_config add column if not exists widget_language text not null default 'en';
alter table widget_config add column if not exists widget_phrases_json text;
