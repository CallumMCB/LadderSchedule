import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

function getWeatherDescription(weatherCode: string): string {
  const codes: { [key: string]: string } = {
    '0': 'Clear night',
    '1': 'Sunny day',
    '2': 'Partly cloudy',
    '3': 'Partly cloudy',
    '4': 'Not used',
    '5': 'Mist',
    '6': 'Fog',
    '7': 'Cloudy',
    '8': 'Overcast',
    '9': 'Light rain shower',
    '10': 'Light rain',
    '11': 'Drizzle',
    '12': 'Light rain',
    '13': 'Heavy rain shower',
    '14': 'Heavy rain',
    '15': 'Heavy rain',
    '16': 'Sleet shower',
    '17': 'Sleet',
    '18': 'Hail shower',
    '19': 'Hail',
    '20': 'Light snow shower',
    '21': 'Light snow',
    '22': 'Heavy snow shower',
    '23': 'Heavy snow',
    '24': 'Ice shower',
    '25': 'Ice',
    '26': 'Thunder shower',
    '27': 'Thunder',
    '28': 'Heavy rain and thunder',
    '29': 'Light snow and thunder',
    '30': 'Heavy snow and thunder'
  };
  
  return codes[weatherCode] || 'Variable conditions';
}

async function fetchMetOfficeWeather() {
  if (!MET_OFFICE_API_KEY) {
    throw new Error('Met Office API key not configured');
  }

  // Leamington Spa coordinates
  const latitude = 52.2928;
  const longitude = -1.5317;

  const response = await fetch(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`,
    {
      headers: {
        'accept': 'application/json',
        'apikey': MET_OFFICE_API_KEY
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Met Office API error response:', errorText);
    throw new Error(`Met Office API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// One-time initialization endpoint to populate weather for the rest of this week
export async function POST(request: NextRequest) {
  try {
    // Verify this is an authorized call
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET || 'development-secret';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🌤️ Starting initial weather cache population...');
    
    // Fetch weather data from Met Office
    const weatherData = await fetchMetOfficeWeather();
    
    if (!weatherData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid weather data format');
    }

    const timeSeries = weatherData.features[0].properties.timeSeries;
    let updatedCount = 0;
    
    // Get current British time
    const now = new Date();
    const britishNow = new Date(now.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
    
    // Find the end of this week (next Sunday)
    const endOfWeek = new Date(britishNow);
    const daysUntilSunday = 7 - britishNow.getDay(); // getDay() returns 0 for Sunday, 1 for Monday, etc.
    endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
    endOfWeek.setHours(23, 59, 59, 999); // End of Sunday
    
    console.log(`Populating weather from ${britishNow.toDateString()} to ${endOfWeek.toDateString()}`);
    
    // Process each day's forecast for the rest of this week
    for (const forecast of timeSeries) {
      const forecastDate = new Date(forecast.time);
      const britishForecastDate = new Date(forecastDate.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
      
      // Only process forecasts from today until end of this week
      if (britishForecastDate < britishNow || britishForecastDate > endOfWeek) continue;
      
      // Normalize to midnight British time for consistent date matching
      const normalizedDate = new Date(britishForecastDate.getFullYear(), britishForecastDate.getMonth(), britishForecastDate.getDate());
      
      try {
        // Upsert weather cache entry
        const weatherEntry = await prisma.weatherCache.upsert({
          where: { date: normalizedDate },
          update: {
            temperature: Math.round(forecast.dayMaxScreenTemperature || 20),
            minTemperature: Math.round(forecast.dayMinScreenTemperature || 10),
            weatherType: getWeatherDescription(forecast.daySignificantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(forecast.dayProbabilityOfPrecipitation || 0),
            windSpeed: Math.round(forecast.midday10MWindSpeed || 0),
            windDirection: forecast.midday10MWindDirection || 'Variable',
            uvIndex: Math.round(forecast.dayMaxUvIndex || 0),
            visibility: forecast.middayVisibility ? `${Math.round(forecast.middayVisibility / 1000)}km` : 'Good',
            humidity: Math.round(forecast.middayRelativeHumidity || 50),
            updatedAt: new Date()
          },
          create: {
            date: normalizedDate,
            temperature: Math.round(forecast.dayMaxScreenTemperature || 20),
            minTemperature: Math.round(forecast.dayMinScreenTemperature || 10),
            weatherType: getWeatherDescription(forecast.daySignificantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(forecast.dayProbabilityOfPrecipitation || 0),
            windSpeed: Math.round(forecast.midday10MWindSpeed || 0),
            windDirection: forecast.midday10MWindDirection || 'Variable',
            uvIndex: Math.round(forecast.dayMaxUvIndex || 0),
            visibility: forecast.middayVisibility ? `${Math.round(forecast.middayVisibility / 1000)}km` : 'Good',
            humidity: Math.round(forecast.middayRelativeHumidity || 50)
          }
        });
        
        console.log(`✅ Weather cached for ${normalizedDate.toDateString()}: ${weatherEntry.weatherType}, ${weatherEntry.temperature}°C`);
        updatedCount++;
      } catch (error) {
        console.error(`Failed to update weather for ${normalizedDate.toISOString().split('T')[0]}:`, error);
      }
    }

    console.log(`✅ Initial weather cache populated: ${updatedCount} forecasts for rest of week`);
    
    return NextResponse.json({
      success: true,
      message: `Populated ${updatedCount} weather forecasts for rest of this week`,
      updatedCount,
      periodCovered: `${britishNow.toDateString()} to ${endOfWeek.toDateString()}`
    });

  } catch (error) {
    console.error('❌ Initial weather cache population failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to populate initial weather cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Allow GET requests for manual testing
export async function GET(request: NextRequest) {
  // Just call the POST method for testing
  return POST(request);
}