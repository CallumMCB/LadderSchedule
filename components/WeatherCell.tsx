'use client';

import { useState, useEffect } from 'react';
import { getWeatherEmoji, getWindDirectionEmoji } from "@/lib/weather";

function getSunscreenRecommendation(uvIndex: number): { spf: string; warning: string; color: string } {
  if (uvIndex <= 2) {
    return { spf: "SPF 15", warning: "Low risk - minimal protection needed", color: "text-green-600" };
  } else if (uvIndex <= 5) {
    return { spf: "SPF 30", warning: "Moderate risk - protection recommended", color: "text-yellow-600" };
  } else if (uvIndex <= 7) {
    return { spf: "SPF 30-50", warning: "High risk - protection essential", color: "text-orange-600" };
  } else if (uvIndex <= 10) {
    return { spf: "SPF 50+", warning: "Very high risk - extra protection required", color: "text-red-600" };
  } else {
    return { spf: "SPF 50+", warning: "Extreme risk - avoid midday sun", color: "text-purple-600" };
  }
}

interface WeatherCellProps {
  slotKey: string;
  className?: string;
  showWeather?: boolean;
  canLoadWeather?: boolean;
}

export function WeatherCell({ slotKey, className = "", showWeather = true, canLoadWeather = true }: WeatherCellProps) {
  const [weatherInfo, setWeatherInfo] = useState<{
    emoji: string;
    temperature: string;
    wind: string;
  } | null>(null);
  
  const [detailedWeather, setDetailedWeather] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    // Only fetch for future times and when weather loading is allowed
    const isPastTime = new Date(slotKey) < new Date();
    if (isPastTime || !canLoadWeather) return;

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
            setDetailedWeather(matchingWeather);
          }
        }
      } catch (error) {
        console.error('Failed to load weather for cell:', error);
      }
    };

    fetchWeather();
  }, [slotKey, canLoadWeather]);

  if (!weatherInfo || !showWeather) return null;

  return (
    <div className={`absolute top-0 right-0 p-0.5 pointer-events-auto z-20 ${className}`}>
      {/* Weather Column - Vertical Layout */}
      <div 
        className="flex flex-col items-center bg-white bg-opacity-90 rounded-sm px-1 py-1 shadow-sm cursor-help relative"
        onMouseEnter={() => setShowPopup(true)}
        onMouseLeave={() => setShowPopup(false)}
      >
        <span className="text-base leading-none">{weatherInfo.emoji}</span>
        <span className="text-xs font-medium leading-none mt-0.5">{weatherInfo.temperature}</span>
        <span className="text-xs text-gray-600 leading-none mt-0.5">{weatherInfo.wind}</span>
        
        {/* Detailed Weather Popup */}
        {showPopup && detailedWeather && (
          <div className="absolute top-0 right-full mr-2 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-64 z-[9999] max-w-xs pointer-events-auto" style={{ transform: 'translateY(-10px)' }}>
            <div className="text-sm font-semibold text-gray-800 mb-2">
              {new Date(slotKey).toLocaleString('en-GB', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/London'
              })}
            </div>
            
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-lg">{weatherInfo.emoji}</span>
                <span className="font-medium">{detailedWeather.weatherType}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>Temperature: <span className="font-medium">{Math.round(detailedWeather.temperature)}°C</span></div>
                {detailedWeather.feelsLikeTemperature && (
                  <div>Feels like: <span className="font-medium">{Math.round(detailedWeather.feelsLikeTemperature)}°C</span></div>
                )}
                
                {detailedWeather.precipitationProbability && (
                  <div>Rain chance: <span className="font-medium">{detailedWeather.precipitationProbability}%</span></div>
                )}
                
                <div>Wind: <span className="font-medium">{Math.round(detailedWeather.windSpeed || 0)} mph</span></div>
                
                {detailedWeather.humidity && (
                  <div>Humidity: <span className="font-medium">{Math.round(detailedWeather.humidity)}%</span></div>
                )}
                
                {detailedWeather.visibility && (
                  <div>Visibility: <span className="font-medium">{Math.round(detailedWeather.visibility/1000)}km</span></div>
                )}
                
                {detailedWeather.uvIndex !== null && detailedWeather.uvIndex !== undefined && (
                  <div className="col-span-2">
                    <div>UV Index: <span className="font-medium">{detailedWeather.uvIndex}</span></div>
                    {(() => {
                      const sunscreenRec = getSunscreenRecommendation(detailedWeather.uvIndex);
                      return (
                        <div className={`text-xs mt-1 ${sunscreenRec.color}`}>
                          ☀️ {sunscreenRec.spf} recommended - {sunscreenRec.warning}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              
              {detailedWeather.precipitationProbability > 30 && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-blue-800">
                  ⚠️ Possible rain - consider bringing weather protection
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}