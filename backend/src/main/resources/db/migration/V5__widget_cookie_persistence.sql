-- Add widget_config fields for visitor_id cookie persistence hints
alter table widget_config add column if not exists cookie_domain text;
alter table widget_config add column if not exists cookie_samesite text;
