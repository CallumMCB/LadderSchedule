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

  const response = await fetch(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/hourly?latitude=52.2928&longitude=-1.5317&includeLocationName=true`,
    {
      headers: {
        'accept': 'application/json',
        'apikey': MET_OFFICE_API_KEY
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Met Office Hourly API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchMetOfficeDailyWeather() {
  if (!MET_OFFICE_API_KEY) {
    throw new Error('Met Office API key not configured');
  }

  const response = await fetch(
    `https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily?latitude=52.2928&longitude=-1.5317&includeLocationName=true`,
    {
      headers: {
        'accept': 'application/json',
        'apikey': MET_OFFICE_API_KEY
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Met Office Daily API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Hybrid initial population using both hourly and daily data
 * - Use hourly data for first 2-3 days (detailed forecasts)
 * - Use daily data to fill remaining days up to 14 days total
 * - Generate hourly data points from daily data for consistent structure
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET || 'development-secret';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🌤️ Starting hybrid initial weather population (hourly + daily)...');
    
    // Step 1: Clear ALL existing hourly weather data
    const clearCount = await prisma.hourlyWeatherCache.deleteMany({});
    console.log(`🧹 Cleared ${clearCount.count} existing hourly weather records`);
    
    // Step 2: Fetch both hourly and daily weather data
    const [hourlyData, dailyData] = await Promise.all([
      fetchMetOfficeHourlyWeather(),
      fetchMetOfficeDailyWeather()
    ]);
    
    if (!hourlyData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid hourly weather data format');
    }
    
    if (!dailyData?.features?.[0]?.properties?.timeSeries) {
      throw new Error('Invalid daily weather data format');
    }

    const hourlyTimeSeries = hourlyData.features[0].properties.timeSeries;
    const dailyTimeSeries = dailyData.features[0].properties.timeSeries;
    
    console.log(`📊 Hourly API: ${hourlyTimeSeries.length} forecasts`);
    console.log(`📊 Daily API: ${dailyTimeSeries.length} forecasts`);
    
    let populatedCount = 0;
    const now = new Date();
    const britishNow = convertToBritishTime(now);
    const todayStart = new Date(britishNow.getFullYear(), britishNow.getMonth(), britishNow.getDate());
    
    // Step 3: Process hourly data first (most accurate for immediate forecasts)
    const processedDates = new Set<string>();
    
    for (const forecast of hourlyTimeSeries) {
      const forecastDateTime = new Date(forecast.time);
      const britishDateTime = convertToBritishTime(forecastDateTime);
      
      // Only tennis playing hours (6am to 10pm)
      const hourOfDay = britishDateTime.getHours();
      if (hourOfDay < 6 || hourOfDay > 22) continue;
      
      // Process from 6am today onwards
      const todaySixAM = new Date(todayStart);
      todaySixAM.setHours(6, 0, 0, 0);
      if (britishDateTime < todaySixAM) continue;
      
      const dateKey = britishDateTime.toISOString().split('T')[0];
      processedDates.add(dateKey);
      
      try {
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
      } catch (error) {
        console.error(`Failed to populate hourly weather:`, error);
      }
    }
    
    console.log(`✅ Populated ${populatedCount} hourly forecasts from detailed API`);
    
    // Step 4: Fill remaining days with generated hourly data from daily forecasts
    let generatedCount = 0;
    
    for (const dailyForecast of dailyTimeSeries) {
      const forecastDate = new Date(dailyForecast.time);
      const britishForecastDate = convertToBritishTime(forecastDate);
      const dateKey = britishForecastDate.toISOString().split('T')[0];
      
      // Skip if we already have hourly data for this day
      if (processedDates.has(dateKey)) continue;
      
      // Only process next 14 days from today
      const daysFromToday = Math.floor((britishForecastDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
      if (daysFromToday < 0 || daysFromToday >= 14) continue;
      
      // Generate hourly data points for tennis hours (6am-10pm)
      for (let hour = 6; hour <= 22; hour++) {
        const hourlyDateTime = new Date(britishForecastDate);
        hourlyDateTime.setHours(hour, 0, 0, 0);
        
        try {
          await prisma.hourlyWeatherCache.create({
            data: {
              datetime: hourlyDateTime,
              temperature: dailyForecast.dayMaxScreenTemperature || 20,
              feelsLikeTemperature: dailyForecast.dayMaxScreenTemperature || 20, // Estimate
              weatherType: getWeatherDescription(dailyForecast.nightSignificantWeatherCode?.toString() || '1'),
              precipitationProbability: Math.round(dailyForecast.nightProbabilityOfPrecipitation || 0),
              precipitationRate: 0, // Not available in daily data
              windSpeed: dailyForecast.midday10MWindSpeed || 0,
              windDirection: Math.round(dailyForecast.midday10MWindDirection || 0),
              windGust: dailyForecast.midday10MWindSpeed ? dailyForecast.midday10MWindSpeed * 1.3 : 0, // Estimate
              uvIndex: 0, // Not available in this daily API version
              visibility: dailyForecast.middayVisibility ? Math.round(dailyForecast.middayVisibility) : 10000,
              humidity: dailyForecast.middayRelativeHumidity || 50,
              pressure: 101325, // Standard atmospheric pressure (not available in daily)
              dewPoint: (dailyForecast.dayMaxScreenTemperature || 20) - 5 // Rough estimate
            }
          });
          generatedCount++;
        } catch (error) {
          console.error(`Failed to generate hourly data:`, error);
        }
      }
      
      processedDates.add(dateKey);
    }
    
    console.log(`✅ Generated ${generatedCount} hourly forecasts from daily data`);
    
    const totalHours = populatedCount + generatedCount;
    const totalDays = processedDates.size;
    
    console.log(`✅ Complete population: ${totalHours} hours across ${totalDays} days`);
    
    return NextResponse.json({
      success: true,
      message: `Hybrid population complete: cleared ${clearCount.count} old records, populated ${totalHours} hourly forecasts across ${totalDays} days`,
      clearedCount: clearCount.count,
      hourlyForecasts: populatedCount,
      generatedForecasts: generatedCount,
      totalHours: totalHours,
      daysPopulated: totalDays,
      hoursPerDay: '6am-10pm (17 hours)',
      approach: 'Hybrid (detailed hourly + generated from daily)'
    });

  } catch (error) {
    console.error('❌ Hybrid weather population failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to populate hybrid weather cache',
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