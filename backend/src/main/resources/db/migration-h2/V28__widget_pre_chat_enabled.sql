-- Replace legacy anonymous_enabled with pre_chat_enabled
-- pre_chat_enabled: when true, visitors must fill the pre-chat form before starting a conversation.

alter table widget_config add column if not exists pre_chat_enabled boolean not null default false;

-- Migrate existing data:
update widget_config set pre_chat_enabled = not anonymous_enabled;

alter table widget_config drop column if exists anonymous_enabled;
