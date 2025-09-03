import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

function convertToBritishTime(utcDate: Date): Date {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(utcDate);
  const britishDateTime = new Date(
    parseInt(parts.find(p => p.type === 'year')!.value),
    parseInt(parts.find(p => p.type === 'month')!.value) - 1,
    parseInt(parts.find(p => p.type === 'day')!.value),
    parseInt(parts.find(p => p.type === 'hour')!.value),
    parseInt(parts.find(p => p.type === 'minute')!.value),
    parseInt(parts.find(p => p.type === 'second')!.value)
  );
  
  return britishDateTime;
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
    '27': 'Thunderstorm',
    '28': 'Heavy rain and thunder',
    '29': 'Light snow and thunder',
    '30': 'Thunderstorm'
  };
  
  return codes[weatherCode] || 'Variable conditions';
}

async function fetchMetOfficeThreeHourlyWeather() {
  if (!MET_OFFICE_API_KEY) {
    throw new Error('Met Office API key not configured');
  }

  // Leamington Spa coordinates
  const latitude = 52.2928;
  const longitude = -1.5317;

  const response = await fetch(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/three-hourly?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`,
    {
      headers: {
        accept: 'application/json',
        apikey: MET_OFFICE_API_KEY
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Met Office three-hourly API error response:', errorText);
    throw new Error(`Met Office three-hourly API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Three-hourly updater (integrated policy):
 * - Stores >48h up to 7 days ahead
 * - Keeps only 3-hourly slots within tennis hours (06:00–21:00 local) and aligned to 0,3,6,...,21
 */
export async function POST(request: NextRequest) {
  try {
    // Authorization
    const authHeader = request.headers.get('authorization');
    const vercelCronHeader = request.headers.get('vercel-cron');
    const expectedToken = process.env.CRON_SECRET || 'development-secret';
    const isAuthorized = vercelCronHeader === '1' || authHeader === `Bearer ${expectedToken}`;
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🌤️ Starting three-hourly (48h–7d) weather cache update...');
    
    const weatherData = await fetchMetOfficeThreeHourlyWeather();
    if (!weatherData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid three-hourly weather data format');
    }

    const now = new Date();
    const britishNow = convertToBritishTime(now);
    const after48h = new Date(britishNow.getTime() + 48 * 60 * 60 * 1000);
    const until7d = new Date(britishNow.getTime() + 7 * 24 * 60 * 60 * 1000);

    let updatedCount = 0;

    for (const forecast of weatherData.features[0].properties.timeSeries) {
      const forecastDateTime = new Date(forecast.time);
      const britishDateTime = convertToBritishTime(forecastDateTime);

      // Only >48h and ≤7d
      if (britishDateTime <= after48h || britishDateTime > until7d) continue;

      // Tennis hours & 3-hour alignment
      const h = britishDateTime.getHours();
      if (h < 6 || h > 21) continue;
      if (h % 3 !== 0) continue;

      try {
        await prisma.hourlyWeatherCache.upsert({
          where: { datetime: britishDateTime },
          update: {
            temperature: forecast.screenTemperature,
            feelsLikeTemperature: forecast.feelsLikeTemperature,
            weatherType: getWeatherDescription(forecast.significantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(forecast.probOfPrecipitation || 0),
            precipitationRate: forecast.precipitationRate || 0,
            windSpeed: forecast.windSpeed10m,
            windDirection: Math.round(forecast.windDirectionFrom10m || 0),
            windGust: forecast.windGustSpeed10m,
            uvIndex: Math.round(forecast.uvIndex || 0),
            visibility: Math.round(forecast.visibility || 0),
            humidity: forecast.screenRelativeHumidity,
            pressure: forecast.mslp,
            dewPoint: forecast.screenDewPointTemperature,
            updatedAt: new Date()
          },
          create: {
            datetime: britishDateTime,
            temperature: forecast.screenTemperature,
            feelsLikeTemperature: forecast.feelsLikeTemperature,
            weatherType: getWeatherDescription(forecast.significantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(forecast.probOfPrecipitation || 0),
            precipitationRate: forecast.precipitationRate || 0,
            windSpeed: forecast.windSpeed10m,
            windDirection: Math.round(forecast.windDirectionFrom10m || 0),
            windGust: forecast.windGustSpeed10m,
            uvIndex: Math.round(forecast.uvIndex || 0),
            visibility: Math.round(forecast.visibility || 0),
            humidity: forecast.screenRelativeHumidity,
            pressure: forecast.mslp,
            dewPoint: forecast.screenDewPointTemperature
          }
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to upsert three-hourly weather for ${britishDateTime.toISOString()}:`, error);
      }
    }

    // Clean up records older than 2 days (prior to 06:00 two days ago)
    const twoDaysAgo = new Date(britishNow.getFullYear(), britishNow.getMonth(), britishNow.getDate() - 2, 6, 0, 0, 0);
    const deletedCount = await prisma.hourlyWeatherCache.deleteMany({
      where: { datetime: { lt: twoDaysAgo } }
    });

    console.log(`✅ Three-hourly cache updated: ${updatedCount} rows, cleaned ${deletedCount.count} old rows`);
    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} three-hourly forecasts (48h–7d), cleaned ${deletedCount.count} old records`,
      updatedCount,
      deletedCount: deletedCount.count
    });

  } catch (error) {
    console.error('❌ Three-hourly weather cache update failed:', error);
    return NextResponse.json(
      { error: 'Failed to update three-hourly weather cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Allow GET requests for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}
