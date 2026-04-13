-- The Fairway Society — database schema
-- Run once in Supabase SQL editor after creating the project.

create extension if not exists "uuid-ossp";

create table if not exists courses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  platform text not null check (platform in ('miclub', 'quick18')),
  booking_url text not null,
  state text,
  suburb text,
  postcode text,
  lat double precision,
  lng double precision,
  holes integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_platform_idx on courses(platform);
create index if not exists courses_active_idx on courses(active);
create index if not exists courses_latlng_idx on courses(lat, lng);

-- Distance helper (Haversine in km).
create or replace function course_distance_km(
  c_lat double precision,
  c_lng double precision,
  u_lat double precision,
  u_lng double precision
) returns double precision as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(u_lat - c_lat) / 2), 2) +
    cos(radians(c_lat)) * cos(radians(u_lat)) *
    power(sin(radians(u_lng - c_lng) / 2), 2)
  ))
$$ language sql immutable;

-- Convenience view: nearby active courses.
-- Use with: select * from nearby_courses(-31.95, 115.86, 50);
create or replace function nearby_courses(
  u_lat double precision,
  u_lng double precision,
  radius_km double precision
) returns table (
  id uuid,
  name text,
  slug text,
  platform text,
  booking_url text,
  suburb text,
  state text,
  lat double precision,
  lng double precision,
  distance_km double precision
) as $$
  select c.id, c.name, c.slug, c.platform, c.booking_url, c.suburb, c.state,
    c.lat, c.lng,
    course_distance_km(c.lat, c.lng, u_lat, u_lng) as distance_km
  from courses c
  where c.active = true
    and c.lat is not null and c.lng is not null
    and course_distance_km(c.lat, c.lng, u_lat, u_lng) <= radius_km
  order by distance_km asc
$$ language sql stable;

-- Row Level Security — courses are public-read only.
alter table courses enable row level security;

drop policy if exists "courses public read" on courses;
create policy "courses public read" on courses
  for select using (active = true);
