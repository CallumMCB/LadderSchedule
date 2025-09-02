'use client';

import { getWeatherEmoji, getWindDirectionEmoji } from "@/lib/weather";

interface WeatherDisplayProps {
  slotKey: string;
  weatherData: Map<string, {
    emoji: string;
    temperature: string;
    wind: string;
  }>;
  className?: string;
}

export function WeatherDisplay({ slotKey, weatherData, className = "" }: WeatherDisplayProps) {
  const weatherInfo = weatherData.get(slotKey);
  const isPastTime = new Date(slotKey) < new Date();
  
  if (!weatherInfo || isPastTime) return null;

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