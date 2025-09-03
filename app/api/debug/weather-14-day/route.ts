import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get current weather data and show how far ahead we have forecasts
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get all weather data from today onwards
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
        has_14_day_coverage: daysAhead >= 13,
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
      recommendation: daysAhead < 13 ? 
        'Weather data only covers ' + (daysAhead + 1) + ' days. Run full 14-day update.' : 
        '✅ Full 14-day coverage available'
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
      console.log('⚠️ Daily weather API failed, continuing with hourly only');
    }
    
    // Then call the weather-hourly endpoint with type=all for detailed hourly data
    console.log('🌤️ Calling hourly weather API...');
    const updateResponse = await fetch(`${baseUrl}/api/cron/weather-hourly?type=all`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'development-secret'}`,
        'Content-Type': 'application/json'
      }
    });
    
    const updateResult = await updateResponse.json();
    
    if (!updateResponse.ok) {
      throw new Error(`Update failed: ${updateResult.error}`);
    }
    
    // Check the results
    const checkResponse = await fetch(`${baseUrl}/api/debug/weather-14-day`, {
      method: 'GET'
    });
    
    const checkResult = await checkResponse.json();
    
    return NextResponse.json({
      daily_result: dailyResult,
      hourly_result: updateResult,
      current_status: checkResult,
      success: true,
      message: '14-day weather update completed (daily + hourly APIs)'
    });
    
  } catch (error) {
    console.error('Manual weather update error:', error);
    return NextResponse.json(
      { error: 'Failed to update weather', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}