-- Visitor geo context (approximate)

alter table visitor add column if not exists geo_country varchar;
alter table visitor add column if not exists geo_region varchar;
alter table visitor add column if not exists geo_city varchar;

alter table visitor add column if not exists geo_lat double;
alter table visitor add column if not exists geo_lon double;

-- IANA timezone id, e.g. "Asia/Hong_Kong"
alter table visitor add column if not exists geo_timezone varchar;

alter table visitor add column if not exists geo_updated_at timestamp;
