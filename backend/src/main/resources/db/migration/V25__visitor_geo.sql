-- Visitor geo context (approximate)

alter table visitor add column if not exists geo_country text;
alter table visitor add column if not exists geo_region text;
alter table visitor add column if not exists geo_city text;

alter table visitor add column if not exists geo_lat double precision;
alter table visitor add column if not exists geo_lon double precision;

-- IANA timezone id, e.g. "Asia/Hong_Kong"
alter table visitor add column if not exists geo_timezone text;

alter table visitor add column if not exists geo_updated_at timestamptz;
