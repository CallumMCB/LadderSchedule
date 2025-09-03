import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get current weather data and show how far ahead we have forecasts
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get all weather data from today onwards (combined hourly + three-hourly in one table)
    const weatherData = await prisma.hourlyWeatherCache.findMany({
      where: {
        datetime: {
          gte: todayStart
        }
      },
      orderBy: {
        datetime: 'asc'
      }
    });
    
    if (weatherData.length === 0) {
      return NextResponse.json({
        status: 'no_data',
        message: 'No weather data found',
        recommendation: 'Run the weather update cron job'
      });
    }
    
    // Calculate how many days ahead we have data
    const latestForecast = weatherData[weatherData.length - 1];
    const latestDate = new Date(latestForecast.datetime);
    const daysAhead = Math.floor((latestDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
    
    // Group by day
    const dataByDay: { [key: string]: number } = {};
    
    weatherData.forEach(entry => {
      const date = new Date(entry.datetime);
      const dayKey = date.toISOString().split('T')[0];
      dataByDay[dayKey] = (dataByDay[dayKey] || 0) + 1;
    });
    
    return NextResponse.json({
      status: 'success',
      summary: {
        total_forecasts: weatherData.length,
        days_ahead: daysAhead,
        latest_forecast_date: latestDate.toISOString(),
        has_7_day_coverage: daysAhead >= 6,
        data_by_day: dataByDay
      },
      first_forecast: {
        datetime: weatherData[0].datetime,
        temperature: weatherData[0].temperature,
        weather_type: weatherData[0].weatherType
      },
      last_forecast: {
        datetime: latestForecast.datetime,
        temperature: latestForecast.temperature,
        weather_type: latestForecast.weatherType
      },
      recommendation: daysAhead < 6 ? 
        'Weather data only covers ' + (daysAhead + 1) + ' days. Run full 7-day update.' : 
        '✅ Full 7-day coverage available (hourly + three-hourly)'
    });
    
  } catch (error) {
    console.error('Weather debug error:', error);
    return NextResponse.json(
      { error: 'Failed to check weather data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger full 14-day update
export async function POST(request: NextRequest) {
  try {
    console.log('🌤️ Manually triggering full 14-day weather update...');
    
    const baseUrl = request.nextUrl.origin;
    
    // First call the daily weather API for 14-day coverage
    console.log('🌤️ Calling daily weather API for 14-day forecast...');
    const dailyResponse = await fetch(`${baseUrl}/api/cron/weather`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'development-secret'}`,
        'Content-Type': 'application/json'
      }
    });
    
    let dailyResult = null;
    if (dailyResponse.ok) {
      dailyResult = await dailyResponse.json();
      console.log('✅ Daily weather API succeeded:', dailyResult.message);
    } else {
      const errorText = await dailyResponse.text();
      console.log('⚠️ Daily weather API failed:', dailyResponse.status, dailyResponse.statusText, errorText);
      dailyResult = { 
        error: `Daily API failed: ${dailyResponse.status} ${dailyResponse.statusText}`, 
        details: errorText 
      };
    }
    
    // Then call the weather-hourly endpoint with type=all for detailed hourly data (48 hours)
    console.log('🌤️ Calling hourly weather API for 48-hour coverage...');
    const hourlyResponse = await fetch(`${baseUrl}/api/cron/weather-hourly?type=all`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'development-secret'}`,
        'Content-Type': 'application/json'
      }
    });
    
    let hourlyResult = null;
    if (hourlyResponse.ok) {
      hourlyResult = await hourlyResponse.json();
      console.log('✅ Hourly weather API succeeded:', hourlyResult.message);
    } else {
      const errorText = await hourlyResponse.text();
      console.log('⚠️ Hourly weather API failed:', errorText);
      hourlyResult = { error: `Hourly API failed: ${hourlyResponse.status}` };
    }
    
    // Call the three-hourly endpoint for extended coverage (days 3-7)
    console.log('🌤️ Calling three-hourly weather API for extended coverage...');
    const threeHourlyResponse = await fetch(`${baseUrl}/api/cron/weather-three-hourly`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'development-secret'}`,
        'Content-Type': 'application/json'
      }
    });
    
    let threeHourlyResult = null;
    if (threeHourlyResponse.ok) {
      threeHourlyResult = await threeHourlyResponse.json();
      console.log('✅ Three-hourly weather API succeeded:', threeHourlyResult.message);
    } else {
      const errorText = await threeHourlyResponse.text();
      console.log('⚠️ Three-hourly weather API failed:', errorText);
      threeHourlyResult = { 
        error: `Three-hourly API failed: ${threeHourlyResponse.status}`,
        details: errorText,
        status: threeHourlyResponse.status
      };
    }
    
    // Check the combined results
    const checkResponse = await fetch(`${baseUrl}/api/debug/weather-14-day`, {
      method: 'GET'
    });
    
    const checkResult = await checkResponse.json();
    
    return NextResponse.json({
      daily_result: dailyResult,
      hourly_result: hourlyResult,
      three_hourly_result: threeHourlyResult,
      current_status: checkResult,
      success: true,
      message: '7-day weather update completed (daily + hourly + three-hourly APIs)'
    });
    
  } catch (error) {
    console.error('Manual weather update error:', error);
    return NextResponse.json(
      { error: 'Failed to update weather', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}