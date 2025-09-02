import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
        weatherType: w.weatherType,
        windSpeed: w.windSpeed,
        windDirection: w.windDirection
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