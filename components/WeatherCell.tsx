'use client';

import { useState, useEffect } from 'react';
import { getWeatherEmoji, getWindDirectionEmoji } from "@/lib/weather";

interface WeatherCellProps {
  slotKey: string;
  className?: string;
}

export function WeatherCell({ slotKey, className = "" }: WeatherCellProps) {
  const [weatherInfo, setWeatherInfo] = useState<{
    emoji: string;
    temperature: string;
    wind: string;
  } | null>(null);

  useEffect(() => {
    // Only fetch for future times
    const isPastTime = new Date(slotKey) < new Date();
    if (isPastTime) return;

    // Extract date info from slotKey for API call
    const slotDate = new Date(slotKey);
    const weekStart = new Date(slotDate);
    weekStart.setDate(weekStart.getDate() - slotDate.getDay() + (slotDate.getDay() === 0 ? -6 : 1)); // Monday of current week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const fetchWeather = async () => {
      try {
        const response = await fetch(`/api/weather/hourly?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`);
        if (response.ok) {
          const data = await response.json();
          const matchingWeather = data.weather?.find((w: any) => {
            const datetime = new Date(w.datetime);
            return datetime.toISOString() === slotKey;
          });
          
          if (matchingWeather) {
            setWeatherInfo({
              emoji: getWeatherEmoji(matchingWeather.weatherType),
              temperature: `${Math.round(matchingWeather.temperature)}°`,
              wind: `${getWindDirectionEmoji(matchingWeather.windDirection)}${Math.round(matchingWeather.windSpeed || 0)}`
            });
          }
        }
      } catch (error) {
        console.error('Failed to load weather for cell:', error);
      }
    };

    fetchWeather();
  }, [slotKey]);

  if (!weatherInfo) return null;

  return (
    <div className={`absolute top-0 right-0 p-1 pointer-events-none z-10 ${className}`}>
      <div className="text-xs bg-white bg-opacity-90 rounded-sm px-1 py-0.5 shadow-sm flex items-center gap-1">
        <span>{weatherInfo.emoji}</span>
        <span className="font-medium">{weatherInfo.temperature}</span>
        <span className="text-gray-600">{weatherInfo.wind}</span>
      </div>
    </div>
  );
}