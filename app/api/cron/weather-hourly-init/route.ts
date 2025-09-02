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

/**
 * Initial population endpoint for hourly weather cache
 * - Clears ALL existing hourly weather data
 * - Populates complete 14-day hourly forecast (6am-10pm only)
 * - One-time setup for the hourly weather system
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET || 'development-secret';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🌤️ Starting initial hourly weather population...');
    
    // Step 1: Clear ALL existing hourly weather data
    const clearCount = await prisma.hourlyWeatherCache.deleteMany({});
    console.log(`🧹 Cleared ${clearCount.count} existing hourly weather records`);
    
    // Step 2: Fetch fresh weather data from Met Office
    const weatherData = await fetchMetOfficeHourlyWeather();
    
    if (!weatherData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid hourly weather data format');
    }

    const timeSeries = weatherData.features[0].properties.timeSeries;
    let populatedCount = 0;
    
    // Get current British time
    const now = new Date();
    const britishNow = new Date(now.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
    const todayStart = new Date(britishNow.getFullYear(), britishNow.getMonth(), britishNow.getDate());
    
    // Set cutoff to 14 days from today
    const maxDate = new Date(todayStart);
    maxDate.setDate(maxDate.getDate() + 14);
    
    console.log(`📅 Populating hourly weather from ${britishNow.toISOString()} to ${maxDate.toISOString()}`);
    console.log(`🔢 API provided ${timeSeries.length} total hourly forecasts`);
    
    // Log the date range of available data
    if (timeSeries.length > 0) {
      const firstForecast = new Date(timeSeries[0].time);
      const lastForecast = new Date(timeSeries[timeSeries.length - 1].time);
      console.log(`📊 API data range: ${firstForecast.toISOString()} to ${lastForecast.toISOString()}`);
    }
    
    // Process all available hourly forecasts
    for (const forecast of timeSeries) {
      const forecastDateTime = new Date(forecast.time);
      const britishDateTime = new Date(forecastDateTime.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
      
      // Only process tennis playing hours (6am to 10pm) 
      const hourOfDay = britishDateTime.getHours();
      if (hourOfDay < 6 || hourOfDay > 22) continue;
      
      // Process from 6am today onwards (include ALL remaining tennis hours for today)
      const todaySixAM = new Date(todayStart);
      todaySixAM.setHours(6, 0, 0, 0);
      if (britishDateTime < todaySixAM) continue;
      
      // Don't process beyond 14 days
      if (britishDateTime >= maxDate) continue;
      
      try {
        // Insert hourly weather cache entry
        await prisma.hourlyWeatherCache.create({
          data: {
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
        
        populatedCount++;
        
        // Log every 24 hours (for visibility)
        if (populatedCount % 17 === 0) { // Roughly 17 hours per day (6am-10pm)
          const dayCount = Math.floor(populatedCount / 17) + 1;
          console.log(`📈 Populated day ${dayCount} (${populatedCount} hours total)`);
        }
        
      } catch (error) {
        console.error(`Failed to populate hourly weather for ${britishDateTime.toISOString()}:`, error);
      }
    }

    const daysPopulated = Math.ceil(populatedCount / 17); // Roughly 17 hours per day
    
    console.log(`✅ Initial hourly weather population complete: ${populatedCount} hours across ${daysPopulated} days`);
    
    return NextResponse.json({
      success: true,
      message: `Initial population complete: cleared ${clearCount.count} old records, populated ${populatedCount} hourly forecasts across ${daysPopulated} days`,
      clearedCount: clearCount.count,
      populatedCount,
      daysPopulated,
      hoursPerDay: '6am-10pm (17 hours)',
      period: `${britishNow.toDateString()} to ${maxDate.toDateString()}`
    });

  } catch (error) {
    console.error('❌ Initial hourly weather population failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to populate initial hourly weather cache',
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