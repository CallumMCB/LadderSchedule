import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

function convertToBritishTime(utcDate: Date): Date {
  // Get the date components in British timezone
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
    parseInt(parts.find(p => p.type === 'month')!.value) - 1, // Month is 0-indexed
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
        'accept': 'application/json',
        'apikey': MET_OFFICE_API_KEY
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
 * Three-hourly weather update endpoint for extended 7-day coverage
 * Covers days 3-7 with 3-hourly intervals (after hourly data ends)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const vercelCronHeader = request.headers.get('vercel-cron');
    const expectedToken = process.env.CRON_SECRET || 'development-secret';
    
    const isAuthorized = vercelCronHeader === '1' || authHeader === `Bearer ${expectedToken}`;
    
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🌤️ Starting three-hourly weather cache update...');
    
    // Fetch weather data from Met Office
    const weatherData = await fetchMetOfficeThreeHourlyWeather();
    
    console.log('Three-hourly Weather API - Raw response keys:', Object.keys(weatherData));
    
    if (!weatherData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid three-hourly weather data format');
    }

    const timeSeries = weatherData.features[0].properties.timeSeries;
    let updatedCount = 0;
    
    // Get current British time
    const now = new Date();
    const britishNow = convertToBritishTime(now);
    const todayStart = new Date(britishNow.getFullYear(), britishNow.getMonth(), britishNow.getDate());
    
    // Only process forecasts after 48 hours (when hourly data ends) up to 7 days
    const hourlyEndTime = new Date(todayStart);
    hourlyEndTime.setHours(todayStart.getHours() + 48);
    
    const maxForecastTime = new Date(todayStart);
    maxForecastTime.setDate(maxForecastTime.getDate() + 7);
    
    // Process three-hourly forecasts
    for (const forecast of timeSeries) {
      const forecastDateTime = new Date(forecast.time);
      const britishDateTime = convertToBritishTime(forecastDateTime);
      
      // Only process data after hourly coverage ends (48 hours) and within 7 days
      if (britishDateTime <= hourlyEndTime || britishDateTime > maxForecastTime) {
        continue;
      }
      
      // Only process tennis playing hours (6am to 10pm) and three-hourly slots (0, 3, 6, 9, 12, 15, 18, 21)
      const hourOfDay = britishDateTime.getHours();
      if (hourOfDay < 6 || hourOfDay > 21 || hourOfDay % 3 !== 0) {
        continue;
      }
      
      try {
        // Upsert three-hourly weather cache entry into hourly table (for now)
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
        console.error(`Failed to update three-hourly weather for ${britishDateTime.toISOString()}:`, error);
      }
    }

    // Clean up old three-hourly weather data (older than 2 days)
    const cleanupCutoff = new Date(todayStart);
    cleanupCutoff.setDate(cleanupCutoff.getDate() - 2);
    cleanupCutoff.setHours(6, 0, 0, 0);
    
    const deletedCount = await prisma.hourlyWeatherCache.deleteMany({
      where: {
        datetime: {
          lt: cleanupCutoff
        }
      }
    });

    console.log(`✅ Three-hourly weather cache updated: ${updatedCount} forecasts, ${deletedCount.count} old records cleaned`);
    
    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} three-hourly weather forecasts (days 3-7), cleaned ${deletedCount.count} old records`,
      updatedCount,
      deletedCount: deletedCount.count,
      coverage: '7 days (3-hourly after 48 hours)'
    });

  } catch (error) {
    console.error('❌ Three-hourly weather cache update failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update three-hourly weather cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Allow GET requests for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}