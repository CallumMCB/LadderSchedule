-- Hourly Weather Cache Migration for Supabase
-- Enhanced weather system with hourly forecasts (6am-10pm) for next 14 days

-- Create hourly weather cache table
CREATE TABLE IF NOT EXISTS "HourlyWeatherCache" (
    id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "datetime" TIMESTAMP(3) NOT NULL, -- Exact date and hour in British time
    temperature DECIMAL(5,2) NOT NULL, -- Screen temperature in Celsius
    "feelsLikeTemperature" DECIMAL(5,2), -- Feels like temperature in Celsius  
    "weatherType" TEXT NOT NULL, -- Weather description from weather code
    "precipitationProbability" INTEGER, -- Chance of rain (0-100%)
    "precipitationRate" DECIMAL(5,2), -- Precipitation rate (mm/h)
    "windSpeed" DECIMAL(5,2), -- Wind speed in m/s
    "windDirection" INTEGER, -- Wind direction in degrees (0-360)
    "windGust" DECIMAL(5,2), -- Wind gust speed in m/s
    "uvIndex" INTEGER, -- UV index (0-11+)
    visibility INTEGER, -- Visibility in metres
    humidity DECIMAL(5,2), -- Relative humidity percentage
    pressure DECIMAL(8,2), -- Mean sea level pressure in pascals
    "dewPoint" DECIMAL(5,2), -- Dew point temperature in Celsius
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP -- When this record was last updated
);

-- Create unique constraint on datetime
CREATE UNIQUE INDEX IF NOT EXISTS "HourlyWeatherCache_datetime_key" ON "HourlyWeatherCache"(datetime);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "HourlyWeatherCache_datetime_idx" ON "HourlyWeatherCache"(datetime);
CREATE INDEX IF NOT EXISTS "HourlyWeatherCache_date_idx" ON "HourlyWeatherCache"(DATE(datetime));
CREATE INDEX IF NOT EXISTS "HourlyWeatherCache_updated_idx" ON "HourlyWeatherCache"("updatedAt");

-- Keep daily weather cache for summary data
-- The existing WeatherCache table remains for daily summaries