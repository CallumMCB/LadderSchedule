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

async function fetchMetOfficeHourlyWeather() {
  if (!MET_OFFICE_API_KEY) {
    throw new Error('Met Office API key not configured');
  }

  // Leamington Spa coordinates
  const latitude = 52.2928;
  const longitude = -1.5317;

  const response = await fetch(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`,
    {
      headers: {
        accept: 'application/json',
        apikey: MET_OFFICE_API_KEY
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

/**
 * Hourly updater (integrated policy):
 * - Only stores forecasts within the next 48 hours (hourly resolution)
 * - Tennis hours filter: 06:00–22:00 local
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

    console.log('🌤️ Starting hourly (0–48h) weather cache update...');
    
    const weatherData = await fetchMetOfficeHourlyWeather();
    if (!weatherData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid hourly weather data format');
    }

    const now = new Date();
    const britishNow = convertToBritishTime(now);
    const horizon48h = new Date(britishNow.getTime() + 48 * 60 * 60 * 1000);

    let updatedCount = 0;

    for (const forecast of weatherData.features[0].properties.timeSeries) {
      const forecastDateTime = new Date(forecast.time);
      const britishDateTime = convertToBritishTime(forecastDateTime);

      // Only keep 0–48h horizon
      if (britishDateTime < britishNow || britishDateTime > horizon48h) continue;

      // Tennis hours 06:00–22:00
      const h = britishDateTime.getHours();
      if (h < 6 || h > 22) continue;

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
        console.error(`Failed to upsert hourly weather for ${britishDateTime.toISOString()}:`, error);
      }
    }

    // Clean up anything before 06:00 today (local)
    const todayStart = new Date(britishNow.getFullYear(), britishNow.getMonth(), britishNow.getDate(), 6, 0, 0, 0);
    const deletedCount = await prisma.hourlyWeatherCache.deleteMany({
      where: {
        datetime: { lt: todayStart }
      }
    });

    console.log(`✅ Hourly cache updated: ${updatedCount} rows, cleaned ${deletedCount.count} old rows`);
    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} hourly forecasts (0–48h), cleaned ${deletedCount.count} old records`,
      updatedCount,
      deletedCount: deletedCount.count
    });

  } catch (error) {
    console.error('❌ Hourly weather cache update failed:', error);
    return NextResponse.json(
      { error: 'Failed to update hourly weather cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Allow GET requests for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}
