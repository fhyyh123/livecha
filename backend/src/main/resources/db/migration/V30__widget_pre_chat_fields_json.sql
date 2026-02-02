-- Pre-chat form: dynamic fields builder (stored as JSON)
alter table widget_config add column if not exists pre_chat_fields_json text;
