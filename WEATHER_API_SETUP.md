# Weather API Setup

The Tennis Ladder application includes real-time weather forecasts for Leamington Spa in match confirmation emails. This requires setting up weather API keys.

## Supported Weather APIs

The system uses a fallback approach to ensure weather data is always available:

### 1. Met Office DataPoint API (Primary - UK Official)
- **Provider**: UK Met Office
- **Coverage**: Highly accurate for UK locations
- **Cost**: Free tier available
- **Setup**: Register at https://www.metoffice.gov.uk/services/data/datapoint

### 2. OpenWeatherMap API (Fallback)
- **Provider**: OpenWeatherMap
- **Coverage**: Global weather data
- **Cost**: Free tier (1000 calls/day)
- **Setup**: Register at https://openweathermap.org/api

### 3. Seasonal Fallback
- **Provider**: Built-in seasonal advice
- **Coverage**: Basic seasonal guidance for UK
- **Cost**: Free
- **Setup**: No setup required

## Environment Variables

Add these to your `.env.local` file:

```env
# Weather API Keys (optional but recommended)
MET_OFFICE_API_KEY=your_met_office_api_key_here
OPENWEATHER_API_KEY=your_openweather_api_key_here
```

## Setting Up Met Office API

1. Visit https://www.metoffice.gov.uk/services/data/datapoint
2. Register for a free account
3. Apply for API access
4. Once approved, get your API key
5. Add `MET_OFFICE_API_KEY=your_key` to your environment variables

## Setting Up OpenWeatherMap API

1. Visit https://openweathermap.org/api
2. Sign up for a free account
3. Go to API keys section
4. Copy your default API key
5. Add `OPENWEATHER_API_KEY=your_key` to your environment variables

## Weather Forecast Features

When APIs are configured, match confirmation emails include:

- **Real-time conditions** for the match date
- **Temperature** in Celsius
- **Weather description** (sunny, cloudy, rainy, etc.)
- **Humidity levels**
- **Rain probability** (Met Office)
- **Contextual advice** based on conditions:
  - Rain warnings with court availability reminders
  - Heat warnings with hydration advice
  - Cold warnings with layering suggestions

## Fallback Behavior

If no API keys are provided:
- System uses seasonal weather patterns
- Provides general advice based on time of year
- Ensures emails always include weather guidance

## Location

The weather forecast is specifically configured for:
- **Location**: Leamington Spa, UK
- **Coordinates**: 52.2928°N, 1.5317°W

To change the location, update the coordinates in `lib/email.ts`.

## API Limits

- **Met Office**: Check your account limits
- **OpenWeatherMap**: 1000 calls/day on free tier
- **Fallback**: Unlimited (no API calls)

The system is designed to handle API failures gracefully and will always provide some weather guidance to users.