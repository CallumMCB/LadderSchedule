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
    
    const weather = await prisma.hourlyWeatherCache.findMany({
      where: {
        datetime: {
          gte: startDate,
          lt: endDate
        }
      },
      orderBy: { datetime: 'asc' }
    });

    // Optional cadence hint (1h vs 3h) from timestamp hour modulo 3
    const payload = weather.map(w => {
      const hour = w.datetime.getHours();
      const cadence = hour % 3 === 0 ? '3h' : '1h';
      return {
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
        cadence,
        source: 'hybrid'
      };
    });
    
    return NextResponse.json({ success: true, weather: payload });
    
  } catch (error) {
    console.error('Failed to fetch hourly weather:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
