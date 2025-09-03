import { prisma } from './prisma';

export interface WeatherData {
  id: string;
  datetime: Date;
  temperature: number;
  feelsLikeTemperature?: number | null;
  weatherType: string;
  precipitationProbability?: number | null;
  precipitationRate?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  windGust?: number | null;
  uvIndex?: number | null;
  visibility?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  dewPoint?: number | null;
  updatedAt: Date;
}

/**
 * Get weather emoji based on weather type
 */
export function getWeatherEmoji(weatherType: string): string {
  const weather = weatherType.toLowerCase();
  
  if (weather.includes('clear') || weather.includes('sunny')) return '☀️';
  if (weather.includes('partly cloudy')) return '⛅';
  if (weather.includes('cloudy') || weather.includes('overcast')) return '☁️';
  if (weather.includes('mist') || weather.includes('fog')) return '🌫️';
  if (weather.includes('drizzle') || weather.includes('light rain')) return '🌦️';
  if (weather.includes('heavy rain') || weather.includes('rain')) return '🌧️';
  if (weather.includes('thunder')) return '⛈️';
  if (weather.includes('snow')) return '❄️';
  if (weather.includes('sleet') || weather.includes('hail')) return '🌨️';
  
  return '🌤️';
}

/**
 * Get wind direction emoji based on degrees
 */
export function getWindDirectionEmoji(degrees?: number | null): string {
  if (degrees === null || degrees === undefined) return '💨';
  
  if (degrees >= 337.5 || degrees < 22.5) return '⬆️'; // N
  if (degrees >= 22.5 && degrees < 67.5) return '↗️'; // NE
  if (degrees >= 67.5 && degrees < 112.5) return '➡️'; // E
  if (degrees >= 112.5 && degrees < 157.5) return '↘️'; // SE
  if (degrees >= 157.5 && degrees < 202.5) return '⬇️'; // S
  if (degrees >= 202.5 && degrees < 247.5) return '↙️'; // SW
  if (degrees >= 247.5 && degrees < 292.5) return '⬅️'; // W
  if (degrees >= 292.5 && degrees < 337.5) return '↖️'; // NW
  
  return '💨';
}

/**
 * Get weather summary for a specific datetime
 */
export async function getWeatherSummary(datetime: Date): Promise<{
  emoji: string;
  temperature: string;
  wind: string;
} | null> {
  try {
    const weather = await prisma.hourlyWeatherCache.findUnique({
      where: { datetime }
    });
    
    if (!weather) return null;
    
    return {
      emoji: getWeatherEmoji(weather.weatherType),
      temperature: `${Math.round(weather.temperature)}°`,
      wind: `${getWindDirectionEmoji(weather.windDirection)}${Math.round(weather.windSpeed || 0)}`
    };
  } catch (error) {
    console.error('Failed to get weather summary:', error);
    return null;
  }
}

/**
 * Get detailed weather forecast for a match
 */
export async function getMatchWeatherForecast(startTime: Date, endTime: Date): Promise<{
  summary: string;
  details: WeatherData[];
  recommendation: string;
} | null> {
  try {
    const weather = await prisma.hourlyWeatherCache.findMany({
      where: {
        datetime: {
          gte: startTime,
          lte: endTime
        }
      },
      orderBy: { datetime: 'asc' }
    });
    
    if (weather.length === 0) return null;
    
    const avgTemp = Math.round(weather.reduce((sum, w) => sum + w.temperature, 0) / weather.length);
    const maxPrecip = Math.max(...weather.map(w => w.precipitationProbability || 0));
    const avgWindSpeed = Math.round(weather.reduce((sum, w) => sum + (w.windSpeed || 0), 0) / weather.length);
    
    const mainWeather = weather[0];
    const emoji = getWeatherEmoji(mainWeather.weatherType);
    const summary = `${emoji} ${mainWeather.weatherType}, ${avgTemp}°C`;
    
    let recommendation = '';
    if (maxPrecip > 70) {
      recommendation = '⚠️ High chance of rain - consider rescheduling or indoor courts';
    } else if (maxPrecip > 40) {
      recommendation = '🌂 Possible rain - bring waterproofs and check conditions';
    } else if (avgWindSpeed > 15) {
      recommendation = '💨 Windy conditions - expect challenging ball flight';
    } else if (avgTemp < 5) {
      recommendation = '🥶 Cold conditions - dress warmly and allow extra warm-up time';
    } else if (avgTemp > 28) {
      recommendation = '🌡️ Hot conditions - stay hydrated and take breaks';
    } else {
      recommendation = '✅ Good conditions for tennis';
    }
    
    return { summary, details: weather, recommendation };
    
  } catch (error) {
    console.error('Failed to get match weather forecast:', error);
    return null;
  }
}
