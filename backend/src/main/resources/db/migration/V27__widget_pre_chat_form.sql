-- Pre-chat form settings for website widget
alter table widget_config add column if not exists pre_chat_message text;
alter table widget_config add column if not exists pre_chat_name_label text;
alter table widget_config add column if not exists pre_chat_email_label text;
alter table widget_config add column if not exists pre_chat_name_required boolean not null default false;
alter table widget_config add column if not exists pre_chat_email_required boolean not null default false;
