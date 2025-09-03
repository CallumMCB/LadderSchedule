import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MET_OFFICE_API_KEY = process.env.MET_OFFICE_API_KEY;

function toGB(utc: Date) {
  return new Date(utc.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
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

// Shared coords
const latitude = 52.2928;
const longitude = -1.5317;

async function fetchJSON(url: string) {
  if (!MET_OFFICE_API_KEY) throw new Error('Met Office API key not configured');
  const res = await fetch(url, {
    headers: { accept: 'application/json', apikey: MET_OFFICE_API_KEY }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function fetchHourly() {
  return fetchJSON(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`
  );
}

async function fetchThreeHourly() {
  return fetchJSON(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/three-hourly?latitude=${latitude}&longitude=${longitude}&includeLocationName=true`
  );
}

/**
 * HYBRID updater:
 * - Writes hourly data for 0–48 hours (06:00–22:00)
 * - Writes 3-hourly data for >48h to 7 days (06:00–21:00, on 3-hour steps)
 * - Cleans old data (older than 06:00 two days ago)
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

    console.log('🌤️ Starting HYBRID weather cache update (hourly 0–48h, three-hourly 48h–7d)...');

    const [hourly, threeHourly] = await Promise.all([fetchHourly(), fetchThreeHourly()]);
    const hourlyTS = hourly?.features?.[0]?.properties?.timeSeries || [];
    const threeTS = threeHourly?.features?.[0]?.properties?.timeSeries || [];

    const now = new Date();
    const gbNow = toGB(now);
    const horizon48 = new Date(gbNow.getTime() + 48 * 60 * 60 * 1000);
    const horizon7d = new Date(gbNow.getTime() + 7 * 24 * 60 * 60 * 1000);

    let updatedHourly = 0;
    let updatedThree = 0;

    // Process 0–48h (hourly)
    for (const f of hourlyTS) {
      const gb = toGB(new Date(f.time));
      if (gb < gbNow || gb > horizon48) continue;
      const h = gb.getHours();
      if (h < 6 || h > 22) continue;

      try {
        await prisma.hourlyWeatherCache.upsert({
          where: { datetime: gb },
          update: {
            temperature: f.screenTemperature,
            feelsLikeTemperature: f.feelsLikeTemperature,
            weatherType: getWeatherDescription(f.significantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(f.probOfPrecipitation || 0),
            precipitationRate: f.precipitationRate || 0,
            windSpeed: f.windSpeed10m,
            windDirection: Math.round(f.windDirectionFrom10m || 0),
            windGust: f.windGustSpeed10m,
            uvIndex: Math.round(f.uvIndex || 0),
            visibility: Math.round(f.visibility || 0),
            humidity: f.screenRelativeHumidity,
            pressure: f.mslp,
            dewPoint: f.screenDewPointTemperature,
            updatedAt: new Date()
          },
          create: {
            datetime: gb,
            temperature: f.screenTemperature,
            feelsLikeTemperature: f.feelsLikeTemperature,
            weatherType: getWeatherDescription(f.significantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(f.probOfPrecipitation || 0),
            precipitationRate: f.precipitationRate || 0,
            windSpeed: f.windSpeed10m,
            windDirection: Math.round(f.windDirectionFrom10m || 0),
            windGust: f.windGustSpeed10m,
            uvIndex: Math.round(f.uvIndex || 0),
            visibility: Math.round(f.visibility || 0),
            humidity: f.screenRelativeHumidity,
            pressure: f.mslp,
            dewPoint: f.screenDewPointTemperature
          }
        });
        updatedHourly++;
      } catch (e) {
        console.error(`Upsert hourly failed for ${gb.toISOString()}`, e);
      }
    }

    // Process >48h–7d (3-hourly)
    for (const f of threeTS) {
      const gb = toGB(new Date(f.time));
      if (gb <= horizon48 || gb > horizon7d) continue;
      const h = gb.getHours();
      if (h < 6 || h > 21) continue;
      if (h % 3 !== 0) continue;

      try {
        await prisma.hourlyWeatherCache.upsert({
          where: { datetime: gb },
          update: {
            temperature: f.screenTemperature,
            feelsLikeTemperature: f.feelsLikeTemperature,
            weatherType: getWeatherDescription(f.significantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(f.probOfPrecipitation || 0),
            precipitationRate: f.precipitationRate || 0,
            windSpeed: f.windSpeed10m,
            windDirection: Math.round(f.windDirectionFrom10m || 0),
            windGust: f.windGustSpeed10m,
            uvIndex: Math.round(f.uvIndex || 0),
            visibility: Math.round(f.visibility || 0),
            humidity: f.screenRelativeHumidity,
            pressure: f.mslp,
            dewPoint: f.screenDewPointTemperature,
            updatedAt: new Date()
          },
          create: {
            datetime: gb,
            temperature: f.screenTemperature,
            feelsLikeTemperature: f.feelsLikeTemperature,
            weatherType: getWeatherDescription(f.significantWeatherCode?.toString() || '1'),
            precipitationProbability: Math.round(f.probOfPrecipitation || 0),
            precipitationRate: f.precipitationRate || 0,
            windSpeed: f.windSpeed10m,
            windDirection: Math.round(f.windDirectionFrom10m || 0),
            windGust: f.windGustSpeed10m,
            uvIndex: Math.round(f.uvIndex || 0),
            visibility: Math.round(f.visibility || 0),
            humidity: f.screenRelativeHumidity,
            pressure: f.mslp,
            dewPoint: f.screenDewPointTemperature
          }
        });
        updatedThree++;
      } catch (e) {
        console.error(`Upsert three-hourly failed for ${gb.toISOString()}`, e);
      }
    }

    // Cleanup: older than 06:00 two days ago
    const cutoff = new Date(gbNow.getFullYear(), gbNow.getMonth(), gbNow.getDate() - 2, 6, 0, 0, 0);
    const deletedCount = await prisma.hourlyWeatherCache.deleteMany({
      where: { datetime: { lt: cutoff } }
    });

    console.log(`✅ HYBRID update done. Hourly: ${updatedHourly} | 3-hourly: ${updatedThree} | Cleaned: ${deletedCount.count}`);
    return NextResponse.json({
      success: true,
      message: `Hybrid update complete: hourly ${updatedHourly}, three-hourly ${updatedThree}, cleaned ${deletedCount.count}`,
      updatedHourly,
      updatedThree,
      deletedCount: deletedCount.count
    });
  } catch (error) {
    console.error('❌ HYBRID weather cache update failed:', error);
    return NextResponse.json(
      { error: 'Failed to update hybrid weather cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Allow GET requests for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}
