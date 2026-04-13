-- Migration: Add Google Places photo caching columns to courses table
-- Run once in the Supabase SQL editor.
--
-- place_id   : Google Places place ID (used to look up photos via Places API)
-- image_url  : Cached direct photo URL from Google Places (avoids re-calling the API on every search)
--
-- After running this migration, execute:  npm run enrich:photos
-- That script will populate place_id and image_url for all active courses.

alter table courses
  add column if not exists place_id  text,
  add column if not exists image_url text;
