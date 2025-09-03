import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (!start || !end) {
      return NextResponse.json({ error: 'Start and end dates are required' }, { status: 400 });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Get weather data (now includes both hourly and three-hourly in one table)
    const weather = await prisma.hourlyWeatherCache.findMany({
      where: {
        datetime: {
          gte: startDate,
          lt: endDate
        }
      },
      orderBy: {
        datetime: 'asc'
      }
    });
    
    return NextResponse.json({
      success: true,
      weather: weather.map(w => ({
        datetime: w.datetime.toISOString(),
        temperature: w.temperature,
        feelsLikeTemperature: w.feelsLikeTemperature,
        weatherType: w.weatherType,
        precipitationProbability: w.precipitationProbability,
        precipitationRate: w.precipitationRate,
        windSpeed: w.windSpeed,
        windDirection: w.windDirection,
        windGust: w.windGust,
        uvIndex: w.uvIndex,
        visibility: w.visibility,
        humidity: w.humidity,
        pressure: w.pressure,
        dewPoint: w.dewPoint,
        source: 'hybrid'
      }))
    });
    
  } catch (error) {
    console.error('Failed to fetch hourly weather:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}