# Weather Caching System Setup

## Overview
This system caches weather data from the Met Office API to optimize API usage and provide reliable weather information for match emails. Weather data is stored for up to 14 days in advance and updated hourly.

## Database Setup

### 1. Run Supabase Migration
Execute the SQL in `supabase_weather_cache_migration.sql` in your Supabase SQL editor to create the WeatherCache table.

### 2. Environment Variables
Ensure these are set in your production environment:
```
MET_OFFICE_API_KEY=your_met_office_api_key_here
CRON_SECRET=your_secure_cron_secret_here
```

## How It Works

### Weather Data Flow
1. **Hourly Updates**: `/api/cron/weather` endpoint fetches weather data from Met Office API
2. **Cache Storage**: Weather data stored in WeatherCache table for next 14 days
3. **Email Integration**: Match emails use cached data instead of making API calls
4. **Automatic Cleanup**: Old weather data (>1 day old) automatically removed

### API Usage Optimization
- **Met Office API**: 360 calls/day limit
- **Cache Updates**: 24 calls/day (1 per hour)
- **Remaining Budget**: 336 calls/day for other features
- **Email Weather**: No API calls - uses cached data

## Setting Up the Cron Job

### Production (Vercel/Netlify)
Set up a cron job or webhook to call:
```
POST /api/cron/weather
Authorization: Bearer your_cron_secret_here
```

### Manual Testing
```bash
curl -X POST "https://your-domain.com/api/cron/weather" \
  -H "Authorization: Bearer your_cron_secret_here" \
  -H "Content-Type: application/json"
```

## Weather Data Structure

The WeatherCache table stores:
- **date**: Match date (normalized to midnight UTC)
- **temperature**: Max temperature (°C)
- **minTemperature**: Min temperature (°C)
- **weatherType**: Description (e.g., "Sunny day", "Light rain")
- **precipitationProbability**: Rain chance (0-100%)
- **windSpeed**: Wind speed (mph)
- **windDirection**: Wind direction (e.g., "SW")
- **uvIndex**: UV index (0-11+)
- **visibility**: Visibility distance
- **humidity**: Relative humidity (%)

## Email Integration

Match confirmation emails now:
- Use cached weather data for accurate forecasts
- Show gear recommendations based on conditions
- Fall back to seasonal advice if no cached data

## Monitoring

Check the cron job logs for:
- ✅ Successful updates: "Weather cache updated: X forecasts"
- ❌ API errors: "Met Office API error: ..."
- 🧹 Cleanup: "cleaned X old records"

## Troubleshooting

### No Weather Data in Emails
1. Check if cron job is running hourly
2. Verify MET_OFFICE_API_KEY is valid
3. Check API quota hasn't been exceeded

### API Quota Issues
- Met Office free tier: 360 calls/day
- Current usage: ~24 calls/day for caching
- Monitor usage in Met Office dashboard

### Database Issues
- Ensure WeatherCache table exists in Supabase
- Check date field uses proper timezone (UTC)
- Verify unique constraint on date field