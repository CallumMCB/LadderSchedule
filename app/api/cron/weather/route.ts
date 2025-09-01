import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

interface MetOfficeWeatherData {
  SiteRep: {
    DV: {
      Location: {
        Period: Array<{
          value: string; // Date like "2025-01-15Z"
          Rep: Array<{
            D: string; // Wind direction
            F: string; // Feels like temperature
            G: string; // Wind gust
            H: string; // Humidity
            P: string; // Pressure
            S: string; // Wind speed
            T: string; // Temperature
            V: string; // Visibility
            W: string; // Weather type
            U: string; // UV index
            Dm: string; // Max temperature
            Dn: string; // Min temperature
            FDm: string; // Feels like max temp
            FNm: string; // Feels like min temp
            Gm: string; // Max wind gust
            Gn: string; // Min wind gust
            Hm: string; // Max humidity
            Hn: string; // Min humidity
            PPd: string; // Precipitation probability day
            PPn: string; // Precipitation probability night
            Sm: string; // Max wind speed
            Sn: string; // Min wind speed
            Um: string; // Max UV
            Un: string; // Min UV
            Vm: string; // Max visibility
            Vn: string; // Min visibility
          }>;
        }>;
      };
    };
  };
}

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
        'Authorization': `Bearer ${MET_OFFICE_API_KEY}`
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

export async function POST(request: NextRequest) {
  try {
    // Verify this is an authorized cron job
    // Vercel cron jobs include a special header
    const authHeader = request.headers.get('authorization');
    const vercelCronHeader = request.headers.get('vercel-cron');
    const expectedToken = process.env.CRON_SECRET || 'development-secret';
    
    // Allow both Vercel cron jobs and manual calls with auth header
    const isAuthorized = vercelCronHeader === '1' || authHeader === `Bearer ${expectedToken}`;
    
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🌤️ Starting weather cache update...');
    
    // Fetch weather data from Met Office
    const weatherData = await fetchMetOfficeWeather();
    
    if (!weatherData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid weather data format');
    }

    const timeSeries = weatherData.features[0].properties.timeSeries;
    let updatedCount = 0;
    
    // Process each day's forecast (keep next 14 days)
    const now = new Date();
    const britishNow = new Date(now.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
    const maxDate = new Date(britishNow);
    maxDate.setDate(maxDate.getDate() + 14);
    
    for (const forecast of timeSeries) {
      const forecastDate = new Date(forecast.time);
      const britishForecastDate = new Date(forecastDate.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
      
      // Only process forecasts within the next 14 days
      if (britishForecastDate > maxDate) continue;
      
      // Normalize to midnight British time for consistent date matching
      const normalizedDate = new Date(britishForecastDate.getFullYear(), britishForecastDate.getMonth(), britishForecastDate.getDate());
      
      try {
        // Upsert weather cache entry
        await prisma.weatherCache.upsert({
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
        
        updatedCount++;
      } catch (error) {
        console.error(`Failed to update weather for ${normalizedDate.toISOString().split('T')[0]}:`, error);
      }
    }

    // Clean up old weather data (older than 1 day) - using British time
    const cutoffDate = new Date(britishNow);
    cutoffDate.setDate(cutoffDate.getDate() - 1);
    
    const deletedCount = await prisma.weatherCache.deleteMany({
      where: {
        date: {
          lt: cutoffDate
        }
      }
    });

    console.log(`✅ Weather cache updated: ${updatedCount} forecasts, ${deletedCount.count} old records cleaned`);
    
    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} weather forecasts, cleaned ${deletedCount.count} old records`,
      updatedCount,
      deletedCount: deletedCount.count
    });

  } catch (error) {
    console.error('❌ Weather cache update failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update weather cache',
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