-- Weather Cache Migration for Supabase
-- Add this to your Supabase SQL editor

CREATE TABLE IF NOT EXISTS "WeatherCache" (
    id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date TIMESTAMP(3) NOT NULL,
    temperature INTEGER NOT NULL,
    "minTemperature" INTEGER,
    "weatherType" TEXT NOT NULL,
    "precipitationProbability" INTEGER,
    "windSpeed" INTEGER,
    "windDirection" TEXT,
    "uvIndex" INTEGER,
    visibility TEXT,
    humidity INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique constraint on date
CREATE UNIQUE INDEX IF NOT EXISTS "WeatherCache_date_key" ON "WeatherCache"(date);

-- Create index for efficient date lookups
CREATE INDEX IF NOT EXISTS "WeatherCache_date_idx" ON "WeatherCache"(date);