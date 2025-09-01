-- Weather Cache Migration for Supabase
-- Add this to your Supabase SQL editor

CREATE TABLE IF NOT EXISTS "WeatherCache" (
    id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date TIMESTAMP(3) NOT NULL, -- Date in British time (BST/GMT), normalized to midnight
    temperature INTEGER NOT NULL, -- Max temperature in Celsius
    "minTemperature" INTEGER, -- Min temperature in Celsius
    "weatherType" TEXT NOT NULL, -- Weather description (e.g., "Sunny day", "Light rain")
    "precipitationProbability" INTEGER, -- Chance of rain (0-100%)
    "windSpeed" INTEGER, -- Wind speed in mph
    "windDirection" TEXT, -- Wind direction (e.g., "SW")
    "uvIndex" INTEGER, -- UV index (0-11+)
    visibility TEXT, -- Visibility description
    humidity INTEGER, -- Relative humidity percentage
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP -- When this record was last updated
);

-- Create unique constraint on date
CREATE UNIQUE INDEX IF NOT EXISTS "WeatherCache_date_key" ON "WeatherCache"(date);

-- Create index for efficient date lookups
CREATE INDEX IF NOT EXISTS "WeatherCache_date_idx" ON "WeatherCache"(date);