-- Make show_logo default to true (was false) to match product expectations.

alter table widget_config
    alter column show_logo set default true;

update widget_config
set show_logo = true
where show_logo = false;
